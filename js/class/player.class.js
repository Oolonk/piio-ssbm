class Player {
	constructor(params) {
		if (!params)
			params = {};
		this._id = params._id || "";
		this.name = params.name || "";
		this.displayname = params.displayname || "";
		this.firstname = params.firstname || "";
		this.lastname = params.lastname || "";
		this.birthday = params.birthday || null;
		this.pronoun = params.pronoun || "";
		this.twitter = params.twitter || "";
		this.twitch = params.twitch || "";
		this.steam = params.steam || "";
		this.slippicode = params.slippicode || "";
		this.country = params.country || "";
		this.city = params.city || null;
		this.team = params.team || [];
		this.pride = params.pride || [];
		this.smashgg = params.smashgg || [];
		this.smashggIgnore = params.smashggIgnore || {};
		this.lastActivity = params.lastActivity || null;

	}

	getDisplayName(teams, prefixClass) {
		if (this.displayname.length > 0) {
			return this.displayname;
		}
		teams = teams.filter(x => x != null && x.prefix != null)
		var name = this.name;
		var prefix = teams.map(x => x.prefix).join(" ");
		if (teams.length == 1 && teams[0].regex != "") {
			//teams[0].regex = "^[A]";
			var re = new RegExp(teams[0].regex);
			if (this.name.match(teams[0].prefix)) {
				return this.name.replace(re, teams[0].prefix);
			}
		}
		if (prefix.length > 0) {
			let val = prefix + (teams.length == 1 ? teams[0].delimiter || " | " : " | ");
			if (prefixClass != undefined && prefixClass.length > 0) {
				val = '<span class="' + prefixClass + '">' + val + '</span>';
			}
			name = val + this.name
		}
		return name;
	}

	async comparePlayerData(smashgg, includeSmashggIgnore) {
		var spo, ignored;
		try {
			spo = await smashgg.getPlayer(this.smashgg);
		} catch (er) {
			try {
				spo = await smashgg.getPlayer(this.smashggMergeable);
			} catch (er) {
				return [];
			}
		}




		var differences = [];
		var country = this.country ? await db.getSingle("country", this.country) : { name: "" };
		while (country && country.name != spo.country && country.nation) {
			country = await db.getSingle("country", country.nation);
			if (!country || !country.nation)
				break;
		}

		var team = await db.get("team", { $or: [].concat(this.team).map(x => { return { "_id": x } }) });
		var pride = await db.get("pride", { $or: [].concat(this.pride).map(x => { return { "_id": x } }) });
		var prefix = team.map(x => x.prefix).join(" ");

		ignored = this.isSmashggFieldIgnored("country", spo.country);
		if (country.name != spo.country && (includeSmashggIgnore || !ignored))
			differences.push({ "name": "country", "local": country.name, "smashgg": spo.country, "ignored": ignored });

		ignored = this.isSmashggFieldIgnored("team", spo.prefix);
		if (prefix != spo.prefix && (includeSmashggIgnore || !ignored))
			differences.push({ "name": "team", "local": prefix, "smashgg": spo.prefix, "ignored": ignored });

		ignored = this.isSmashggFieldIgnored("name", spo.gamerTag);
		if (this.name != spo.gamerTag && (includeSmashggIgnore || !ignored))
			differences.push({ "name": "name", "local": this.name, "smashgg": spo.gamerTag, "ignored": ignored });

		ignored = this.isSmashggFieldIgnored("twitch", spo.twitchStream);
		if (this.twitch != spo.twitchStream && (includeSmashggIgnore || !ignored)) {
			differences.push({ "name": "twitch", "local": this.twitch, "smashgg": spo.twitchStream, "ignored": ignored });
			console.log("push twitch. is ignored:", ignored);
		}

		ignored = this.isSmashggFieldIgnored("twitter", spo.twitterHandle);
		if (this.twitter != spo.twitterHandle && (includeSmashggIgnore || !ignored)) {
			differences.push({ "name": "twitter", "local": this.twitter, "smashgg": spo.twitterHandle, "ignored": ignored });
			console.log("push twitter. is ignored:", ignored);

		}

		ignored = this.isSmashggFieldIgnored("city", spo.twitterHandle);
		if (this.twitter != spo.twitterHandle && (includeSmashggIgnore || !ignored)) {
			differences.push({ "name": "city", "local": this.city, "smashgg": spo.city, "ignored": ignored });
			console.log("push twitter. is ignored:", ignored);

		}

		return differences;
	}

	isSmashggFieldIgnored(name, value) {
		if (this.smashggIgnore.hasOwnProperty(name)) {
			return this.smashggIgnore[name] == value;
		}
		return false;
	}

	get Displayname() {
		console.log("not working anymore");
		return "team | " + this.name;
	}

	get ID() {
		return this._id;
	}

	get InDB() {
		return !(this._id == "" || this._id == null);
	}

	get HasSmashgg() {
		return !isNaN(parseInt(this.smashgg)) && this.smashgg != 0;
	}

	get PhotoPath() {
		return "assets/player/photo/" + this.ID + ".png";
	}


}