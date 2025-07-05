const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');
const EventEmitter = require('events');
const ExpressWs = require('express-ws');
const WebSocket = require('ws');
function port() {
	if (process.platform === "win32") {
		return (80);
	} else {

		return (8000);
	}
}

function Server() {
	this.server = express();
	this.expressWs = ExpressWs(this.server);
	this.port = port();

	this.pingInterval = 10; // seconds
	this.socket = require('dgram').createSocket('udp4');

	this.event = new EventEmitter();

	this.theme = "";
	this.webPath = "";
	this.themeManifest = {};
	this.msgCache = {};
	this.root = ''
	this.themeWatcher;
	this.dynStatic;
}

Server.prototype.on = function on(...args) {
	this.event.on(...args);
}

Server.prototype.start = async function start() {
	var self = this;

	this.themeWatcher = fs.watch(path.join(APPRES, 'themes'));
	this.themeWatcher.on("change", () => this.event.emit("themefolder-changed"));

	this.dynStatic = this.createDynStatic(path.join(this.webPath, 'themes/' + this.theme));
	this.server.use('/assets', express.static(path.join(this.webPath, 'assets')));
	this.server.use('/class', express.static(path.join(this.root, 'class')));
	this.server.get('/:filename', (req, res, next) => {
		try {
			let cont = fs.readFileSync(path.join(this.webPath, 'themes/' + this.theme, req.params.filename + ".html"), 'utf8');
			res.write('<!DOCTYPE html>\r\n');
			res.write('<html>\r\n');
			res.write('<head>\r\n');
			res.write('<meta charset="UTF-8" />\r\n');
			res.write('<title>Piio | ' + (this.themeManifest.name || this.theme) + ' | ' + req.params.filename + ' ' + (this.themeManifest.resolution ? '[' + self.themeManifest.resolution.join(",") + ']' : '') + '</title>\r\n');
			if (this.themeManifest.styles) {
				for (let i = 0; i < this.themeManifest.styles.length; i++) {
					res.write('<link rel="stylesheet" href="' + this.themeManifest.styles[i] + '" type="text/css" />\r\n');
				}
			}
			res.write('<link rel="stylesheet" href="' + ((this.themeManifest.folders && this.themeManifest.folders.css)? this.themeManifest.folders.css + "/" : "" ) + req.params.filename + '.css" type="text/css" />\r\n');

			if (this.themeManifest.scripts) {
				for (let i = 0; i < this.themeManifest.scripts.length; i++) {
					res.write('<script type="text/javascript" src="' + this.themeManifest.scripts[i] + '"></script>\r\n');
				}
			}

			res.write('<script type="text/javascript" src="all.js"></script>\r\n');
			res.write('<script type="text/javascript" src="' + ((this.themeManifest.folders && this.themeManifest.folders.js)? this.themeManifest.folders.js + "/" : "" ) + req.params.filename + '.js"></script>\r\n');
			res.write('<script type="text/javascript">var __FILENAME__ = "' + req.params.filename + '";</script>\r\n');
			res.write('</head>\r\n');
			if (this.themeManifest.resolution) {
				res.write('<body style="width:' + (this.themeManifest.resolution[0] || "auto") + 'px;height:' + (this.themeManifest.resolution[1] || "auto") + 'px;">\r\n');
			} else {
				res.write('<body>\r\n');
			}
			res.write(cont);
			res.write('\r\n</body>\r\n');
			res.write('</html>\r\n');
			res.end();
		} catch (err) {
			next();
		}
	});

	this.server.use(this.dynStatic);

	this.server.get('/all.js', (req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/javascript' });
		res.write("\r\n const process = '" + port() + "';\r\n");
		fs.readdir(path.join(this.root, 'class'), (err, files) => {
			if (err) throw err;
			files.forEach(file => {
				if (file.endsWith(".class.js")) {
					let cont = fs.readFileSync(path.join(this.root, 'class/' + file), 'utf8');
					let firstLine = cont.substr(0, cont.indexOf("\r\n"));
					if (!firstLine.includes("--exclude-from-all")) {
						res.write("\r\n/* ------------- */\r\n");
						res.write("/* " + file + " */\r\n");
						res.write("/* ------------- */\r\n");
						res.write("\r\n" + cont + "\r\n");
					}
				}
			});
			// get overlay utils file
			let cont = fs.readFileSync(path.join(this.root, 'overlay-utils.js'), 'utf8');
			res.write("\r\n/* ------------- */\r\n");
			res.write("/* overlay-utils.js */\r\n");
			res.write("/* ------------- */\r\n");
			res.write("\r\n" + cont + "\r\n");
			res.end();
		});
	});

	this.server.get('/', (req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		fs.readdir(path.join(this.webPath, 'themes/' + this.theme), (err, files) => {
			if (err) throw err;
			let manifest;
			try {
				manifest = JSON.parse(fs.readFileSync(path.join(this.webPath, 'themes/' + this.theme + '/manifest.json')));
			} catch (err) { }
			res.write('<html><head><title>' + this.theme + ' | piio overlays</title><meta charset="UTF-8" />');
			res.write(`<style>
			body {
				font-family:segoe ui, arial; color: black; margin:0; background: #dee3ed;
			}
			@media (prefers-color-scheme: dark) {
				body{
					color:white;
					background: #121721;
				}
				#top{
				background:#092334 !important;
				color: white !important;
				}
			}
			#top {
				position:relative; background:#6f899a; font-weight:bold; font-size:40px; color:black; padding:4px 15px;
			}
			.meta {
				position:absolute; right:10px; top:6px; font-size:12px; opacity:0.9; font-weight:normal; text-align:right;
			}
			#overlay-list a {
				display:block; width:300px; color:inherit; font-size:16px; font-weight:bold; text-transform:uppercase; padding:10px; border:1px solid #eee; margin:10px; border-radius:5px; text-decoration:none; transition:all 100ms;
			}
			#overlay-list a:hover {
				color:#fff; background:#000; transition:all 0ms;
			}
			#info {
				padding:20px;
			}
			</style>`);
			res.write('</head><body>');
			res.write('<div id="top">');
			res.write((manifest && manifest.name) ? manifest.name : this.theme);
			res.write(`<div class="meta">
			<div>${manifest.author}</div>
			<div>${manifest.resolution != null ? `${manifest.resolution[0]} x ${manifest.resolution[1]}` : `dynamic resolution`}</div>
			<div>${manifest.caster} caster</div>
			</div>`);
			res.write('</div>');
			res.write('<div id="overlay-list" style="display:flex;flex-wrap:wrap;">');
			files.filter(x => x.endsWith(".html")).forEach((file) => {
				let fileName = file.substr(0, file.length - 5);
				res.write('<a href="' + fileName + '">' + fileName + '</a>');
			});
			res.write('</div>');
			res.write('<div id="info">');
			if (manifest) {
				res.write(`<h3>Custom fields:</h3>`);

				manifest.fields.forEach((field) => {
					res.write('<li>' + field.label + '</li>');
				});

				// res.write('<pre>' + JSON.stringify(manifest) + '</pre>');

			} else {
				res.write(`<b>manifest.json</b> not found in "themes/${this.theme}/manifest.json"`);
			}

			res.write('</div>');
			res.write('</body></html>');
			res.end();
		});
	});

	// handle WebSocket connections
	this.server.ws('/', (ws, req) => {
		ws.isAlive = true;
		ws.subscriptions = [];
		ws._SELF = null;
		ws.receiveAll = false;
		ws.on('pong', () => ws.isAlive = true);
		ws.on('message', (msg) => {
			try {
				let data = JSON.parse(msg);
				if (!Array.isArray(data)) {
					data = [data];
				}
				data.forEach((d) => {
					switch(d.type) {
						default:
					this.handleMessage(d, ws);
					this.broadcast(JSON.stringify(d), ws);
					break;
					}
				});
			} catch (error) {
				console.log("error:", error);
			}
		});
		ws.on("close", () => {
			this.broadcastRegisteredOverlays();
		});
	});

	// handle 404
	this.server.get("/*splat", (req, res, next) => res.sendStatus(404));
	this.checkPort(this.port).then(() => {
		console.log("Start server on port", this.port);
		this.server.listen(this.port, () => this.event.emit("listening"));
		this.socket.bind(0);
		setInterval(() => this.ping(), this.pingInterval * 1000);
	}).catch(() => {
		this.event.emit("port-in-use");
	});
}

