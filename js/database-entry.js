const { clipboard } = require('electron');
const APPROOT = remote.getGlobal("APPROOT");
const APPRES = remote.getGlobal("APPRES");



var dbName, id, fields, dataset, _returnChannel;
var editMode = true;

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);

ipcRenderer.on("data", async (event, data) => {

	console.log("on data");
	console.log(data);

	dbName = data.db;
	id = data.id;
	if (data.entry) {
		dataset = data.entry;
		id = data.entry._id;
	}


	await buildForm();
	if (id) {
		dataset = await db.getSingle(dbName, id);
	} else {
		dataset = await db.createStruct(dbName);
		editMode = false;
	}
	insertValues(dataset);
});


async function buildForm() {
	console.log("buildForm");
	let formEl = document.getElementById("form");
	fields = await db.get("dbstruct", { "name": dbName }, { sort: { index: -1 } });

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
			case "color":
				inEl = document.createElement("input");
				inEl.type = "color";
				break;
			case "relation":
				inEl = document.createElement("select");
				break;
		}
		inEl.id = "field-" + field.field;
		childEl.appendChild(inEl);
		formEl.appendChild(childEl);
	}

	// build
	for (let i in fields) {
		let field = fields[i];
		let inEl = document.getElementById("field-" + field.field);
		if (inEl) {
			switch (field.type) {
				case "relation":
					let optionVals = await db.get(field.relation);
					optionVals.sort(function (a, b) {
						if (a.name < b.name) { return -1; }
						if (a.name > b.name) { return 1; }
						return 0;
					});
					optionVals.unshift({ _id: "", name: " - none - " });
					optionVals.forEach(entry => {
						let opt = document.createElement("option");
						opt.innerText = entry.name;
						opt.value = entry._id;
						opt.disabled = (field.relation == dbName && entry._id == id);
						inEl.appendChild(opt);
					});
					inEl.multiple = field.multi == true;
					break;
			}
		}
	}

	return true;
}

async function insertValues(entry) {
	console.log(entry);
	for (let i in fields) {
		let field = fields[i];
		let value = entry[field.field] || "";
		let el = document.getElementById("field-" + field.field);
		if (el) {
			if (field.type == "relation") {
				for (let i = 0; i < el.options.length; i++) {
					el.options[i].selected = value.indexOf(el.options[i].value) >= 0;
				}
			} else if (field.type == "text" && field.multi) {
				el.value = value ? value.join(',') : "";
			} else if (field.type == "color") {
				el.value = (value != null && value != '') ? value : "#000000";
			} else {
				el.value = value;
			}
		} else {
			console.log("field-" + field.field, "is missing");
		}
	}
}


async function save() {
	for (let i in fields) {
		let field = fields[i];
		let value = "";
		let el = document.getElementById("field-" + field.field);
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
		dataset[field.field] = value;
	}




	let doc;
	if (editMode) {
		doc = await db.update(dbName, dataset._id, dataset);
	} else {
		doc = await db.add(dbName, dataset);
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
	let conf = confirm("Are you sure you want to delete this entry?");
	if (!conf) { return; }
	await db.remove(dbName, dataset._id);
	window.close();
}
