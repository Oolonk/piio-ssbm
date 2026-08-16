const APPROOT = remote.getGlobal("APPROOT");
const APPRES = remote.getGlobal("APPRES");


// ipcRenderer.on("databaseChanged", (event, arg) => db.reload(arg).then(getList));



var _currentDB;
var _keys = [];

var _maxPerPage = 30;
var _currentPage = 1;

var _selectedFields = [];
var _selectedIndex = -1;

// databases which can be checked for mergeable (duplicate) entries and the fields taken over on merge
const MERGE_DBS = ["player"];
const MERGE_FIELDS = [{ "field": "smashgg", "label": "start.gg" }, { "field": "parrygg", "label": "parry.gg" }];
const MERGE_INFO_COLUMNS = 4;

var _mergeGroups = [];
var _mergeInfoKeys = [];
var _relationNames = {};


remoteOn(db, "changed", refreshUI);

window.onkeydown = (e) => {
	if (document.body.classList.contains("modal")) { return; }
	if (e.key == "Delete" && _selectedFields.length > 0) {
		let conf = confirm("Do you want to remove all selected entries? (" + _selectedFields.length + ")");
		if (!conf) { return; }
		for (let i in _selectedFields) {
			db.remove(_currentDB, _selectedFields[i]);
		}
	}
};

window.addEventListener("load", buildDatabaseSelection);

async function buildDatabaseSelection() {
	let el = document.getElementById('db-selection').truncate();
	let dbList = db.getDatabaseList();
	// filter out databases without dbStruct
	let struct = await db.get("dbstruct", { $not: { "listhide": true } });
	dbList = dbList.filter(x => [...new Set(struct.map(x => x.name))].includes(x));

	for (let dbName of dbList) {
		let item = createElement({ "type": "a", "id": "db-select-" + dbName, "onclick": () => selectDatabase(dbName) });
		item.appendChild(createElement({ "type": "span", "className": "name", "text": dbName }));
		item.appendChild(createElement({ "type": "span", "className": "count" }));
		el.appendChild(item);
		updateEntryCount(dbName);
	}

	if (!_currentDB) {
		selectDatabase(dbList[0]);
	}
}

async function updateEntryCount(dbName) {
	document.querySelector("#db-select-" + dbName + " .count").innerText = await db.count(dbName);
}

async function selectDatabase(name) {
	if (_currentDB) {
		document.getElementById("db-select-" + _currentDB).classList.remove("selected");
	}
	document.getElementById("db-select-" + name).classList.add("selected");
	_currentDB = name;
	_keys = await db.get("dbstruct", { "name": _currentDB, $not: { "listhide": true } }, { sort: { index: -1 } });
	document.getElementById('merge-check-btn').disabled = MERGE_DBS.indexOf(_currentDB) === -1;
	getList();
}


function editEntry(id) {
	openWindow("database-entry", { db: _currentDB, id: id });
}

async function getList() {
	let term = document.getElementById('search-txb').value.toLowerCase();
	let params = { "limit": _maxPerPage, "page": _currentPage };

	if (_keys[0]) {
		params.sort = {};
		params.sort[_keys[0].field] = 1;
	}


	let filter = [];

	for (field of _keys.filter(x => x.type == "relation")) {
		let res = await db.get(field.relation, { "name": { $regex: new RegExp(`${escapeRegExp(term)}`, 'i') } });
		filter = filter.concat(res.map(x => ({ [field.field]: x._id })));
	}


	filter = filter.concat(_keys.filter(x => x.type == "text").map(x => ({ [x.field]: { $regex: new RegExp(`${escapeRegExp(term)}`, 'i') } })));


	let list = await db.get(_currentDB, { $or: filter }, params);

	buildPageList();
	displayList(list);
}

