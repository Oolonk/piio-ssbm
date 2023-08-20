const { SlippiGame, Ports, DolphinConnection, ConnectionStatus } = require('@slippi/slippi-js');
const { SlpFolderStream, SlpLiveStream, Slpstream, SlpRealTime } = require("@vinceau/slp-realtime");

const path = require('path');
const fs = require("fs")
const EventEmitter = require('events');
const watch = require('object-watcher').watch;


function SlippiServer() {
	this.slippiIP = '127.0.0.1';
	this.slippiPort = 0;
	this.slippiFolder;
	this.connectionStatus = ConnectionStatus;
	this.realtime = new SlpRealTime;
	this.slippiType = "console";
	this.stream = new SlpLiveStream(this.slippiType);
	this.status = null;
	this.autoconnect = false;
	this.port = 42070;

	this.pingInterval = 10; // seconds

	this.event = new EventEmitter();

	this.theme = "";
	this.webPath = "";
	this.themeManifest = {};
	this.msgCache = {};
	this.root = ''
	this.themeWatcher;
	this.playerbackup = [];
	this.cache = {
		"settings": undefined,
		"options": undefined,
		"lastFinalizedFrame": undefined,
		"latestFrameIndex": undefined,
		"options": undefined,
		"frame": undefined,
		"gameEnd": undefined,
		"lras": undefined,
		"combo": undefined
	};
	this.gameEnded = {};
	this.gameStarted = {};


}

SlippiServer.prototype.on = function on(...args) {
	this.event.on(...args);
}

SlippiServer.prototype.setAutoConnect = function setAutoConnect(val) {
	this.autoconnect = val;
}

SlippiServer.prototype.getAutoConnect = function getAutoConnect() {
	return this.autoconnect;
}
SlippiServer.prototype.setSlippiIP = function setSlippiIP(val) {
	this.slippiIP = val;
}
SlippiServer.prototype.setSlippiPort = function setSlippiPort(val) {
	this.slippiPort = parseInt(val);
}
SlippiServer.prototype.setSlippiFolder = function setSlippiFolder(val) {
	console.log(val);
	this.slippiFolder = val;
}
SlippiServer.prototype.setSlippiType = function setSlippiType(val) {
	this.slippiType = val;
}

SlippiServer.prototype.startSlippi = function startSlippi() {
	this.stream = new SlpLiveStream(this.slippiType);
	this.stream.start(this.slippiIP, (this.slippiType == "dolphin") ? Ports.DEFAULT : this.slippiPort)
		.catch(console.error());
	this.realtime.setStream(this.stream);
	if (this.slippiType == "dolphin") {
		this.autoconnect = true;
	}
	// try {
	watch(this.stream.parser, 'lastFinalizedFrame', () => {
		//fs.writeFileSync('json/realtime.combo.json', util.inspect(realtime.combo.comboComputer, {depth: Infinity}));
		var overlayData = {
			"settings": undefined,
			"options": undefined,
			"lastFinalizedFrame": undefined,
			"latestFrameIndex": undefined,
			"options": undefined,
			"frame": undefined,
			"gameEnd": undefined,
			"lras": undefined,
			"combo": undefined
		};
		// console.log(this.stream);
		overlayData.settings = this.stream.parser.settings;
		overlayData.options = this.stream.parser.options;
		overlayData.lastFinalizedFrame = this.stream.parser.lastFinalizedFrame;
		overlayData.settingsComplete = this.stream.parser.settingsComplete;
		overlayData.latestFrameIndex = this.stream.parser.latestFrameIndex;
		overlayData.gameEnd = null;
		overlayData.lras = null;
		overlayData.frame = this.stream.parser.frames[this.stream.parser.lastFinalizedFrame];
		overlayData.combo = this.realtime.combo.comboComputer.combos;
		//fs.writeFileSync('json/overlay.json', util.inspect(stream.parser.frames[stream.parser.latestFrameIndex]));
		for (var i = 0; i < 4; i++) {
			if (this.stream.parser.frames[this.stream.parser.lastFinalizedFrame]) {
				if (this.stream.parser.frames[this.stream.parser.lastFinalizedFrame].players[i]) {
					this.playerbackup[i] = this.stream.parser.frames[this.stream.parser.lastFinalizedFrame].players[i];
					//console.log("Normal wurde genommen");
				} else {
					overlayData.frame.players[i] = this.playerbackup[i];
				}
			}
		}
		this.cache = Object.assign({}, overlayData);
		this.event.emit("frame");

	});
	this.realtime.game.start$.subscribe((payload) => {
		this.gameStarted = payload;
		this.event.emit("started");
	});
	this.realtime.game.end$.subscribe((payload) => {
		var overlayData = {
			"settings": undefined,
			"options": undefined,
			"lastFinalizedFrame": undefined,
			"latestFrameIndex": undefined,
			"options": undefined,
			"frame": undefined,
			"gameEnd": undefined,
			"lras": undefined,
			"combo": undefined
		};
		overlayData.settings = this.stream.parser.settings;
		overlayData.options = this.stream.parser.options;
		overlayData.lastFinalizedFrame = this.stream.parser.lastFinalizedFrame;
		overlayData.settingsComplete = this.stream.parser.settingsComplete;
		overlayData.latestFrameIndex = this.stream.parser.latestFrameIndex;
		overlayData.options = this.stream.parser.options;
		overlayData.frame = this.stream.parser.frames[this.stream.parser.lastFinalizedFrame];
		overlayData.combo = this.realtime.combo.comboComputer.combos;
		overlayData.gameEnd = payload.gameEndMethod;
		overlayData.lras = payload.winnerPlayerIndex;
		//fs.writeFileSync('realtime.json', util.inspect(stream.parser));
		//fs.writeFileSync('json/game/overlay.json', util.inspect(overlayData));
		this.cache = Object.assign({}, overlayData);
		this.event.emit("frame");
		this.gameEnded = payload
		this.event.emit("ended");
	});

	// } catch (error) {
	// 	console.log(error);
	// }

}
SlippiServer.prototype.stopSlippi = function stopSlippi() {
	this.autoconnect = false;
	this.stream.end();
	this.stream.destroy();
	this.stream = null;
}
SlippiServer.prototype.restartSlippi = async function restartSlippi() {
	this.stream = null;
	this.startSlippi()
}
// SlippiServer.prototype.getStats = function getStats(val) {
// 	var slippiFolder = this.slippiFolder
// 	var files = fs.readdirSync(slippiFolder, [])
// 		.map(function (v) {
// 			return { name: v };
// 		})
// 		.filter(files => files.name.endsWith('.slp'))
// 	files = files.sort(function (a, b) {
// 		let game1StartTime;
// 		let game2StartTime;
// 		const game1 = new SlippiGame(path.normalize(slippiFolder + "/" + a.name));
// 		const game2 = new SlippiGame(path.normalize(slippiFolder + "/" + b.name));
// 		if (game1.getMetadata() == null)
// 			game1StartTime = "1";
// 		else
// 			game1StartTime = game1.getMetadata().startAt;

