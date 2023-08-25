class PiioConnector {
	constructor(name, requests, subscriptions) {
		this.address = location.hostname;
		this.port = location.port;
		this.id = Date.now().toString(32) + Math.ceil(Math.random() * 1000).toString(32);
		this.name = name || this.id;
		this.ws = null;
		this._callbacks = { on: {}, once: {}, any: [] };
		this.debug = false;
		this.debugTimeout;
		this.messageIdCounter = 1;
		this.awaitingCommandReturns = {};
		this.requests = requests || ["scoreboard"];
		this.subscriptions = this.requests || [];

		this.cache = { scoreboard: {}, team: {}, character: {}, country: {}, game: {}, pride: {} };

		// this.on("theme", e => location.reload());

		this.init();
		document.onreadystatechange = (e) => this.init();
	}

	init() {
		if (document.readyState != "complete") return;
		this.connect();
		this.sourceVisibleBind(this.name);
	}

	connect() {
		this.ws = new WSWrapper(this.address, this.port, true);
		this.ws.on("data", data => {
			if (data.hasOwnProperty("type") && data.hasOwnProperty("data")) {
				data = this.processdata(data);
				this.fire(data.type, data.data);
			}
		});
		this.ws.on("open", () => {
			this.register();
			this.subscriptions.forEach(subName => this.ws.send({ "type": "subscribe", "data": subName }));
			if (!Array.isArray(this.requests))
				this.requests = [this.requests];
			this.requests.forEach(req => this.request(req));
			this.fire("ready");
		});
	}

	register() {
		this.ws.send({ "type": "register", "data": { "id": this.id, "name": this.name, "filename": __FILENAME__ } });
	}

	request(name) {
		this.ws.send({ "type": "request", "data": name });
	}

	subscribe(name) {
		this.subscriptions.push(name);
		if (this.ws && this.ws.Open) {
			this.ws.send({ "type": "subscribe", "data": name });
		}
	}

	command(module, args, cb) {
		let mid = this.messageIdCounter++;
		if (cb && typeof cb == "function") {
			this.awaitingCommandReturns[module + "-cmd-return-" + mid] = cb;
		}
		this.ws.send({ "type": module + "-cmd", "data": args, "mid": mid });
	}

	processdata(data) {
		console.log(data);
		switch (data.type) {
			case 'scoreboard':
				let sb = data.data.scoreboard;
				let db = data.data.dbEntries;
				this.cache.scoreboard = sb;
				for (let teamNum in sb.teams) {
					sb.teams[teamNum].players = this.assignPrototype(sb.teams[teamNum].players, Player);
				}
				sb.caster = this.assignPrototype(sb.caster, Player);
				for (let dbIndex in db) {
					for (let entryIndex in db[dbIndex]) {
						this.cache[dbIndex][db[dbIndex][entryIndex]._id] = db[dbIndex][entryIndex];
					}
				}
				data.data = sb;
				break;
			case 'slippiFrame':
				break;
			case 'slippiStats':
				break;
		}


		if (data.mid !== null) {
			for (let i in this.awaitingCommandReturns) {
				if (data.type + "-" + data.mid == i) {
					this.awaitingCommandReturns[i](data.data);
					delete this.awaitingCommandReturns[i];
					break;
				}
			}
		}

		return data;
	}

	getPlayer(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}

		if (this.cache.scoreboard.teams.hasOwnProperty(teamNum) && this.cache.scoreboard.teams[teamNum].players.hasOwnProperty(playerNum))
			return this.cache.scoreboard.teams[teamNum].players[playerNum];
		return null;
	}

	getPosition(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}
		let seats = this.cache.scoreboard.seatorder;
		for (let i in seats) {
			let seat = seats[i];
			if (seat[0] == teamNum && seat[1] == playerNum) {
				return i;
			}
		}
	}

	getPlayersByPosition() {
		let list = [];
		let seats = this.cache.scoreboard.seatorder;
		for (let i in seats) {
			list.push(this.getPlayer(seats[i][0], seats[i][1]));
		}
		return list;
	}

	getSelectedPlayer(teamNum) {
		if (this.TeamSize > 1 && this.cache.scoreboard.teams.hasOwnProperty(teamNum) && this.cache.scoreboard.teams[teamNum].selected !== null) {
			return this.cache.scoreboard.teams[teamNum].selected;
		}
		return 0;
	}

	getTeamName(teamNum, options) {
		options = options || {};
		let before = options.before || "";
		let after = options.after || "";
		let delimiter = options.delimiter || " / ";

		let value = "";
		if (!this.cache.hasOwnProperty("scoreboard") || !this.cache.scoreboard.hasOwnProperty("teams") || !this.cache.scoreboard.teams.hasOwnProperty(teamNum)) {
			return ""; // team not here - something broken
		}
		if (!this.cache.scoreboard.teams[teamNum].hasOwnProperty("name") || this.cache.scoreboard.teams[teamNum].name.length == 0) {
			// build teamname out of names
			value = this.getTeamPlayers(teamNum).map(x => x.name).join(delimiter);
		} else {
			value = this.cache.scoreboard.teams[teamNum].name;
		}
		return before + value + after;
	}

	getTeamStatus(teamNum, playerNum) {
		if (this.cache.scoreboard.type != "crews" || !this.cache.scoreboard.teams.hasOwnProperty(teamNum)) {
			return null;
		}
		let list = [];

		this.cache.scoreboard.teams[teamNum].out.forEach((isOut, index) => {
			list.push({
				"out": isOut,
				"selected": this.cache.scoreboard.teams[teamNum].selected == index
			});
		});

		if (playerNum != null) {
			return list[playerNum];
		}

		return list;
	}

	getTeamPlayers(teamNum) {
		if (!this.cache.scoreboard.teams.hasOwnProperty(teamNum)) {
			return [];
		}
		let list = this.cache.scoreboard.teams[teamNum].players;

		list = list.filter(player => player.name != "");

		return list;
	}

	getScore(teamNum) {
		if (this.cache.scoreboard.teams.hasOwnProperty(teamNum))
			return this.cache.scoreboard.teams[teamNum].score;
		return null;
	}
	getState(teamNum) {
		if (this.cache.scoreboard.teams.hasOwnProperty(teamNum))
			return this.cache.scoreboard.teams[teamNum].state;
		return null;
	}

	getCountry(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}
		let po = this.getPlayer(teamNum, playerNum);
		if (po && this.cache.country.hasOwnProperty(po.country))
			return this.cache.country[po.country];
		return null;
	}

	getCountry(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}
		let po = this.getPlayer(teamNum, playerNum);
		if (po && this.cache.pride.hasOwnProperty(po.pride))
			return this.cache.pride[po.pride];
		return null;
	}

	getPort(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}
		for (let i in this.cache.scoreboard.ports) {
			if (this.cache.scoreboard.ports[i] != null && this.cache.scoreboard.ports[i][0] == teamNum && this.cache.scoreboard.ports[i][1] == playerNum) {
				return parseInt(i);
			}
		}
		return null;
	}

	getCharacter(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}
		if (!this.cache.scoreboard.teams.hasOwnProperty(teamNum) || !this.cache.scoreboard.teams[teamNum].characters.hasOwnProperty(playerNum) || this.TeamSize <= playerNum)
			return null;
		let co = this.cache.scoreboard.teams[teamNum].characters[playerNum];
		if (co && this.cache.character.hasOwnProperty(co[0])) {
			let c = new Character(this.cache.character[co[0]]);
			c.defaultSkin = co[1];
			return c;
		}
		return null;
	}

	getPlayerTeams(teamNum, playerNum) {
		if (playerNum == null) {
			playerNum = this.getSelectedPlayer(teamNum);
		}
		let po, teams = [];
		if (teamNum instanceof Player) {
			po = teamNum;
		} else {
			playerNum = playerNum || 0;
			po = this.getPlayer(teamNum, playerNum);
		}
		if (po == null) {
			return [];
		}
		po.team.forEach(teamID => {
			if (this.cache.team.hasOwnProperty(teamID))
				teams.push(this.cache.team[teamID]);
		});
		return teams;
	}

	getCaster(casterNum) {
		if (this.cache.scoreboard.caster.hasOwnProperty(casterNum - 1))
			return this.cache.scoreboard.caster[casterNum - 1];
		return null;
	}

	getGame() {
		if (!this.cache.scoreboard.hasOwnProperty("game")) {
			return null;
		}
		if (!this.cache.game.hasOwnProperty(this.cache.scoreboard.game)) {
			return null;
		}
		return this.cache.game[this.cache.scoreboard.game];
	}

	getField(name) {
		try {
			return this.cache.scoreboard.fields[name];
		} catch (e) {
			return { value: "", enabled: false };
		}
	}

	getFieldValue(name) {
		let field = this.getField(name);
		return field.value;
	}

	get TeamSize() {
		return Math.max(this.cache.scoreboard.teams[1].players.length, this.cache.scoreboard.teams[2].players.length);
	}

	get Game() {
		return piio.cache.game[this.cache.scoreboard.game];
	}

	assignPrototype(docs, proto) {
		for (let i in docs) {
			if (proto.length == 1)
				docs[i] = new proto(docs[i]);
			else
				docs[i].__proto__ = proto.prototype;
		}
		return docs;
	}

	resolve(dbName, id) {
		return this.cache[dbName][id];
	}



	sourceVisibleBind(arg) {

		if (typeof arg == "string") {
			arg = { "source": arg };
		}
		let params = {
			"source": arg.source || "",
			"element": arg.element || document.body,
			"visibleClass": arg.visibleClass || "visible",
			"hiddenClass": arg.hiddenClass || "hidden",
			"default": arg.default || true
		};

		params.element.classList.toggle(params.visibleClass, params.default);
		params.element.classList.toggle(params.hiddenClass, !params.default);

		this.subscribe("overlay-trigger");
		this.on("overlay-trigger", (data) => {
			if (data.source != params.source || !params.element) { return; }
			if (data.visible == null) {
				data.visible = params.element.classList.contains(params.hiddenClass);
			}
			params.element.classList.toggle(params.visibleClass, data.visible);
			params.element.classList.toggle(params.hiddenClass, !data.visible);
		});
	}

	on(name, callback) {
		if (!this._callbacks.on.hasOwnProperty(name)) {
			this._callbacks.on[name] = [];
		}
		this._callbacks.on[name].push(callback);
	}

	once(name, callback) {
		if (!this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name] = [];
		}
		this._callbacks.once[name].push(callback);
	}

	fire(name, data) {
		if (this._callbacks.on.hasOwnProperty(name)) {
			this._callbacks.on[name].forEach(cb => cb(data));
		}
		if (this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name].forEach(cb => cb(data));
			this._callbacks.once[name] = [];
		}
	}
	slippi = {
		moveId(move) {
			switch (move) {
				case 1:
					return "Item Throw";
				case 2:
					return "Jab";
				case 3:
					return "Jab";
				case 4:
					return "Jab";
				case 5:
					return "Jab";
				case 6:
					return "Dash Attack";
				case 7:
					return "Forward Tilt";
				case 8:
					return "Up Tilt";
				case 9:
					return "Down Tilt";
				case 10:
					return "Side Smash";
				case 11:
					return "Up Smash";
				case 12:
					return "Down Smash";
				case 13:
					return "Neutral Air";
				case 14:
					return "Forward Air";
				case 15:
					return "Back Air";
				case 16:
					return "Up Air";
				case 17:
					return "Down Air";
				case 18:
					return "Neutral Special";
				case 19:
					return "Side Special";
				case 20:
					return "Up Special";
				case 21:
					return "Down Special";
				case 50:
					return "Get Up Attack";
				case 51:
					return "Get Up Attack";
				case 52:
					return "Pummel";
				case 53:
					return "Forward Throw";
				case 54:
					return "Back Throw";
				case 55:
					return "Up Throw";
				case 56:
					return "Down Throw";
				case 57:
					return "Cargo Forward Throw";
				case 58:
					return "Cargo Back Throw";
				case 59:
					return "Cargo Up Throw";
				case 60:
					return "Cargo Down Throw";
				case 61:
					return "Ledge Attack";
				case 62:
					return "Ledge Attack";
				case 63:
					return "Beam Sword Jab";
				case 64:
					return "Beam Sword Tilt Swing";
				case 65:
					return "Beam Sword Smash Swing";
				case 66:
					return "Beam Sword Dash Swing";
				case 87:
					return "Peach Parasol";
				case 22:
					return "Kirby Copy";
				case 23:
					return "Kirby Copy";
				case 24:
					return "Kirby Copy";
				case 25:
					return "Kirby Copy";
				case 26:
					return "Kirby Copy";
				case 27:
					return "Kirby Copy";
				case 28:
					return "Kirby Copy";
				case 29:
					return "Kirby Copy";
				case 30:
					return "Kirby Copy";
				case 31:
					return "Kirby Copy";
				case 32:
					return "Kirby Copy";
				case 33:
					return "Kirby Copy";
				case 34:
					return "Kirby Copy";
				case 35:
					return "Kirby Copy";
				case 36:
					return "Kirby Copy";
				case 37:
					return "Kirby Copy";
				case 38:
					return "Kirby Copy";
				case 39:
					return "Kirby Copy";
				case 40:
					return "Kirby Copy";
				case 41:
					return "Kirby Copy";
				case 42:
					return "Kirby Copy";
				case 43:
					return "Kirby Copy";
				case 44:
					return "Kirby Copy";
				case 45:
					return "Kirby Copy";
				case 46:
					return "Kirby Copy";
				default:
					return `Unknown MoveID: ${move}`;
			}
		},
		getGamesStats: (amount = 1) => {
			if (this.ws && this.ws.Open) {
				this.ws.send({ "type": "getSlippiStats", "data": { length: amount, 'id': this.id } });
			}
		}
	}
}