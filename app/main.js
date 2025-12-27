//handle setupevents as quickly as possible
const setupEvents = require('./../installers/setupEvents')
if (setupEvents.handleSquirrelEvent()) {
	// squirrel event handled and app will exit in 1000ms, so don't do anything else
	return;
}
const electron = require('./electron.js');
const PiioServer = require('./server.js');
const database = require('./db.js');
const ensure = require('./ensure.js');
const fs = require('fs-extra');
const path = require('path');
const nedb = require("@seald-io/nedb");
const { Notification, dialog } = require('electron');
const { ipcMain } = require('./electron.js');
const SlippiIntegration = require('./plugins/slippi.js');
const ObsIntegration = require('./plugins/obs.js');

//init Slippi Integration
var slippi = new SlippiIntegration;
var obs = new ObsIntegration;

global.ARGV = { argv: {} };
process.argv.forEach((arg) => {
	if (arg.startsWith("--")) {
		arg = arg.split("=");
		global.ARGV[arg[0].substr(2)] = arg[1] || null;
	}
});

_debug = global.ARGV.hasOwnProperty("inspect") && global.ARGV.inspect !== 'false';

var APPROOT = global.APPROOT = electron.APP.getAppPath();
var APPRES = global.APPRES = electron.APP.getAppPath();
var APPUSERDATA = global.APPUSERDATA = electron.APP.getPath("userData");
function folder() {
	if (process.platform === "win32") {
		return (path.join(APPROOT, 'js'));
	} else {
		return (path.join(APPROOT, 'js'));
	}
}
var sessionTimestamp = new Date().getTime();
var clientSettings = new nedb({ filename: path.join(APPUSERDATA, 'settings.db'), autoload: true });



// init server
let server = new PiioServer();
function port() {
	if (process.platform === "win32") {
		return (80);
	} else {
		return (8000);
	}
}
server.port = global.ARGV.port || port();
server.root = folder();

server.on("listening", electron.createMainWindow);
server.on("themefolder-changed", () => electron.send("themefolder-changed"));
server.on("port-in-use", () => {
	dialog.showMessageBox({ message: `Port ${server.port} is already in use on this machine. \nClosing program.` });
	process.exit(1);
});
server.on("api", async (data, cb) => {
	// console.log(data);
	if (data.name == "version") {
		data.version = electron.APP.getVersion();
		cb(data);
	}
	if (data.name == "player") {
		data.player = await database.get("player");
		cb(data);
	}
});

electron.on("ready", async () => { // programm is ready
	APPRES = global.APPRES = (await getClientSetting("resPath")) || path.join(electron.APP.getPath("home"), 'Production Interface IO');

	// make sure everything is alright
	await ensure(APPRES, APPROOT, APPUSERDATA);

	database.setPath(APPRES);
	database.newDb(['dbstruct', 'player', 'country', 'game', 'character', 'team', 'match', 'pride', 'region']);
	await database.load();

	server.webPath = APPRES;
	server.setTheme((await getClientSetting("theme")));
	server.start();
});

server.on('data-getSlippiStats', async (data, cb) => {
	let randomId = data.mid;
	let stats = slippi.getStats(await data.length);
	server.sendToID({ type: 'slippiStats', data: await stats }, data.id);
	server.sendToID({ type: 'getSlippiStats-' + randomId, data: await stats }, data.id);

});

server.on('data-getPlayersByStartGGId', async (data, cb) => {
	console.log(data);
	let randomId = data.mid;
	let startGGIds = data.data;
	let returnData = []
	if(Array.isArray(startGGIds)) {
		for(let i = 0; i < startGGIds.length; i++) {
			let id = startGGIds[i].toString();
			returnData = returnData.concat(await database.get("player", {  "smashgg": id  }));
		}
	}else{
		startGGIds = startGGIds.toString();
		returnData = returnData.concat(await database.get("player", {  "smashgg": startGGIds  }));
	}
	server.sendToID({ type: 'getPlayersByStartGGId-' + randomId, data: await returnData }, data.id);

});

server.on('data-getPlayersByParryGGId', async (data, cb) => {
	console.log(data);
	let randomId = data.mid;
	let parryGGIds = data.data;
	let returnData = []
	if(Array.isArray(parryGGIds)) {
		for(let i = 0; i < parryGGIds.length; i++) {
			let id = parryGGIds[i];
			returnData = returnData.concat(await database.get("player", {  "parrygg": id  }));
		}
	}else{
		returnData = returnData.concat(await database.get("player", {  "parrygg": parryGGIds  }));
	}
	server.sendToID({ type: 'getPlayersByParryGGId-' + randomId, data: await returnData }, data.id);

});

slippi.on('frame', () => {
	server.broadcast({ type: 'slippiFrame', data: slippi.cache })
})

slippi.on('started', (data) => {
	server.broadcast({ type: 'slippiGameStarted', data: data })
	electron.send('slippiStarted', data)
})
slippi.on('ended', (data) => {
	server.broadcast({ type: 'slippiGameEnded', data: data })
	electron.send('slippiEnded', data);
})
slippi.on('addScore', (slippiPort) => {
	let port = slippiPort + 1;
	electron.send('slippiAddScore', port);
})

electron.ipcMain.on('switchScene', (event, name) => {
	obs.setCurrentScene(name)
});
obs.on('CurrentSceneChanged', (data) =>{
	// console.log('obs scene changed to:', data);
	electron.send("obsCurrentSceneChanged", data);
	server.broadcast({ type: 'obsSceneChanged', data: data })
})

