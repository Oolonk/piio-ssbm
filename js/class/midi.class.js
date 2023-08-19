/* --exclude-from-all */

class MidiWrapper {
	constructor() {
		this.deviceList = [];

		this.selectedDeviceName = "";

		this.midiAccess = null;
		this.input = null;
		this.output = null;

		this._callbacks = { on: {}, once: {}, any: [] };


		navigator.requestMIDIAccess().then(midi => {
			this.midiAccess = midi;
			midi.onstatechange = (e) => {
				if (e.port.state == "connected") {
					this._refreshList();
					if (((e.port.constructor.name == "MIDIInput" && this.input == null) || (e.port.constructor.name == "MIDIOutput" && this.output == null)) && this.selectedDeviceName == e.port.name) {
						this.selectDevice(this.selectedDeviceName);
					}
				}
				if (e.port.state == "disconnected") {
					this._refreshList();
				}
			};
			this._refreshList();
			this.emit("ready");
		});
	}

	_refreshList() {
		this.deviceList = [];
		this.midiAccess.outputs.forEach(port => this.deviceList.push(port));
		this.midiAccess.inputs.forEach(port => this.deviceList.push(port));
	}

	_portChanged(e) {
		let type = "";
		switch (e.port.constructor.name) {
			case "MIDIInput": type = "input"; break;
			case "MIDIOutput": type = "output"; break;
		}
		this.emit(type + e.port.connection);
	}

	_message(data) {
		let input = this._convertInput(data.data);
		this.emit("data", input);
		if (input.type == "button") {
			this.emit("button", input);
			this.emit("button" + (input.value ? "down" : "up"), input);
		}
		if (input.type == "slider")
			this.emit("slider", input);
	}

	send(data) {
		let output = this._convertOutput(data);
		this.output.send(output);
	}

	get Devices() {
		let list = [];
		this.deviceList.forEach(device => {
			if (list.indexOf(device.name) === -1)
				list.push(device.name);
		});
		return list;
	}

	selectDevice(name) {
		this.selectedDeviceName = name;
		if (this.input) {
			this.input.onmidimessage = null;
			this.input.close();
		}
		if (this.output) {
			this.output.close();
		}
		this.input = null;
		this.output = null;
		this.deviceList.forEach(device => {
			if (device.name == name) {
				if (device instanceof MIDIInput) {
					this.input = device;
					this.input.open();
					this.input.onmidimessage = data => this._message(data);
					this.input.onstatechange = e => this._portChanged(e);
				}
				if (device instanceof MIDIOutput) {
					this.output = device;
					this.output.open();
					this.output.onstatechange = e => this._portChanged(e);
				}
				this.emit("connected");
			}
		});
	}

	_removePort(port) {
		console.log(this.deviceList);
	}


	on(name, callback) {
		if (callback == undefined) {
			this._callbacks.any.push(name); // name is callback
		} else {
			if (!this._callbacks.on.hasOwnProperty(name)) {
				this._callbacks.on[name] = [];
			}
			this._callbacks.on[name].push(callback);
		}
	}

	once(name, callback) {
		if (!this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name] = [];
		}
		this._callbacks.once[name].push(callback);
	}

	emit(name, data) {
		this._callbacks.any.forEach(cb => cb(name, data));
		if (this._callbacks.on.hasOwnProperty(name)) {
			this._callbacks.on[name].forEach(cb => cb(data));
		}
		if (this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name].forEach(cb => cb(data));
			this._callbacks.once[name] = [];
		}
	}




	_convertInput(data) {
		let res = {
			type: "generic",
			cat: "unknown",
			value: data[0],
			note: data[1],
			velo: data[2],
		};

		switch (this.input.name) {
			case "APC MINI":
				if (data[0] == 128 || data[0] == 144) {
					res.type = "button";
					if (data[1] >= 0 && data[1] <= 63) {
						res.cat = "button-square";
						if (data[1] >= 56 && data[1] <= 63)
							res.note = data[1] - 55;
						if (data[1] >= 48 && data[1] <= 55)
							res.note = data[1] - 39;
						if (data[1] >= 40 && data[1] <= 47)
							res.note = data[1] - 23;
						if (data[1] >= 32 && data[1] <= 39)
							res.note = data[1] - 7;
						if (data[1] >= 24 && data[1] <= 31)
							res.note = data[1] + 9;
						if (data[1] >= 16 && data[1] <= 23)
							res.note = data[1] + 25;
						if (data[1] >= 8 && data[1] <= 15)
							res.note = data[1] + 41;
						if (data[1] >= 0 && data[1] <= 7)
							res.note = data[1] + 57;
					}
					if (data[1] >= 64 && data[1] <= 71) {
						res.cat = "button-round-bottom";
						res.note = data[1] - 63;
					}
					if (data[1] >= 82 && data[1] <= 89) {
						res.cat = "button-round-right";
						res.note = data[1] - 81;
					}
					if (data[1] == 98) {
						res.cat = "button-square-extra";
						res.note = 1;
					}
					res.value = data[0] == 144;
				}
				if (data[0] == 176) {
					res.type = "slider";
					res.cat = "slider";
					res.note = data[1] - 47;
					res.value = (res.velo / 120) - 0.0275590551181102;
					if (res.value > 1) res.value = 1;
					if (res.value < 0) res.value = 0;
				}

				break;
			default:


		}

		return res;
	}

	_convertOutput(data) {
		let res = {
			value: data[0],
			note: data[1],
			velo: data[2],
		};

		switch (this.input.name) {
			case "APC MINI":
				/*
				0 => cat
				1 => note
				2 => color
				*/
				res.value = 144;
				switch (data[0]) {
					case "button-square":
						var LEDMODE = {
							OFF: 0,
							GREEN: 1,
							GREENBLINK: 2,
							RED: 3,
							REDBLINK: 4,
							YELLOW: 5,
							YELLOWBLINK: 6,
						};

						if (data[1] >= 1 && data[1] <= 8)
							res.note = data[1] + 55;
						if (data[1] >= 9 && data[1] <= 16)
							res.note = data[1] + 39;
						if (data[1] >= 17 && data[1] <= 24)
							res.note = data[1] + 23;
						if (data[1] >= 25 && data[1] <= 32)
							res.note = data[1] + 7;
						if (data[1] >= 33 && data[1] <= 40)
							res.note = data[1] - 9;
						if (data[1] >= 41 && data[1] <= 48)
							res.note = data[1] - 25;
						if (data[1] >= 49 && data[1] <= 56)
							res.note = data[1] - 41;
						if (data[1] >= 57 && data[1] <= 64)
							res.note = data[1] - 57;
						res.velo = LEDMODE[data[2]];

						break;
					case "button-round-bottom":
						var LEDMODE = {
							OFF: 0,
							RED: 1,
							REDBLINK: 2,
						};
						res.note = data[1] + 63;
						res.velo = LEDMODE[data[2]];
						break;
					case "button-round-right":
						var LEDMODE = {
							OFF: 0,
							GREEN: 1,
							GREENBLINK: 2,
						};
						res.note = data[1] + 81;
						res.velo = LEDMODE[data[2]];
						break;
				}


				break;
			default:


		}

		return [res.value, res.note, res.velo];
	}


}

MidiWrapper.NAME = "MIDI Device";
MidiWrapper.EVENTS = ["button", "buttondown", "buttonup", "slider"];