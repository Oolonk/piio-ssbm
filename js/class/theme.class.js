/* --exclude-from-all */

class ThemeWrapper {
	constructor() {
		this.dir = "";
		this.name = "";
		this.resolution = [0, 0];
		this.fields = [];
		this.caster = 2;

	}

	get Name() {
		return (this.name ? this.name : this.dir);
	}

	get Path() {
		return `themes/${this.dir}/`;
	}

	static getThemesList() {
		return new Promise((resolve, reject) => {
			const fs = require("fs");
			const path = require("path");
			let themePath = path.join(remote.getGlobal("APPRES"), 'themes');
			fs.readdir(themePath, { withFileTypes: true }, (err, dirs) => {
				if (err) { return reject(err); }
				dirs = dirs.filter(x => x.isDirectory());
				let promises = [];
				dirs.forEach((dir) => {
					promises.push(new Promise((resolve, reject) => {
						let theme = new ThemeWrapper();
						theme.dir = dir.name;
						fs.readFile(path.join(themePath, dir.name, 'manifest.json'), 'utf8', (err, data) => {
							if (!err) {
								var data = JSON.parse(data);
								theme = Object.assign(theme, data);
							}
							resolve(theme);
						});
					}));
				});
				Promise.all(promises).then((list) => {
					list.sort((a, b) => a.name - b.name);
					resolve(list);
				});
			});
		});
	}

	static async getTheme(val) {
		let themes = await ThemeWrapper.getThemesList();
		switch (typeof val) {
			case 'string': return themes.find(x => x.dir == val);
			case 'number': return themes[val];
			default: return themes[0];
		}
	}
}