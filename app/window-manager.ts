import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

require('@electron/remote/main').initialize();

const Nedb = require('@seald-io/nedb');

declare global { var _debug: boolean; }

interface WindowConf {
  name: string;
  width: number;
  height: number;
  maxi: boolean;
}

interface OpenWindowArg {
  name: string;
  dialog?: boolean;
  params?: Record<string, unknown>;
}

const event = new EventEmitter();
const windowConfDb = new Nedb({
  filename: path.join(app.getPath('userData'), 'windowConf.db'),
  autoload: true,
});

app.setAppUserModelId(process.execPath);
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

let electronScreen: Electron.Screen;
let splashWin: BrowserWindow;
let mainWin: BrowserWindow;
let mainConf: Partial<WindowConf> = {};
const wins: BrowserWindow[] = [];

app.on('ready', async () => {
  splashWin = new BrowserWindow({
    width: 500,
    height: 450,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    transparent: true,
    icon: path.join(__dirname, 'logo.png'),
    frame: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  require('@electron/remote/main').enable(splashWin.webContents);
  splashWin.loadFile('window/splash.html');
  splashWin.webContents.on('did-finish-load', () => {
    splashWin.show();
    splashWin.webContents.send('ping', app.getVersion());
  });
  electronScreen = require('electron').screen as Electron.Screen;
  event.emit('ready');
});

app.on('window-all-closed', saveAndQuit);
app.on('activate', () => {
  if (!mainWin) createMainWindow();
});

ipcMain.on('openWindow', (e, arg: OpenWindowArg) => createWindow(e as unknown as IpcMainEvent, arg));
ipcMain.handle('openWindow', async (e: IpcMainInvokeEvent, arg: OpenWindowArg) => createWindow(e as unknown as IpcMainEvent, arg));

ipcMain.on('databaseChanged', (e, arg: unknown) => {
  if (e.sender !== mainWin?.webContents) {
    mainWin?.webContents.send('databaseChanged', arg);
  }
  wins.forEach((w) => {
    if (e.sender === w.webContents) return;
    w.webContents.send('databaseChanged', arg);
  });
});

ipcMain.on('databaseaction', (e, arg: unknown) => {
  if (e.sender !== mainWin?.webContents) {
    mainWin?.webContents.send('databaseaction', arg);
  }
  wins.forEach((w) => w.webContents.send('databaseaction', arg));
});

ipcMain.handle('databaseaction', async () => {});

ipcMain.on('settings', (_e, arg: unknown) => event.emit('settings', arg));

export async function createMainWindow(): Promise<void> {
  mainConf = await getWindowConf('main');
  mainWin = new BrowserWindow({
    width: mainConf.width ?? 1700,
    height: mainConf.height ?? 800,
    minWidth: 780,
    minHeight: 350,
    frame: false,
    maximizable: true,
    show: false,
    icon: path.join(__dirname, 'logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      devTools: global._debug,
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInWorker: true,
    },
  });
  require('@electron/remote/main').enable(mainWin.webContents);
  mainWin.once('ready-to-show', () =>
    setTimeout(() => {
      mainWin.show();
      if (mainConf.maxi) mainWin.maximize();
      if (global._debug) mainWin.webContents.openDevTools();
      setTimeout(() => splashWin.close(), 1000);
    }, 500)
  );
  mainWin.loadFile('window/main.html');
  mainWin.on('resize', () => {
    if (!mainWin.isMaximized()) {
      const size = mainWin.getSize();
      mainConf.width = size[0];
      mainConf.height = size[1];
    }
  });
  mainWin.on('close', () => { mainConf.maxi = mainWin.isMaximized(); });
  mainWin.on('closed', saveAndQuit);
}

function createWindow(e: IpcMainEvent, arg: OpenWindowArg): Promise<unknown> {
  return new Promise((resolve) => {
    const currentScreen = electronScreen.getDisplayNearestPoint(
      electronScreen.getCursorScreenPoint()
    );
    getWindowConf(arg.name).then((conf) => {
      const returnchannel = `windowReturnChannel${Math.ceil(Math.random() * 1000000)}`;
      let returnValue: unknown;

      const winWidth = conf.width ?? 1000;
      const winHeight = conf.height ?? 600;
      const winPosX = Math.round(
        currentScreen.workArea.x + (currentScreen.workArea.width - winWidth) / 2
      );
      const winPosY = Math.round(
        currentScreen.workArea.y + (currentScreen.workArea.height - winHeight) / 2
      );

      const win = new BrowserWindow({
        show: false,
        x: winPosX,
        y: winPosY,
        width: winWidth,
        height: winHeight,
        minWidth: 200,
        minHeight: 100,
        frame: false,
        icon: path.join(__dirname, 'logo.png'),
        maximizable: true,
        modal: arg.dialog ?? false,
        autoHideMenuBar: true,
        parent: arg.dialog
          ? (BrowserWindow.fromWebContents(e.sender) ?? undefined)
          : undefined,
        webPreferences: {
          devTools: global._debug,
          nodeIntegration: true,
          contextIsolation: false,
        },
      });
      require('@electron/remote/main').enable(win.webContents);

      let windowFile = `window/${arg.name}.html`;
      if (arg.name === 'database-entry' && arg.params) {
        const db = (arg.params as { db?: string }).db;
        if (db) {
          try {
            fs.accessSync(`${app.getAppPath()}/window/${arg.name}-${db}.html`);
            windowFile = `window/${arg.name}-${db}.html`;
          } catch { /* use default */ }
        }
      }
      win.loadFile(windowFile);
      win.once('ready-to-show', () => win.show());
      win.webContents.on('did-finish-load', () => {
        win.webContents.send('returnchannel', returnchannel);
        if (arg.params) win.webContents.send('data', arg.params);
      });
      win.on('resize', () => {
        if (!win.isMaximized()) {
          const size = win.getSize();
          conf.width = size[0];
          conf.height = size[1];
        }
      });
      win.on('close', () => {
        ipcMain.removeAllListeners(returnchannel);
        setWindowConf(arg.name, conf);
        resolve(returnValue);
      });
      win.on('closed', cleanupWindows);
      if (global._debug) win.webContents.openDevTools();

      ipcMain.on(returnchannel, (_event, val: unknown) => { returnValue = val; });
      wins.push(win);
    });
  });
}

function cleanupWindows(): void {
  let i = wins.length;
  while (i--) {
    if (wins[i].isDestroyed()) wins.splice(i, 1);
  }
}

function getWindowConf(name: string): Promise<Partial<WindowConf>> {
  return new Promise((resolve) => {
    windowConfDb.findOne(
      { name },
      (_err: Error | null, doc: WindowConf | null) => resolve(doc ?? {})
    );
  });
}

export function setWindowConf(name: string, doc: Partial<WindowConf>): Promise<void> {
  doc.name = name;
  return new Promise((resolve) => {
    windowConfDb.update({ name }, doc, { upsert: true }, () => resolve());
  });
}

function saveAndQuit(): void {
  setWindowConf('main', mainConf).then(() => app.quit());
}

export function send(type: string, data: unknown): void {
  [...wins, mainWin].filter(Boolean).forEach((win) => win.webContents.send(type, data));
}

export { app as APP, ipcMain };
export const on = (n: string, f: (...args: unknown[]) => void): EventEmitter =>
  event.on(n, f);
