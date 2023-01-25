const { SlippiGame, Ports, DolphinConnection, ConnectionStatus} = require('@slippi/slippi-js');
const { SlpFolderStream, SlpLiveStream, Slpstream, SlpRealTime } = require("@vinceau/slp-realtime");

const express = require('express');
const path = require('path');
const fs = require("fs")
const net = require('net');
const EventEmitter = require('events');
const ExpressWs = require('express-ws');
const WebSocket = require('ws');
const { windowsStore } = require('process');

async function  getStats(games, slpLiveFolderPath){
	var files = fs.readdirSync(slpLiveFolderPath, [])
	.map(function(v) {
	  return { name:v };
	})
	.filter(files => files.name.endsWith('.slp'))
	files = files.sort(function(a, b) {
	  var fest;
	  var yuio;
	  const gamer = new SlippiGame(path.normalize(slpLiveFolderPath + "/" +  a.name));
	  const gamet = new SlippiGame(path.normalize(slpLiveFolderPath + "/" +  b.name));
	  if (gamer.getMetadata() == null)
		fest = "1";
	  else
		fest = gamer.getMetadata().startAt;
  
	  if (gamet.getMetadata() == null)
		yuio = "1";
	  else
		yuio = gamet.getMetadata().startAt;
	  return yuio.replace(/\D/g,'') - fest.replace(/\D/g,'');
	})
	.map(function(v) { return path.normalize(slpLiveFolderPath + "/" +  v.name); });
  var stats = await { stats: [], settings: [], metadata: []};
  
  for (var i = 0; i < parseInt(games, 10); i++) {
	const gamez = await new SlippiGame(files[i]);
	stats.stats[parseInt(games, 10) - i - 1] = gamez.getStats()
	stats.settings[parseInt(games, 10) - i - 1] = gamez.getSettings()
	stats.metadata[parseInt(games, 10) - i - 1] = gamez.getMetadata()
  }
  return await stats;

}

function SlippiServer(){
	this.server = express();
	this.expressWs = ExpressWs(this.server);
	this.slippiIP = '127.0.0.1';
	this.slippiPort = 0;
	this.slippiFolder = "";
	this.realtime = new SlpRealTime;
	this.slippiType = "dolphin";
	this.stream = new SlpLiveStream(this.slippiType);

	this.port = 42070;

	this.pingInterval = 10; // seconds
	
	this.event = new EventEmitter();

	this.theme = "";
	this.webPath = "";
	this.themeManifest = {};
	this.msgCache = {};
	this.root = ''
	this.themeWatcher;

}

SlippiServer.prototype.on = function on(...args){
	this.event.on(...args);
}


SlippiServer.prototype.startServer = async function startServer(){
	this.server.use(function(req, res, next) {
	  res.header("Access-Control-Allow-Origin", "*");
	  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	  next();
	});
	
	this.server.get('/:amount', async (req, res, next) => {
		try {
			res.json( {
				games: await getStats(req.params.amount, this.slippiFolder)
			});
			// res.end();

		}catch(err){
			next();
		}
	});
	
	
	this.server.ws('/', (ws, req) => {
		ws.isAlive = true;
		ws.subscriptions = [];
		ws._SELF = null;
		ws.receiveAll = false;
		ws.on('pong', () => ws.isAlive = true);
		ws.on('message', (msg) => {
			console.log(msg);
			ws.send(msg);
		});
		ws.on("connection", (client) => {
		  console.log("Client connected!");
		});
	});
	// handle 404
	this.server.get("/*", (req, res, next) => res.sendStatus(404));
	this.checkPort(this.port).then(() => {
		console.log("Start server on port", this.port);
		this.server.listen(this.port, () => this.event.emit("listening"));
		this.socket.bind(0);
		setInterval(() => this.ping(), this.pingInterval * 1000);
	}).catch(() => {
		this.event.emit("port-in-use");
	});
}

SlippiServer.prototype.checkPort = function checkPort(port){
	return new Promise((resolve, reject) => {
		var server = net.createServer();
		server.once('error', reject);
		server.once('listening', () => {
			server.close();
			resolve();
		});
		server.listen(port);
	});
}
	
SlippiServer.prototype.setSlippiIP = function setSlippiIP(val){
	this.slippiIP = val;
}
SlippiServer.prototype.setSlippiPort = function setSlippiPort(val){
	this.slippiPort = val;
}
SlippiServer.prototype.setSlippiFolder = function setSlippiFolder(val){
	this.slippiFolder = val;
}
SlippiServer.prototype.setSlippiType = function setSlippiType(val){
	this.slippiType = val;
	this.stream = new SlpLiveStream(this.slippiType);
}

SlippiServer.prototype.startSlippi = function startSlippi(){
this.realtime.setStream(this.stream);
this.stream.start(this.SlippiIP, this.SlippiPort)
	.catch(console.error);
}
SlippiServer.prototype.stopSlippi = function stopSlippi(){
	this.stream.stop();
}
SlippiServer.prototype.getStats = function getStats(val){
	var files = fs.readdirSync(this.slippiFolder, [])
	.map(function(v) {
		return { name:v };
	})
	.filter(files => files.name.endsWith('.slp'))
	files = files.sort(function(a, b) {
		let fest;
		let yuio;
		const gamer = new SlippiGame(path.normalize(this.slippiFolder + "/" +  a.name));
		const gamet = new SlippiGame(path.normalize(this.slippiFolder + "/" +  b.name));
		if (gamer.getMetadata() == null)
		fest = "1";
		else
		fest = gamer.getMetadata().startAt;
	
		if (gamet.getMetadata() == null)
		yuio = "1";
		else
		yuio = gamet.getMetadata().startAt;
		return yuio.replace(/\D/g,'') - fest.replace(/\D/g,'');
	})
	.map(function(v) { return path.normalize(this.slippiFolder + "/" +  v.name); });
	var stats = { stats: [], settings: [], metadata: []};
	
	for (var i = 0; i < parseInt(val, 10); i++) {
	const gamez = new SlippiGame(files[i]);
	stats.stats[parseInt(val, 10) - i - 1] = gamez.getStats()
	stats.settings[parseInt(val, 10) - i - 1] = gamez.getSettings()
	stats.metadata[parseInt(val, 10) - i - 1] = gamez.getMetadata()
	}
	return stats;
}
module.exports = SlippiServer;