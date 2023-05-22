const { clipboard } = require('electron');
const path = require("path");
const fs = require("fs");
const APPROOT = remote.getGlobal("APPROOT");
const APPRES = remote.getGlobal("APPRES");



var dbName, id, fields, dataset, hook, _returnChannel;
var _callbacks = { on: {}, once: {}, hold: [] }; // callbacks for on,once & fire
var editMode = false;
var smashgg = new SmashggWrapper();
var smashggIgnore = {};

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);

ipcRenderer.on("data", async (event, data) => {
	dbName = data.db;
	id = data.id;
	if (data.entry) {
		dataset = data.entry;
		id = data.entry._id;
	}
	if (id == null) {
		dataset = db.createStruct(dbName);
	}
	await startFunction();
});

smashgg.on("fetch-error", (e) => {
	console.error(e);
});

async function startFunction() {
	await ipcRenderer.invoke("get", "smashgg-token").then(token => smashgg.Token = token);
	await ipcRenderer.invoke("get", "smashgg").then(data => smashgg.SelectedTournament = data.tournament);

	await buildForm();

	if (id) {
		dataset = await db.getSingle(dbName, id);
		editMode = true;
	}
	dataset = await db.resolveRelations("player", dataset);
	dataset = new Player(dataset);
	console.log(dataset);
	insertValues(dataset);
	for (let infoEl of document.querySelectorAll("#info > div")) {
		infoEl.onclick = () => clipboard.writeText(infoEl.innerText, 'selection');
	}
};

async function downloadPhotoFromSmashgg() {
	let smashggId = parseInt(document.getElementById('field-smashgg').value);
	if (isNaN(smashggId) || smashggId == 0) { return; }
	await new Promise(async (resolve, reject) => {
		let res = await smashgg.getPlayerPhoto(smashggId);
		let buffer = await res.arrayBuffer();
		fs.writeFile(`${APPRES}/assets/player/avatar/${dataset._id}.png`, Buffer.from(buffer), (err) => {
			if (err) throw err;
			resolve();
		});
	});
	document.getElementById('photo').style.backgroundImage = `url('${path.join(APPRES, "assets", "player", "avatar", dataset._id + ".png").replace(/\\/g, "/")}?_rand=${Math.random()}')`;
}

async function checkSmashggCompare() {
	let smashggId = parseInt(document.getElementById('field-smashgg').value);
	if (isNaN(smashggId) || smashggId == 0) { return; }
	let smashggEntry = await smashgg.getPlayer(smashggId);

	console.log(smashggEntry);

	let diffs = SmashggWrapper.comparePlayer(dataset, smashggEntry, true);


	for (let diffIdx in diffs) {
		const diff = diffs[diffIdx];
		const diffEl = document.querySelector(`#field-${diff.field} .smashgg-diff`);
		const field = fields.find(x => x.field == diff.field);
		if (field.type == "relation" && diff.smashgg.length > 0) {
			let relationEntry = await db.getSingle(field.relation, { "name": diff.smashgg });
			console.log("?", diff.smashgg, relationEntry);
			diff.smashggRelationId = (relationEntry == null ? null : relationEntry._id);
		}

		document.getElementById(`field-${diff.field}`).smashggDifference = diff;
		diffEl.classList.add("visible");
		diffEl.classList.toggle("no-db", diff.smashggRelationId === null);
		diffEl.classList.toggle("ignored", diff.ignored);
		diffEl.querySelector(`.merge`).disabled = diff.smashggRelationId === null;
		diffEl.querySelector(`.ignore`).disabled = diff.ignored || diff.smashggRelationId === null;
		diffEl.querySelector(`.value`).innerText = diff.smashgg;
		diffEl.querySelector(`.value`).classList.toggle("empty", diff.smashgg.length == 0);
	}

	console.log("Differences:", diffs);
}

