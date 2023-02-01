class PiioConnector {
	constructor(name, requests, subscriptions){
		this.address = location.hostname;
		this.port = location.port;
		this.id = Date.now().toString(32) + Math.ceil(Math.random()*1000).toString(32);
		this.name = name || this.id;
		this.ws = null;
		this._callbacks = {on:{}, once:{}, any:[]};
		this.debug = false;
		this.debugTimeout;
		this.messageIdCounter = 1;
		this.awaitingCommandReturns = {};
		this.requests = requests || ["scoreboard"];
		this.subscriptions = this.requests || [];
		
		this.cache = {scoreboard:{},team:{},character:{},country:{},game:{}};
		
		// this.on("theme", e => location.reload());
		
		this.init();
		document.onreadystatechange = (e) => this.init();
	}
	
	init(){
		if(document.readyState != "complete") return;
		this.connect();
		this.sourceVisibleBind(this.name);
	}
	
	connect(){
		this.ws = new WSWrapper(this.address, this.port, true);
		this.ws.on("data", data => {
			if(data.hasOwnProperty("type") && data.hasOwnProperty("data")){
				data = this.processdata(data);
				this.fire(data.type, data.data);
			}
		});
		this.ws.on("open", () => {
			this.register();
			this.subscriptions.forEach(subName => this.ws.send({"type":"subscribe","data":subName}));
			if(!Array.isArray(this.requests))
				this.requests = [this.requests];
			this.requests.forEach(req => this.request(req));
			this.fire("ready");
		});
	}
	
	register(){
		this.ws.send({"type":"register", "data":{"id":this.id, "name":this.name, "filename":__FILENAME__}});
	}
	
	request(name){
		this.ws.send({"type":"request","data":name});		
	}
	
	subscribe(name){
		this.subscriptions.push(name);
		if(this.ws && this.ws.Open){
			this.ws.send({"type":"subscribe","data":name});
		}
	}
	
	command(module, args, cb){
		var mid = this.messageIdCounter++;
		if(cb && typeof cb == "function"){
			this.awaitingCommandReturns[module+"-cmd-return-"+mid] = cb;
		}
		this.ws.send({"type":module+"-cmd","data":args,"mid":mid});
	}
	
	processdata(data){
		if(data.type == "scoreboard"){
			console.log(data);
			let sb = data.data.scoreboard;
			let db = data.data.dbEntries;
			this.cache.scoreboard = sb;
			for(let teamNum in sb.teams){
				sb.teams[teamNum].players = this.assignPrototype(sb.teams[teamNum].players, Player);
			}
			sb.caster = this.assignPrototype(sb.caster, Player);
			for(let dbIndex in db){
				for(let entryIndex in db[dbIndex]){
					this.cache[dbIndex][db[dbIndex][entryIndex]._id] = db[dbIndex][entryIndex];
				}
			}
			data.data = sb;
		}
		
		
		if(data.mid !== null){
			for(let i in this.awaitingCommandReturns){
				if(data.type+"-"+data.mid == i){
					this.awaitingCommandReturns[i](data.data);
					delete this.awaitingCommandReturns[i];
					break;
				}
			}
		}
		
		return data;
	}
	
	getPlayer(teamNum, playerNum){
		if(playerNum == null){
			playerNum = this.getSelectedPlayer(teamNum);
		}
			
		if(this.cache.scoreboard.teams.hasOwnProperty(teamNum) && this.cache.scoreboard.teams[teamNum].players.hasOwnProperty(playerNum))
			return this.cache.scoreboard.teams[teamNum].players[playerNum];
		return null;
	}
	
	getPosition(teamNum, playerNum){
		if(playerNum == null){
			playerNum = this.getSelectedPlayer(teamNum);
		}
		var seats = this.cache.scoreboard.seatorder;
		for(let i in seats){
			let seat = seats[i];
			if(seat[0] == teamNum && seat[1] == playerNum){
				return i;
			}
		}
	}
	
	getPlayersByPosition(){
		var list = [];
		var seats = this.cache.scoreboard.seatorder;
		for(let i in seats){
			list.push(this.getPlayer(seats[i][0], seats[i][1]));
		}
		return list;
	}
	
	getSelectedPlayer(teamNum){
		if(this.TeamSize > 1 && this.cache.scoreboard.teams.hasOwnProperty(teamNum) && this.cache.scoreboard.teams[teamNum].selected !== null){
			return this.cache.scoreboard.teams[teamNum].selected;
		}
		return 0;
	}
	
	getTeamName(teamNum, options){
		options = options || {};
		var before = options.before || "";
		var after = options.after || "";
		var delimiter = options.delimiter || " / ";
		
		var value = "";
		if(!this.cache.hasOwnProperty("scoreboard") || !this.cache.scoreboard.hasOwnProperty("teams") || !this.cache.scoreboard.teams.hasOwnProperty(teamNum)){
			return ""; // team not here - something broken
		}
		if(!this.cache.scoreboard.teams[teamNum].hasOwnProperty("name") || this.cache.scoreboard.teams[teamNum].name.length == 0){
			// build teamname out of names
			value = this.getTeamPlayers(teamNum).map(x => x.name).join(delimiter);
		}else{
			value = this.cache.scoreboard.teams[teamNum].name;
		}
		return before + value + after;
	}
	
	getTeamStatus(teamNum, playerNum){
		if(this.cache.scoreboard.type != "crews" || !this.cache.scoreboard.teams.hasOwnProperty(teamNum)){
			return null;
		}
		var list = [];
		
		this.cache.scoreboard.teams[teamNum].out.forEach((isOut, index) => {
			list.push({
				"out":isOut,
				"selected": this.cache.scoreboard.teams[teamNum].selected == index
			});
		});
		
		if(playerNum != null){
			return list[playerNum];
		}
		
		return list;
	}
	
	getTeamPlayers(teamNum){
		if(!this.cache.scoreboard.teams.hasOwnProperty(teamNum)){
			return [];
		}
		var list = this.cache.scoreboard.teams[teamNum].players;
		
		list = list.filter(player => player.name != "" );
		
		return list;
	}
	
	getScore(teamNum){
		if(this.cache.scoreboard.teams.hasOwnProperty(teamNum))
			return this.cache.scoreboard.teams[teamNum].score;
		return null;
	}	
	getState(teamNum){
		if(this.cache.scoreboard.teams.hasOwnProperty(teamNum))
			return this.cache.scoreboard.teams[teamNum].state;
		return null;
	}
	
	getCountry(teamNum, playerNum){
		if(playerNum == null){
			playerNum = this.getSelectedPlayer(teamNum);
		}
		var po = this.getPlayer(teamNum, playerNum);
		if(po && this.cache.country.hasOwnProperty(po.country))
			return this.cache.country[po.country];
		return null;
	}
	
	getPort(teamNum, playerNum){
		if(playerNum == null){
			playerNum = this.getSelectedPlayer(teamNum);
		}
		for(let i in this.cache.scoreboard.ports){
			if(this.cache.scoreboard.ports[i] != null && this.cache.scoreboard.ports[i][0] == teamNum && this.cache.scoreboard.ports[i][1] == playerNum){
				return parseInt(i);
			}
		}
		return null;
	}
	
	getCharacter(teamNum, playerNum){
		if(playerNum == null){
			playerNum = this.getSelectedPlayer(teamNum);
		}
		if(!this.cache.scoreboard.teams.hasOwnProperty(teamNum) || !this.cache.scoreboard.teams[teamNum].characters.hasOwnProperty(playerNum) || this.TeamSize <= playerNum)
			return null;
		var co = this.cache.scoreboard.teams[teamNum].characters[playerNum];
		if(co && this.cache.character.hasOwnProperty(co[0])){
			var c = new Character(this.cache.character[co[0]]);
			c.defaultSkin = co[1];
			return c;
		}
		return null;
	}
	
	getPlayerTeams(teamNum, playerNum){
		if(playerNum == null){
			playerNum = this.getSelectedPlayer(teamNum);
		}
		var po, teams = [];
		if(teamNum instanceof Player){
			po = teamNum;
		}else{
			playerNum = playerNum || 0;
			po = this.getPlayer(teamNum, playerNum);
		}
		if(po == null){
			return [];
		}
		po.team.forEach(teamID => {
			if(this.cache.team.hasOwnProperty(teamID))
				teams.push(this.cache.team[teamID]);
		});
		return teams;
	}
	
	getCaster(casterNum){
		if(this.cache.scoreboard.caster.hasOwnProperty(casterNum-1))
			return this.cache.scoreboard.caster[casterNum-1];
		return null;
	}
	
	getGame(){
		if(!this.cache.scoreboard.hasOwnProperty("game")){
			return null;
		}
		if(!this.cache.game.hasOwnProperty(this.cache.scoreboard.game)){
			return null;
		}
		return this.cache.game[this.cache.scoreboard.game];
	}
	
	getField(name){
		try {
			return this.cache.scoreboard.fields[name];	
		}catch(e){
			return {value:"", enabled:false};
		}
	}
	
	getFieldValue(name){
		var field = this.getField(name);
		return field.value;
	}
	
	get TeamSize(){
		return Math.max(this.cache.scoreboard.teams[1].players.length, this.cache.scoreboard.teams[2].players.length);
	}
	
	get Game(){
		return piio.cache.game[this.cache.scoreboard.game];
	}
	
	assignPrototype(docs, proto){
		for(let i in docs){
			if(proto.length == 1)
				docs[i] = new proto(docs[i]);
			else
				docs[i].__proto__ = proto.prototype;
		}
		return docs;
	}
	
	resolve(dbName, id){
		return this.cache[dbName][id];
	}
	

	
	sourceVisibleBind(arg){
		
		if(typeof arg == "string"){
			arg = {"source":arg};
		}
		var params = {
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
			if(data.source != params.source || !params.element){return;}
			if(data.visible == null){
				data.visible = params.element.classList.contains(params.hiddenClass);
			}
			params.element.classList.toggle(params.visibleClass, data.visible);
			params.element.classList.toggle(params.hiddenClass, !data.visible);
		});
	}

	on(name, callback){
		if(!this._callbacks.on.hasOwnProperty(name)){
			this._callbacks.on[name] = [];
		}
		this._callbacks.on[name].push(callback);
	}
	
	once(name, callback){
		if(!this._callbacks.once.hasOwnProperty(name)){
			this._callbacks.once[name] = [];
		}
		this._callbacks.once[name].push(callback);
	}
	
	fire(name, data){
		if(this._callbacks.on.hasOwnProperty(name)){
			this._callbacks.on[name].forEach(cb => cb(data));
		}
		if(this._callbacks.once.hasOwnProperty(name)){
			this._callbacks.once[name].forEach(cb => cb(data));
			this._callbacks.once[name] = [];
		}
	}
}