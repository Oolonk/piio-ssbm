const {shell, ipcMain} = require('electron');
const fs = require('fs');
const emitter = new (require("events"))();

const APPROOT = remote.getGlobal("APPROOT").replace(/\\/g, '/');
const APPRES = remote.getGlobal("APPRES").replace(/\\/g, '/');

var _ws, _cons, _theme;
var _timeouts = {};

var _callbacks = {on: {}, once: {}, hold: []}; // callbacks for on,once & fire

var matchList = [];

var scoreboard = {
    id: null,
    teams: {
        1: {
            name: "",
            players: [],
            characters: [],
            state: 0,
            score: 0,
            selected: null,
            out: []
        },
        2: {
            name: "",
            players: [],
            characters: [],
            state: 0,
            score: 0,
            selected: null,
            out: []
        }
    },
    caster: [],
    seatorder: [],
    ports: [],
    fields: {},
    game: null,
    startgg: {
        set: null,
        event: null,
        phaseGroup: null,
        phase: null
    },
    smashggtoken: null,
    streamlist: [],
    type: null,
    _D: null
};
var slippi = {
    settings: {
        slpVersion: "1",
        timerType: 0,
        inGameMode: 0,
        friendlyFireEnabled: false,
        isTeams: false,
        itemSpawnBehavior: 0,
        stageId: 0,
        startingTimerSeconds: 0,
        enabledItems: 0,
        players: [],
        scene: 0,
        gameMode: 0,
        language: 0,
        gameInfoBlock: {
            gameBitfield1: 0,
            gameBitfield2: 0,
            gameBitfield3: 0,
            gameBitfield4: 0,
            bombRainEnabled: false,
            itemSpawnBehavior: 0,
            selfDestructScoreValue: 0,
            itemSpawnBitfield1: 0,
            itemSpawnBitfield2: 0,
            itemSpawnBitfield3: 0,
            itemSpawnBitfield4: 0,
            itemSpawnBitfield5: 0,
            damageRatio: 0
        },
        randomSeed: 0,
        isPAL: false,
        isFrozenPS: false,
        matchInfo: {
            matchId: "",
            gameNumber: 0,
            tiebreakerNumber: 0
        }
    },
    options: {
        strict: true
    },
    lastFinalizedFrame: 0,
    latestFrameIndex: 0,
    frame: {
        start: {
            frame: 0,
            seed: 0,
            sceneFrameCounter: 0
        },
        players: [],
        frame: 0,
        isTransferComplete: false
    },
    gameEnd: null,
    lras: null,
    combo: [],
    settingsComplete: true
};


var client = {
    autoupdate: false,
    autoupdateThreshold: 500,
    teamSize: null,
    fixedSidebar: true
};

var portAmount = 4; // amount of ports available for specific game TODO: make dynamic


addEventListener("load", () => fire("load"));

remoteOn(db, "player-changed", playerChangedHandler);
remoteOn(db, "player-changed", buildPlayerAutoCompleteList);
remoteOn(db, "game-changed", buildGameSelection);

on("load", init);
on("load", buildPlayerAutoCompleteList);
on("load", clockUpdate);
on("load", buildGameSelection);
on("scoreboardchanged", autoUpdate);
on("scoreboardteamschanged", insertTeamUI);
on("scoreboardteamschanged", buildSeatOrder);
on("scoreboardcasterchanged", insertCasterUI);
on("scoreboardseatorderchanged", buildSeatOrder);
on("themechanged", buildFieldList);
on("themechanged", insertScoreboardData);

once("themechanged", buildThemeSelection);

ipcRenderer.on("themefolder-changed", buildThemeSelection);


async function init() {
    hold("scoreboardchanged");
    bgWork.start("init");

    await applyClientSettings(await ipcRenderer.invoke("get", "settings"));

    // failsafe if theme is not defined in settings
    if (_theme == null) {
        await setTheme((await ThemeWrapper.getTheme(0)).name);
    }


    fs.readFile('scoreboard.json', 'utf8', (err, data) => {
        if (!err) {
            try {
                scoreboard = Object.assign(scoreboard, JSON.parse(data));
            } catch (e) {
            }
            setGame(scoreboard.game);
        } else {
            setGame();
        }
        setTeamSize(Math.max(scoreboard.teams[1].players.length, 1));
        insertScoreboardData(scoreboard);
        release("scoreboardchanged");
    });


    _ws = new WSWrapper(null, remote.getGlobal("ARGV").port);

    _ws.on("open", () => _ws.send(JSON.stringify({"type": "subscribe", "data": "*"})));
    _ws.on("open", () => fire("ws-ready"));
    _ws.on("data-cmd", handleWsCommand);

    // Update Button animation script
    let updateBtn = document.getElementById('update-btn');
    on("update", () => {
        updateBtn.classList.remove("changed", "anim");
        void updateBtn.offsetWidth;
        updateBtn.classList.add("anim");
    });
    on("scoreboardchanged", () => updateBtn.classList.add("changed"));
    updateBtn.getElementsByTagName("img")[1].addEventListener("animationend", e => e.srcElement.parentNode.classList.remove("anim"));

    document.getElementById('version').innerText = "v " + remote.app.getVersion();

    bgWork.finish("init");
}

// hotkeys
window.addEventListener("keydown", (e) => {
    if (e.ctrlKey) {
        switch (e.keyCode) {
            case 83:
                update();
                break; // CTRL + S => update
            default:
                return;
        }
        e.preventDefault();
    }
}, true);

async function applyClientSettings(settings) {
    for (let row of settings) {
        switch (row.name) {
            case "theme":
                await setTheme(row.value);
                break;
            case "smashgg-token":
                smashgg.Token = row.value;
                scoreboard.smashggtoken = row.value;
                break;
            case "autoupdate":
                toggleAutoUpdate(row.value);
                break;
            case "autoupdateThreshold":
                client.autoupdateThreshold = row.value;
                break;
            case "fixedSidebar":
                client.fixedSidebar = row.value;
                document.body.classList.toggle("fixedSidebar", row.value);
                break;
            case "fixedSmashggQueue":
                client.fixedSmashggQueue = row.value;
                document.body.classList.toggle("fixedSmashggQueue", row.value);
                break;
            case "connection-type":
                ipcRenderer.send("connectionType", row.value);
                break;
            case "relay-port":
                ipcRenderer.send("slippiPort", row.value);
                break;
            case "slippi-folder":
                ipcRenderer.send("slippiFolder", row.value);
                break;
            case "obs-ip":
                ipcRenderer.send("obsIp", row.value);
                break;
            case "obs-port":
                ipcRenderer.send("obsPort", row.value);
                break;
            case "obs-password":
                ipcRenderer.send("obsPassword", row.value);
                break;
            case "enable-slippi":
                ipcRenderer.send("enableSlippi", row.value);
                showSlippi(row.value);
                break;
            case "enable-obs":
                ipcRenderer.send("enableObs", row.value);
                showObs(row.value);
                break;
        }
    }
}

async function openSettingsWindow() {
    await openWindow('settings', null, true);
    let clientSettings = await ipcRenderer.invoke("get", "settings");
    console.log(clientSettings);
    applyClientSettings(clientSettings);
}