function displayList(list) {
	let el = document.getElementById('list-grid');
	el.innerHTML = "";
	el.style.gridTemplateColumns = "repeat(" + _keys.length + ", 1fr)";
	_keys.forEach((key) => {
		let field = document.createElement("div");
		field.classList.add("label");
		field.innerText = key.field.substr(0, 1).toUpperCase() + key.field.substr(1);
		el.appendChild(field);
	});
	list.forEach((entry, index) => {
		_keys.forEach((key) => {
			let field = document.createElement("div");
			field.id = "field-" + index + "-" + key.field;
			field.classList.add("field-row-" + index);
			field.classList.toggle("selected", _selectedFields.indexOf(entry._id) !== -1);
			if (entry[key.field]) {
				if (key.multi) {
					field.innerText = entry[key.field].join(" , ");
				} else {
					field.innerText = entry[key.field];
				}
			} else {
				field.innerText = " - ";
			}

			field.classList.toggle("empty", !entry.hasOwnProperty(key.field));
			field.classList.toggle("odd", index % 2 == 1);

			if (entry.hasOwnProperty(key.field) && key.type == "relation" && db.dbExists(key.relation)) {
				db.get(key.relation, { $or: [].concat(entry[key.field]).map(x => ({ "_id": x })) }).then(entry => {
					field.classList.add("relation");
					field.innerHTML = entry.map(x => '<div class="subline">' + x.name + '</div>').join();
				});

			}
			field.onclick = (e) => {
				if (e.ctrlKey) {
					let entryIndex = _selectedFields.indexOf(entry._id);
					if (entryIndex !== -1) {
						_selectedFields.splice(entryIndex, 1);
					} else {
						_selectedFields.push(entry._id);
					}
					let elms = document.querySelectorAll('.field-row-' + index);
					elms.forEach((el) => el.classList.toggle("selected", entryIndex === -1));
				}
			};
			field.ondblclick = () => editEntry(entry._id);
			el.appendChild(field);
		});
	});
}

async function buildPageList() {
	let term = document.getElementById('search-txb').value.toLowerCase();
	let filter = [];
	for (field of _keys.filter(x => x.type == "relation")) {
		let res = await db.get(field.relation, { "name": { $regex: new RegExp(`${escapeRegExp(term)}`, 'i') } });
		filter = filter.concat(res.map(x => ({ [field.field]: x._id })));
	}
	filter = filter.concat(_keys.filter(x => x.type == "text").map(x => ({ [x.field]: { $regex: new RegExp(`${escapeRegExp(term)}`, 'i') } })));

	let count = await db.count(_currentDB, { $or: filter });

	let pageCount = Math.ceil(count / _maxPerPage);
	let el = document.getElementById('page-list');
	el.innerHTML = "";

	for (let i = 1; i <= pageCount; i++) {
		let pi = document.createElement('div');
		let num = i;
		pi.innerText = num;
		pi.classList.toggle("selected", num == _currentPage);
		pi.onclick = () => goToPage(num);
		el.appendChild(pi);
	}
}

function refreshUI(dbName) {
	updateEntryCount(dbName)
	if (_currentDB == dbName) {
		getList();
	}
}

function goToPage(page) {
	_currentPage = page;
	getList();
}

function openWindow(name, params) {
	ipcRenderer.send('openWindow', { name: name, params: params })
}


/* ---------------------------------------------------------------- modal */

function showModal(name) {
	let el = document.querySelector("#modal .panel").truncate();
	el.id = name + "-modal";
	el.appendChild(document.getElementById(name + "-modal-tpl").content.cloneNode(true));
	document.body.classList.add("modal");
	window.addEventListener("keydown", modalHotkeys, true);
}

function hideModal() {
	window.removeEventListener("keydown", modalHotkeys, true);
	document.body.classList.remove("modal");
}

function modalHotkeys(e) {
	if (e.keyCode == 27) {
		hideModal();
		e.stopPropagation();
	}
}


/* -------------------------------------------------------- merge check */

/*
read a mergeable field ("smashgg" / "parrygg") as a plain string.
depending on where the entry was written it can be a string, a number or an array.
*/
function mergeFieldValue(entry, field) {
	let val = entry[field];
	if (Array.isArray(val)) { val = val[0]; }
	if (val == null) { return ""; }
	return String(val).trim();
}

/*
keys an entry is grouped by - entries sharing any of them belong to the same group
*/
function mergeGroupKeys(entry) {
	let keys = [];
	let name = String(entry.name || "").trim().toLowerCase();
	if (name.length > 0) { keys.push("name:" + name); }
	MERGE_FIELDS.forEach((mergeField) => {
		let val = mergeFieldValue(entry, mergeField.field).toLowerCase();
		if (val.length > 0) { keys.push(mergeField.field + ":" + val); }
	});
	return keys;
}

