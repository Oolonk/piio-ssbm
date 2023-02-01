class SlippiRealtimeConnector {
	constructor(name, requests, subscriptions){
		this.address = location.hostname;
		this.port = 42070;
		this.id = (Date.now().toString(32) + 3) + Math.ceil(Math.random()*1000).toString(32);
		this.name = name || this.id;
		this.ws = null;
		this._callbacks = {on:{}, once:{}, any:[]};
		this.debug = false;
		this.debugTimeout;
		this.messageIdCounter = 1;
		this.awaitingCommandReturns = {};
		this.requests = requests || ["frame"];
		this.subscriptions = this.requests || [];
		
		this.cache = {settings:{},options:{},lastFinalizedFrame:{},settingsComplete:{},latestFrameIndex:{},gameEnd:{},lras:{},frame:{},combo:{},players:{}};
		
		//this.on("theme", e => location.reload());
		
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
			this.fire("ready");
			console.log("Connected to Slippi");
		});
	}
	
	command(module, args, cb){
		var mid = this.messageIdCounter++;
		if(cb && typeof cb == "function"){
			this.awaitingCommandReturns[module+"-cmd-return-"+mid] = cb;
		}
		this.ws.send({"type":module+"-cmd","data":args,"mid":mid});
	}
	
	processdata(data){
		if(data.type == "frame"){
			let sb = data.data;
			this.cache = sb;
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