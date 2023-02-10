const { clipboard } = require('electron');
const dialog = remote.dialog;
const path = require('path');
const fs = require('fs');

const APPROOT = remote.getGlobal("APPROOT");
const APPRES = remote.getGlobal("APPRES");

var _maxPerPage = 20;
var _currentPage = 1;

var _directory = [];
var _rel;
var _relation = {
	character: ["game", "character", null, "character.skins"],
	player: [null, "player"],
	country: ["country"],
	game: ["game"],
	team: ["team"]
};
var _folderTemplate = {
	character: ["{game:id}/{character:id}/stock", "{game:id}/{character:id}/portrait"],
	player: ["photo", "avatar"]
}

function showAssetsList(arg) {
	_directory = [{ "path": path.join(APPRES, "assets"), "name": "Assets" }];
	if (arg) {
		_rel = _relation[arg.path];
		_directory.push({ "path": arg.path, "name": arg.name });
	} else {
		_rel = null;
	}
	getList();
}

function getList(dir) {
	var pathEl = document.getElementById('path').truncate();
	var listEl = document.getElementById("list-grid").truncate();
	_directory = dir || _directory;

	_directory.forEach((folder, index) => {
		let childEl = document.createElement('div');
		childEl.innerText = folder.name;

		if (index >= 2 && _rel[index - 2]) {
			db.getSingle(_rel[index - 2], folder.path).then(entry => {
				childEl.innerText = entry[Object.keys(entry)[0]];
			});
		}
		childEl.onclick = () => {
			if (index > 0) {
				getList(_directory.slice(0, index + 1));
			}
		};
		pathEl.appendChild(childEl);
	});

	var dirPath = path.join.apply(null, _directory.map(x => x.path));
	var rel = _directory.length >= 2 && _rel ? _rel[_directory.length - 2] : null;
	var relDb = null;

	if (_rel) {
		for (let i = _directory.length - 3; i >= 0; i--) {
			if (relDb == null && _rel[i] != null) {
				relDb = _rel[i];
				break;
			}
		}
	}


	fs.readdir(dirPath, (err, files) => {
		var query = {};
		if (rel) {
			var isFileList = (_rel.indexOf(rel) + 1 == _rel.length);
			var relPath = rel.split(".");
			if (relPath.length >= 2) {
				// get multiple entries of one dataset
				rel = relPath.shift();
				if (relDb != null && _directory && _directory[_directory.length - 1]) {
					query = _directory[_directory.length - 1].path;
				}

				if (relDb != null) {
					let index = _rel.indexOf(relDb) + 2;
					query = _directory[index].path;
				}

				db.getSingle(rel, query).then(dataset => {
					console.log(dataset);
					let entries = deep_value(dataset, relPath.join("."));
					entries.forEach(entry => {
						childEl = buildRelatedItem(isFileList, entry, dirPath, entry);
						listEl.appendChild(childEl);
					});
				}).catch(er => {
					console.log(er);
				});
			} else {
				// get multiple datasets from database
				if (relDb != null && _directory && _directory[_directory.length - 1]) {
					query[relDb] = _directory[_directory.length - 1].path;
				}
				db.get(rel, query, null, { sort: { "name": 1 } }).then(entries => {
					entries.forEach(entry => {

						let fieldName = entry.hasOwnProperty("name") ? "name" : Object.keys(entry)[0];

						childEl = buildRelatedItem(isFileList, entry[fieldName], dirPath, entry._id);
						listEl.appendChild(childEl);
					});
				});
			}

		} else {
			let folderTpl = _folderTemplate[_directory[1].path];
			if (folderTpl) {
				files = [];
				folderTpl.forEach(folder => {
					var folderParts = folder.split("/");
					var name = folderParts[_directory.length - 2];
					files.push(name);
				});
			}

			files.forEach(file => {
				let stat;
				let dir = path.join(dirPath, file);
				let childEl = createElement({ className: "item" });
				try {
					stat = fs.statSync(dir);
				} catch (e) {
					createFolders(dir);
					stat = fs.statSync(dir);
				}
				let fileInfo = path.parse(dir);
				if (stat.isDirectory()) {
					childEl = buildFolderItem(fileInfo.name, file, rel);
				} else {
					childEl = buildFileItem(fileInfo.name, dirPath, file, rel);
				}
				listEl.appendChild(childEl);
			});
		}
	});
}

