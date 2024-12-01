const { SlippiGame, Ports, DolphinConnection, ConnectionStatus } = require('@slippi/slippi-js');
const { SlpFolderStream, SlpLiveStream, Slpstream, SlpRealTime } = require("@vinceau/slp-realtime");

const path = require('path');
const fs = require("fs")
const EventEmitter = require('events');
const watch = require('object-watcher').watch;


function Slippi() {
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

Slippi.prototype.on = function on(...args) {
	this.event.on(...args);
}

Slippi.prototype.setAutoConnect = function setAutoConnect(val) {
	this.autoconnect = val;
}

Slippi.prototype.getAutoConnect = function getAutoConnect() {
	return this.autoconnect;
}
Slippi.prototype.setSlippiIP = function setSlippiIP(val) {
	this.slippiIP = val;
}
Slippi.prototype.setSlippiPort = function setSlippiPort(val) {
	this.slippiPort = parseInt(val);
}
Slippi.prototype.setSlippiFolder = function setSlippiFolder(val) {
	console.log(val);
	this.slippiFolder = val;
}
Slippi.prototype.setSlippiType = function setSlippiType(val) {
	this.slippiType = val;
}

Slippi.prototype.startSlippi = function startSlippi() {
	if(typeof this.stream == 'object' && this.stream != null) {
		this.stream.destroy();
	}
	this.stream = new SlpLiveStream(this.slippiType);
	this.stream.start(this.slippiIP, (this.slippiType == "dolphin") ? Ports.DEFAULT : this.slippiPort)
		.catch(console.error());
	this.realtime = new SlpRealTime();
	this.realtime.setStream(this.stream);
	if (this.slippiType == "dolphin") {
		this.autoconnect = true;
	}
	// try {
	watch(this.stream.parser, 'lastFinalizedFrame', () => {
		// console.log(this.stream);
		this.cache.settings = this.stream.parser.settings;
		this.cache.options = this.stream.parser.options;
		this.cache.lastFinalizedFrame = this.stream.parser.lastFinalizedFrame;
		this.cache.settingsComplete = this.stream.parser.settingsComplete;
		this.cache.latestFrameIndex = this.stream.parser.latestFrameIndex;
		this.cache.gameEnd = null;
		this.cache.lras = null;
		this.cache.frame = this.stream.parser.frames[this.stream.parser.lastFinalizedFrame];
		this.cache.combo = this.realtime.combo.comboComputer.combos;
		//fs.writeFileSync('json/overlay.json', util.inspect(stream.parser.frames[stream.parser.latestFrameIndex]));
		for (var i = 0; i < 4; i++) {
			if (this.stream.parser.frames[this.stream.parser.lastFinalizedFrame]) {
				if (this.stream.parser.frames[this.stream.parser.lastFinalizedFrame].players[i]) {
					this.playerbackup[i] = this.stream.parser.frames[this.stream.parser.lastFinalizedFrame].players[i];
					//console.log("Normal wurde genommen");
				} else {
					this.cache.frame.players[i] = this.playerbackup[i];
				}
			}
		}
		this.cache = Object.assign({}, this.cache);
		this.event.emit("frame");

	});
	this.realtime.game.start$.subscribe((payload) => {
		this.gameStarted = payload;
		this.event.emit("started", payload);
	});
	this.realtime.game.end$.subscribe((payload) => {
		this.cache.settings = this.stream.parser.settings;
		this.cache.options = this.stream.parser.options;
		this.cache.lastFinalizedFrame = this.stream.parser.lastFinalizedFrame;
		this.cache.settingsComplete = this.stream.parser.settingsComplete;
		this.cache.latestFrameIndex = this.stream.parser.latestFrameIndex;
		this.cache.options = this.stream.parser.options;
		this.cache.frame = this.stream.parser.frames[this.stream.parser.lastFinalizedFrame];
		this.cache.combo = this.realtime.combo.comboComputer.combos;
		this.cache.gameEnd = payload.gameEndMethod;
		this.cache.lras = payload.winnerPlayerIndex;
		//fs.writeFileSync('realtime.json', util.inspect(stream.parser));
		//fs.writeFileSync('json/game/overlay.json', util.inspect(this.cache));
		this.cache = Object.assign({}, this.cache);
		this.event.emit("frame");
		this.gameEnded = payload
		this.event.emit("ended", payload);
	});

	// } catch (error) {
	// 	console.log(error);
	// }

}
Slippi.prototype.stopSlippi = function stopSlippi() {
	this.autoconnect = false;
	this.stream.end();
	this.stream.destroy();
}
Slippi.prototype.restartSlippi = async function restartSlippi() {
	this.stream = null;
	this.startSlippi()
}
Slippi.prototype.getStats = async function getStats(games) {
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
module.exports = Slippi;