const { SlippiGame, Ports, DolphinConnection, ConnectionStatus} = require('@slippi/slippi-js');
const { SlpFolderStream, SlpLiveStream, Slpstream, SlpRealTime } = require("@vinceau/slp-realtime");

const express = require('express');
const path = require('path');
const net = require('net');
const EventEmitter = require('events');
const ExpressWs = require('express-ws');
const WebSocket = require('ws');

class SlippiServer{

	constructor(){
		this.slippiIP = '127.0.0.1';
		this.slippiPort = 0;
		this.slippiFolder = '';
		this.realtime = new SlpRealTime;
		this.slippiType = "dolphin";
		this.stream = new SlpLiveStream(this.slippiType);

		this.port = 42070;
		this.ws = new WebSocket.Server({ port: this.port });

		this.pingInterval = 10; // seconds
		
		this.event = new EventEmitter();
	
		this.theme = "";
		this.webPath = "";
		this.themeManifest = {};
		this.msgCache = {};
		this.root = ''
		this.themeWatcher;
		this.dynStatic;
		()=>{
			this.ws.on("connection", (client) => {
			  console.log("Overlay client connected!");
			});
		}
	}
	
	set SlippiIP(val){
		this.slippiIP = val;
	}
	set SlippiPort(val){
		this.slippiPort = val;
	}
	set SlippiFolder(val){
		this.slippiFolder = val;
	}
	set SlippiType(val){
		this.slippiType = val;
		this.stream = new SlpLiveStream(this.slippiType);
	}
	
	start(){
	this.realtime.setStream(this.stream);
    this.stream.start(this.SlippiIP, this.SlippiPort)
      .catch(console.error);
	}
	stop(){
		this.stream.stop();
	}
	getStats(val){
		var files = fs.readdirSync(this.slippiFolder, [])
		.map(function(v) {
		  return { name:v };
		})
		.filter(files => files.name.endsWith('.slp'))
		files = files.sort(function(a, b) {
		  var fest;
		  var yuio;
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
	
}
module.exports = SlippiServer;