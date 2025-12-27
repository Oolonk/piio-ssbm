const { app, ipcMain, BrowserWindow } = require('electron');
require('@electron/remote/main').initialize();
const path = require("path");
const nedb = require("@seald-io/nedb");
const fs = require("fs");
const EventEmitter = require('events');
var event = new EventEmitter();

var windowConf = new nedb({ filename: path.join(app.getPath("userData"), 'windowConf.db'), autoload: true });

app.setAppUserModelId(process.execPath);
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
let screen;
let splashWin;
let mainWin;
let mainConf;
let wins = [];

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
		webPreferences: { nodeIntegration: true, contextIsolation: false, enableRemoteModule: true }
	});
	require("@electron/remote/main").enable(splashWin.webContents);
	splashWin.loadFile('window/splash.html');
	splashWin.webContents.on('did-finish-load', () => {
		splashWin.show();
		splashWin.webContents.send('ping', app.getVersion());
	});
	screen = require('electron').screen;
	event.emit('ready');
});
app.on('window-all-closed', saveAndQuit);
app.on('activate', () => {
	if (mainWin === null)
		createMainWindow();
});


ipcMain.on('openWindow', createWindow);
ipcMain.handle('openWindow', async (event, arg) => {
	return createWindow(event, arg);
});
ipcMain.on('databaseChanged', (e, arg) => {
	// inform windows about database change
	if (e.sender != mainWin.webContents) {
		mainWin.webContents.send('databaseChanged', arg);
	}
	wins.forEach((w, i) => {
		if (e.sender == w.webContents) { return; }
		w.webContents.send('databaseChanged', arg);
	});
});
ipcMain.on('databaseaction', (e, arg) => {
	// inform windows about database action to execute
	if (e.sender != mainWin.webContents)
		mainWin.webContents.send('databaseaction', arg);
	wins.forEach((w, i) => {
		w.webContents.send('databaseaction', arg);
	});
});

ipcMain.handle('databaseaction', async (e, arg) => {


});



ipcMain.on('settings', (e, arg) => event.emit('settings', arg));

async function createMainWindow() {
	mainConf = await getWindowConf("main");
	mainWin = new BrowserWindow({
		width: mainConf.width || 1700,
		height: mainConf.height || 800,
		minWidth: 780,
		minHeight: 350,
		frame: false,
		maximizable: true,
		show: false,
		icon: path.join(__dirname, 'logo.png'),
		autoHideMenuBar: true,
		webPreferences: { devTools: _debug, nodeIntegration: true, contextIsolation: false, enableRemoteModule: true, nodeIntegrationInWorker: true }
	});
	require("@electron/remote/main").enable(mainWin.webContents);
	mainWin.once('ready-to-show', () => setTimeout(() => {
		mainWin.show();
		if (mainConf.maxi)
			mainWin.maximize();
		if (_debug)
			mainWin.webContents.openDevTools();
		setTimeout(() => splashWin.close(), 1000);
	}, 500));
	mainWin.loadFile('window/main.html');
	mainWin.on('resize', e => {
		if (!mainWin.isMaximized()) {
			let size = mainWin.getSize();
			mainConf.width = size[0];
			mainConf.height = size[1];
		}
	});

	mainWin.on('close', async () => mainConf.maxi = mainWin.isMaximized());
	mainWin.on('closed', saveAndQuit);

}

function createWindow(event, arg) {
	return new Promise(async (resolve, reject) => {

		var currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
		var conf = await getWindowConf(arg.name);
		var returnchannel = "windowReturnChannel" + Math.ceil(Math.random() * 1000000);
		var returnValue;

		let winWidth = conf.width || 1000;
		let winHeight = conf.height || 600;
		let winPosX = Math.round(currentScreen.workArea.x + (currentScreen.workArea.width - winWidth) / 2);
		let winPosY = Math.round(currentScreen.workArea.y + (currentScreen.workArea.height - winHeight) / 2);

		let win = new BrowserWindow({
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
			modal: arg.dialog || false,
			autoHideMenuBar: true,
			parent: arg.dialog ? BrowserWindow.fromWebContents(event.sender) : null,
			webPreferences: { devTools: _debug, nodeIntegration: true, contextIsolation: false, enableRemoteModule: true }
		});
		require("@electron/remote/main").enable(win.webContents);
		let windowFile = `window/${arg.name}.html`;
		if (arg.name == "database-entry") {
			try {
				fs.accessSync(`${app.getAppPath()}/window/${arg.name}-${arg.params.db}.html`);
				windowFile = `window/${arg.name}-${arg.params.db}.html`;
			} catch (err) { }
		}
		win.loadFile(windowFile);
		win.once('ready-to-show', () => win.show());
		win.webContents.on('did-finish-load', () => {
			win.webContents.send('returnchannel', returnchannel);
			if (arg.params) {
				win.webContents.send('data', arg.params);
			}
		});
		win.on('resize', e => {
			if (!win.isMaximized()) {
				let size = win.getSize();
				conf.width = size[0];
				conf.height = size[1];
			}
		});
		win.on('close', () => {
			ipcMain.removeAllListeners(returnchannel);
			setWindowConf(arg.name, conf);
			resolve(returnValue);
		});
		win.on('closed', () => cleanupWindows());
		if (_debug) {
			win.webContents.openDevTools();
		}

		ipcMain.on(returnchannel, (event, arg) => returnValue = arg);
		wins.push(win);
	});
}

function cleanupWindows() {
	var i = wins.length;
	while (i--) {
		if (wins[i].isDestroyed()) {
			wins.splice(i, 1);
		}
	}
}

function getWindowConf(name) {
	return new Promise((resolve, reject) => {
		windowConf.findOne({ "name": name }, (err, doc) => {
			resolve(doc || {});
		});
	});
}
function setWindowConf(name, doc) {
	doc.name = name;
	return new Promise((resolve, reject) => {
		windowConf.update({ "name": name }, doc, { upsert: true }, () => resolve());
	});
}

function saveAndQuit() {
	setWindowConf("main", mainConf).then(() => app.quit());
}
function sendToWindows(type, data) {
	let w = wins.concat(mainWin);
	w.forEach(win => win.webContents.send(type, data));
}

module.exports = {
	APP: app,
	setWindowConf: setWindowConf,

	createMainWindow: createMainWindow,

	ipcMain: ipcMain,

	send: sendToWindows,
	on: (n, f) => event.on(n, f)
};