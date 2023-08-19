/* saved value */

class SavedValue {
	constructor() {
		this.values = {};
	}
	isSet(name, value, overwrite) {
		overwrite = overwrite || true;
		let isIdentical = this.get(name) === value;
		if (!isIdentical && overwrite)
			this.set(name, value);
		return isIdentical;
	}
	set(name, value) {
		this.values[name] = value;
	}
	get(name) {
		if (!this.values.hasOwnProperty(name))
			this.values[name] = "";
		return this.values[name];
	}
	clear() {
		this.values = {};
	}
}