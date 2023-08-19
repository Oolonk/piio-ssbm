/* --exclude-from-all */

class TwitchWrapper {
	constructor(params) {
		if (!params)
			params = {};
		this.token = params.token || "";
		this.clientID = params.clientID || "oulv6mq31wvbfiec8vds8nzo896110";
		this.userID = 0;
		this.userName = "";
		this.redirect = "http://localhost/oauth2/twitch";
		this.ws = null

		this.https = require("https");

		this.scopes = ["user:edit", "bits:read", "user:edit:broadcast", "clips:edit", "channel:moderate", "chat:read", "chat:edit",
			"channel_commercial", "channel_editor", "channel_read", "channel_stream", "channel_subscriptions"];


		this._callbacks = { on: {}, once: {}, any: [] };

	}

	test() {
		this.authenticate();
	}

	connectWs() {
		this.ws = new WebSocket("wss://pubsub-edge.twitch.tv");
		this.ws.onopen = e => {
			this.ws.send(JSON.stringify({
				"type": "LISTEN",
				"nonce": "44h1k13746815ab1r2",
				"data": {
					"topics": ["channel-subscribe-events-v1." + this.userID, "channel-bits-events-v1." + this.userID],
					"auth_token": this.token
				}
			}));
			this.ws.send('{type:"PING"}');
		};
		this.ws.onmessage = e => {
			console.log(e);
		};

		/*
		bits send look like this:
		{"type":"MESSAGE","data":{"topic":"channel-bits-events-v1.82775102","message":"{\"data\":{\"user_name\":\"livastyle\",\"channel_name\":\"geekygoonsquad\",\"user_id\":\"27393980\",\"channel_id\":\"82775102\",\"time\":\"2018-11-25T21:57:20.669Z\",\"chat_message\":\"cheer1 test message\",\"bits_used\":1,\"total_bits_used\":80,\"context\":\"cheer\",\"badge_entitlement\":null},\"version\":\"1.0\",\"message_type\":\"bits_event\",\"message_id\":\"213fe157-a84f-502b-be62-a8ee7db2b201\"}"}}

		*/
	}

	authenticate(force) {
		let state = Math.round(Math.random() * 10000000);
		let url = "https://id.twitch.tv/oauth2/authorize?client_id=" + this.clientID + "&redirect_uri=" + this.redirect + "&response_type=token&scope=" + this.scopes.join("+") + "&state=" + state;
		if (force)
			url += "&force_verify=true";
		let authWindow = window.open(url);
		window.addEventListener('message', async e => {
			let hash = e.data.hash.substr(1);
			let params = JSON.parse('{"' + decodeURI(hash).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}')
			if (state == params.state) {
				this.Token = params.access_token;
				authWindow.close();
			}
		});
	}

	update(data) {
		return this.post("channels/" + this.userID, data, "PUT");
	}

	commercial(secs) {
		return this.post("channels/" + this.userID + "/commercial", '{"length":' + secs + '}');
	}

	get(path) {
		return new Promise((resolve, reject) => {
			let options = {
				hostname: TwitchWrapper.APIHOST,
				path: TwitchWrapper.APIPATH + '/' + path,
				port: 443,
				method: 'GET',
				headers: {
					'Client-ID': this.clientID,
					'Authorization': 'OAuth ' + this.token,
					'Accept': 'application/vnd.twitchtv.v5+json'
				}
			};
			let req = this.https.request(options, (res) => {
				if (res.statusCode == 200) {
					let data = "";
					res.setEncoding('utf8');
					res.on('data', chunk => data += chunk);
					res.on('end', () => {
						resolve(JSON.parse(data));
					});
				} else {
					reject(res.statusCode);
				}
			});
			req.on('error', (e) => {
				reject(e);
			});
			req.end();
		});
	}

	post(path, post_data, method) {
		return new Promise((resolve, reject) => {
			let options = {
				hostname: TwitchWrapper.APIHOST,
				path: TwitchWrapper.APIPATH + '/' + path,
				port: 443,
				method: method || 'POST',
				headers: {
					'Client-ID': this.clientID,
					'Authorization': 'OAuth ' + this.token,
					'Accept': 'application/vnd.twitchtv.v5+json',
					'Content-Length': Buffer.byteLength(post_data),
					'Content-Type': 'application/json'
				}
			};
			console.log(options);
			let req = this.https.request(options, (res) => {
				console.log(res.statusCode);
				if (res.statusCode == 200) {
					let data = "";
					res.setEncoding('utf8');
					res.on('data', chunk => data += chunk);
					res.on('end', () => {
						resolve(JSON.parse(data));
					});
				} else {
					reject(res.statusCode);
				}
			});
			req.write(post_data);
			req.on('error', (e) => {
				reject(e);
			});
			req.end();
		});
	}

	isAuthenticated() {
		return new Promise(async (resolve, reject) => {
			if (this.token && this.token.length > 0) {
				let res = await this.get("/");
				this.userID = res.token.valid ? res.token.user_id : "";
				this.userName = res.token.valid ? res.token.user_name : "";
				resolve(res.token.valid || false);
			} else {
				resolve(false);
			}
		});
	}

	set Token(val) {
		this.token = val;
		this.isAuthenticated().then(authenticated => this.emit(authenticated ? "open" : "close"));
	}

	on(name, callback) {
		if (callback == undefined) {
			this._callbacks.any.push(name); // name is callback
		} else {
			if (!this._callbacks.on.hasOwnProperty(name)) {
				this._callbacks.on[name] = [];
			}
			this._callbacks.on[name].push(callback);
		}
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


}

TwitchWrapper.APIHOST = "api.twitch.tv";
TwitchWrapper.APIPATH = "/kraken";