/*
the more fields an entry has filled the more likely it is the one to keep
*/
function mergeEntryScore(entry) {
	let score = 0;
	for (let key in entry) {
		if (key == "_id") { continue; }
		let val = entry[key];
		if (val == null || val === "") { continue; }
		if (typeof val == "object" && Object.keys(val).length == 0) { continue; }
		score++;
	}
	return score;
}

function mergeEntryActivity(entry) {
	let time = new Date(entry.lastActivity || 0).getTime();
	return isNaN(time) ? 0 : time;
}

/*
group entries which share a name, a start.gg ID or a parry.gg ID (transitively)
*/
function findMergeGroups(entries) {
	let parent = entries.map((entry, index) => index);

	function root(index) {
		while (parent[index] != index) {
			parent[index] = parent[parent[index]];
			index = parent[index];
		}
		return index;
	}

	function union(a, b) {
		a = root(a);
		b = root(b);
		if (a != b) { parent[b] = a; }
	}

	let keyOwner = {};
	entries.forEach((entry, index) => {
		mergeGroupKeys(entry).forEach((key) => {
			if (keyOwner.hasOwnProperty(key)) {
				union(keyOwner[key], index);
			} else {
				keyOwner[key] = index;
			}
		});
	});

	let buckets = {};
	entries.forEach((entry, index) => {
		let groupRoot = root(index);
		buckets[groupRoot] = (buckets[groupRoot] || []).concat([entry]);
	});

	let groups = [];
	for (let groupRoot in buckets) {
		if (buckets[groupRoot].length < 2) { continue; }
		// most complete entry first - it becomes the preselected main entry
		let groupEntries = buckets[groupRoot].sort((a, b) => (mergeEntryScore(b) - mergeEntryScore(a)) || (mergeEntryActivity(b) - mergeEntryActivity(a)));
		groups.push({
			"entries": groupEntries,
			"mainIndex": 0,
			"merge": groupEntries.map(() => false),
			"values": {}
		});
	}

	return groups.sort((a, b) => String(a.entries[0].name || "").localeCompare(String(b.entries[0].name || "")));
}

async function openMergeCheck() {
	if (MERGE_DBS.indexOf(_currentDB) === -1) { return; }

	showModal("merge-check");
	let listEl = document.getElementById('merge-list').truncate();
	listEl.appendChild(createElement({ "type": "div", "className": "merge-empty", "text": "Searching..." }));

	_mergeInfoKeys = _keys.filter(x => MERGE_FIELDS.every(m => m.field != x.field)).slice(0, MERGE_INFO_COLUMNS);

	// resolve relation IDs to names once instead of per row
	_relationNames = {};
	for (let key of _mergeInfoKeys.filter(x => x.type == "relation" && db.dbExists(x.relation))) {
		if (_relationNames.hasOwnProperty(key.relation)) { continue; }
		_relationNames[key.relation] = {};
		(await db.get(key.relation)).forEach(entry => _relationNames[key.relation][entry._id] = entry.name);
	}

	_mergeGroups = findMergeGroups(await db.get(_currentDB));
	displayMergeGroups();
}

function mergeInfoText(entry, key) {
	let val = entry[key.field];
	if (val == null || val === "" || (Array.isArray(val) && val.length == 0)) { return " - "; }
	if (key.type == "relation" && _relationNames[key.relation]) {
		return [].concat(val).map(x => _relationNames[key.relation][x] || x).join(", ");
	}
	if (typeof val == "object" && !Array.isArray(val)) { return " - "; }
	return [].concat(val).join(", ");
}

function displayMergeGroups() {
	let listEl = document.getElementById('merge-list').truncate();

	if (_mergeGroups.length == 0) {
		listEl.appendChild(createElement({ "type": "div", "className": "merge-empty", "text": "No mergeable entries found." }));
		updateMergeSummary();
		return;
	}

	_mergeGroups.forEach((group, groupIndex) => {
		listEl.appendChild(buildMergeGroup(group, groupIndex));
		updateMergeGroup(groupIndex);
	});
	updateMergeSummary();
}

