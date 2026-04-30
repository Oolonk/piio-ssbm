import type { IDbParams, DbName } from '@shared/types/database.types';

const remote = require('@electron/remote');
const db = remote.require('./main').database;

export class DatabaseService {
  get<T = Record<string, unknown>>(
    dbName: DbName,
    query?: string | Record<string, unknown>,
    params?: IDbParams
  ): Promise<T[]> {
    return db.get(dbName, query, params) as Promise<T[]>;
  }

  getSingle<T = Record<string, unknown>>(
    dbName: DbName,
    query?: string | Record<string, unknown>,
    params?: IDbParams
  ): Promise<T | null> {
    return db.getSingle(dbName, query, params) as Promise<T | null>;
  }

  add<T extends Record<string, unknown>>(dbName: DbName, docs: T): Promise<T> {
    return db.add(dbName, docs) as Promise<T>;
  }

  update<T extends Record<string, unknown>>(
    dbName: DbName,
    query: string | Record<string, unknown>,
    setDoc: Partial<T>,
    noEmit = false
  ): Promise<T[]> {
    return db.update(dbName, query, setDoc, noEmit) as Promise<T[]>;
  }

  remove(
    dbName: DbName,
    arg: string | Record<string, unknown>,
    noEmit = false
  ): Promise<number> {
    return db.remove(dbName, arg, noEmit) as Promise<number>;
  }

  count(dbName: DbName, query?: Record<string, unknown>): Promise<number> {
    return db.count(dbName, query) as Promise<number>;
  }

  getDatabaseList(): string[] {
    return db.getDatabaseList() as string[];
  }

  dbExists(name: string): boolean {
    return db.dbExists(name) as boolean;
  }

  getStruct(dbName: DbName): Promise<Record<string, unknown>[]> {
    return db.getStruct(dbName) as Promise<Record<string, unknown>[]>;
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    db.on(event, listener);
  }
}
