class PiioConnector {
    constructor(name, requests) {
        this.address = location.hostname;
        this.port = location.port;
        this.id = Date.now().toString(32) + Math.ceil(Math.random() * 1000).toString(32);
        this.name = name || this.id;
        this.ws = null;
        this._callbacks = {on: {}, once: {}, any: []};
        this.debug = false;
        this.debugTimeout;
        this.messageIdCounter = 1;
        this.awaitingCommandReturns = {};
        this.requests = requests || ["scoreboard"];
        this.subscriptions = this.requests || [];

        this.cache = {
            scoreboard: {},
            team: {},
            character: {},
            country: {},
            game: {},
            pride: {},
            obs: {},
            streamQueue: []
        };

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
            this.subscriptions.forEach(subName => this.ws.send({"type": "subscribe", "data": subName}));
            if (!Array.isArray(this.requests))
                this.requests = [this.requests];
            this.requests.forEach(req => this.request(req));
            this.fire("ready");
        });
    }

    register() {
        this.ws.send({"type": "register", "data": {"id": this.id, "name": this.name, "filename": __FILENAME__}});
    }

    request(name) {
        this.ws.send({"type": "request", "data": name});
    }

    subscribe(name) {
        this.subscriptions.push(name);
        if (this.ws && this.ws.Open) {
            this.ws.send({"type": "subscribe", "data": name});
        }
    }

    command(module, args, cb) {
        let mid = this.messageIdCounter++;
        if (cb && typeof cb == "function") {
            this.awaitingCommandReturns[module + "-cmd-return-" + mid] = cb;
        }
        this.ws.send({"type": module + "-cmd", "data": args, "mid": mid});
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
            case 'obsSceneChanged':
                this.cache.obs.activeScene = data.data;
                break;
            case 'obsSceneList':
                this.cache.obs.sceneList = data.data;
                break;
            case 'streamQueue':
                this.cache.streamQueue = data.data;
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

    getPride(teamNum, playerNum) {
        if (playerNum == null) {
            playerNum = this.getSelectedPlayer(teamNum);
        }
        let po = this.getPlayer(teamNum, playerNum);
        let po2 = this.cache.pride;
        po2 = Object.keys(po2)
            .filter(key => po.pride.includes(key))
            .reduce((obj, key) => {
                obj[key] = po2[key];
                return obj;
            }, {});
        return Object.values(po2);
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

    getCasterCountry(casterNum) {
        let po = this.getCaster(casterNum);
        if (po && this.cache.country.hasOwnProperty(po.country))
            return this.cache.country[po.country];
        return null;
    }

    getCasterPride(casterNum) {
        let po = this.getCaster(casterNum);
        let po2 = this.cache.pride;
        po2 = Object.keys(po2)
            .filter(key => po.pride.includes(key))
            .reduce((obj, key) => {
                obj[key] = po2[key];
                return obj;
            }, {});
        return Object.values(po2);
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
            return {value: "", enabled: false};
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
            arg = {"source": arg};
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
            if (data.source != params.source || !params.element) {
                return;
            }
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

    async getPlayersByStartGGId(startGGId) {
        if (this.ws && this.ws.Open) {
            let randomId = Math.random().toString(36).substring(2, 15);
            this.ws.send({"type": "getPlayersByStartGGId", "data": {data: startGGId, 'id': this.id, 'mid': randomId}});
            this.ws.once("getPlayersByStartGGId-" + randomId, (data) => {
                console.log(data);
                return data;
            })
        }
    }

    getPictureUrl(url) {
        if (url) {
            let urlSVG = url + '.svg';
            let req = new XMLHttpRequest();
            req.open('GET', urlSVG, false);
            req.send();
            if (req.status == 200) {
                return urlSVG;
            }
            let urlPNG = url + '.png';
            req = new XMLHttpRequest();
            req.open('GET', urlPNG, false);
            req.send();
            if (req.status == 200) {
                return urlPNG;
            }
			let urlGIF = url + '.gif';
			req = new XMLHttpRequest();
			req.open('GET', urlGIF, false);
			req.send();
			if (req.status == 200) {
				return urlGIF;
			}
			let urlJPG = url + '.jpg';
			req = new XMLHttpRequest();
			req.open('GET', urlJPG, false);
			req.send();
			if (req.status == 200) {
				return urlJPG;
			}
			let urlJPEG = url + '.jpeg';
			req = new XMLHttpRequest();
			req.open('GET', urlJPEG, false);
			req.send();
			if (req.status == 200) {
				return urlJPEG;
			}
        }
        return false;
    }

    slippi = {
        moveId(move) {
            move = move.toString();
            if(this.moves.hasOwnProperty(move)) {
                return this.moves[move].name;
            }else {
                return `Unknown MoveID: ${move}`;
            }
        },
        getGamesStats: async (amount = 1) => {
            if (this.ws && this.ws.Open) {
                let randomId = Math.random().toString(36).substring(2, 15);
                this.ws.send({"type": "getSlippiStats", "data": {length: amount, 'id': this.id, 'mid': randomId}});
                this.ws.once("getSlippiStats-" + randomId, (data) => {
                    console.log(data);
                    return data;
                })
            }
        },
        moves: {
            "1": {
                "name": "Miscellaneous",
                "shortName": "misc"
            },
            "2": {
                "name": "Jab",
                "shortName": "jab"
            },
            "3": {
                "name": "Jab",
                "shortName": "jab"
            },
            "4": {
                "name": "Jab",
                "shortName": "jab"
            },
            "5": {
                "name": "Rapid Jabs",
                "shortName": "rapid-jabs"
            },
            "6": {
                "name": "Dash Attack",
                "shortName": "dash"
            },
            "7": {
                "name": "Forward Tilt",
                "shortName": "ftilt"
            },
            "8": {
                "name": "Up Tilt",
                "shortName": "utilt"
            },
            "9": {
                "name": "Down Tilt",
                "shortName": "dtilt"
            },
            "10": {
                "name": "Forward Smash",
                "shortName": "fsmash"
            },
            "11": {
                "name": "Up Smash",
                "shortName": "usmash"
            },
            "12": {
                "name": "Down Smash",
                "shortName": "dsmash"
            },
            "13": {
                "name": "Neutral Air",
                "shortName": "nair"
            },
            "14": {
                "name": "Forward Air",
                "shortName": "fair"
            },
            "15": {
                "name": "Back Air",
                "shortName": "bair"
            },
            "16": {
                "name": "Up Air",
                "shortName": "uair"
            },
            "17": {
                "name": "Down Air",
                "shortName": "dair"
            },
            "18": {
                "name": "Neutral B",
                "shortName": "neutral-b"
            },
            "19": {
                "name": "Side B",
                "shortName": "side-b"
            },
            "20": {
                "name": "Up B",
                "shortName": "up-b"
            },
            "21": {
                "name": "Down B",
                "shortName": "down-b"
            },
            "50": {
                "name": "Getup Attack",
                "shortName": "getup"
            },
            "51": {
                "name": "Getup Attack (Slow)",
                "shortName": "getup-slow"
            },
            "52": {
                "name": "Grab Pummel",
                "shortName": "pummel"
            },
            "53": {
                "name": "Forward Throw",
                "shortName": "fthrow"
            },
            "54": {
                "name": "Back Throw",
                "shortName": "bthrow"
            },
            "55": {
                "name": "Up Throw",
                "shortName": "uthrow"
            },
            "56": {
                "name": "Down Throw",
                "shortName": "dthrow"
            },
            "61": {
                "name": "Edge Attack (Slow)",
                "shortName": "edge-slow"
            },
            "62": {
                "name": "Edge Attack",
                "shortName": "edge"
            }
        },
        stages: {
            "2": "Fountain of Dreams",
            "3": "Pokémon Stadium",
            "4": "Princess Peach's Castle",
            "5": "Kongo Jungle",
            "6": "Brinstar",
            "7": "Corneria",
            "8": "Yoshi's Story",
            "9": "Onett",
            "10": "Mute City",
            "11": "Rainbow Cruise",
            "12": "Jungle Japes",
            "13": "Great Bay",
            "14": "Hyrule Temple",
            "15": "Brinstar Depths",
            "16": "Yoshi's Island",
            "17": "Green Greens",
            "18": "Fourside",
            "19": "Mushroom Kingdom I",
            "20": "Mushroom Kingdom II",
            "22": "Venom",
            "23": "Poké Floats",
            "24": "Big Blue",
            "25": "Icicle Mountain",
            "26": "Icetop",
            "27": "Flat Zone",
            "28": "Dream Land N64",
            "29": "Yoshi's Island N64",
            "30": "Kongo Jungle N64",
            "31": "Battlefield",
            "32": "Final Destination",
            "33": "Target Test (Mario)",
            "34": "Target Test (Captain Falcon)",
            "35": "Target Test (Young Link)",
            "36": "Target Test (Donkey Kong)",
            "37": "Target Test (Dr. Mario)",
            "38": "Target Test (Falco)",
            "39": "Target Test (Fox)",
            "40": "Target Test (Ice Climbers)",
            "41": "Target Test (Kirby)",
            "42": "Target Test (Bowser)",
            "43": "Target Test (Link)",
            "44": "Target Test (Luigi)",
            "45": "Target Test (Marth)",
            "46": "Target Test (Mewtwo)",
            "47": "Target Test (Ness)",
            "48": "Target Test (Peach)",
            "49": "Target Test (Pichu)",
            "50": "Target Test (Pikachu)",
            "51": "Target Test (Jigglypuff)",
            "52": "Target Test (Samus)",
            "53": "Target Test (Sheik)",
            "54": "Target Test (Yoshi)",
            "55": "Target Test (Zelda)",
            "56": "Target Test (Mr. Game & Watch)",
            "57": "Target Test (Roy)",
            "58": "Target Test (Ganondorf)",
            "84": "Home-Run Contest"
        },
        characters: {
            "0": {
                "name": "Captain Falcon",
                "shortName": "Falcon",
                "colors": ["Black", "Red", "White", "Green", "Blue"]
            },
            "1": {
                "name": "Donkey Kong",
                "shortName": "DK",
                "colors": ["Black", "Red", "Blue", "Green"]
            },
            "2": {
                "name": "Fox",
                "colors": ["Red", "Blue", "Green"]
            },
            "3": {
                "name": "Mr. Game & Watch",
                "shortName": "G&W",
                "colors": ["Red", "Blue", "Green"]
            },
            "4": {
                "name": "Kirby",
                "colors": ["Yellow", "Blue", "Red", "Green", "White"]
            },
            "5": {
                "name": "Bowser",
                "colors": ["Red", "Blue", "Black"]
            },
            "6": {
                "name": "Link",
                "colors": ["Red", "Blue", "Black", "White"]
            },
            "7": {
                "name": "Luigi",
                "colors": ["White", "Blue", "Red"]
            },
            "8": {
                "name": "Mario",
                "colors": ["Yellow", "Black", "Blue", "Green"]
            },
            "9": {
                "name": "Marth",
                "colors": ["Red", "Green", "Black", "White"]
            },
            "10": {
                "name": "Mewtwo",
                "colors": ["Red", "Blue", "Green"]
            },
            "11": {
                "name": "Ness",
                "colors": ["Yellow", "Blue", "Green"]
            },
            "12": {
                "name": "Peach",
                "colors": ["Daisy", "White", "Blue", "Green"]
            },
            "13": {
                "name": "Pikachu",
                "colors": ["Red", "Party Hat", "Cowboy Hat"]
            },
            "14": {
                "name": "Ice Climbers",
                "shortName": "ICs",
                "colors": ["Green", "Orange", "Red"]
            },
            "15": {
                "name": "Jigglypuff",
                "shortName": "Puff",
                "colors": ["Red", "Blue", "Headband", "Crown"]
            },
            "16": {
                "name": "Samus",
                "colors": ["Pink", "Black", "Green", "Purple"]
            },
            "17": {
                "name": "Yoshi",
                "colors": ["Red", "Blue", "Yellow", "Pink", "Cyan"]
            },
            "18": {
                "name": "Zelda",
                "colors": ["Red", "Blue", "Green", "White"]
            },
            "19": {
                "name": "Sheik",
                "colors": ["Red", "Blue", "Green", "White"]
            },
            "20": {
                "name": "Falco",
                "colors": ["Red", "Blue", "Green"]
            },
            "21": {
                "name": "Young Link",
                "shortName": "YLink",
                "colors": ["Red", "Blue", "White", "Black"]
            },
            "22": {
                "name": "Dr. Mario",
                "shortName": "Doc",
                "colors": ["Red", "Blue", "Green", "Black"]
            },
            "23": {
                "name": "Roy",
                "colors": ["Red", "Blue", "Green", "Yellow"]
            },
            "24": {
                "name": "Pichu",
                "colors": ["Red", "Blue", "Green"]
            },
            "25": {
                "name": "Ganondorf",
                "shortName": "Ganon",
                "colors": ["Red", "Blue", "Green", "Purple"]
            },
            "26": {
                "name": "Master Hand"
            },
            "27": {
                "name": "Wireframe (Male)"
            },
            "28": {
                "name": "Wireframe (Female)"
            },
            "29": {
                "name": "Gigabowser"
            },
            "30": {
                "name": "Crazy Hand"
            },
            "31": {
                "name": "Sandbag"
            },
            "32": {
                "name": "Popo"
            }
        }
    }
}