function buildTeamPlayerList() {
    let teamSize = Math.max(scoreboard.teams[1].players.length, scoreboard.teams[2].players.length);
    scoreboard.ports = [];
    scoreboard.seatorder = [];
    document.getElementById('sb').classList.toggle("multi", teamSize > 1);
    let tpl = document.getElementById("sb-player-tpl");
    for (let teamNum = 1; teamNum <= 2; teamNum++) {
        // Player fields
        let teamPlayerField = document.getElementById('sb-players-' + teamNum).truncate();
        for (let i = 0; i < teamSize; i++) {

            let playerItemEl = createElement({
                "type": "div",
                "className": "player-item",
                "id": "playeritem-" + teamNum + "-" + i,
                "append": tpl.content.cloneNode(true)
            });

            let playerNameElm = playerItemEl.querySelector("input.playername");
            let characterElm = playerItemEl.querySelector(".character-select-btn");
            let playerEditBtn = playerItemEl.querySelector(".player-edit-btn");
            let playerAddBtn = playerItemEl.querySelector(".player-create-btn");
            let portNumberBtns = playerItemEl.querySelector(".player-ports").truncate();
            let playerSelectCxb = playerItemEl.querySelector(".player-select");
            let playerOutCxb = playerItemEl.querySelector(".player-out");

            playerItemEl.dataset.team = teamNum;
            playerItemEl.dataset.player = i;

            playerNameElm.id = "playername-" + teamNum + "-" + i;
            playerNameElm.value = scoreboard.teams[teamNum].players[i] ? scoreboard.teams[teamNum].players[i].name : "";
            playerNameElm.tabIndex = teamNum * teamSize + i;
            playerNameElm.oninput = playerNameInput;
            characterElm.onclick = e => openCharacterSelect(teamNum, i);
            playerEditBtn.onclick = editPlayer;
            playerAddBtn.onclick = editPlayer;
            playerSelectCxb.onclick = e => setPlayerActive(teamNum, i);
            playerOutCxb.onclick = e => setPlayerOut(teamNum, i);

            portNumberBtns.id = "playerport-" + teamNum + "-" + i;
            for (let portNum = 1; portNum <= portAmount; portNum++) {
                let portBtn = document.createElement("div");
                portBtn.classList.add("port");
                portBtn.innerText = portNum;
                portBtn.id = "playerport-" + portNum + "-" + teamNum + "-" + i;
                portBtn.onclick = e => assignPlayerPort(portNum, teamNum, i);

                portNumberBtns.appendChild(portBtn);
            }

            teamPlayerField.appendChild(playerItemEl);

            if (teamSize <= 4) { // limit seatorder to max 4 players per team
                scoreboard.seatorder.push([teamNum, i]);
            }

        }
        // Team Player Swap Buttons
        let swapButtonField = document.getElementById('sb-players-swap-' + teamNum).truncate();
        for (let swapButton = 1; swapButton < teamSize; swapButton++) {
            swapButtonField.appendChild(createElement({
                "type": "button",
                "onclick": () => swap(teamNum, swapButton)
            }));
        }
    }
    fire("scoreboardseatorderchanged");
}

function buildCasterList() {
    let tpl = document.getElementById('caster-item-tpl');
    let el = document.getElementById('caster').truncate();
    for (let casterNum = 0; casterNum < (_theme.caster || 2); casterNum++) {
        let item = createElement({"type": "div", "className": "item", "append": tpl.content.cloneNode(true)});
        let nameTbx = item.querySelector("input");
        // let selectionElm = item.querySelector(".selection");
        let selectedIndex = -1;

        sortable(item, ["div.player-options", ".search"], (indexList) => {
            let newCasterOrder = [];
            indexList.forEach((item) => newCasterOrder.push(scoreboard.caster[item[0]]));
            scoreboard.caster = newCasterOrder;
            insertScoreboardData();
        });

        // open caster selection by focusing the input element
        item.querySelector(".info").onclick = function (e) {
            let el = e.currentTarget.parentNode;
            let tbx = el.querySelector("input");
            el.querySelector(".search").classList.add("visible");
            tbx.value = scoreboard.caster[e.currentTarget.parentNode.getIndex()].name;
            tbx.focus();
            tbx.select();
            e.stopPropagation();
        }

        item.querySelector(".info .player-options .player-edit-btn").onclick = e => {
            editPlayer(scoreboard.caster[e.target.getIndexIn(el)]);
            e.stopPropagation();
        }

        // search through player DB
        nameTxbInput = e => {
            let value = e.target.value.trim().toLowerCase();
            let selectionElm = e.target.parentNode.querySelector(".selection");
            db.get("player", {"name": {$regex: new RegExp(`${value}`, 'i')}}, {limit: 20}).then((list) => {
                list = list.map(x => new Player(x));
                selectionElm.truncate();
                selectedIndex = -1;
                if (value.length > 0) // add temp name entry
                    list.push(new Player({name: e.target.value}));
                list.unshift(new Player());
                selectedIndex = list.length - 1;

                list.forEach((po, index) => {
                    // build caster select items
                    let item = document.createElement("div");
                    item.classList.add("item");
                    item.classList.toggle("tmp", (!po.InDB && po.name.length > 0));
                    item.classList.toggle("clear", (!po.InDB && po.name.length == 0));
                    item.appendChild(createElement({"type": "div", "className": "name", "text": po.name}));

                    if (po.country) {
                        let countryEl = createElement({"type": "img"});
                        countryEl.src = APPRES + '/assets/country/' + po.country + '.png';
                        if (fs.existsSync(APPRES + '/assets/country/' + po.country + '.png')) {
                            countryEl.src = APPRES + '/assets/country/' + po.country + '.png';
                        } else {
                            countryEl.src = APPRES + '/assets/country/' + po.country + '.svg';
                        }
                        countryEl.onerror = e => e.target.remove();
                        item.appendChild(countryEl);
                    }
                    if (po.team) {
                        let teamEl = createElement({"type": "div", "className": "team"});
                        db.get("team", {$or: [].concat(po.team).map(x => ({"_id": x}))})
                            .then(entry => teamEl.innerText = entry.map(x => x.name).join(", "));
                        item.appendChild(teamEl);
                    }
                    if (po.InDB && e.type == "input" && (e.target.value == po.name || list.length == 1)) {
                        selectedIndex = index;
                    }
                    item.classList.toggle("highlighted", selectedIndex == index);

                    item.onclick = e => { // caster select item clicked
                        nameTbx.blur();
                        setCaster(e.target.getIndexIn(document.getElementById('caster')), po);
                    };
                    item.onmousedown = e => e.preventDefault();
                    selectionElm.appendChild(item);
                });

            });
        };

        nameTbx.oninput = nameTxbInput;
        nameTbx.onfocus = nameTxbInput;
        nameTbx.onblur = () => item.querySelector(".search").classList.remove("visible");
        nameTbx.onkeydown = e => {
            let selectionElm = e.target.parentNode.querySelector(".selection");
            if (e.code == "ArrowDown") {
                if (selectedIndex == -1)
                    selectedIndex++;
                selectedIndex++;
                e.preventDefault();
            }
            if (e.code == "ArrowUp") {
                selectedIndex--;
                if (selectedIndex < 0)
                    selectedIndex = 0;
                e.preventDefault();
            }
            if (selectedIndex > -1) {
                if (selectedIndex >= selectionElm.querySelectorAll("div.item").length)
                    selectedIndex = selectionElm.querySelectorAll("div.item").length - 1;
                selectionElm.querySelectorAll("div.item").forEach(el => el.classList.remove("highlighted"));
                let selectedElm = selectionElm.querySelector("div.item:nth-child(" + (selectedIndex + 1) + ")");
                selectedElm.classList.add("highlighted");
                let height = parseInt(document.defaultView.getComputedStyle(selectedElm, '').getPropertyValue('height').substr(0, 2));
                selectionElm.scrollTop = selectedIndex * height - 150;
                if (e.code == "Enter") {
                    selectedElm.click();
                    e.preventDefault();
                }
            }
        }
        el.appendChild(item);
        insertCasterUI();

        // casterEl.querySelector(".info .twitter").innerText = co.twitter;
    }

    // decrease casters to casterCount
    scoreboard.caster.splice(_theme.caster || 2);
    // increase casters to casterCount
    for (let i = scoreboard.caster.length; i < (_theme.caster || 2); i++) {
        scoreboard.caster.push(new Player());
    }
}

