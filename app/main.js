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
const nedb = require("nedb");
const { dialog } = require('electron');
const SlippiServer = require('./slippiserver.js');
const { ipcMain } = require('./electron.js');



global.ARGV = {argv:{}};
process.argv.forEach((arg) => {
	if(arg.startsWith("--")){
		arg = arg.split("=");
		global.ARGV[arg[0].substr(2)] = arg[1] || null;
	}
});

_debug = global.ARGV.hasOwnProperty("debug") && global.ARGV.debug !== 'false';

var APPROOT = global.APPROOT = electron.APP.getAppPath();
var APPRES = global.APPRES = electron.APP.getAppPath();
var APPUSERDATA = global.APPUSERDATA = electron.APP.getPath("userData");
function folder(){
	if (process.platform === "win32") {
		return(path.join(APPROOT, 'js'));
	}else{
		return(path.join(process.resourcesPath, 'js2'));
	}
}
var sessionTimestamp = new Date().getTime();
var clientSettings = new nedb({ filename: path.join(APPUSERDATA, 'settings.db'), autoload :true});


//init slippiserver

let slippi = new SlippiServer;
slippi.startServer();

// init server
let server = new PiioServer();
function port(){
	if (process.platform === "win32") {
		return(80);
	}else{
		return(8000);
	}
}
server.port = global.ARGV.port || port();
	server.root = folder();

server.on("listening", electron.createMainWindow);
server.on("themefolder-changed", () => electron.send("themefolder-changed"));
server.on("port-in-use", () => {
	dialog.showMessageBox({message: "Port "+server.port+" is already in use on this machine. \nClosing program."});
	process.exit(1);
});

server.on("api", async (data, cb) => {
	console.log(data);
	if(data.name == "version"){
		data.version = electron.APP.getVersion();
		cb(data);
	}
	if(data.name == "player"){
		data.player = await database.get("player");
		cb(data);
	}
});

electron.on("ready", async () => { // programm is ready
	APPRES = global.APPRES = (await getClientSetting("resPath")) || path.join(electron.APP.getPath("home"), 'Production Interface IO');

	// make sure everything is alright
	await ensure(APPRES, APPROOT, APPUSERDATA);

	database.setPath(APPRES);
	database.newDb(['dbstruct','player','country','game','character','team','match']);
	await database.load();

	server.webPath = APPRES;
	server.setTheme((await getClientSetting("theme")));
	server.start();
});

var startedOnce = false;

electron.ipcMain.on('slippiPort', (event, name) => slippi.setSlippiPort(name));
electron.ipcMain.on('connectionType', (event, name) => slippi.setSlippiType(name == true ? "dolphin" : "console"));
electron.ipcMain.on('slippiFolder', (event, name) => slippi.setSlippiFolder(name));
electron.ipcMain.on('slippi', (event, name) => {
	if(name == "start"){
		slippi.startSlippi();
		slippi.stream.connection.on("statusChange", (status) => {
			if (status === slippi.connectionStatus.DISCONNECTED) {
				console.log("Disconnected to the relay");
				electron.send("slippi_status", 'disconnected');
			}
			if(status === slippi.connectionStatus.CONNECTED){
				// notification("Slippi Stream Tool", "Connected to the relay", "Connected to the relay");
				console.log("Connected to the relay");
				electron.send("slippi_status", 'connected');
			}
			if(status === slippi.connectionStatus.CONNECTING){
				// notification("Slippi Stream Tool", "Connected to the relay", "Connected to the relay");
				console.log("Connecting to the relay");
				electron.send("slippi_status", 'connecting');
			}
			if(status === slippi.connectionStatus.RECONNECT_WAIT){
				// notification("Slippi Stream Tool", "Connected to the relay", "Connected to the relay");
				console.log("RECONNECT_WAIT to the relay");
				electron.send("slippi_status", 'reconnect');
			}
		});
	}else{
		slippi.stopSlippi();
		console.log("Disconnected to the relay");
		electron.send("slippi_status", 'disconnected');
	}
});

electron.ipcMain.on('theme', (event, name) => applyTheme(name));

electron.ipcMain.handle('get', async (event, name) => {
	return await new Promise((resolve, reject) => {
		switch(name){
			case "settings":
				clientSettings.find({}, (e, rows) => resolve(rows));
			break;
			case "smashgg-token":
				clientSettings.find({ "name": "smashgg-token" }, (e, row) => {
					if(e || !row || !row[0]){
						resolve("");
					}else{
						resolve(row[0].value);
					}
				});
			break;
			default:
				clientSettings.find({"name": name}, (e, row) => {
					if(e || !row || !row[0]){
						resolve("");
					}else{
						resolve(row[0].value);
					}
				});
			break;
		}
	});
});

electron.ipcMain.handle('set', async (event, name, value) => {
	return await new Promise((resolve, reject) =>{
		switch(name){
			default:
				clientSettings.update({ "name": name }, { "name": name, "value":value}, { upsert: true }, (e,r) => resolve(true));
			break;
		}
	});
});

electron.on('settings', (arg) => clientSettings.update({"name":arg.name}, {"name":arg.name,"value":arg.value}, {upsert:true}));

function applyTheme(name){
	server.setTheme(name);
	clientSettings.update({"name":"theme"}, {"name":"theme","value": name}, {upsert:true});
}

function getClientSetting(name){
	return new Promise((resolve, reject) => {
		clientSettings.findOne({name}, (e, doc) => resolve(doc ? doc.value : null));
	});
}


exports.database = database;