function buildMergeGroup(group, groupIndex) {
	let groupEl = createElement({ "type": "div", "className": "merge-group", "id": "merge-group-" + groupIndex });

	let titleEl = createElement({ "type": "div", "className": "group-title" });
	titleEl.appendChild(createElement({ "type": "span", "className": "name", "text": group.entries[0].name || "(no name)" }));
	titleEl.appendChild(createElement({ "type": "span", "className": "count", "text": group.entries.length + " entries" }));
	groupEl.appendChild(titleEl);

	let gridEl = createElement({ "type": "div", "className": "entry-grid" });
	gridEl.style.gridTemplateColumns = "45px 45px repeat(" + _mergeInfoKeys.length + ", 1fr) repeat(" + MERGE_FIELDS.length + ", 130px)";

	let labels = ["Main", "Merge"]
		.concat(_mergeInfoKeys.map(x => x.field.substr(0, 1).toUpperCase() + x.field.substr(1)))
		.concat(MERGE_FIELDS.map(x => x.label));
	labels.forEach(label => gridEl.appendChild(createElement({ "type": "div", "className": "label", "text": label })));

	group.entries.forEach((entry, entryIndex) => {
		let rowClass = "row row-" + groupIndex + "-" + entryIndex;

		let mainCell = createElement({ "type": "div", "className": rowClass + " cell-main" });
		let mainRadio = document.createElement("input");
		mainRadio.type = "radio";
		mainRadio.name = "merge-main-" + groupIndex;
		mainRadio.checked = (group.mainIndex == entryIndex);
		mainRadio.title = "keep this entry";
		mainRadio.onchange = () => {
			group.mainIndex = entryIndex;
			updateMergeGroup(groupIndex);
			updateMergeSummary();
		};
		mainCell.appendChild(mainRadio);
		gridEl.appendChild(mainCell);

		let mergeCell = createElement({ "type": "div", "className": rowClass + " cell-merge" });
		let mergeCxb = document.createElement("input");
		mergeCxb.type = "checkbox";
		mergeCxb.id = "merge-cxb-" + groupIndex + "-" + entryIndex;
		mergeCxb.checked = group.merge[entryIndex];
		mergeCxb.title = "merge this entry into the main entry and remove it";
		mergeCxb.onchange = () => {
			group.merge[entryIndex] = mergeCxb.checked;
			updateMergeGroup(groupIndex);
			updateMergeSummary();
		};
		mergeCell.appendChild(mergeCxb);
		gridEl.appendChild(mergeCell);

		_mergeInfoKeys.forEach((key) => {
			gridEl.appendChild(createElement({ "type": "div", "className": rowClass, "text": mergeInfoText(entry, key) }));
		});

		MERGE_FIELDS.forEach((mergeField) => {
			let val = mergeFieldValue(entry, mergeField.field);
			let cell = createElement({ "type": "div", "className": rowClass + (val.length == 0 ? " empty" : ""), "text": val.length == 0 ? " - " : val });
			cell.title = val;
			gridEl.appendChild(cell);
		});
	});

	groupEl.appendChild(gridEl);

	let resultEl = createElement({ "type": "div", "className": "group-result" });
	resultEl.appendChild(createElement({ "type": "span", "className": "result-label", "text": "Result" }));
	MERGE_FIELDS.forEach((mergeField) => {
		let wrapEl = createElement({ "type": "span", "className": "result-field" });
		wrapEl.appendChild(createElement({ "type": "span", "className": "name", "text": mergeField.label }));
		let select = document.createElement("select");
		select.id = "merge-value-" + groupIndex + "-" + mergeField.field;
		select.onchange = () => {
			group.values[mergeField.field] = select.value;
			updateMergeGroup(groupIndex);
		};
		wrapEl.appendChild(select);
		resultEl.appendChild(wrapEl);
	});
	resultEl.appendChild(createElement({ "type": "span", "className": "result-status", "id": "merge-status-" + groupIndex }));
	groupEl.appendChild(resultEl);

	return groupEl;
}

/*
all values available for a field: the main entry's own value plus the values of every entry checked for merging
*/
function mergeAvailableValues(group, field) {
	let values = [];
	let add = (val) => {
		if (val.length > 0 && values.indexOf(val) === -1) { values.push(val); }
	};
	add(mergeFieldValue(group.entries[group.mainIndex], field));
	group.entries.forEach((entry, entryIndex) => {
		if (entryIndex == group.mainIndex || !group.merge[entryIndex]) { return; }
		add(mergeFieldValue(entry, field));
	});
	return values;
}