on("themechanged", buildCasterList);

function sortable(elm, exclude, callback) {
    elm.classList.add("dragable");
    elm.onpointerdown = e => {

        let initPos = e.clientX,
            origPos = [],
            indexList = [],
            parentEl = elm.parentNode,
            downEvent = e,
            threshold = 20;

        if (exclude) {
            for (let eIdx in exclude) {
                for (let pIdx in e.path) {
                    if (parentEl.querySelector(exclude[eIdx]).outerHTML == e.path[pIdx].outerHTML) {
                        return;
                    }
                }
            }
        }

        parentEl.childNodes.forEach(childEl => origPos.push(childEl.getBoundingClientRect().x));

        elm.onmousemove = e => {
            if (Math.abs(e.x - initPos) > threshold) {
                threshold = 0;
                elm.setPointerCapture(downEvent.pointerId);
                document.body.classList.add("noPointer");
                elm.classList.add("dragging");
                indexList = [];
                parentEl.childNodes.forEach((elm, index) => indexList.push([index, elm.getBoundingClientRect().x, elm]));
                indexList.sort(function (a, b) {
                    return a[1] - b[1]
                });
                indexList.forEach((item, index) => item[2].style.transform = "translate(" + (origPos[index] - origPos[item[0]]) + "px, 0px)");
                elm.style.transform = "translate(" + (e.x - initPos) + "px,-3px)";
            }
        };
        window.onpointerup = e => {
            elm.onmousemove = null;
            document.body.classList.remove("noPointer");
            elm.releasePointerCapture(e.pointerId);
            elm.classList.remove("dragging");
            parentEl.childNodes.forEach((elm, index) => elm.style.transform = "translate(0px, 0px)");
            if (indexList.length > 1) {
                indexList.forEach((item, index) => item[2].parentNode.insertBefore(indexList[item[0]][2], item[2]));
                callback(indexList);
                window.onpointerup = null;
            }
        };
    };

}

function buildFieldList() {
    // fix fields in scoreboard.fields
    let el = document.getElementById('fields').truncate();
    _theme.fields.forEach(field => {
        let item = createElement({"type": "div", "className": "item", "append": createField(field)});
        if (field.checkbox) {
            let cbx = createElement({"type": "input", "id": "field-" + field.name + "-cbx", "className": "toggle"})
            cbx.type = "checkbox";
            cbx.onchange = e => {
                scoreboard.fields[field.name].enabled = e.target.checked;
                fire("scoreboardchanged", true);
            }
            item.appendChild(cbx);
            item.classList.add("hascheckbox");
        }
        el.appendChild(item);
    });
}

function swap(team, player) {
    let tmp;
    if (team == null) {
        // swap teams
        tmp = scoreboard.teams[1];
        scoreboard.teams[1] = scoreboard.teams[2];
        scoreboard.teams[2] = tmp;
        scoreboard.seatorder.forEach(seat => seat[0] = seat[0] == 1 ? 2 : 1);
        scoreboard.ports.forEach((port) => {
            if (port != null) {
                port[0] = port[0] == 1 ? 2 : 1;
            }
        });
    } else {
        // swap players within a team
        tmp = scoreboard.teams[team].players[player - 1];
        scoreboard.teams[team].players[player - 1] = scoreboard.teams[team].players[player];
        scoreboard.teams[team].players[player] = tmp;
        tmp = scoreboard.teams[team].characters[player - 1];
        scoreboard.teams[team].characters[player - 1] = scoreboard.teams[team].characters[player];
        scoreboard.teams[team].characters[player] = tmp;

        tmp = scoreboard.teams[team].out[player - 1];
        scoreboard.teams[team].out[player - 1] = scoreboard.teams[team].out[player];
        scoreboard.teams[team].out[player] = tmp;

        if (scoreboard.teams[team].selected == player) {
            scoreboard.teams[team].selected--;
        } else if (scoreboard.teams[team].selected == player - 1) {
            scoreboard.teams[team].selected++;
        }

        scoreboard.seatorder.forEach((seat) => {
            if (seat[0] != team) {
                return;
            }
            if (seat[1] == player - 1) {
                seat[1] = player;
            } else if (seat[1] == player) {
                seat[1] = player - 1;
            }
        });

        scoreboard.ports.forEach((port) => {
            if (port == null || port[0] != team) {
                return;
            }
            if (port[1] == player - 1) {
                port[1] = player;
            } else if (port[1] == player) {
                port[1] = player - 1;
            }
        });
    }
    fire("scoreboardseatorderchanged");
    fire("scoreboardteamschanged");
    fire("scoreboardchanged", true);
}

async function playerNameInput(e) {
    let txb = e.currentTarget;
    let parent = txb.closest("div.player-item");
    let {team, player} = parent.dataset;
    let name = txb.value;
    let players = await db.get("player", {"name": {$regex: new RegExp(`^${name}$`, 'i')}}, {"sort": {"lastActivity": -1}});
    let po = {"name": name};

    if (players.length > 0) {
        po = players.find(x => x.name == name) || players[0];
    }

    scoreboard.teams[team].players[player] = new Player(po);
    txb.insertValue(po.name);
    parent.dataset.returnId = Math.floor(Math.random() * 1000000);
    insertTeamUI(team);
    fire("scoreboardchanged");
}

async function teamNameInput(team, e) {
    bgWork.start("teamNameInput");
    scoreboard.teams[team].name = e.currentTarget.value;
    fire("scoreboardteamschanged");
    fire("scoreboardchanged");
    bgWork.finish("teamNameInput");
}

async function setCaster(index, co) {
    bgWork.start("setCaster");
    scoreboard.caster[index] = co;

    let casterEl = document.querySelectorAll("#caster > div")[index];
    if (casterEl) {
        casterEl.querySelector(".info .name").innerText = co.name;
        casterEl.querySelector(".info .twitter").innerText = co.twitter != (null || '') ? `@${co.twitter}` : '';
        if (co.HasSmashgg && co.InDB) {
            let id = co.ID;
            getSmashggDifferences(co).then((res) => {
                if (scoreboard.caster[index]._id != id) {
                    return;
                } // outdated request - quit out
                casterEl.querySelector(".info .player-options .player-edit-btn").classList.toggle("outdated", res.differences.length > 0);
            });
        } else {
            casterEl.querySelector(".info .player-options .player-edit-btn").classList.remove("outdated");
        }
        casterEl.querySelector(".info .player-options .player-edit-btn").disabled = !co.InDB;

        fire("scoreboardchanged");
    }
    bgWork.finish("setCaster");
}

