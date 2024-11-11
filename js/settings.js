const { shell } = require('electron');

var _timeouts = {};
var _returnChannel;

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);

addEventListener("load", async () => {
	let settings = await ipcRenderer.invoke("get", "settings");
	settings.forEach((entry) => {
		let el = document.getElementById(entry.name + '-value');
		console.log(entry.name, el);
		if (!el) { return; }

		switch (entry.name) {
			case "fixedSmashggQueue":
			case "connection-type":
			case "fixedSidebar":
				el.value = entry.value ? 1 : 0;
				break;
			case "showSmashggToken":
				el.checked = entry.value ? 1 : 0;
				break;
			case "enable-slippi":
				el.checked = entry.value ? 1 : 0;
				if(entry.value) {
				}else{
					document.querySelectorAll('.slippi-settings').forEach(e => e.classList.add('hide'));
				}
				break;
			case "enable-obs":
				el.checked = entry.value ? 1 : 0;
				if(entry.value) {
				}else{
					document.querySelectorAll('.obs-settings').forEach(e => e.classList.add('hide'));
				}
				break;
			default:
				el.value = entry.value;
				break;
		}
	});
});

async function set(name, value) {
	if (_timeouts.hasOwnProperty("save-" + name)) {
		clearTimeout(_timeouts["save-" + name]);
	}
	_timeouts["save-" + name] = setTimeout(async () => {
		if (_timeouts.hasOwnProperty("save_success_" + name)) {
			clearTimeout(_timeouts["save_success_" + name]);
		}
		let el = document.getElementById(name + '-saved');
		el.classList.add("pending");
		let saveSuccess = await ipcRenderer.invoke("set", name, value);
		el.classList.remove("pending");

		el.classList.toggle("success", saveSuccess);
		el.classList.toggle("failed", !saveSuccess);

		_timeouts["save_success_" + name] = setTimeout(() => {
			el.classList.remove("success", "failed");
		}, 1000);
	}, 400);
}

async function setSlippiEnable(value){
	if(value){
		document.querySelectorAll('.slippi-settings').forEach(e => e.classList.remove('hide'));
	}else{
		document.querySelectorAll('.slippi-settings').forEach(e => e.classList.add('hide'));
	}
	set('enable-slippi', value);
}

async function setObsEnable(value){
	if(value){
		document.querySelectorAll('.obs-settings').forEach(e => e.classList.remove('hide'));
	}else{
		document.querySelectorAll('.obs-settings').forEach(e => e.classList.add('hide'));
	}
	set('enable-obs', value);
}