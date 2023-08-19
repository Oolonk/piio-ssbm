const { ipcRenderer, remote } = require('electron');

var dbName, id, fields, dataset;
var _callbacks = { on: {}, once: {}, hold: [] }; // callbacks for on,once & fire
var _selectedShortcut = -1;

var _commandsList = [];
var _shortcuts = [];

ipcRenderer.on("shortcut-settings", (event, data) => {
	_shortcuts = data.shortcuts;
	console.log(data);
	_commandsList = [];
	let generalOptions = [{ "label": "Nothing", "value": -1 }, { "label": "Custom", "value": 0 }];
	let el = document.getElementById('details-action').truncate();

	generalOptions.forEach((command) => {
		let opt = document.createElement('option');
		opt.value = command.value;
		opt.innerText = command.label;
		el.appendChild(opt);
	});

	_commandsList.push({
		"module-type": "__custom",
		"name": "custom",
		"args": [{ "name": "command", "type": "text" }]
	});

	data.commands.forEach((module) => {
		let optGroup = document.createElement('optgroup');
		optGroup.label = module.type;
		module.commands.forEach((command) => {
			if (command.shortcut == true) {
				let opt = document.createElement('option');
				opt.value = _commandsList.length;
				opt.innerText = command.name;

				_commandsList.push({
					"module-type": module.type,
					"name": command.name,
					"args": command.args
				});
				optGroup.appendChild(opt);
			}
		});
		el.appendChild(optGroup);
	});
	displayList(_shortcuts);
});


window.onload = init;

function init() {
	ipcRenderer.send('get', { "type": "shortcut-settings" });
}

function displayList(list) {
	let el = document.getElementById('list').truncate();

	for (let i in list) {
		let entry = list[i];
		let item = document.createElement('div');
		item.className = "item";
		item.classList.toggle("selected", i == _selectedShortcut);
		item.onclick = (e) => {
			_selectedShortcut = i;
			let selected = el.getElementsByClassName("selected");
			if (selected && selected[0]) {
				selected[0].classList.remove("selected");
			}
			item.classList.add("selected");
			showDetails(entry);
		};

		let cbx = document.createElement("input");
		cbx.type = "checkbox";
		cbx.className = "vanilla";
		cbx.checked = entry.enabled;
		item.appendChild(cbx);

		let label = document.createElement('div');
		label.className = "label";
		label.innerText = entry.label + " | " + JSON.stringify(entry.payload);
		item.appendChild(label);

		el.appendChild(item);
	}
}

function showDetails(entry) {
	let commandIndex = getCommandIndex(entry.payload);
	detailsActionChanged(commandIndex);
	document.getElementById('details-label').value = entry.label;
	document.getElementById('details-action').value = commandIndex;

	for (let i in entry.payload.data) {
		if (i != "name") {
			console.log('details-arg-' + i);
			document.getElementById('details-arg-' + i).value = entry.payload.data[i];
		}
	}
}

function getCommandIndex(payload) {
	for (let i in _commandsList) {
		if (_commandsList[i]["module-type"] == payload.type && _commandsList[i]["name"] == payload.data.name) {
			return i;
		}
	}
	return -1;
}

function detailsActionChanged(value) {
	let el = document.getElementById('details-args').truncate();
	if (_commandsList[value]) {
		if (_commandsList[value].args) {
			_commandsList[value].args.forEach((arg) => {
				let item = document.createElement('div');
				let lbl = document.createElement('label');
				let txb = document.createElement('input');
				lbl.innerText = arg.name;
				txb.type = arg.type;
				txb.id = "details-arg-" + arg.name;
				item.appendChild(lbl);
				item.appendChild(txb);
				el.appendChild(item);
			});
		}
	}
}

function saveEntry() {
	// {"label":"Scene Mute auto trigger","enabled":true,"payload":{"type":"obs-cmd","data":{"name":"transition","duration":300}}},
	let actionIndex = document.getElementById('details-action').value;
	let command = _commandsList[actionIndex];
	let entry = {
		"label": document.getElementById('details-label').value,
		"enabled": true,
		"payload": {
			"type": command["module-type"],
			"data": {
				"name": command.name
			}
		}
	};
	command.args.forEach((arg) => {
		let value = document.getElementById('details-arg-' + arg.name).value;
		entry.payload.data[arg.name] = value;
	});

	// if nothing selected, create new entry to save on
	if (!_selectedShortcut) {
		_shortcuts.push({});
		_selectedShortcut = _shortcuts.length - 1;
	}
	_shortcuts[_selectedShortcut] = entry;
	displayList(_shortcuts);

	//ipcRenderer.send('save-shortcut-settings', _shortcuts); // replaced by following line
	ipcRenderer.send('set', { "type": "shortcut-settings", data: _shortcuts });

}
function addEntry() {
	_selectedShortcut = -1;
	saveEntry();
}
function removeEntry() {

}







function remove() {
	let conf = confirm("Are you sure you want to delete this entry?");

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
