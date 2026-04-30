import type { IDbParams } from '../../src/shared/types/database.types';

type DbCallback = (data: unknown) => void;
type DbAnyCallback = (name: string, data: unknown) => void;

interface DbCallbacks {
  on: Record<string, DbCallback[]>;
  once: Record<string, DbCallback[]>;
  any: DbAnyCallback[];
}

interface DbAction {
  type: 'update' | 'insert' | 'remove';
  dbName: string;
  dataset: Record<string, unknown> & { _id?: string };
}

export class DBWrapper {
  db: Record<string, unknown>;
  path: string;
  private readonly nedb: typeof import('@seald-io/nedb');
  private readonly fs: typeof import('fs');
  private readonly _callbacks: DbCallbacks;

  constructor(path?: string) {
    this.nedb = require('@seald-io/nedb');
    this.fs = require('fs');
    this._callbacks = { on: {}, once: {}, any: [] };
    this.db = {};
    this.path = path ?? '.';
  }

  async load(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const i in this.db) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          const dbInstance = this.db[i] as { loadDatabase: (cb: (err: Error | null) => void) => void };
          dbInstance.loadDatabase((err) => {
            if (err) return reject(err);
            resolve();
            this.emit(`${i}-ready`);
            this.emit('load', i);
          });
        })
      );
    }
    await Promise.all(promises);
    this.emit('ready');
  }

  reload(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!Object.prototype.hasOwnProperty.call(this.db, dbName)) {
        return reject(`Database '${dbName}' not found`);
      }
      const dbInstance = this.db[dbName] as { loadDatabase: (cb: (err: Error | null) => void) => void };
      dbInstance.loadDatabase((err) => {
        if (err) return reject(err);
        resolve();
        this.emit(`${dbName}-ready`);
        this.emit('load', dbName);
      });
    });
  }

  add<T extends Record<string, unknown>>(dbName: string, docs: T): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!Object.prototype.hasOwnProperty.call(this.db, dbName)) {
        return reject('Database not found');
      }
      delete (docs as Record<string, unknown>)._id;
      const dbInstance = this.db[dbName] as {
        insert: (doc: T, cb: (err: Error | null, newDoc: T) => void) => void;
      };
      dbInstance.insert(docs, (err, newDocs) => {
        if (err) return reject(err);
        resolve(newDocs);
        this.emit('changed', dbName);
        this.emit('added', dbName);
        this.emit(`${dbName}-changed`, [newDocs]);
        this.emit(`${dbName}-added`, [newDocs]);
      });
    });
  }

  remove(dbName: string, doc: string | Record<string, unknown>): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!Object.prototype.hasOwnProperty.call(this.db, dbName)) {
        return reject('Database not found');
      }
      let promise: Promise<Record<string, unknown>[]>;
      if (typeof doc !== 'object') {
        promise = this.get(dbName, { _id: doc });
      } else {
        promise = Promise.resolve([doc as Record<string, unknown>]);
      }
      promise.then((docs) => {
        if (docs.length === 0) return reject('Entry not found (ID given)');
        const dbInstance = this.db[dbName] as {
          remove: (query: Record<string, unknown>, cb: (err: Error | null, num: number) => void) => void;
        };
        dbInstance.remove({ _id: docs[0]._id }, (err, numRemoved) => {
          if (err) return reject(err);
          resolve(numRemoved);
          this.emit('changed', dbName);
          this.emit('removed', dbName);
          this.emit(`${dbName}-changed`, docs);
          this.emit(`${dbName}-removed`, docs);
        });
      });
    });
  }

  update<T extends Record<string, unknown>>(
    dbName: string,
    query: string | Record<string, unknown>,
    setDoc: Partial<T>,
    noEmit = false
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!Object.prototype.hasOwnProperty.call(this.db, dbName)) {
        return reject('Database not found');
      }
      const q = typeof query === 'string' ? { _id: query } : query;
      const dbInstance = this.db[dbName] as {
        update: (
          query: Record<string, unknown>,
          update: { $set: Partial<T> },
          options: { multi: boolean; returnUpdatedDocs: boolean },
          cb: (err: Error | null, num: number, docs: T[]) => void
        ) => void;
      };
      dbInstance.update(q, { $set: setDoc }, { multi: true, returnUpdatedDocs: true }, (err, _num, updatedDocs) => {
        if (err) return reject(err);
        resolve(updatedDocs);
        if (!noEmit) {
          this.emit('changed', dbName);
          this.emit(`${dbName}-changed`, updatedDocs);
        }
      });
    });
  }

  get<T = Record<string, unknown>>(
    dbName: string,
    query?: string | Record<string, unknown> | null,
    _assignPrototype?: unknown,
    params?: IDbParams
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!Object.prototype.hasOwnProperty.call(this.db, dbName)) {
        return reject('Database not found');
      }
      const q = typeof query === 'string' ? { _id: query } : (query ?? {});
      interface DbCursor {
        sort: (s: Record<string, 1 | -1>) => DbCursor;
        skip: (n: number) => DbCursor;
        limit: (n: number) => DbCursor;
        exec: (cb: (err: Error | null, docs: T[]) => void) => void;
      }
      const dbInstance = this.db[dbName] as {
        find: (query: Record<string, unknown>) => DbCursor;
      };
      let cursor = dbInstance.find(q as Record<string, unknown>);
      if (params?.sort) cursor = cursor.sort(params.sort);
      if (params?.page && params?.limit) cursor = cursor.skip(params.page * params.limit - params.limit);
      if (params?.limit) cursor = cursor.limit(params.limit);

      cursor.exec(async (err, docs) => {
        if (err) return reject(err);
        if (params?.resolve && docs && docs.length > 0) {
          for (let i = 0; i < docs.length; i++) {
            docs[i] = await this.resolveRelations(dbName, docs[i], params.resolve) as T;
          }
        }
        resolve(docs);
      });
    });
  }

  getSingle<T = Record<string, unknown>>(
    dbName: string,
    query?: string | Record<string, unknown> | null,
    _assignPrototype?: unknown,
    params?: IDbParams
  ): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!query) return reject('Parameter 2 (query) is required');
      const p = { ...(params ?? {}), limit: 1 };
      this.get<T>(dbName, query, null, p)
        .then((data) => resolve(data[0] ?? null))
        .catch(reject);
    });
  }

  async resolveRelations<T>(dbName: string, data: T, level?: number): Promise<T> {
    let depth = typeof level === 'number' ? level : 50;
    depth--;
    if (depth <= 0) return data;

    const structure = await this.getStruct(dbName);
    for (const row of structure) {
      const field = row.field as string;
      const val = (data as Record<string, unknown>)[field];
      if (row.type !== 'relation' || val == null || (Array.isArray(val) && val.length === 0)) {
        continue;
      }
      if (row.multi) {
        if (Array.isArray(val)) {
          for (let idx = 0; idx < val.length; idx++) {
            (data as Record<string, unknown[]>)[field][idx] = await this.getSingle(
              row.relation as string,
              val[idx] as string,
              null,
              { resolve: depth }
            );
          }
        }
      } else {
        (data as Record<string, unknown>)[field] = await this.getSingle(
          row.relation as string,
          val as string,
          null,
          { resolve: depth }
        );
      }
    }
    return data;
  }

  createStruct(dbName: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.db['dbstruct']) return reject("Database 'dbstruct' not loaded");
      this.get('dbstruct', { name: dbName }, null, { sort: { index: -1 } }).then((docs) => {
        const entry: Record<string, unknown> = { _id: null };
        (docs as Array<{ field: string; default?: unknown; multi?: boolean }>).forEach((field) => {
          entry[field.field] = field.default ?? (field.multi ? [] : '');
        });
        resolve(entry);
      }).catch(reject);
    });
  }

  getStruct(dbName: string): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      if (!this.db['dbstruct']) return reject("Database 'dbstruct' not loaded");
      this.get('dbstruct', { name: dbName }, null, { sort: { index: -1 } })
        .then((docs) => resolve(docs as Record<string, unknown>[]))
        .catch(reject);
    });
  }

  count(dbName: string, query?: Record<string, unknown>): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!Object.prototype.hasOwnProperty.call(this.db, dbName)) {
        return reject('Database not found');
      }
      const dbInstance = this.db[dbName] as {
        count: (q: Record<string, unknown>) => { exec: (cb: (err: Error | null, n: number) => void) => void };
      };
      dbInstance.count(query ?? {}).exec((err, count) => {
        if (err) return reject(err);
        resolve(count);
      });
    });
  }

  newDb(name: string | string[], inMemoryOnly = false): void {
    if (Array.isArray(name)) {
      name.forEach((dbName) => this.newDb(dbName, inMemoryOnly));
      return;
    }
    const NeDB = this.nedb as unknown as new (options: { filename: string; inMemoryOnly: boolean }) => unknown;
    this.db[name] = new NeDB({ filename: `${this.path}/db/${name}`, inMemoryOnly });
  }

  dbExists(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.db, name);
  }

  action(arg: DbAction): Promise<unknown> {
    switch (arg.type) {
      case 'update': return this.update(arg.dbName, arg.dataset._id!, arg.dataset);
      case 'insert': return this.add(arg.dbName, arg.dataset);
      case 'remove': return this.remove(arg.dbName, arg.dataset);
    }
  }

  on(name: string | string[] | DbCallback, callback?: DbCallback): void {
    if (Array.isArray(name)) {
      name.forEach((val) => this.on(val, callback));
      return;
    }
    if (typeof name === 'function') {
      this._callbacks.any.push(name as DbAnyCallback);
      return;
    }
    if (callback === undefined) {
      this._callbacks.any.push(name as unknown as DbAnyCallback);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(this._callbacks.on, name)) {
      this._callbacks.on[name] = [];
    }
    this._callbacks.on[name].push(callback);
  }

  once(name: string | string[], callback: DbCallback): void {
    if (Array.isArray(name)) {
      name.forEach((val) => this.once(val, callback));
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(this._callbacks.once, name)) {
      this._callbacks.once[name] = [];
    }
    this._callbacks.once[name].push(callback);
  }

  emit(name: string, data?: unknown): void {
    this._callbacks.any.forEach((cb) => cb(name, data));
    if (Object.prototype.hasOwnProperty.call(this._callbacks.on, name)) {
      this._callbacks.on[name].forEach((cb) => cb(data));
    }
    if (Object.prototype.hasOwnProperty.call(this._callbacks.once, name)) {
      this._callbacks.once[name].forEach((cb) => cb(data));
      this._callbacks.once[name] = [];
    }
  }
}