async function setTheme(name) {
    if (_theme && _theme.dir == name) {
        return;
    }
    bgWork.start("setTheme");
    _theme = (await ThemeWrapper.getTheme(name)) || (await ThemeWrapper.getTheme(0));
    scoreboard = correctDynamicProperties(scoreboard);
    document.getElementById('theme-select').value = _theme.dir;
    ipcRenderer.send("theme", _theme.dir);
    fire("themechanged");
    bgWork.finish("setTheme");
}

async function setGame(game) {
    if (game == null) {
        let res = await db.getSingle("game");
        if (res) {
            game = res._id;
        } else {
            return;
        }
    }
    document.getElementById('game-select').value = game; // TODO: make better check for line underneath (didnt update)
    if (scoreboard.game == game) {
        return;
    }
    scoreboard.game = game;
    fire("gamechanged", true);
    fire("scoreboardchanged", true);
}

function setTeamSize(size) {
    size = parseInt(size || 1);
    document.getElementById('teamsize-select').value = size;
    for (let teamNum = 1; teamNum <= 2; teamNum++) {
        // decrease players to teamSize
        scoreboard.teams[teamNum].players.splice(size);
        // increase players to teamSize
        for (let i = scoreboard.teams[teamNum].players.length; i < size; i++) {
            scoreboard.teams[teamNum].players.push(new Player());
        }
    }
    buildTeamPlayerList();
}

function setTeamType(num) {
    let teamTypes = ["teams", "crews", "ironman"];
    for (let i = 0; i < teamTypes.length; i++) {
        document.getElementById("sb").classList.toggle('teamtype-' + teamTypes[i], i == num);
    }
    document.getElementById('team-type-select').value = num;
    scoreboard.type = teamTypes[num];
}

function resetScore() {
    modifyScore(1, 0, true);
    modifyScore(2, 0, true);
}

function modifyScore(team, inc, absolute) {
    let value = parseInt(inc);
    if (!absolute)
        value += parseInt(scoreboard.teams[team].score);
    if (value < 0 || isNaN(value))
        value = 0;
    scoreboard.teams[team].score = value;
    document.getElementById('sb-score-val-' + team).value = value;
    fire("scoreboardchanged", true);
}

function setTeamState(team, state) {
    let el = document.getElementById('sb-state-' + team);
    el.classList.toggle("winners", state == 1);
    el.classList.toggle("losers", state == 2);
    scoreboard.teams[team].state = state;
    fire("scoreboardchanged", true);
}

function clearBoard() {
    for (let teamNum in scoreboard.teams) {
        let team = scoreboard.teams[teamNum];
        team.players.forEach(x => new Player());
        team.characters.forEach(x => null);
        team.name = "";
        team.score = 0;
        team.state = 0;
    }
    scoreboard.ports = [null, null, null, null];
    scoreboard.startgg = {
        set: null,
        event: null,
        phaseGroup: null,
        phase: null
    };

    fire("scoreboardsmashggchanged");
    fire("scoreboardteamschanged");
    fire("scoreboardchanged", true);
}

function assignPlayerPort(port, teamNum, playerNum) {
    let current = 0;
    let toSwap = 0;
    let obj = [teamNum, playerNum];

    // find current port for this player
    for (let i = 1; i <= portAmount; i++) {
        if (scoreboard.ports[i] && scoreboard.ports[i].length == obj.length && scoreboard.ports[i].every((value, index) => value === obj[index])) {
            current = i;
        }
    }
    // is the desired port already occupied?
    if (scoreboard.ports[port] != null) {
        toSwap = port;
        // remove other port selection
        document.getElementById("playerport-" + port + "-" + scoreboard.ports[port][0] + "-" + scoreboard.ports[port][1]).classList.remove("checked");
    }

    // remove if already set
    if (port == current) {
        scoreboard.ports[port] = null;
        document.getElementById("playerport-" + port + "-" + obj[0] + "-" + obj[1]).classList.remove("checked");
        port = 0;
    }

    // remove previous port selection
    if (current != 0) {
        scoreboard.ports[current] = null;
        document.getElementById("playerport-" + current + "-" + obj[0] + "-" + obj[1]).classList.remove("checked");
    }

    // swap if possible
    if (toSwap != 0 && current != 0 && toSwap != current) {
        scoreboard.ports[current] = scoreboard.ports[toSwap];
        document.getElementById("playerport-" + toSwap + "-" + scoreboard.ports[toSwap][0] + "-" + scoreboard.ports[toSwap][1]).classList.remove("checked");
        document.getElementById("playerport-" + current + "-" + scoreboard.ports[toSwap][0] + "-" + scoreboard.ports[toSwap][1]).classList.add("checked");
    }

    if (port != 0) {
        scoreboard.ports[port] = obj;
        document.getElementById("playerport-" + port + "-" + obj[0] + "-" + obj[1]).classList.add("checked");
    }
    fire("scoreboardchanged", true);
}

function setPlayerActive(teamNum, playerNum) {
    let el = document.getElementById('sb-players-' + teamNum);
    let boxes = el.getElementsByClassName('player-select');
    for (let i in boxes) {
        boxes[i].checked = playerNum == i;
    }
    scoreboard.teams[teamNum].selected = playerNum;
    fire("scoreboardchanged", true);
}

function setPlayerOut(teamNum, playerNum) {
    let el = document.getElementById('sb-players-' + teamNum);
    let btn = el.querySelector('#playeritem-' + teamNum + '-' + playerNum + ' .player-out');
    let btns = el.querySelectorAll('.player-out');

    btn.classList.toggle("out");
    scoreboard.teams[teamNum].out = [].map.call(btns, x => x.classList.contains("out"));
    fire("scoreboardchanged", true);
}

