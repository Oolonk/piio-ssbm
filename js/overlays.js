const { ipcRenderer, remote } = require('electron');
const WebSocket = require("ws");
var _callbacks = { on: {}, once: {}, hold: [] };
function port() {
	if (process.platform === "win32") {
		return (80);
	} else {

		return (8000);
	}

}
var _ws = new WebSocket("ws://127.0.0.1:" + port());
_ws.onopen = () => {
	_ws.send(JSON.stringify([
		{ "type": "subscribe", "data": "registered-overlays" },
		{ "type": "subscribe", "data": "overlay-trigger" }
	]));
};
_ws.onmessage = (msg) => {
	let data = JSON.parse(msg.data);
	switch (data.type) {
		case "registered-overlays": displayOverlayList(data.data); break;
		case "overlay-trigger": overlayTrigger(data.data); break;
	}
};

ipcRenderer.on("overlay-list", (event, data) => displayOverlayList(data));


window.onload = init;

function init() {
	ipcRenderer.send('get', { "type": "overlay-list" });
}

function displayOverlayList(list) {
	console.log("displayOverlayList");
	// console.log(list);
	let el = document.getElementById("list").truncate();
	list.forEach((overlay) => {
		let item = document.createElement("div");
		item.id = "overlay-" + overlay.id;
		item.className = "item";
		item.name = overlay.name;

		let stat = document.createElement("div");
		stat.className = "status";
		item.appendChild(stat);

		let label = document.createElement("div");
		label.className = "label";
		label.innerText = overlay.name;
		item.appendChild(label);


		el.appendChild(item);
	});
}

function overlayTrigger(overlay) {

	let elms = document.getElementById("list").childNodes;

	//console.log(elms);

	elms.forEach((el) => {
		if (el.name == overlay.source) {
			console.log(overlay.source);
			el.classList.toggle("visible", overlay.visible);
		}
	});
}


function on(name, fn) {
	if (!_callbacks.on.hasOwnProperty(name))
		_callbacks.on[name] = [];
	_callbacks.on[name].push(fn);
}
function once(name, fn) {
	if (!_callbacks.once.hasOwnProperty(name))
		_callbacks.once[name] = [];
	_callbacks.once[name].push(fn);
}
function emit(name, data) {
	if (_callbacks.hold.indexOf(name) > -1)
		return false;
	if (_callbacks.on.hasOwnProperty(name))
		_callbacks.on[name].forEach(cb => cb(data));
	if (_callbacks.once.hasOwnProperty(name)) {
		_callbacks.once[name].forEach(cb => cb(data));
		_callbacks.once[name] = [];
	}
}
