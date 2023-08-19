let process2;
if (navigator.appVersion.indexOf("Win") != -1) {
	process2 = 80;
} else {
	process2 = 8000;
}
let declared = true;
try {
	theVariable;
}
catch (e) {
	if (e.name == "ReferenceError") {
		declared = false;
	}
}
if (declared) {
	process2 = process;
}
class WSWrapper {
	constructor(url, port, autoconnect) {
		autoconnect = (autoconnect == null ? true : autoconnect);
		this.ws = null;
		this.url = url || "127.0.0.1";
		this.port = port || process2;
		this.reconnect = true;
		this.reconnectAttempts = 5;
		this.reconnectCounter = 0;
		this.reconnectTimer = 2000;
		this.reconnectTimeout = null;
		this._callbacks = { on: {}, once: {}, any: [] };

		if (autoconnect) {
			this.connect();
		}
	}

	connect() {
		let pattern = /^((ws|wss):\/\/)/;
		let url = (pattern.test(this.url) ? '' : 'ws://') + this.url;
		try {
			this.ws = new WebSocket(url + ":" + this.port);
		} catch (err) {
			this._wsErrored(err);
			console.log(err);
		}
		this.ws.onopen = e => this._wsOpened(e);
		this.ws.onclose = e => this._wsClosed(e);
		this.ws.onerror = e => this._wsErrored(e);
		this.ws.onmessage = e => this._wsMessage(e);
	}

	_wsOpened(e) {
		console.log(`WebSocket connected to ${this.url}:${this.port}`);
		this.reconnectCounter = 0;
		this.emit("open", e);
	}

	_wsClosed(e) {
		console.log(`WebSocket to ${this.url}:${this.port} has diconnected`);
		if (this.reconnect && this.reconnectAttempts > this.reconnectCounter) {
			this.reconnectCounter++;
			this._reconnect();
		} else {
			this.reconnectCounter = 0;
		}
		this.emit("close", e);
	}

	_wsErrored(e) {
		this.emit("error", e);
	}

	_wsMessage(e) {
		this.emit("message", e.data);
		try {
			let data = JSON.parse(e.data);
			this.emit("data", data);
			if (data.hasOwnProperty("type") && data.hasOwnProperty("data")) {
				this.emit("data-" + data.type, data.data);
			}
		} catch (err) {
			console.error(err);
		}
	}

	_reconnect() {
		this.emit("reconnect");
		console.log(`Reconnect to ${this.url} in ${this.reconnectTimer} ms`);
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
		}
		this.reconnectTimeout = setTimeout(() => this.connect(), this.reconnectTimer);
	}

	on(name, callback) {
		if (!this._callbacks.on.hasOwnProperty(name)) {
			this._callbacks.on[name] = [];
		}
		this._callbacks.on[name].push(callback);
	}

	any(callback) {
		this._callbacks.any.push(callback);
	}

	once(name, callback) {
		if (!this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name] = [];
		}
		this._callbacks.once[name].push(callback);
	}

	emit(name, data) {
		this._callbacks.any.forEach(cb => cb(name, data));
		if (this._callbacks.on.hasOwnProperty(name)) {
			this._callbacks.on[name].forEach(cb => cb(data));
		}
		if (this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name].forEach(cb => cb(data));
			this._callbacks.once[name] = [];
		}
	}

	send(arg1, arg2) {
		let data = arg2 ? { type: arg1, data: arg2 } : arg1;
		if (!this.Open) {
			console.error("Socket not connected", this.url, this.port);
			console.log("attempted to send:", data);
			return false;
		}
		if (typeof (data) !== "string") {
			try {
				data = JSON.stringify(data);
			} catch (err) {
				console.error(err);
				return false;
			}
		}
		this.ws.send(data);
		return true;
	}

	get Open() {
		return this.ws != null && this.ws.readyState == WebSocket.OPEN;
	}

}