async function openCharacterSelect(teamNum, playerNum) {
    bgWork.start("openCharacterSelect");
    showModal("character-select");
    window.addEventListener("keydown", listenCharacterSelectKeyboard, true);
    let rosterEl = document.getElementById('character-select-roster').truncate();
    document.getElementById('character-select-personal').truncate(); // TODO: finally implement
    let skinsEl = document.getElementById('character-select-skins').truncate();
    let selection = scoreboard.teams[teamNum].characters[playerNum];
    let characters = await db.get("character", {game: scoreboard.game});
    characters = characters.map(x => new Character(x));

    let path = APPRES + "/assets/character/" + scoreboard.game;

    characters.push(new Character());

    characters.forEach((co) => {
        let rosterItem = createElement({"type": "div", "className": "item", "text": co.Shorten});
        if (co.DefaultSkin) {
            fileExists(`${path}/${co.ID}/stock/${co.DefaultSkin}.png`).then((ok) => {
                if (!ok) {
                    return;
                }
                rosterItem.innerText = "";
                let iconEl = createElement({"type": "div", "className": "icon"});
                iconEl.style.backgroundImage = `url('${path}/${co.ID}/stock/${co.DefaultSkin}.png')`;
                rosterItem.appendChild(iconEl);
            });
        }
        rosterItem.classList.toggle("selected", (selection && selection[0] == co.ID) || selection == null && co.ID == "");
        rosterItem.filterTerms = [co.name.toLowerCase(), co.shorten.toLowerCase()];

        let showSkins = e => {
            if (co.SkinCount <= 1) {
                setCharacter(teamNum, playerNum, co.ID, co.DefaultSkin);
                return hideModal();
            }

            skinsEl.truncate();
            co.skins.forEach((skin, index) => {
                let skinItem = createElement({"type": "div", "className": "item", "text": skin});
                fileExists(`${path}/${co.ID}/stock/${skin}.png`).then((ok) => {
                    if (!ok) {
                        return;
                    }
                    skinItem.innerText = "";
                    let iconEl = createElement({"type": "div", "className": "icon"});
                    iconEl.style.backgroundImage = `url('${path}/${co.ID}/stock/${skin}.png')`;
                    skinItem.appendChild(iconEl);
                });
                skinItem.classList.toggle("selected", selection && selection[0] == co.ID && selection[1] == index);
                skinItem.onclick = e => {
                    setCharacter(teamNum, playerNum, co.ID, index);
                    hideModal();
                };
                skinsEl.appendChild(skinItem);
            });
        };

        if (selection && selection[0] == co.ID && co.SkinCount > 2) {
            showSkins();
        }
        rosterItem.onclick = showSkins;
        rosterEl.appendChild(rosterItem);
    });
    bgWork.finish("openCharacterSelect");
}


function listenCharacterSelectKeyboard(e) {
    let selectRoster = document.getElementById('character-select-roster');
    if (!selectRoster.hasOwnProperty('filterTerm')) {
        selectRoster.filterTerm = "";
    }
    if (e) {
        e.preventDefault();
        if (e.keyCode >= 65 && e.keyCode <= 90 || e.keyCode == 32) {
            selectRoster.filterTerm += e.key;
        }
        if (e.keyCode == 8) { // Backspace
            selectRoster.filterTerm = "";
        }
        if (e.keyCode == 13) { // Enter
            let selected = document.querySelectorAll('#character-select-roster > .item:not(.filtered)');
            if (selected.length == 1) {
                selected[0].click();
            } else {
                let filteredSelection = [].filter.call(selected, x => x.filterTerms.includes(selectRoster.filterTerm));
                if (filteredSelection.length >= 1) {
                    filteredSelection[0].click();
                }
            }
        }
    }

    document.querySelectorAll('#character-select-roster > .item').forEach((item) => {
        item.classList.toggle("filtered", !item.filterTerms.join(",").includes(selectRoster.filterTerm));
    });

    if (selectRoster.filterTimeout) {
        clearTimeout(selectRoster.filterTimeout);
    }
    selectRoster.filterTimeout = setTimeout(() => {
        selectRoster.filterTerm = "";
        listenCharacterSelectKeyboard();
    }, 1000);
}

async function setCharacter(teamNum, playerNum, characterID, costumeIndex) {
    let character = characterID ? [characterID, costumeIndex] : null;
    let co = (character != null) ? await db.getSingle("character", character[0]) : null;
    co = new Character(co);
    setCharacterIcon(teamNum, playerNum, scoreboard.game, co.ID, co.getSkin(costumeIndex), co.Shorten);
    scoreboard.teams[teamNum].characters[playerNum] = character;
    fire("scoreboardchanged", true);
}

async function setCharacterIcon(teamNum, playerNum, game, id, skin, label) {
    let charBtn = document.querySelector("#playeritem-" + teamNum + "-" + playerNum + " button.character-select-btn .icon");
    let path = `${APPRES}/assets/character/${game}/${id}/stock/${skin}.png`;
    let charIconFileExists = await fileExists(path);
    charBtn.innerText = charIconFileExists ? "" : label;
    charBtn.style.backgroundImage = charIconFileExists ? `url('${path}')` : "";
}

function showModal(name) {
    let el = document.querySelector("#modal .panel").truncate();
    el.currentModalName = name;
    el.appendChild(document.getElementById(name + "-modal-tpl").content.cloneNode(true));
    el.id = name + "-modal";
    document.body.classList.add("modal");
    window.addEventListener("keydown", modalHotkeys, true);
}

function hideModal() {
    let el = document.querySelector("#modal .panel");
    window.removeEventListener("keydown", modalHotkeys, true);
    if (el.currentModalName == "character-select") {
        // do something here ...
        window.removeEventListener("keydown", listenCharacterSelectKeyboard, true);
    }
    document.body.classList.remove("modal");
}

function modalHotkeys(e) {
    if (e.keyCode == 27) {
        hideModal();
    }
}

async function insertTeamUI(teamNum) {
    if (teamNum == null) {
        insertTeamUI(1);
        insertTeamUI(2);
        return;
    }

    scoreboard.teams[teamNum].players.forEach((po, playerNum) => insertPlayerUI(teamNum, playerNum));

    let teamNameTbx = document.getElementById('sb-team-name-val-' + teamNum);
    teamNameTbx.placeholder = scoreboard.teams[teamNum].players.map(x => x.name).filter(x => x.length > 0).join(" / ");
    teamNameTbx.value = scoreboard.teams[teamNum].name;
    document.getElementById('sb-score-val-' + teamNum).value = scoreboard.teams[teamNum].score;

    let stateEl = document.getElementById('sb-state-' + teamNum);
    stateEl.classList.toggle("winners", scoreboard.teams[teamNum].state == 1);
    stateEl.classList.toggle("losers", scoreboard.teams[teamNum].state == 2);
}


async function insertPlayerUI(teamNum, playerNum) {
    let po = scoreboard.teams[teamNum].players[playerNum];
    let character = scoreboard.teams[teamNum].characters[playerNum];
    let co = character ? new Character(await db.getSingle("character", character[0])) : new Character();


    let pEl = document.getElementById("playeritem-" + teamNum + "-" + playerNum);
    let charBtn = pEl.querySelector("button.character-select-btn .icon");

    pEl.querySelector("input.playername").insertValue(po.name);

    setCharacterIcon(teamNum, playerNum, scoreboard.game, co.ID, co.getSkin(character ? character[1] : 0), co.Shorten);

    pEl.querySelector(".player-select").checked = scoreboard.teams[teamNum].selected == playerNum;
    pEl.querySelector(".player-out").classList.toggle("out", scoreboard.teams[teamNum].out[playerNum]);

    pEl.querySelector(".player-edit-btn").disabled = !po.InDB;
    pEl.querySelector(".player-create-btn").disabled = po.name.length == 0;
    // pEl.querySelector(".smashgg-apply-btn").disabled = isNaN(parseInt(po.smashgg)) && isNaN(parseInt(po.smashggMergeable));


    for (let portNum = 1; portNum <= portAmount; portNum++) {
        let hasPort = scoreboard.ports[portNum] != null && scoreboard.ports[portNum][0] == teamNum && scoreboard.ports[portNum][1] == playerNum;
        document.getElementById("playerport-" + portNum + "-" + teamNum + "-" + playerNum).classList.toggle("checked", hasPort);
    }

    pEl.querySelector(".player-edit-btn").classList.toggle("mergeable", !isNaN(parseInt(po.smashggMergeable)) && (parseInt(po.smashgg) == 0 || isNaN(parseInt(po.smashgg))));
    pEl.querySelector(".player-create-btn").classList.toggle("new", !isNaN(parseInt(po.smashgg)) && !po.InDB);

    getSmashggDifferences(po).then((res) => {
        if (scoreboard.teams[teamNum].players[playerNum]._id != res.player._id) {
            return;
        } // check if still same player
        pEl.querySelector(".player-edit-btn").classList.toggle("outdated", res.differences.length > 0);
    });


    if (po.InDB) {
        db.get("team", {$or: [].concat(po.team).map(x => ({"_id": x}))}).then(entry => {
            let value = entry.map(x => x.name).join(", ");
            pEl.querySelector(".team").innerText = value;
            pEl.classList.toggle("hasteam", value.length > 0);
        });
        db.count("player", {"name": {$regex: new RegExp(`^${po.name}$`, 'i')}})
            .then(count => pEl.getElementsByClassName("player-multi-btn")[0].disabled = count <= 1);
    } else {
        pEl.querySelector(".team").innerText = "";
        pEl.classList.remove("hasteam");
        pEl.querySelector(".player-multi-btn").disabled = true;
    }
}


