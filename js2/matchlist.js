const { clipboard } = require('electron');
const APPROOT = remote.getGlobal("APPROOT");
const APPRES = remote.getGlobal("APPRES");


remoteOn(db, "changed", dbRefresh);

var tournamentName = "";
var titlePattern = "{TOURNAMENT} - {TEAM1} Vs. {TEAM2} - {FIELD:ROUND} - {FIELD:EVENT}";
var teamSeperator = " / ";
var characterSeperator = ", ";
var includeCharacters = true;
var includeTeamPrefix = true;

var _keys = [];

var _maxPerPage = 50;
var _currentPage = 1;

var _selectedFields = [];
var _selectedIndex = -1;


window.onkeydown = (e) => {
	if (e.key == "Delete" && _selectedFields.length > 0) {
		if (!confirm("Do you want to remove all selected entries? (" + _selectedFields.length + ")")) { return; }
		_selectedFields.forEach((field) => {
			db.remove(_currentDB, field);
		});
	}
};

window.addEventListener("load", () => dbRefresh);

function dbRefresh() {
	updateEntryCount()
	getList();
}

async function updateEntryCount() {
	var val = await db.count('match');
	document.querySelector("#db-select-" + dbName + " .count").innerText = val + " entr" + (val == 1 ? 'y' : 'ies');
}

async function getList() {
	let entries = await db.get('match', {}, null, {
		limit: _maxPerPage,
		page: _currentPage,
		sort: { "_D": -1 }
	});
	displayList(entries);
	buildPageList();
}

