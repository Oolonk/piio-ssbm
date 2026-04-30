const setupEvents = require('./../installers/setupEvents');
if (setupEvents.handleSquirrelEvent()) {
  // squirrel event handled — app will exit shortly
  process.exit(0);
}

import * as path from 'path';
import * as fs from 'fs-extra';
import { Notification, dialog } from 'electron';
import {
  APP, ipcMain, createMainWindow, send, on as electronOn,
} from './window-manager';
import { Server } from './server';
import * as database from './database';
import { ensure } from './ensure';
import {
  initSettingsStore, getClientSetting, setClientSetting, getAllClientSettings,
} from './settings-store';
import { SlippiIntegration } from './plugins/slippi';
import { ObsIntegration } from './plugins/obs';

const slippi = new SlippiIntegration();
const obs = new ObsIntegration();

// Parse CLI arguments into global ARGV
global.ARGV = { argv: {} } as Record<string, unknown>;
process.argv.forEach((arg) => {
  if (arg.startsWith('--')) {
    const parts = arg.split('=');
    (global.ARGV as Record<string, unknown>)[parts[0].substring(2)] = parts[1] ?? null;
  }
});

global._debug =
  Object.prototype.hasOwnProperty.call(global.ARGV, 'inspect') &&
  (global.ARGV as Record<string, string | null>)['inspect'] !== 'false';

const APPROOT = (global.APPROOT = APP.getAppPath());
let APPRES = (global.APPRES = APP.getAppPath());
const APPUSERDATA = (global.APPUSERDATA = APP.getPath('userData'));

declare global {
  var ARGV: Record<string, unknown>;
  var _debug: boolean;
  var APPROOT: string;
  var APPRES: string;
  var APPUSERDATA: string;
}

function jsFolder(): string {
  return path.join(APPROOT, 'js');
}

function defaultPort(): number {
  return process.platform === 'win32' ? 80 : 8000;
}

initSettingsStore(APPUSERDATA);

const server = new Server();
server.port = Number((global.ARGV as Record<string, unknown>)['port']) || defaultPort();
server.root = jsFolder();

server.on('listening', createMainWindow);
server.on('themefolder-changed', () => send('themefolder-changed', null));
server.on('port-in-use', () => {
  dialog.showMessageBox({
    message: `Port ${server.port} is already in use on this machine. \nClosing program.`,
  });
  process.exit(1);
});

server.on('api', async (...args: unknown[]) => {
  const [data, cb] = args as [Record<string, unknown>, (d: Record<string, unknown>) => void];
  if (data.name === 'version') {
    data.version = APP.getVersion();
    cb(data);
  }
  if (data.name === 'player') {
    data.player = await database.get('player');
    cb(data);
  }
});

electronOn('ready', async () => {
  APPRES = global.APPRES = ((await getClientSetting('resPath')) as string | null)
    ?? path.join(APP.getPath('home'), 'Production Interface IO');

  await ensure(APPRES, APPROOT, APPUSERDATA);

  database.setPath(APPRES);
  database.newDb([
    'dbstruct', 'player', 'country', 'game', 'character', 'team', 'match', 'pride', 'region',
  ]);
  await database.load();

  server.webPath = APPRES;
  server.setTheme((await getClientSetting('theme') as string | null) ?? '');
  server.start();
});

server.on('data-getSlippiStats', async (...args: unknown[]) => {
  const data = args[0] as { mid: string; length: number; id: string };
  const stats = await slippi.getStats(data.length);
  server.sendToID({ type: 'slippiStats', data: stats }, data.id);
  server.sendToID({ type: `getSlippiStats-${data.mid}`, data: stats }, data.id);
});

server.on('data-getPlayersByStartGGId', async (...args: unknown[]) => {
  const data = args[0] as { mid: string; data: string | string[]; id: string };
  const ids = Array.isArray(data.data) ? data.data : [data.data];
  let returnData: unknown[] = [];
  for (const id of ids) {
    returnData = returnData.concat(await database.get('player', { smashgg: id.toString() }));
  }
  server.sendToID({ type: `getPlayersByStartGGId-${data.mid}`, data: returnData }, data.id);
});

server.on('data-getPlayersByParryGGId', async (...args: unknown[]) => {
  const data = args[0] as { mid: string; data: string | string[]; id: string };
  const ids = Array.isArray(data.data) ? data.data : [data.data];
  let returnData: unknown[] = [];
  for (const id of ids) {
    returnData = returnData.concat(await database.get('player', { parrygg: id }));
  }
  server.sendToID({ type: `getPlayersByParryGGId-${data.mid}`, data: returnData }, data.id);
});