Server.prototype.checkPort = function checkPort(port) {
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

Server.prototype.handleMessage = function handleMessage(inData, ws) {
	this.event.emit("data-" + inData.type, inData.data);
	switch (inData.type) {
		case "request": return this.responseRequest(ws, inData.data); break;
		case "subscribe": return subscribe.call(ws, inData.data); break;
		case "register": return this.registerOverlay(ws, inData.data); break;
		case "api":
			this.event.emit("api", inData.data, (outData) => {
				console.log(inData);
				outData.mid = inData.mid;
				console.log(outData);
				ws.send(JSON.stringify(outData));
			});
			break;
	}
}

Server.prototype.setTheme = function setTheme(val) {
	if (this.theme == val) { return; }
	this.theme = val;
	this.themeManifest = {};
	fs.readFile(path.join(this.webPath, 'themes/' + this.theme, 'manifest.json'), 'utf8', (err, cont) => {
		if (!err) {
			try {
				this.themeManifest = JSON.parse(cont);
			} catch (err) { }
		}
		if (this.dynStatic) {
			this.dynStatic.setPath(path.join(this.webPath, 'themes/' + this.theme));
		}
	});
}

Server.prototype.responseRequest = function responseRequest(client, type) {
	if (this.msgCache.hasOwnProperty(type)) {
		client.send(this.msgCache[type]);
	}
}

Server.prototype.registerOverlay = function registerOverlay(client, name) {
	client._SELF = name;
	this.broadcastRegisteredOverlays();
}

Server.prototype.broadcastRegisteredOverlays = function broadcastRegisteredOverlays() {
	var list = this.getOverlays();
	this.broadcast(JSON.stringify({
		"type": "registered-overlays",
		"data": list
	}));
}

Server.prototype.getOverlays = function getOverlays(path, options) {
	var list = [];
	this.expressWs.getWss().clients.forEach(client => {
		if (client._SELF) {
			list.push(client._SELF);
		}
	});
	return list;
}

Server.prototype.createDynStatic = function createDynStatic(path, options) {
	var statics = express.static(path, options);
	var dyn = function (req, res, next) {
		return statics(req, res, next)
	}
	dyn.setPath = function (newPath) {
		statics = express.static(newPath, options)
	}
	return dyn;
}

Server.prototype.broadcast = function broadcast(data, sender = null) {
	var self = this;
	var sendObj = (typeof data == "string" ? JSON.parse(data) : data);
	var jsonStr = (typeof data == "string" ? data : JSON.stringify(data));
	self.msgCache[sendObj.type] = jsonStr;
	self.expressWs.getWss().clients.forEach((client) => {
		// check if not the same && if client has subscribed to this type
		if ((sender == null || client != sender) && (client.subscriptions.includes(sendObj.type) || client.receiveAll) && client.readyState == WebSocket.OPEN) {
			client.send(jsonStr);
		}
	});
}

Server.prototype.sendToID = function sendToID(data, id) {
	var self = this;
	var sendObj = (typeof data == "string" ? JSON.parse(data) : data);
	var jsonStr = (typeof data == "string" ? data : JSON.stringify(data));
	self.msgCache[sendObj.type] = jsonStr;
	self.expressWs.getWss().clients.forEach((client) => {
		if (client._SELF != null && client._SELF.id == id) {
			console.log(client._SELF.id);
			// check if not the same && if client has subscribed to this type
			if (client.readyState == WebSocket.OPEN) {
				client.send(jsonStr);
			}
		}
	});
}
Server.prototype.ping = function ping() {
	this.expressWs.getWss().clients.forEach((client) => {
		if (client.isAlive === false) {
			return client.terminate();
		}
		client.isAlive = false;
		if (client.readyState === 1) {
			client.ping();
		}
	});
}

function subscribe(name) {
	if (name == "*") {
		this.receiveAll = true;
	} else if (!this.subscriptions.includes(name)) {
		this.subscriptions.push(name);
	}
}

module.exports = Server;