import * as path from 'path';
import { EventEmitter } from 'events';
import type { IDbParams } from '../src/shared/types/database.types';

const Nedb = require('@seald-io/nedb');

const event = new EventEmitter();

const _db: Record<string, unknown> = {};
let _resPath = '';

export function setPath(val: string): void {
  _resPath = val;
}

export async function load(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const i in _db) {
    promises.push(
      new Promise<void>((resolve, reject) => {
        const db = _db[i] as { loadDatabase: (cb: (err: Error | null) => void) => void };
        db.loadDatabase((err) => {
          if (err) return reject(err);
          event.emit(`${i}-ready`);
          event.emit('load', i);
          resolve();
        });
      })
    );
  }
  await Promise.all(promises);
  event.emit('ready');
}

export function add<T extends Record<string, unknown>>(dbName: string, docs: T): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!dbExists(dbName)) return reject(new Error(`Database ${dbName} not found`));
    delete (docs as Record<string, unknown>)._id;
    const db = _db[dbName] as { insert: (doc: T, cb: (err: Error | null, newDoc: T) => void) => void };
    db.insert(docs, (err, newDocs) => {
      if (err) return reject(err);
      event.emit('changed', dbName);
      event.emit('added', dbName);
      event.emit(`${dbName}-changed`, [newDocs]);
      event.emit(`${dbName}-added`, [newDocs]);
      resolve(newDocs);
    });
  });
}

export function remove(dbName: string, arg: string | Record<string, unknown>, noEmit = false): Promise<number> {
  return new Promise(async (resolve, reject) => {
    if (!dbExists(dbName)) return reject(new Error(`Database ${dbName} not found`));

    let docs: Record<string, unknown>[];
    if (typeof arg !== 'object') {
      docs = await get(dbName, { _id: arg });
    } else {
      docs = Array.isArray(arg) ? arg : [arg as Record<string, unknown>];
    }

    if (docs.length === 0) return reject(new Error(`Entry in ${dbName} not found (ID was given)`));

    const db = _db[dbName] as { remove: (query: Record<string, unknown>, cb: (err: Error | null, num: number) => void) => void };
    db.remove({ _id: docs[0]._id }, (err, numRemoved) => {
      if (err) return reject(err);
      if (!noEmit) {
        event.emit('changed', dbName);
        event.emit('removed', dbName);
        event.emit(`${dbName}-changed`, docs);
        event.emit(`${dbName}-removed`, docs);
      }
      resolve(numRemoved);
    });
  });
}

export function update<T extends Record<string, unknown>>(
  dbName: string,
  query: string | Record<string, unknown>,
  setDoc: Partial<T>,
  noEmit = false
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!dbExists(dbName)) return reject(new Error(`Database ${dbName} not found`));
    const q = typeof query === 'string' ? { _id: query } : query;
    const db = _db[dbName] as {
      update: (
        query: Record<string, unknown>,
        update: { $set: Partial<T> },
        options: { multi: boolean; returnUpdatedDocs: boolean },
        cb: (err: Error | null, num: number, docs: T[]) => void
      ) => void;
    };
    db.update(q, { $set: setDoc }, { multi: true, returnUpdatedDocs: true }, (err, _num, updatedDocs) => {
      if (err) return reject(err);
      if (!noEmit) {
        event.emit('changed', dbName);
        event.emit(`${dbName}-changed`, updatedDocs);
      }
      resolve(updatedDocs);
    });
  });
}

export function get<T = Record<string, unknown>>(
  dbName: string,
  query?: string | Record<string, unknown>,
  params?: IDbParams
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!dbExists(dbName)) return reject(new Error(`Database ${dbName} not found`));
    const q = typeof query === 'string' ? { _id: query } : (query ?? {});
    interface DbCursor {
      sort: (s: Record<string, 1 | -1>) => DbCursor;
      skip: (n: number) => DbCursor;
      limit: (n: number) => DbCursor;
      exec: (cb: (err: Error | null, docs: T[]) => void) => void;
    }
    const db = _db[dbName] as { find: (q: Record<string, unknown>) => DbCursor };
    let cursor = db.find(q as Record<string, unknown>);
    if (params?.sort) cursor = cursor.sort(params.sort);
    if (params?.page && params?.limit) cursor = cursor.skip(params.page * params.limit - params.limit);
    if (params?.limit) cursor = cursor.limit(params.limit);

    cursor.exec(async (err, docs) => {
      if (err) return reject(err);
      if (params?.resolve && docs?.length > 0) {
        for (let i = 0; i < docs.length; i++) {
          docs[i] = await resolveRelations(dbName, docs[i] as Record<string, unknown>, params.resolve) as T;
        }
      }
      resolve(docs);
    });
  });
}