function playerChangedHandler(docs) {
    for (let teamNum in scoreboard.teams) {
        for (let playerNum in scoreboard.teams[teamNum].players) {
            let po = scoreboard.teams[teamNum].players[playerNum];
            let txb = document.querySelector("#playeritem-" + teamNum + "-" + playerNum + " input.playername");
            docs.forEach((doc) => {
                if (doc.name == txb.value || doc._id == po._id) {
                    txb.dispatchEvent(new Event('input'));
                }
            });
        }
    }

    let oldIds = scoreboard.caster.map(x => x._id);
    let newIds = docs.map(x => x._id);
    let affected = oldIds.filter(value => newIds.includes(value));
    if (affected.length >= 0) {
        affected.forEach((pId) => scoreboard.caster[oldIds.indexOf(pId)] = new Player(docs[newIds.indexOf(pId)]));
        fire("scoreboardcasterchanged");
    }
}

function insertCasterUI() {
    scoreboard.caster.forEach((caster, idx) => setCaster(idx, caster));
}

function insertScoreboardData(newScoreboard) {

    if (newScoreboard) {
        scoreboard = correctDynamicProperties(newScoreboard);
    }

    // Fix player object Instances
    for (let teamNum in scoreboard.teams) {
        scoreboard.teams[teamNum].players = scoreboard.teams[teamNum].players.map((po) => (po instanceof Player ? po : new Player(po)));
    }

    // Fix caster object instances
    scoreboard.caster = scoreboard.caster.map((caster) => (caster instanceof Player ? caster : new Player(caster)));

    for (let fieldName in scoreboard.fields) {
        document.getElementById("field-" + fieldName).value = scoreboard.fields[fieldName].value;
        let cbx = document.getElementById("field-" + fieldName + "-cbx");
        if (cbx) {
            cbx.checked = scoreboard.fields[fieldName].enabled;
        }
    }

    // insert ports
    for (let teamNum = 1; teamNum <= 2; teamNum++) {
        for (let playerNum = 0; playerNum < scoreboard.teams[teamNum].players.length; playerNum++) {
            for (let portNum = 1; portNum <= portAmount; portNum++) {
                let hasPort = scoreboard.ports[portNum] != null && scoreboard.ports[portNum][0] == teamNum && scoreboard.ports[portNum][1] == playerNum;
                document.getElementById("playerport-" + portNum + "-" + teamNum + "-" + playerNum).classList.toggle("checked", hasPort);
            }
        }
    }

    fire("scoreboardsmashggchanged");
    fire("scoreboardcasterchanged");
    fire("scoreboardteamschanged");
    fire("scoreboardchanged", true);
}

function correctDynamicProperties(data) {

    // gracefully remove unneeded fields from scoreboard
    for (let fieldName in data.fields) {
        let del = true;
        _theme.fields.forEach(field => del = (fieldName == field.name ? false : del));
        if (del)
            delete data.fields[fieldName];
    }
    // add missing fields to scoreboard
    _theme.fields.forEach(field => {
        if (!data.fields.hasOwnProperty(field.name))
            data.fields[field.name] = {value: "", enabled: !field.checkbox};
    });
    return data;
}

function toggleSeatorderGlue() {
    document.getElementById('seatorder-glue-option').classList.toggle("enabled");
    buildSeatOrder();
}

function buildSeatOrder(affectedSeat) {
    let el = document.getElementById('seatorder').truncate();
    el.classList.toggle("visible", scoreboard.seatorder.length > 0);
    let glueTeams = document.getElementById('seatorder-glue-option').classList.contains("enabled");
    if (glueTeams) {
        let first = scoreboard.seatorder[0][0];
        if (affectedSeat != undefined) {
            // check if affected seat is last index
            for (let idx in scoreboard.seatorder) {
                if (scoreboard.seatorder[idx][0] == affectedSeat[0] && scoreboard.seatorder[idx][1] == affectedSeat[1] && idx == scoreboard.seatorder.length - 1) {
                    first = (affectedSeat[0] == 1 ? 2 : 1);
                    break;
                }
            }
        }
        // reorder teams together
        let teams = {1: [], 2: []};
        scoreboard.seatorder.forEach((entry) => teams[entry[0]].push(entry));
        scoreboard.seatorder = teams[first].concat(teams[(first == 1 ? 2 : 1)]);
    }

    scoreboard.seatorder.forEach((seat, index) => {
        let item = document.createElement("div");
        let po = scoreboard.teams[seat[0]].players[seat[1]];
        item.innerText = po.name || (seat[0] == 1 ? "Left" : "Right") + " Team - " + (seat[1] + 1) + ". Player";
        item.classList.toggle("hasname", po.name.length > 0);
        item.classList.add("team" + seat[0]);
        sortable(item, null, (indexList) => {
            scoreboard.seatorder = indexList.map((x) => scoreboard.seatorder[x[0]]);
            fire("scoreboardseatorderchanged", seat);
            fire("scoreboardchanged", true);
        });
        el.appendChild(item);
    });
}

async function editPlayer(arg) {
    let po, returnId, parentEl;

    if (arg instanceof Event) {
        parentEl = arg.currentTarget.closest("div.player-item");
        let {team, player} = parentEl.dataset;
        returnId = Math.floor(Math.random() * 100000);
        parentEl.dataset.returnId = returnId;
        po = scoreboard.teams[team].players[player];

        if (arg.currentTarget.classList.contains("player-create-btn")) {
            po._id = "";
        }

    } else if (arg) {
        po = arg;
    }

    let res = await openWindow("database-entry", {db: "player", entry: new Player(po)});

    if (parentEl && parseInt(parentEl.dataset.returnId) == returnId) {
        console.log("edit player res:", res);
    }

}

