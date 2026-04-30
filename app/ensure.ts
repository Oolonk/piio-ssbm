import * as path from 'path';
import * as fs from 'fs';
import * as fse from 'fs-extra';

const Nedb = require('@seald-io/nedb');

interface DefaultSettings {
  fixedStreamQueue: boolean;
  autoupdate: boolean;
  fixedSidebar: boolean;
  autoupdateThreshold: number;
  autoscore: boolean;
  resPath?: string;
}

interface DbStructEntry {
  name: string;
  field: string;
  type: string;
  index?: number;
  relation?: string;
  multi?: boolean | null;
  listhide?: boolean;
  default?: unknown;
}

const defaultSettings: DefaultSettings = {
  fixedStreamQueue: false,
  autoupdate: false,
  fixedSidebar: true,
  autoupdateThreshold: 500,
  autoscore: false,
};

const dbStruct: DbStructEntry[] = [
  { name: 'player', field: 'name', type: 'text', index: -1 },
  { name: 'player', field: 'country', type: 'relation', relation: 'country', index: -4 },
  { name: 'player', field: 'region', type: 'relation', relation: 'region', index: -4 },
  { name: 'player', field: 'city', type: 'text' },
  { name: 'player', field: 'firstname', type: 'text', index: -2 },
  { name: 'player', field: 'lastname', type: 'text', index: -3 },
  { name: 'player', field: 'birthday', type: 'date', listhide: true },
  { name: 'player', field: 'pronoun', type: 'text', listhide: true },
  { name: 'player', field: 'smashgg', type: 'number' },
  { name: 'player', field: 'parrygg', type: 'text' },
  { name: 'player', field: 'twitter', type: 'text' },
  { name: 'player', field: 'twitch', type: 'text', index: -4 },
  { name: 'player', field: 'steam', type: 'text', listhide: true },
  { name: 'player', field: 'slippicode', type: 'text' },
  { name: 'player', field: 'bluesky', type: 'text' },
  { name: 'player', field: 'team', type: 'relation', relation: 'team', multi: true },
  { name: 'player', field: 'pride', type: 'relation', relation: 'pride', multi: true },
  { name: 'team', field: 'name', index: -1, type: 'text' },
  { name: 'team', field: 'shorten', index: -2, type: 'text' },
  { name: 'team', field: 'prefix', index: -3, type: 'text' },
  { name: 'team', field: 'website', index: -4, type: 'text' },
  { name: 'team', field: 'delimiter', type: 'text', default: ' | ', index: -4 },
  { name: 'team', field: 'regex', type: 'text', index: -4 },
  { name: 'team', field: 'backgroundcolor', type: 'color', index: -4 },
  { name: 'team', field: 'textcolor', type: 'color', index: -4 },
  { name: 'country', field: 'name', index: -1, type: 'text' },
  { name: 'country', field: 'continent', index: -2, type: 'text' },
  { name: 'country', field: 'nation', type: 'relation', relation: 'country', multi: null, index: -2 },
  { name: 'game', field: 'videogameId', type: 'number', index: -3 },
  { name: 'game', field: 'name', type: 'text', index: -1 },
  { name: 'game', field: 'shorten', type: 'text', index: -2 },
  { name: 'character', field: 'name', type: 'text', relation: undefined, multi: null },
  { name: 'character', field: 'shorten', type: 'text', relation: undefined, multi: null },
  { name: 'character', field: 'skins', type: 'text', multi: true },
  { name: 'character', field: 'slippiId', type: 'number', relation: undefined, multi: null },
  { name: 'character', field: 'game', type: 'relation', relation: 'game', multi: null },
  { name: 'pride', field: 'name', index: -1, type: 'text' },
  { name: 'pride', field: 'color', type: 'color', index: -4 },
  { name: 'region', field: 'name', index: -1, type: 'text' },
  { name: 'region', field: 'country', index: -2, type: 'relation', relation: 'country' },
  { name: 'region', field: 'shortcode', index: -3, type: 'text' },
];

let resFolder: string;
let appFolder: string;
let userDataFolder: string;
let settingsDb: typeof Nedb;

export async function ensure(res: string, root: string, userData: string): Promise<void> {
  resFolder = res;
  appFolder = root;
  userDataFolder = userData;

  (defaultSettings as unknown as Record<string, unknown>).resPath = resFolder;

  await ensureFolders();
  await ensureSettings();
  await ensureDatabase();
  await ensureTheme();
}

async function ensureTheme(): Promise<void> {
  return new Promise((resolve) => {
    fs.access(path.join(resFolder, 'themes', 'default', 'manifest.json'), fs.constants.F_OK, (err) => {
      if (!err) {
        console.log('default theme exists');
        return resolve();
      }
      console.error('default theme manifest missing on path', (err as NodeJS.ErrnoException).path);
      fse.copySync(
        path.join(appFolder, 'themes', 'default'),
        path.join(resFolder, 'themes', 'default'),
        { overwrite: true }
      );
      resolve();
    });
  });
}

async function ensureDatabase(): Promise<void> {
  const dbstructDB = new Nedb({
    filename: path.join(resFolder, 'db', 'dbstruct'),
    autoload: true,
  });

  await new Promise<void>((resolve) => {
    dbstructDB.count({}, (err: Error | null, rowCount: number) => {
      if (!err && rowCount === dbStruct.length) return resolve();
      dbstructDB.remove({}, { multi: true }, () => {
        dbstructDB.insert(dbStruct, () => resolve());
      });
    });
  });
}

async function ensureSettings(): Promise<void> {
  settingsDb = new Nedb({
    filename: path.join(userDataFolder, 'settings.db'),
    autoload: true,
  });
  for (const key of Object.keys(defaultSettings) as Array<keyof DefaultSettings>) {
    await settingsEntry(key, defaultSettings[key]);
  }
}

function settingsEntry(name: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    settingsDb.findOne({ name }, (_err: Error | null, doc: unknown) => {
      if (doc == null) {
        settingsDb.insert({ name, value }, () => resolve());
      } else {
        resolve();
      }
    });
  });
}

async function ensureFolders(): Promise<void> {
  fse.ensureDirSync(resFolder);
  fse.ensureDirSync(path.join(resFolder, 'db'));
  fse.ensureDirSync(path.join(resFolder, 'logs'));
  fse.ensureDirSync(path.join(resFolder, 'themes'));
  fse.ensureDirSync(path.join(resFolder, 'assets'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'character'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'country'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'pride'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'game'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'team'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'player'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'region'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'player', 'avatar'));
  fse.ensureDirSync(path.join(resFolder, 'assets', 'player', 'photo'));
}