async function displayList(entries) {
	var el = document.getElementById('match-list');
	el.innerHTML = "";

	// collect IDs to fetch all DB entries
	var dbIdCollection = {
		player: {},
		team: {},
		game: {},
		character: {}
	};
	entries.forEach((entry) => {
		if (entry.game && entry.game.length > 0) {
			dbIdCollection.game[entry.game] = null;
		}
		entry.caster.forEach((caster) => {
			if (caster._id && caster._id.length > 0) {
				dbIdCollection.player[caster._id] = null;
			}
		});
		for (let teamNum in entry.teams) {
			entry.teams[teamNum].players.forEach((player) => {
				if (player._id && player._id.length > 0) {
					dbIdCollection.player[player._id] = null;
					player.team.forEach((team) => {
						dbIdCollection.team[team] = null;
					});
				}
			});
		}
		for (let charIndex in entry.characters) {
			entry.characters[charIndex].forEach((charId) => {
				dbIdCollection.character[charId] = null;
			});
		}
	});

	// fetch entries for dbIdCollection
	for (let dbName in dbIdCollection) {
		for (entryId in dbIdCollection[dbName]) {
			let prototypeAssign = null;
			if (dbName == 'player') { prototypeAssign = Player; }
			if (dbName == 'character') { prototypeAssign = Character; }
			dbIdCollection[dbName][entryId] = await db.getSingle(dbName, { "_id": entryId }, prototypeAssign);
		}
	}



	// display items
	entries.forEach((entry, index) => {
		console.log(entry);

		var teamNames = [];
		for (let teamNum in entry.teams) {
			if (entry.teams[teamNum].name.length > 0) {
				teamNames.push(entry.teams[teamNum].name);
			} else {
				var playerNames = [];
				for (let playerNum in entry.teams[teamNum].players) {
					let player = entry.teams[teamNum].players[playerNum];
					let playerName = player.name;
					if (dbIdCollection.player.hasOwnProperty(player._id)) {
						player = dbIdCollection.player[player._id];
						if (includeTeamPrefix) {
							playerName = player.getDisplayName(player.team.map(x => dbIdCollection.team[x]));
						} else {
							playerName = player.name;
						}
						if (includeCharacters && entry.characters[player._id]) {
							var charList = ' (' + entry.characters[player._id].map(x => dbIdCollection.character[x].Shorten).join(characterSeperator) + ')';
							playerName += charList;
						}
					}
					playerNames.push(playerName);
				}
				teamNames.push(playerNames.join(teamSeperator));
			}
		}

		/*
		var includeCharacters = true;
		var includeTeamPrefix = true;
		*/
		var patternReplacements = [];
		patternReplacements.push(["TOURNAMENT", tournamentName]);
		patternReplacements.push(["TEAM1", teamNames[0]]);
		patternReplacements.push(["TEAM2", teamNames[1]]);
		for (let field in entry.fields) {
			patternReplacements.push(["FIELD:" + field.toUpperCase(), entry.fields[field]]);
		}

		var title = titlePattern;
		patternReplacements.forEach((replace) => {
			title = title.replace(new RegExp("{" + replace[0] + "}", 'g'), replace[1]);
		});


		var item = document.createElement('div');
		item.classList.add('item');

		var overviewEl = document.createElement('div');

		var overviewTitleEl = document.createElement('div');
		overviewTitleEl.innerText = title;
		overviewEl.appendChild(overviewTitleEl);

		var overviewCopyBtn = document.createElement('button');
		overviewCopyBtn.innerText = "Copy";
		overviewCopyBtn.onclick = (e) => {
			clipboard.writeText(title, 'selection');
			e.stopPropagation();
		}

		overviewEl.appendChild(overviewCopyBtn);


		item.appendChild(overviewEl);

		var matchListEl = document.createElement('div');


		matchListEl.className = "game-item";
		var playersEl = document.createElement('div');
		playersEl.className = "player";




		playersEl.innerHTML = teamNames.join(" Vs. ");
		matchListEl.appendChild(playersEl);

		var castersEl = document.createElement('div');
		castersEl.className = "caster";
		castersEl.innerHTML = entry.caster.filter(x => x.name.length > 0 || x.id.length > 0).map(x => (x.id && x.id.length > 0) ? dbIdCollection.player[x.id].name : '<i>' + x.name + '</i>').join(" / ");
		matchListEl.appendChild(castersEl);

		var gameEl = document.createElement('div');
		gameEl.className = "game";
		gameEl.innerHTML = dbIdCollection.game[entry.game].name;
		matchListEl.appendChild(gameEl);

		var fieldsEl = document.createElement('div');
		fieldsEl.className = "fields";
		for (let i in entry.fields) {
			fieldsEl.innerHTML += '<div class="field-item">' + i + ': ' + entry.fields[i] + '</div>';
		}
		matchListEl.appendChild(fieldsEl);

		item.appendChild(matchListEl);
		var titleTextboxesEl = document.createElement('div');
		titleTextboxesEl.classList.add("title-textboxes");

		var titleFull = document.createElement('input');
		titleFull.value = "";
		titleTextboxesEl.appendChild(titleFull);

		var titleTrimmed = document.createElement('input');
		titleTrimmed.value = "";
		titleTextboxesEl.appendChild(titleTrimmed);

		var titleShort = document.createElement('input');
		titleShort.value = "";
		titleTextboxesEl.appendChild(titleShort);


		item.appendChild(titleTextboxesEl);
		item.onclick = (e) => {
			if (e.path.map(x => x.className).indexOf('game-item') !== -1) {
				return;
			}
			item.classList.toggle("selected");
		};


		el.appendChild(item);
	});
}

function buildPageList() {

	db.db['match'].count({}, (err, rows) => {
		if (err) console.log(err);
		var pageCount = Math.ceil(rows / _maxPerPage);
		var el = document.getElementById('page-list');
		el.innerHTML = "";
		for (let num = 1; num <= pageCount; num++) {
			let pi = document.createElement('div');
			pi.innerText = num;
			pi.classList.toggle("selected", num == _currentPage);
			pi.onclick = () => goToPage(num);
			el.appendChild(pi);
		}
	});
}

function goToPage(page) {
	_currentPage = page;
	getList();
}

function openWindow(name, params) {
	ipcRenderer.send('openWindow', { name: name, params: params })
}