function createFolders(dir) {
	var pathParts = dir.split("\\")
	for (let i = 2; i <= pathParts.length; i++) {
		let path = pathParts.slice(0, i).join("\\");
		try {
			let stat = fs.statSync(path);
		} catch (e) {
			fs.mkdirSync(path);
		}
	}
}

function buildRelatedItem(isFileList, name, dirPath, id, rel) {
	if (isFileList) {
		let childElm;
		if (fs.existsSync(path.join(dirPath, id + ".png"))) {
			childElm = buildFileItem(name, dirPath, id + ".png");
		} else if (fs.existsSync(path.join(dirPath, id + ".jpg"))) {
			childElm = buildFileItem(name, dirPath, id + ".jpg");
		} else if (fs.existsSync(path.join(dirPath, id + ".svg"))) {
			childElm = buildFileItem(name, dirPath, id + ".svg");
		} else {
			childElm = createElement({ className: "item file add" });
			let labelEl = document.createElement("div");
			let fileEl = createElement({ "className": "file" });
			labelEl.innerText = name;
			childElm.appendChild(labelEl);
			childElm.appendChild(fileEl);
		}
		// childElm.lastChild.onclick = () => {
		// 	console.log("childElm.lastChild.onclick", dirPath, id);
		// 	editAsset(name, path.join(dirPath, id+".png")).then(getList);

		// }
		childElm.lastChild.ondragenter = e => {
			childElm.classList.add("dropfile");
			e.preventDefault();
		}
		childElm.lastChild.ondragleave = e => {
			childElm.classList.remove("dropfile");
			console.log(e);
		}
		childElm.lastChild.ondragover = e => {
			event.preventDefault();
		}
		childElm.lastChild.ondrop = e => {
			childElm.classList.remove("dropfile");
			editAsset(name, path.join(dirPath, id + "." + e.dataTransfer.files[0].path.split('.').pop()), e.dataTransfer.files[0].path).then(getList);
			e.preventDefault();
		}
		return childElm;
	} else {
		return buildFolderItem(name, id);
	}
}

function buildFolderItem(name, id, rel) {
	let childEl = createElement({ className: "item dir" });
	childEl.innerText = name;
	if (rel) {
		db.getSingle(rel, id).then(entry => {
			childEl.innerText = entry[Object.keys(entry)[0]];
		});
	}
	childEl.onclick = () => {
		_directory.push({ "path": id, "name": id });
		getList();
	};
	return childEl;
}
function buildFileItem(name, dirPath, id, rel) {
	let childEl = createElement({ className: "item file" });
	let labelEl = document.createElement("div");
	let fileEl = createElement({ "className": "file" });
	labelEl.innerText = name;
	if (rel) {
		db.getSingle(rel, name).then(entry => {
			labelEl.innerText = entry[Object.keys(entry)[0]];
		}).catch(() => {
			labelEl.innerText = rel + " not found";
		});
	}
	fileEl.style.backgroundImage = 'url("' + path.join(dirPath, id).split('\\').join('/') + '")';
	childEl.appendChild(labelEl);
	childEl.appendChild(fileEl);
	return childEl;
}

function editAsset(name, filePath, uploadFile) {
	return new Promise((resolve, reject) => {

		var file;
		filePath = path.normalize(filePath);
		var dir = path.dirname(filePath);
		if (uploadFile) {
			file = [uploadFile];
		} else {
			file = dialog.showOpenDialog({
				filters: [
					{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'svg'] }
				],
			});
		}
		if (!file)
			return reject("file open abort");
		try {
			fs.statSync(dir);
		} catch (e) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.copyFile(path.normalize(file[0]), filePath, (err) => {
			if (err) return reject(err);
			resolve();
		});

	});
}
