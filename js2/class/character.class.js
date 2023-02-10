
class Character {
	constructor(params) {
		if (!params)
			params = {};
		this._id = params._id || "";
		this.name = params.name || "";
		this.shorten = params.shorten || "";
		this.defaultSkin = params.defaultSkin || 0;
		this.skins = params.skins || [];
		this.game = params.game || "";

	}

	getSkin(index) {
		if (this.skins.length > index)
			return this.skins[index];
		return this.DefaultSkin;
	}

	get DefaultSkin() {
		if (this.skins.length > 0) {
			if (this.skins.length <= this.defaultSkin)
				this.defaultSkin = 0;
			return this.skins[this.defaultSkin]
		}
		return null;
	}

	get Shorten() {
		return (this.shorten ? this.shorten : this.name);
	}

	get ID() {
		return this._id;
	}

	get SkinCount() {
		return this.skins.length;
	}


}