async function buildForm() {
	var formEl = document.getElementById("form");

	fields = await db.get("dbstruct", { "name": dbName }, { sort: { index: -1 } });

	console.log(fields.map(x => x.field));

	for (let i in fields) {
		let field = fields[i];
		let childEl = document.createElement("div");
		childEl.className = "field-item";
		let labelEl = document.createElement("label");
		labelEl.innerText = field.field;
		childEl.appendChild(labelEl);
		let inEl;
		switch (field.type) {
			case "text":
				inEl = document.createElement("input");
				inEl.type = "text";
				break;
			case "date":
				inEl = document.createElement("input");
				inEl.type = "date";
				break;
			case "number":
				inEl = document.createElement("input");
				inEl.type = "number";
				break;
			case "relation":
				inEl = document.createElement("select");
				break;
		}
		inEl.id = "field-" + field.field;
		childEl.appendChild(inEl);
		//	formEl.appendChild(childEl);
	}

	let countrySelect = document.querySelector("#field-country .input > *");

	let optionVals = await db.get("country");
	optionVals.sort(function (a, b) {
		if (a.name < b.name) { return -1; }
		if (a.name > b.name) { return 1; }
		return 0;
	});
	optionVals.unshift({ "_id": "", name: " - None - " });
	optionVals.forEach((entry) => {
		let opt = document.createElement("option");
		opt.innerText = entry.name;
		opt.value = entry._id;
		countrySelect.appendChild(opt);
	});




	let teamSelect = document.getElementById('team-select').truncate();
	let teams = await db.get('team');

	teams.sort(function (a, b) {
		if (a.name < b.name) { return -1; }
		if (a.name > b.name) { return 1; }
		return 0;
	});

	teams.forEach((team) => {
		let teamEl = createElement({ "type": "div", "className": "team-item" });
		let teamLogoEl = createElement({ "type": "div", "className": "logo" });
		let teamNameEl = createElement({ "type": "div", "className": "name" });
		let teamLogoPath = null;
		if (fs.existsSync(path.join(APPRES, "assets", "team", team._id + ".png").replace(/\\/g, "/"))) {
			teamLogoPath = path.join(APPRES, "assets", "team", team._id + ".png").replace(/\\/g, "/");
		} else if (fs.existsSync(path.join(APPRES, "assets", "team", team._id + ".jpg").replace(/\\/g, "/"))) {
			teamLogoPath = path.join(APPRES, "assets", "team", team._id + ".jpg").replace(/\\/g, "/");
		} else {
			teamLogoPath = path.join(APPRES, "assets", "team", team._id + ".svg").replace(/\\/g, "/");
		}

		teamEl.dataset._id = team._id;
		teamEl.onclick = (e) => e.currentTarget.classList.toggle("selected");

		teamNameEl.innerText = team.name;

		fs.access(teamLogoPath, (err) => {
			if (err) { return; }
			teamLogoEl.style.backgroundImage = `url('${teamLogoPath}')`;
		});

		teamEl.appendChild(teamLogoEl);
		teamEl.appendChild(teamNameEl);
		teamSelect.appendChild(teamEl);
	});

	return true;
}

async function insertValues(entry) {

	document.title = (editMode ? entry.name : "New Player");

	document.getElementById('photo').style.backgroundImage = `url('${path.join(APPRES, "assets", "player", "avatar", entry._id + ".png").replace(/\\/g, "/")}')`;
	document.querySelector('#info .name').innerText = editMode ? entry.name : "New Player";
	document.querySelector('#info .id').innerText = editMode ? entry._id : "TBD";
	document.getElementById('field-smashgg').value = entry.smashgg;


	for (let field of fields) {
		let value = entry[field.field] || "";
		if (field.field == "team") {
			for (let teamEl of document.getElementById('team-select').children) {
				teamEl.classList.toggle("selected", value.map(x => x._id).includes(teamEl.dataset._id));
			}
		} else {
			let el = document.getElementById("field-" + field.field);
			let inputEl = el.querySelector(".input > *");
			if (el && inputEl) {
				if (field.type == "relation") {
					let mappedValue = [];
					if (value) {
						if (field.multi) { // multi (array)[object]
							mappedValue = value.map(x => x._id);
						} else { // single (object)
							mappedValue.push(value._id);
						}
					}
					for (let i = 0; i < inputEl.options.length; i++) {
						inputEl.options[i].selected = mappedValue.includes(inputEl.options[i].value);
					}
				} else if (field.type == "text" && field.multi) {
					inputEl.value = value ? value.join(',') : "";
				} else {
					inputEl.value = value;
				}
			} else {
				console.log("field-" + field.field, "is missing");
			}
		}
	}
	calcInsertAge();
	if (entry.smashgg > 0) {
		smashggIgnore = Object.assign(smashggIgnore, dataset.smashggIgnore);
		checkSmashggCompare();
	}
}

