const { ipcRenderer } = require('electron');
const remote = require('@electron/remote');
const { BrowserWindow } = require('@electron/remote');
const db = remote.require("./main").database;

window.addEventListener("load", () => {
	let el = document.getElementById('titlebar');
	if (!el) { return };
	el.appendChild(createElement({ "type": "div", "className": "titlebarLogo" }));
	el.appendChild(createElement({ "type": "div", "className": "title", "text": document.title }));
	let controlsEl = createElement({ "type": "div", "className": "controls" });
	controlsEl.appendChild(createElement({ "type": "div", "className": "minimize", "onclick": () => remote.BrowserWindow.getFocusedWindow().minimize() }));
	controlsEl.appendChild(createElement({
		"type": "div", "className": "maximize", "onclick": () => {
			let w = remote.BrowserWindow.getFocusedWindow();
			w.isMaximized() ? w.unmaximize() : w.maximize();
		}
	}));
	controlsEl.appendChild(createElement({ "type": "div", "className": "close", "onclick": () => remote.BrowserWindow.getFocusedWindow().close() }));
	el.appendChild(controlsEl);

	document.body.classList.toggle("focused", remote.getCurrentWindow().isFocused());
});


function remoteOn(target, event, callback) {
	target.addListener(event, callback);
	window.addEventListener('beforeunload', () => {
		target.removeListener(event, callback);
	});
}

remoteOn(remote.getCurrentWindow(), "blur", windowBlurHandler);
remoteOn(remote.getCurrentWindow(), "focus", windowFocusHandler);
remoteOn(remote.getCurrentWindow(), "maximize", maximizeHandler);
remoteOn(remote.getCurrentWindow(), "unmaximize", unmaximizeHandler);
remoteOn(remote.getCurrentWindow(), "page-title-updated", pageTitleUpdatedHandler);

function maximizeHandler() {
	document.body.classList.add("maximized");
}

function windowFocusHandler() {
	document.body.classList.add("focused");
}

function windowBlurHandler() {
	document.body.classList.remove("focused")
}

function unmaximizeHandler() {
	document.body.classList.remove("maximized")
}

function pageTitleUpdatedHandler(e, val) {
	let el = document.getElementById('titlebar');
	if (!el) { return; }
	el.querySelector("#titlebar .title").innerText = val;
}


function createElement(params) {
	let defaults = {
		"type": "div",
		"className": "",
		"text": "",
		"append": null,
		"prepend": null,
		"id": "",
		"onclick": null
	};
	params = Object.assign(defaults, params);
	let el = document.createElement(params.type);
	el.className = params.className;
	el.id = params.id;
	if (params.text)
		el.innerText = params.text;
	if (params.append !== null)
		el.appendChild(params.append);
	if (params.prepend !== null)
		el.prepend(params.prepend);
	if (params.onclick)
		el.onclick = params.onclick;

	return el;
}

HTMLInputElement.prototype.insertValue = function (val) {
	let start = this.selectionStart;
	let end = this.selectionEnd;
	this.value = val || "";
	this.selectionStart = start;
	this.selectionEnd = end;
}

HTMLElement.prototype.truncate = function () {
	while (this.firstChild)
		this.removeChild(this.firstChild);
	return this;
};
HTMLElement.prototype.getIndexIn = function (parentElm) {
	let childElm = this;
	while (parentElm != childElm.parentNode)
		childElm = childElm.parentNode;
	return Array.prototype.slice.call(parentElm.children).indexOf(childElm);
};
HTMLElement.prototype.getIndex = function () {
	return Array.prototype.slice.call(this.parentNode.children).indexOf(this);
};

async function openWindow(name, params, dialog) {
	return await ipcRenderer.invoke('openWindow', { name: name, params: params, dialog: dialog });
}

function getInterfaces() {
	let os = require('os');
	let ifaces = os.networkInterfaces();
	let ips = [];
	Object.keys(ifaces).forEach((ifname) => {
		ifaces[ifname].forEach(function (iface) {
			if ('IPv4' !== iface.family || iface.internal !== false) {
				// skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
				return;
			}
			if (ips.indexOf(iface.address) === -1) {
				let range = getIpRangeFromAddressAndNetmask(iface.address, iface.netmask);
				iface.base = range[0];
				iface.broadcast = range[1];
				ips.push(iface);
			}
		});
	});
	return ips;
}

function getIpRangeFromAddressAndNetmask(ip, mask) {
	let ipaddress = ip.split('.');
	let netmaskblocks = mask.split('.').map(function (el) { return parseInt(el, 10) });
	let invertedNetmaskblocks = netmaskblocks.map(function (el) { return el ^ 255; });
	let baseAddress = ipaddress.map(function (block, idx) { return block & netmaskblocks[idx]; });
	let broadcastaddress = ipaddress.map(function (block, idx) { return block | invertedNetmaskblocks[idx]; });
	return [baseAddress.join('.'), broadcastaddress.join('.')];
}


function getCPUUsage() {
	return new Promise((resolve, reject) => {
		let start = getCPU();
		setTimeout(() => {
			let end = getCPU();
			let total = end.total - start.total;
			let idle = end.idle - start.idle;
			resolve(1 - idle / total);
		}, 1000);
	});
}

function getCPU() {
	let os = require('os');
	let cores = os.cpus();
	let total = 0;
	let idle = 0;
	cores.forEach(core => {
		total += core.times.user;
		total += core.times.nice;
		total += core.times.sys;
		total += core.times.irq;
		total += core.times.idle;
		idle += core.times.idle;
	});
	return { 'total': total, 'idle': idle };
}

function fileExists(file) {
	return new Promise((resolve, reject) => fs.access(file, fs.constants.F_OK, err => resolve(err ? false : true)));
}

function deep_value(obj, path) {
	path = path.split('.');
	for (let i = 0, len = path.length; i < len; i++)
		obj = obj[path[i]];
	return obj;
};