obs.on('SceneListChanged', (data) =>{
	// console.log('obs scene changed to:', data);
	electron.send("obsSceneListChanged", data);
	server.broadcast({ type: 'obsSceneList', data: data })
})
var startedOnce = false;

electron.ipcMain.on('slippiPort', (event, name) => slippi.setSlippiPort(name));
electron.ipcMain.on('connectionType', (event, name) => slippi.setSlippiType(name == true ? "dolphin" : "console"));
electron.ipcMain.on('slippiFolder', (event, name) => slippi.setSlippiFolder(name));
electron.ipcMain.on('slippi', (event, name) => slippiChanger(event, name));
electron.ipcMain.on('slippiautoscore', (event, name) => changeAutoScore(event, name));
function slippiChanger(event, name) {
	if (name == "start") {
		slippi.startSlippi();
		slippiViewer();
	} else {
		slippi.stopSlippi();
		console.log("Disconnected to the relay");
		electron.send("slippi_status", 'disconnected');

	}
}
function changeAutoScore(event, name) {
	slippi.autoscore = name;
}
function slippiViewer() {
	slippi.stream.connection.on("statusChange", (status) => {
		slippi.status = status;
		switch (status) {
			case slippi.connectionStatus.DISCONNECTED:
				console.log("DISCONNECTED to the relay");
				if (slippi.autoconnect) {
					electron.send("slippi_status", 'reconnecting');
					showNotification("Slippi Status", "Reconnecting to the relay");
					setTimeout(function () {
						slippi.restartSlippi();
						slippiViewer();
					}, 200)
				} else {
					console.log("Disconnected to the relay");
					electron.send("slippi_status", 'disconnected');
				}
			break;
			case slippi.connectionStatus.CONNECTED:
				// notification("Slippi Stream Tool", "Connected to the relay", "Connected to the relay");
				console.log("Connected to the relay");
				electron.send("slippi_status", 'connected');
				showNotification("Slippi Status", "Connected to the relay");
			break;
			case slippi.connectionStatus.CONNECTING:
				// notification("Slippi Stream Tool", "Connected to the relay", "Connected to the relay");
				console.log("Connecting to the relay");
				electron.send("slippi_status", 'connecting');
			break;
			case slippi.connectionStatus.RECONNECT_WAIT:
				// notification("Slippi Stream Tool", "Connected to the relay", "Connected to the relay");
				console.log("RECONNECT_WAIT to the relay");
				console.log(slippi.autoconnect);
				if (slippi.autoconnect) {
					console.log("test to the relay");
					electron.send("slippi_status", 'reconnecting');
					showNotification("Slippi Status", "Reconnecting to the relay");
				} else {
					slippi.stopSlippi();
					console.log("Disconnected to the relay");
					electron.send("slippi_status", 'disconnected');
				}
			break;
		}
	});
}

electron.ipcMain.on('obsIp', (event, name) => {obs.setIp(name)});
electron.ipcMain.on('obsPort', (event, name) => {obs.setPort(name)});
electron.ipcMain.on('obsPassword', (event, name) => {obs.setPassword(name)});
electron.ipcMain.on('obs', (event, name) => {obsChanger(event, name)});
async function obsChanger(event, name) {
	if(name == "start"){
		let returnVal = await obs.startObs();
		if(returnVal == true){
			electron.send("obs_status", 'connected');
		}
	}
	else{
		obs.stopObs();
		electron.send("obs_status", 'disconnected');
	}
}


electron.ipcMain.on('theme', (event, name) => applyTheme(name));

electron.ipcMain.handle('get', async (event, name) => {
	return await new Promise((resolve, reject) => {
		switch (name) {
			case "settings":
				clientSettings.find({}, (e, rows) => resolve(rows));
				break;
			case "smashgg-token":
				clientSettings.find({ "name": "smashgg-token" }, (e, row) => {
					if (e || !row || !row[0]) {
						resolve("");
					} else {
						resolve(row[0].value);
					}
				});
				break;
            case "parrygg-token":
                clientSettings.find({ "name": "parrygg-token" }, (e, row) => {
                    if (e || !row || !row[0]) {
                        resolve("");
                    } else {
                        resolve(row[0].value);
                    }
                });
                break;
			default:
				clientSettings.find({ "name": name }, (e, row) => {
					if (e || !row || !row[0]) {
						resolve("");
					} else {
						resolve(row[0].value);
					}
				});
				break;
		}
	});
});

electron.ipcMain.handle('set', async (event, name, value) => {
	return await new Promise((resolve, reject) => {
		switch (name) {
			default:
				clientSettings.update({ "name": name }, { "name": name, "value": value }, { upsert: true }, (e, r) => resolve(true));
				break;
		}
	});
});

electron.on('settings', (arg) => clientSettings.update({ "name": arg.name }, { "name": arg.name, "value": arg.value }, { upsert: true }));

function applyTheme(name) {
	server.setTheme(name);
	clientSettings.update({ "name": "theme" }, { "name": "theme", "value": name }, { upsert: true });
}

function getClientSetting(name) {
	return new Promise((resolve, reject) => {
		clientSettings.findOne({ name }, (e, doc) => resolve(doc ? doc.value : null));
	});
}


exports.database = database;


process.on("uncaughtException", (err) => {
	const messageBoxOptions = {
		type: "error",
		title: "Error in Main process",
		message: "Something failed"
	};
});

function showNotification(title, body, silent = true) {
	let notification = new Notification({
		title: title == null ? electron.APP.getName() : title, body: body, silent: silent, icon: path.join(__dirname, 'logo.png')
	});
    // notification.sound = false;
    notification.show();
	// return notification.close();
}