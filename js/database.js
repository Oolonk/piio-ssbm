const APPROOT = remote.getGlobal("APPROOT");
const APPRES = remote.getGlobal("APPRES");


// ipcRenderer.on("databaseChanged", (event, arg) => db.reload(arg).then(getList));



var _currentDB;
var _keys = [];

var _maxPerPage = 30;
var _currentPage = 1;

var _selectedFields = [];
var _selectedIndex = -1;



remoteOn(db, "changed", refreshUI);

window.onkeydown = (e) => {
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
		let res = await db.get(field.relation, { "name": { $regex: new RegExp(`${term}`, 'i') } });
		filter = filter.concat(res.map(x => ({ [field.field]: x._id })));
	}


	filter = filter.concat(_keys.filter(x => x.type == "text").map(x => ({ [x.field]: { $regex: new RegExp(`${term}`, 'i') } })));


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
		let res = await db.get(field.relation, { "name": { $regex: new RegExp(`${term}`, 'i') } });
		filter = filter.concat(res.map(x => ({ [field.field]: x._id })));
	}
	filter = filter.concat(_keys.filter(x => x.type == "text").map(x => ({ [x.field]: { $regex: new RegExp(`${term}`, 'i') } })));

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