export function getSingle<T = Record<string, unknown>>(
  dbName: string,
  query?: string | Record<string, unknown>,
  params?: IDbParams
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const p = { ...(params ?? {}), limit: 1 };
    get<T>(dbName, query, p)
      .then((data) => resolve(data[0] ?? null))
      .catch(reject);
  });
}

export async function resolveRelations<T>(dbName: string, data: T, level?: number): Promise<T> {
  if (!dbExists(dbName)) throw new Error(`Database ${dbName} not found`);
  let depth = typeof level === 'number' ? level : 50;
  depth--;
  if (depth <= 0) return data;

  const structure = await getStruct(dbName);
  for (const row of structure) {
    const field = row.field as string;
    const val = (data as Record<string, unknown>)[field];
    if (row.type !== 'relation' || val == null || (Array.isArray(val) && val.length === 0)) continue;

    if (row.multi) {
      if (Array.isArray(val)) {
        for (let idx = 0; idx < val.length; idx++) {
          (data as Record<string, unknown[]>)[field][idx] = await getSingle(
            row.relation as string,
            val[idx] as string,
            { resolve: depth }
          );
        }
      }
    } else {
      (data as Record<string, unknown>)[field] = await getSingle(
        row.relation as string,
        val as string,
        { resolve: depth }
      );
    }
  }
  return data;
}

export function getDatabaseList(): string[] {
  return Object.keys(_db);
}

export function createStruct(dbName: string): Promise<Record<string, unknown>> {
  return new Promise(async (resolve, reject) => {
    if (!dbExists(dbName)) return reject(new Error(`Database ${dbName} not found`));
    const docs = await get<Record<string, unknown>>('dbstruct', { name: dbName }, { sort: { index: -1 } });
    const entry: Record<string, unknown> = { _id: null };
    (docs as Array<{ field: string; default?: unknown; multi?: boolean }>).forEach((field) => {
      entry[field.field] = field.default ?? (field.multi ? [] : '');
    });
    resolve(entry);
  });
}

export function getStruct(dbName: string): Promise<Record<string, unknown>[]> {
  return get<Record<string, unknown>>('dbstruct', { name: dbName }, { sort: { index: -1 } });
}

export function count(dbName: string, query?: Record<string, unknown>): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!dbExists(dbName)) return reject(new Error(`Database ${dbName} not found`));
    const db = _db[dbName] as {
      count: (q: Record<string, unknown>) => { exec: (cb: (err: Error | null, n: number) => void) => void };
    };
    db.count(query ?? {}).exec((err, n) => {
      if (err) return reject(err);
      resolve(n);
    });
  });
}

export function newDb(arg: string | string[]): void {
  if (Array.isArray(arg)) {
    arg.forEach((dbName) => newDb(dbName));
    return;
  }
  _db[arg] = new Nedb({ filename: path.join(_resPath, 'db', arg) });
}

export function dbExists(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(_db, name);
}

export async function action(arg: {
  type: 'update' | 'insert' | 'remove';
  dbName: string;
  dataset: Record<string, unknown> & { _id?: string };
}): Promise<unknown> {
  switch (arg.type) {
    case 'update': return update(arg.dbName, arg.dataset._id!, arg.dataset);
    case 'insert': return add(arg.dbName, arg.dataset);
    case 'remove': return remove(arg.dbName, arg.dataset);
  }
}

export { event };
export const on = (...args: Parameters<EventEmitter['on']>): EventEmitter => event.on(...args);
export const addListener = (...args: Parameters<EventEmitter['addListener']>): EventEmitter => event.addListener(...args);
export const removeListener = (...args: Parameters<EventEmitter['removeListener']>): EventEmitter => event.removeListener(...args);