function calcInsertAge() {
	let val = document.querySelector('#field-birthday .input input').value;
	let ageDifMs = Date.now() - new Date(val).getTime();
	let age = Math.abs(new Date(ageDifMs).getUTCFullYear() - 1970);
	if (isNaN(age)) {
		age = "";
	}
	document.getElementById('birthday-age').innerText = age;
}

async function merge(fieldName) {
	let el = document.querySelector(`#field-${fieldName}`);
	let diffEl = el.querySelector(`.smashgg-diff`);
	if (smashggIgnore.hasOwnProperty(fieldName)) {
		delete smashggIgnore[fieldName];
	}

	if (el.smashggDifference.smashggRelationId !== undefined) { // relation
		el.querySelector(".input .value").value = el.smashggDifference.smashggRelationId;
	} else {
		el.querySelector(".input .value").value = el.smashggDifference.smashgg;
	}

	diffEl.classList.remove("visible");
}

async function ignore(fieldName) {
	let el = document.querySelector(`#field-${fieldName}`);
	let diffEl = el.querySelector(`.smashgg-diff`);
	// el.querySelector(".input .value").value = el.smashggDifference.smashgg;
	smashggIgnore[fieldName] = el.smashggDifference.smashgg;
	diffEl.querySelector(".ignore").setAttribute("disabled", "disabled");
	diffEl.classList.add("ignored");
}

async function assignSmashgg() {
	let nameField = document.querySelector('#field-name .input input');
	let name = (nameField.value.length > 0 ? nameField.value : dataset.name);
	let res = await openWindow("smashgg-player-search", { name, dataset }, true);
	if (res && res.player && res.player.id) {
		document.getElementById("field-smashgg").value = res.player.id;
		checkSmashggCompare();
	}
}

async function save() {
	dataset.smashggIgnore = smashggIgnore;

	for (let i in fields) {
		let field = fields[i];
		let value = "";
		if (field.field == "team") {
			value = [];
			for (let teamEl of document.getElementById('team-select').children) {
				if (!teamEl.classList.contains("selected")) { continue; }
				value.push(teamEl.dataset._id);
			}
		} else if (field.field == "smashgg") {
			value = document.getElementById('field-smashgg').value;
		} else {
			let el = document.querySelector("#field-" + field.field + " .input .value");
			if (el) {
				if (field.type == "relation" && field.multi) {
					value = [];
					for (let i = 0; i < el.options.length; i++) {
						if (el.options[i].selected) {
							value.push(el.options[i].value);
						}
					}
				} else if (field.type == "text" && field.multi) {
					value = el.value.split(",");
				} else {
					value = el.value;
				}
			}
		}
		dataset[field.field] = value;
	}

	let doc;
	if (editMode) {
		doc = await db.update("player", dataset._id, dataset);
	} else {
		doc = await db.add("player", dataset);
	}
	ipcRenderer.send(_returnChannel, doc);
	window.close();
}

function cancel() {
	window.close();
}

function reset() {
	insertValues(dataset);
}

async function remove() {
	var conf = confirm("Are you sure you want to delete this entry?");
	if (!conf) { return }
	await db.remove("player", dataset._id);
	window.close();
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