// Slippi events → broadcast and IPC
slippi.on('frame', () => server.broadcast({ type: 'slippiFrame', data: slippi.cache }));
slippi.on('started', (data: unknown) => {
  server.broadcast({ type: 'slippiGameStarted', data });
  send('slippiStarted', data);
});
slippi.on('ended', (data: unknown) => {
  server.broadcast({ type: 'slippiGameEnded', data });
  send('slippiEnded', data);
});
slippi.on('addScore', (...args: unknown[]) => send('slippiAddScore', (args[0] as number) + 1));
slippi.on('stockDeath', (data: unknown) => server.broadcast({ type: 'slippiStockDeath', data }));
slippi.on('percentChange', (data: unknown) => server.broadcast({ type: 'slippiPercentChange', data }));

// OBS events
ipcMain.on('switchScene', (_event, name: string) => obs.setCurrentScene(name));
obs.on('CurrentSceneChanged', (data: unknown) => {
  send('obsCurrentSceneChanged', data);
  server.broadcast({ type: 'obsSceneChanged', data });
});
obs.on('SceneListChanged', (data: unknown) => {
  send('obsSceneListChanged', data);
  server.broadcast({ type: 'obsSceneList', data });
});

// Slippi IPC handlers
ipcMain.on('slippiPort', (_e, name: string) => slippi.setSlippiPort(name));
ipcMain.on('connectionType', (_e, name: boolean) =>
  slippi.setSlippiType(name ? 'dolphin' : 'console')
);
ipcMain.on('slippiFolder', (_e, name: string) => slippi.setSlippiFolder(name));
ipcMain.on('slippi', (_e, name: string) => handleSlippiCommand(name));
ipcMain.on('slippiautoscore', (_e, name: boolean) => { slippi.autoscore = name; });

function handleSlippiCommand(cmd: string): void {
  if (cmd === 'start') {
    slippi.startSlippi();
    watchSlippiStatus();
  } else {
    slippi.stopSlippi();
    send('slippi_status', 'disconnected');
  }
}

function watchSlippiStatus(): void {
  const stream = slippi.stream as {
    connection: { on: (event: string, cb: (status: unknown) => void) => void };
  };
  stream.connection.on('statusChange', (status: unknown) => {
    slippi.status = status;
    switch (status) {
      case slippi.connectionStatus.DISCONNECTED:
        if (slippi.autoconnect) {
          send('slippi_status', 'reconnecting');
          showNotification('Slippi Status', 'Reconnecting to the relay');
          setTimeout(() => {
            slippi.restartSlippi();
            watchSlippiStatus();
          }, 200);
        } else {
          send('slippi_status', 'disconnected');
        }
        break;
      case slippi.connectionStatus.CONNECTED:
        send('slippi_status', 'connected');
        showNotification('Slippi Status', 'Connected to the relay');
        break;
      case slippi.connectionStatus.CONNECTING:
        send('slippi_status', 'connecting');
        break;
      case slippi.connectionStatus.RECONNECT_WAIT:
        if (slippi.autoconnect) {
          send('slippi_status', 'reconnecting');
          showNotification('Slippi Status', 'Reconnecting to the relay');
        } else {
          slippi.stopSlippi();
          send('slippi_status', 'disconnected');
        }
        break;
    }
  });
}

// OBS IPC handlers
ipcMain.on('obsIp', (_e, name: string | null) => obs.setIp(name));
ipcMain.on('obsPort', (_e, name: number | null) => obs.setPort(name));
ipcMain.on('obsPassword', (_e, name: string) => obs.setPassword(name));
ipcMain.on('obs', (_e, name: string) => handleObsCommand(name));

async function handleObsCommand(cmd: string): Promise<void> {
  if (cmd === 'start') {
    const ok = await obs.startObs();
    send('obs_status', ok ? 'connected' : 'disconnected');
  } else {
    obs.stopObs();
    send('obs_status', 'disconnected');
  }
}

ipcMain.on('apiPassword', (_e, name: string) => { server.apiPassword = name; });
ipcMain.on('theme', (_e, name: string) => applyTheme(name));
ipcMain.on('parryggHideNotReadySets', () => { /* handled in renderer */ });

ipcMain.handle('get', async (_event, name: string) => {
  if (name === 'settings') return getAllClientSettings();
  return getClientSetting(name);
});

ipcMain.handle('set', async (_event, name: string, value: unknown) =>
  setClientSetting(name, value)
);

electronOn('settings', (...args: unknown[]) => {
  const arg = args[0] as { name: string; value: unknown };
  setClientSetting(arg.name, arg.value);
});

function applyTheme(name: string): void {
  server.setTheme(name);
  setClientSetting('theme', name);
}

function showNotification(title: string, body: string, silent = true): void {
  const notification = new Notification({
    title: title ?? APP.getName(),
    body,
    silent,
    icon: path.join(__dirname, 'logo.png'),
  });
  notification.show();
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
});

export { database };