// 		if (game2.getMetadata() == null)
// 			game2StartTime = "1";
// 		else
// 			game2StartTime = game2.getMetadata().startAt;
// 		return game2StartTime.replace(/\D/g, '') - game1StartTime.replace(/\D/g, '');
// 	})
// 		.map(function (v) { return path.normalize(slippiFolder + "/" + v.name); });
// 	var stats = { stats: [], settings: [], metadata: [] };

// 	for (var i = 0; i < parseInt(val, 10); i++) {
// 		const game = new SlippiGame(files[i]);
// 		stats.stats[parseInt(val, 10) - i - 1] = game.getStats()
// 		stats.settings[parseInt(val, 10) - i - 1] = game.getSettings()
// 		stats.metadata[parseInt(val, 10) - i - 1] = game.getMetadata()
// 	}
// 	console.log(stats);
// 	return stats;
// }

SlippiServer.prototype.getStats = async function getStats(games) {
	let folder = this.slippiFolder
	var files = fs.readdirSync(this.slippiFolder, [])
		.map(function (v) {
			return { name: v };
		})
		.filter(files => files.name.endsWith('.slp'))
	files = files.sort(function (a, b) {
		var fest;
		var game2StartTime;
		const game1 = new SlippiGame(path.normalize(folder + "/" + a.name));
		const game2 = new SlippiGame(path.normalize(folder + "/" + b.name));
		if (game1.getMetadata() == null)
			fest = "1";
		else
			fest = game1.getMetadata().startAt;

		if (game2.getMetadata() == null)
			game2StartTime = "1";
		else
			game2StartTime = game2.getMetadata().startAt;
		return game2StartTime.replace(/\D/g, '') - fest.replace(/\D/g, '');
	})
		.map(function (v) { return path.normalize(folder + "/" + v.name); });
	let stats = { stats: [], settings: [], metadata: [] };
	var x = 0;
	for (var i = 0; i < parseInt(games, 10); i++) {
		const gamez = new SlippiGame(files[i]);
		stats.stats[parseInt(await games, 10) - i - 1] = gamez.getStats();
		stats.settings[parseInt(await games, 10) - i - 1] = gamez.getSettings()
		stats.metadata[parseInt(await games, 10) - i - 1] = gamez.getMetadata()
		x++;
	}
	return (stats);

}
module.exports = SlippiServer;