async function buildPlayerAutoCompleteList() {
    bgWork.start("buildPlayerAutoCompleteList");
    let players = await db.get("player");
    let frag = document.createDocumentFragment();
    let namesAdded = [];
    players.forEach((p) => {
        if (!namesAdded.includes(p.name)) {
            let opt = document.createElement("option"); // do NOT optimize with "createElement()", performance important here
            opt.value = p.name;
            frag.appendChild(opt);
            namesAdded.push(p.name);
        }
    });
    document.getElementById('playernames').truncate().appendChild(frag);
    bgWork.finish("buildPlayerAutoCompleteList");
}


async function buildGameSelection() {
    let el = document.getElementById('game-select').truncate();
    let games = await db.get("game");
    games.forEach((game) => {
        let opt = document.createElement("option");
        opt.value = game._id;
        opt.innerText = game.name;
        opt.selected = scoreboard.game == game._id;
        el.appendChild(opt);
    });
}

async function buildThemeSelection() {
    let el = document.getElementById('theme-select').truncate();
    let themes = await ThemeWrapper.getThemesList();
    themes.forEach((theme) => {
        let opt = document.createElement("option");
        opt.value = theme.dir;
        opt.innerText = theme.Name + (themes.some(x => x.name == theme.name && x.dir != theme.dir) ? " (" + theme.dir + ")" : "");
        opt.selected = _theme.dir == theme.dir;
        el.appendChild(opt);
    });
}

function createField(field) {
    let tpl = document.getElementById("fields-" + field.type + "-tpl") || document.getElementById("fields-text-tpl");
    let el = createElement({"type": "div", "className": "field-" + field.type});
    let label = createElement({"type": "div", "className": "label"});
    label.innerText = field.label;

    el.appendChild(label);
    el.appendChild(tpl.content.cloneNode(true));
    let inputElm = el.getElementsByClassName("ref")[0];

    switch (field.type) {
        case "time":
            el.getElementsByTagName("button")[0].onclick = (e) => {
                let now = new Date();
                let refEl = el.getElementsByTagName("input")[0];
                let offsetHourEl = el.getElementsByClassName("field-time-offset")[0].getElementsByTagName("input")[0];
                let offsetMinuteEl = el.getElementsByClassName("field-time-offset")[0].getElementsByTagName("input")[1];
                now.setTime(now.getTime() + offsetHourEl.value * 3600000 + offsetMinuteEl.value * 60000);
                refEl.value = now.toTimeString().substr(0, 5);
                offsetHourEl.value = 0;
                offsetMinuteEl.value = 0;
                refEl.dispatchEvent(new Event('input'));
            };
            break;
        case "dropdown":
            let options = field.options || ["(No options available)"];
            inputElm.truncate();
            options.forEach((opt) => {
                let optEl = document.createElement("option");
                optEl.value = opt;
                optEl.innerText = opt;
                inputElm.appendChild(optEl);
            });
            break;
    }

    inputElm.id = "field-" + field.name;
    inputElm.addEventListener("input", (e) => {
        scoreboard.fields[field.name].value = e.target.value;
        fire("scoreboardchanged");
    });

    return el;
}

function toggleAutoUpdate(value) {
    client.autoupdate = (value != null ? value : !client.autoupdate);
    ipcRenderer.invoke("set", "autoupdate", client.autoupdate);
    document.getElementById('autoupdate-cbx').checked = client.autoupdate;
}

function autoUpdate(noThreshold) {
    noThreshold = (noThreshold == null ? false : noThreshold);
    if (!client.autoupdate) {
        return;
    }
    if (_timeouts.hasOwnProperty("autoupdate")) {
        clearTimeout(_timeouts.autoupdate);
    }
    _timeouts.autoupdate = setTimeout(update, noThreshold ? 5 : client.autoupdateThreshold);
}

async function update() {
    let now = new Date();
    scoreboard._D = now;

    // apply last stream activity for each player on stream
    for (let teamNum in scoreboard.teams) {
        db.update("player", {$or: scoreboard.teams[teamNum].players.map((x) => ({"_id": x._id}))}, {"lastActivity": now}, true);
    }

    let dbEntries = await collectDatabaseEntries(scoreboard);
    if (scoreboard._D != now) {
        return;
    } // prevent multiple updates due to delay
    _ws.send("scoreboard", {scoreboard, dbEntries});
    insertMatchList(scoreboard);
    fs.writeFileSync('scoreboard.json', JSON.stringify(scoreboard)); // legacy - reads startup data
    fire("update");
}

function slippiUpdate(name, stats) {
    _ws.send('slippi' + name, {stats});
}

async function collectDatabaseEntries(sb) {
    let dbData = {country: [], character: [], team: [], game: [], pride: []};
    for (let teamNum in sb.teams) {
        sb.teams[teamNum].players.forEach((player) => {
            dbData.country.push(player.country);
            dbData.pride = dbData.pride.concat(player.pride);
            dbData.team = dbData.team.concat(player.team);
        });
        // filter if character exists, then map first child and concat to dbData
        dbData.character = dbData.character.concat(sb.teams[teamNum].characters.filter((x) => x != null).map((x) => x[0]));
    }

    sb.caster.forEach((caster) => { // insert DB fetch IDs for caster
        dbData.country.push(caster.country);
        dbData.pride = dbData.pride.concat(caster.pride);
        dbData.team = dbData.team.concat(caster.team);
    });
    dbData.game.push(sb.game);

    for (let dbName in dbData) {
        // filter out empty values
        dbData[dbName] = dbData[dbName].filter((x) => x != null && x.length > 0);

        // convert VALUE to {"_id": VALUE} for all object childs
        dbData[dbName] = dbData[dbName].map((x) => ({"_id": x}));

        // create promise for DB fetch
        dbData[dbName] = await db.get(dbName, {$or: dbData[dbName]});
    }
    return dbData;
}

async function insertMatchList(sb) {
    if (sb.id == null) {
        await newMatch(true);
    }
    let data = await db.getSingle('match', {"_id": sb.id});
    if (data == null) {
        return;
    } // fail safe

    let entry = Object.assign(data, {
        teams: {},
        game: sb.game,
        type: sb.type,
        smashgg: sb.smashgg,
        _D: new Date()
    });

    // add players
    for (let teamNum in sb.teams) {
        entry.teams[teamNum] = {
            name: "",
            players: []
        };
        sb.teams[teamNum].players.forEach((player, playerNum) => {
            if (player.name.length == 0) {
                return;
            }
            entry.teams[teamNum].players[playerNum] = {
                _id: player._id,
                name: player.name,
                team: player.team
            }
        });
    }

    // add characters
    for (let teamNum in sb.teams) {
        for (let charIndex in sb.teams[teamNum].characters) {
            let character = sb.teams[teamNum].characters[charIndex];
            if (character == null || character[0].length == 0) {
                continue;
            } // character is undefined, go to next
            let player = sb.teams[teamNum].players[charIndex];
            if (player == null || player._id.length == 0) {
                continue;
            } // player is undefined or has no ID, go to next
            if (entry.characters[player._id] == null) {
                entry.characters[player._id] = [];
            }
            if (entry.characters[player._id].indexOf(character[0]) !== -1) {
                continue;
            } // character already added, go to next
            entry.characters[player._id].push(character[0]);
        }
    }

    // add commentators
    sb.caster.forEach((caster) => {
        if (caster.name.length == 0) {
            return;
        }
        for (let i in entry.caster) {
            if (entry.caster[i]._id.length > 0 && entry.caster[i]._id == caster._id) {
                return;
            }
            if (entry.caster[i]._id.length == 0 && entry.caster[i].name == caster.name) {
                return;
            }
        }
        entry.caster.push({"_id": caster._id, "name": caster.name});
    });

    // overwrite fields
    _theme.fields.forEach((field) => {
        if (field.matchlist) {
            entry.fields[field.name] = sb.fields[field.name].value;
        }
    });

    db.update("match", {"_id": entry._id}, entry);
}

