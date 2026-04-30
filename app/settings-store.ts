import * as path from 'path';

const Nedb = require('@seald-io/nedb');

declare const APPUSERDATA: string;

let clientSettings: typeof Nedb;

export function initSettingsStore(userDataPath: string): void {
  clientSettings = new Nedb({
    filename: path.join(userDataPath, 'settings.db'),
    autoload: true,
  });
}

export function getClientSetting(name: string): Promise<unknown> {
  return new Promise((resolve) => {
    clientSettings.findOne({ name }, (_e: Error | null, doc: { value: unknown } | null) => {
      resolve(doc ? doc.value : null);
    });
  });
}

export function setClientSetting(name: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    clientSettings.update(
      { name },
      { name, value },
      { upsert: true },
      (_e: Error | null) => resolve(true)
    );
  });
}

export function getAllClientSettings(): Promise<Array<{ name: string; value: unknown }>> {
  return new Promise((resolve, reject) => {
    clientSettings.find(
      {},
      (err: Error | null, rows: Array<{ name: string; value: unknown }>) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}