function updateMergeGroup(groupIndex) {
	let group = _mergeGroups[groupIndex];
	let groupEl = document.getElementById("merge-group-" + groupIndex);
	if (!groupEl) { return; }

	// the main entry can never be merged away
	if (group.merge[group.mainIndex]) { group.merge[group.mainIndex] = false; }

	group.entries.forEach((entry, entryIndex) => {
		let isMain = (group.mainIndex == entryIndex);
		let mergeCxb = document.getElementById("merge-cxb-" + groupIndex + "-" + entryIndex);
		mergeCxb.disabled = isMain;
		mergeCxb.checked = group.merge[entryIndex];
		groupEl.querySelectorAll(".row-" + groupIndex + "-" + entryIndex).forEach((cell) => {
			cell.classList.toggle("main", isMain);
			cell.classList.toggle("merged", group.merge[entryIndex]);
		});
	});

	MERGE_FIELDS.forEach((mergeField) => {
		let values = mergeAvailableValues(group, mergeField.field);
		if (values.indexOf(group.values[mergeField.field]) === -1) {
			group.values[mergeField.field] = values[0] || "";
		}
		let select = document.getElementById("merge-value-" + groupIndex + "-" + mergeField.field).truncate();
		let options = values.length > 0 ? values : [""];
		options.forEach((val) => {
			let option = document.createElement("option");
			option.value = val;
			option.innerText = val.length > 0 ? val : "(empty)";
			option.selected = (val == group.values[mergeField.field]);
			select.appendChild(option);
		});
		select.disabled = (values.length < 2);
	});

	let removeCount = group.merge.filter(x => x).length;
	let statusEl = document.getElementById("merge-status-" + groupIndex);
	if (removeCount == 0) {
		statusEl.innerText = "nothing selected";
		statusEl.classList.remove("active");
	} else {
		statusEl.innerText = "keeps \"" + (group.entries[group.mainIndex].name || "(no name)") + "\", removes " + removeCount + " entr" + (removeCount == 1 ? "y" : "ies");
		statusEl.classList.add("active");
	}
	groupEl.classList.toggle("active", removeCount > 0);
}

function setAllMergeSelections(value) {
	_mergeGroups.forEach((group, groupIndex) => {
		group.merge = group.entries.map((entry, entryIndex) => value && entryIndex != group.mainIndex);
		updateMergeGroup(groupIndex);
	});
	updateMergeSummary();
}

/*
turn the current selection into one plan per group
*/
function buildMergePlans() {
	let plans = [];
	_mergeGroups.forEach((group) => {
		let removeIds = group.entries.filter((entry, entryIndex) => group.merge[entryIndex]).map(x => x._id);
		if (removeIds.length == 0) { return; }

		let main = group.entries[group.mainIndex];
		let setDoc = {};
		MERGE_FIELDS.forEach((mergeField) => {
			let val = group.values[mergeField.field] || "";
			if (val != mergeFieldValue(main, mergeField.field)) { setDoc[mergeField.field] = val; }
		});

		plans.push({ "mainId": main._id, "setDoc": setDoc, "removeIds": removeIds });
	});
	return plans;
}

function updateMergeSummary() {
	let plans = buildMergePlans();
	let removeCount = plans.reduce((sum, plan) => sum + plan.removeIds.length, 0);
	document.getElementById('merge-summary').innerText = _mergeGroups.length + " group" + (_mergeGroups.length == 1 ? "" : "s") + " found"
		+ (plans.length > 0 ? " - merging " + plans.length + ", removing " + removeCount + " entr" + (removeCount == 1 ? "y" : "ies") : "");
	document.getElementById('merge-apply-btn').disabled = (plans.length == 0);
}

async function applyMerges() {
	let plans = buildMergePlans();
	if (plans.length == 0) { return; }

	let removeCount = plans.reduce((sum, plan) => sum + plan.removeIds.length, 0);
	let conf = confirm("Merge " + plans.length + " group" + (plans.length == 1 ? "" : "s") + "?\n\n"
		+ removeCount + " entr" + (removeCount == 1 ? "y" : "ies") + " will be removed permanently.");
	if (!conf) { return; }

	document.getElementById('merge-apply-btn').disabled = true;

	for (let plan of plans) {
		if (Object.keys(plan.setDoc).length > 0) {
			await db.update(_currentDB, plan.mainId, plan.setDoc);
		}
		for (let id of plan.removeIds) {
			await db.remove(_currentDB, id);
		}
	}

	hideModal();
	getList();
}