async function newMatch(noClear) {
    await db.add("match", {"teams": [], "caster": [], "characters": {}, "fields": {}, "_D": new Date()});
    if (noClear != true) {
        clearBoard();
    }
    applyLastMatchId();
}

async function applyLastMatchId() {
    scoreboard.id = await getLastMatchId();
}

async function getLastMatchId() {
    let matches = await db.get("match", null, null, {sort: {"_D": -1}, limit: 1});
    if (matches.length == 0) {
        return;
    }
    return matches[0]._id;
}

function clockUpdate() {
    let d = new Date();
    let h = d.getHours();
    let i = d.getMinutes();
    i = (i < 10 ? '0' : '') + i;
    h = (h < 10 ? '0' : '') + h;
    let offset = -d.getTimezoneOffset();
    document.getElementById('clock').firstElementChild.innerText = h + ':' + i;
    document.getElementById('clock').lastElementChild.innerText = "UTC " + (offset >= 0 ? "+" : "-") + parseInt(offset / 60) + (offset % 60 == 0 ? "" : ":" + offset % 60);
    setTimeout(clockUpdate, (60 - d.getSeconds()) * 1000);
}


function handleWsCommand(data) {
    switch (data.name) {
        case "score":
            modifyScore(data.team, data.value, data.absolute);
            break;
        case "clear":
            clearBoard();
            break;
        case "swap":
            swap();
            break;
        case "update":
            update();
            break;
        case "smashgg-next":
            smashggApplyNextSet();
            break;
        case "character":
            setCharacter(data.team, data.player, data.character.id, data.character.skin)
            break;
    }
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

function fire(name, data) {
    if (_callbacks.hold.indexOf(name) > -1)
        return false;
    if (_callbacks.on.hasOwnProperty(name))
        _callbacks.on[name].forEach(cb => cb(data));
    if (_callbacks.once.hasOwnProperty(name)) {
        _callbacks.once[name].forEach(cb => cb(data));
        _callbacks.once[name] = [];
    }
}

function hold(name) {
    if (_callbacks.hold.indexOf(name) === -1)
        _callbacks.hold.push(name);
}

function release(name) {
    let index = _callbacks.hold.indexOf(name);
    if (index > -1)
        _callbacks.hold.splice(index, 1);
}

var bgWork = {
    workers: [],
    start: function (name) {
        if (this.workers.indexOf(name) == -1)
            this.workers.push(name);
        this.check();
    },
    finish: function (name) {
        let index = this.workers.indexOf(name);
        if (index > -1)
            this.workers.splice(index, 1);
        this.check();
    },
    finishAll: function () {
        this.workers = [];
        this.check();
    },
    check: function () {
        document.body.classList.toggle("working", this.workers.length > 0);
    }
}

function startSlippi() {
    ipcRenderer.send("slippi", "start");
}

function stopSlippi() {
    ipcRenderer.send("slippi", "stop");
}
function showSlippi(value){
    if(value){
        document.querySelectorAll('.slippibtn-div').forEach(e => e.classList.remove('hide'));
    }else{
        document.querySelectorAll('.slippibtn-div').forEach(e => e.classList.add('hide'));
    }
}
function showObs(value){
    if(value){
        document.querySelectorAll('.obsbtn-div').forEach(e => e.classList.remove('hide'));
    }else{
        document.querySelectorAll('.obsbtn-div').forEach(e => e.classList.add('hide'));
    }
}


ipcRenderer.on("slippi_status", (event, name) => {
    switch (name) {
        case "disconnected":
            document.getElementById("start-slippi-btn").disabled = false;
            document.getElementById("start-slippi-btn").innerHTML = 'START SLIPPI'
            document.getElementById("start-slippi-btn").style.display = 'inherit';
            document.getElementById('stop-slippi-btn').style.display = 'none';
            document.getElementById("slippi-status").innerHTML = 'Disconnected to Slippi';
            break;
        case "connected":
            document.getElementById("start-slippi-btn").disabled = true;
            document.getElementById("start-slippi-btn").innerHTML = 'START SLIPPI'
            document.getElementById("start-slippi-btn").style.display = 'none';
            document.getElementById("stop-slippi-btn").style.display = 'inherit';
            document.getElementById("slippi-status").innerHTML = 'Connected to Slippi';
            break;
        case 'connecting':
            document.getElementById("start-slippi-btn").disabled = true;
            document.getElementById("start-slippi-btn").innerHTML = 'START SLIPPI'
            document.getElementById("start-slippi-btn").style.display = 'none';
            document.getElementById("stop-slippi-btn").style.display = 'inherit';
            document.getElementById("slippi-status").innerHTML = 'Connecting to Slippi';
            break;
        case 'reconnecting':
            document.getElementById("start-slippi-btn").disabled = true;
            document.getElementById("start-slippi-btn").innerHTML = 'START SLIPPI'
            document.getElementById("start-slippi-btn").style.display = 'none';
            document.getElementById("stop-slippi-btn").style.display = 'inherit';
            document.getElementById("slippi-status").innerHTML = 'Reconnecting to Slippi';
            break;
    }
});
ipcRenderer.on('slippiFrame', (event, name) => {
    slippi = name;
    slippiUpdate('Frame', slippi);
});


function startObs() {
    ipcRenderer.send("obs", "start");
}

function stopObs() {
    ipcRenderer.send("obs", "stop");
}

ipcRenderer.on("obs_status", (event, name) => {
    switch (name) {
        case "disconnected":
            document.getElementById("start-obs-btn").disabled = false;
            document.getElementById("start-obs-btn").style.display = 'inherit';
            document.getElementById('stop-obs-btn').style.display = 'none';
            document.getElementById("obs-status").innerHTML = 'Disconnected to OBS';
            break;
        case "connected":
            document.getElementById("start-obs-btn").disabled = true;
            document.getElementById("start-obs-btn").style.display = 'none';
            document.getElementById("stop-obs-btn").style.display = 'inherit';
            document.getElementById("obs-status").innerHTML = 'Connected to OBS';
            break;
        case 'connecting':
            document.getElementById("start-obs-btn").disabled = true;
            document.getElementById("start-obs-btn").style.display = 'none';
            document.getElementById("stop-obs-btn").style.display = 'inherit';
            document.getElementById("obs-status").innerHTML = 'Connecting to OBS';
            break;
        case 'reconnecting':
            document.getElementById("start-obs-btn").disabled = true;
            document.getElementById("start-obs-btn").style.display = 'none';
            document.getElementById("stop-obs-btn").style.display = 'inherit';
            document.getElementById("obs-status").innerHTML = 'Reconnecting to OBS';
            break;
    }
});


function casterAdd() {
    _theme.caster++;
    buildCasterList();

}

function casterDelete() {
    if (_theme.caster > 1) {
        _theme.caster--;
        buildCasterList();
    }

}