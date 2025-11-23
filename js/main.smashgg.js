const smashgg = new SmashggWrapper();
var streamvar = {}
smashgg.on("streamschanged", (stream) => {
	document.querySelector("#stream-queue .list .title .channel").innerText = (stream == null ? "No stream selected" : stream.streamName);
});
smashgg.on("streamqueuechanged", displaySmashggStreamQueue);
smashgg.on("streamqueuechanged", (sets) => {
	_ws.send(JSON.stringify({ "type": "stream-queue", "data": sets }));
});

on("ws-ready", async () => {
	await ipcRenderer.invoke("get", "smashgg-token").then(token => smashgg.Token = token);
	await ipcRenderer.invoke("get", "smashgg").then((data) => {
		smashgg.SelectedTournament = data.tournament;
		smashgg.SelectedStream = data.stream;
        if(data.stream != null) {
            smashgg.startStreamQueuePolling();
        }
	});
});


async function applySmashggSet(setId) {
	bgWork.start("applySmashggSet");
	clearBoard();
	let teamSize = 1;
	var set = await smashgg.getSet(setId, 0);
	console.log(set)
	scoreboard.startgg.set = set.id;
	scoreboard.startgg.event = set.event.id;
	scoreboard.startgg.phaseGroup = set.phaseGroup.id;
	scoreboard.startgg.phase = set.phaseGroup.phase.id;


	for (let slot of set.slots) {
		scoreboard.teams[(slot.slotIndex + 1)].name = (slot.entrant ? slot.entrant.name : "");
		if (!slot.entrant) { continue; }
		for (let participantIdx in slot.entrant.participants) {
			let participant = slot.entrant.participants[participantIdx];
			// get all players which have same smashgg ID or same name
			let res = await db.get("player", {  "smashgg": participant.player.id.toString()  }, Player);

			// filter only with matching smashgg ID
			let exactRes = res.filter(x => x.smashgg == participant.player.id.toString()).slice(0, 1);
			let insertPlayer;
			if (exactRes.length == 1) {
				// has matching ID - just insert
				insertPlayer = exactRes[0];
			} else if (res.length > 0) {
				// has matching name - insert and set mergable 
				insertPlayer = res[0];
				insertPlayer.smashggMergeable = participant.player.id;
			} else {
				// no matching player found - create temp and insert
				insertPlayer = { "name": participant.player.gamerTag, "id": participant.player.id.toString() };
			}
			scoreboard.teams[(slot.slotIndex + 1)].players[participantIdx] = new Player(insertPlayer);
		}
		teamSize = Math.max(teamSize, slot.entrant.participants.length);
	}

	setTeamSize(teamSize);

	if (set.phaseGroup.bracketType == "ROUND_ROBIN") {
		set.fullRoundText = `${set.phaseGroup.phase.name} ${set.phaseGroup.displayIdentifier}`;
	} else {
		if (set.phaseGroup.phase.groupCount > 1) {
			set.fullRoundText = `${set.phaseGroup.phase.name} ${set.phaseGroup.displayIdentifier} ${set.fullRoundText}`;
		}
	}
	set.eventName = set.event.name;
	set.slug = set.event.tournament.shortSlug;
	set.hashtag = set.event.tournament.hashtag;
	set.tournamentName = set.event.tournament.name;
	set.all = set;
	_theme.fields.forEach((field) => {
		if (field.hasOwnProperty("smashgg") && field.type == "text" && set.hasOwnProperty(field.smashgg)) {
			document.getElementById('field-' + field.name).value = set[field.smashgg];
			scoreboard.fields[field.name].value = set[field.smashgg];
		}
	});

	fire("scoreboardsmashggchanged");
	fire("scoreboardteamschanged");
	fire("scoreboardchanged");

	bgWork.finish("applySmashggSet");
}

function smashggApplyNextSet() {
	let currentIndex = smashgg.streamQueueSetIdList.indexOf(scoreboard.startgg.set);
	if (smashgg.streamQueueSetIdList.length <= currentIndex + 1) { return; }
	applySmashggSet(smashgg.streamQueueSetIdList[currentIndex + 1]);
}

async function displaySmashggCurrent() {
	let set = await smashgg.getSet(scoreboard.startgg.set);
	document.querySelector("#stream-queue .current").innerText = (set ? set.slots.map(x => x.entrant ? x.entrant.name : "N/A").join(" vs ") : 'No set selected');
	for (let itemEl of document.querySelectorAll("#stream-queue .list .sets > div")) {
		itemEl.classList.toggle("selected", set && itemEl.dataset.setId == set.id);
	}
}
on("scoreboardsmashggchanged", displaySmashggCurrent);

function applySmashggSettings(tournamentSlug, streamId) {
	smashgg.SelectedTournament = tournamentSlug;
	smashgg.SelectedStream = streamId;
    if(tournamentSlug != null) {
        smashgg.startStreamQueuePolling();
    }else {
        smashgg.stopStreamQueuePolling();
    }
}

async function displaySmashggStreamQueue(sets) {
	let setIds = sets.map(x => x.id);
	let el = document.getElementById("stream-queue");
	let listEl = el.querySelector(".list .sets");

	el.classList.toggle("empty", sets.length == 0);
	el.querySelector(".list .title .setcount").innerText = sets.length;

	// add/edit sets
	sets.forEach((set, idx) => {
		let entrants = set.slots.map(slot => (slot.entrant ? slot.entrant.name : ""));
		let item = document.getElementById("stream-queue-item-" + set.id);
		if (!item) {
			item = createElement({ "id": "stream-queue-item-" + set.id });
			item.dataset.setId = set.id;
			item.appendChild(createElement({ "className": "round" }));
			item.appendChild(createElement({ "className": "names" }));
			item.appendChild(createElement({ "className": "indentifier" }));
			item.onclick = (e) => applySmashggSet(e.currentTarget.dataset.setId);
			listEl.appendChild(item);
		}
		item.style.transform = "translateY(" + (40 * idx) + "px)";
		item.querySelector(".indentifier").innerText = set.identifier;
		item.querySelector(".round").innerText = set.fullRoundText;
		item.querySelector(".names").innerText = (entrants[0] || "N/A") + " Vs. " + (entrants[1] || "N/A");
	});
	if (streamvar != sets) {
		// scoreboard.streamlist = sets;
		// streamvar = sets;
		streamQueue = sets;
		// fire("scoreboardchanged");
		fire("streamqueuechanged");
	}

	// remove sets

	let toRemove = [];
	for (let itemEl of listEl.children) {
		if (!setIds.includes(parseInt(itemEl.dataset.setId))) {
			toRemove.push(itemEl);
		}
	}

	toRemove.forEach(x => x.remove());
}


async function getSmashggDifferences(player) {
	let res = { "differences": [], "player": player };
	if (!player.InDB || !player.HasSmashgg) { return res; }

	player = await db.resolveRelations("player", player);
	let smashggPlayer = await smashgg.getPlayer(player.smashgg);
	res.differences = SmashggWrapper.comparePlayer(player, smashggPlayer);
	return res;
}

async function comparePlayerData(po, includeSmashggIgnore) {

	console.log("NOTICE: comparePlayerData() in main.smashgg.js WILL BE REMOVED");

	return [];


	let spo, ignored;
	if (!po) return [];
	try {
		spo = await smashgg.getPlayer(po.smashgg);
	} catch (err) {
		try {
			spo = await smashgg.getPlayer(po.smashggMergeable);
		} catch (err) {
			return [];
		}
	}

	if (po.InDB) { // get current version of player
		po = await db.getSingle("player", po._id, Player);
	}

	let differences = [];
	let country = po.country ? await db.getSingle("country", po.country) : { "name": "" };
	while (country && country.name != spo.country && country.nation) {
		country = await db.getSingle("country", country.nation);
		if (!country || !country.nation)
			break;
	}
	spo.twitchStream = spo.twitchStream || "";
	spo.twitterHandle = spo.twitterHandle || "";
	spo.city = spo.city || "";
	spo.prefix = spo.prefix || "";

	let team = await db.get("team", { $or: [].concat(po.team).map(x => ({ "_id": x })) });
	let prefix = team.map(x => x.prefix).join(" ");



	ignored = po.isSmashggFieldIgnored("country", spo.country);
	if (country && country.name != spo.country && (includeSmashggIgnore || !ignored))
		differences.push({ "name": "country", "local": country.name, "smashgg": spo.country, "ignored": ignored });


	ignored = po.isSmashggFieldIgnored("team", spo.prefix);
	if (prefix != spo.prefix && (includeSmashggIgnore || !ignored))
		differences.push({ "name": "team", "local": prefix, "smashgg": spo.prefix, "ignored": ignored });

	ignored = po.isSmashggFieldIgnored("name", spo.gamerTag);
	if (po.name != spo.gamerTag && (includeSmashggIgnore || !ignored))
		differences.push({ "name": "name", "local": po.name, "smashgg": spo.gamerTag, "ignored": ignored });

	ignored = po.isSmashggFieldIgnored("twitch", spo.twitchStream);
	if (po.twitch != spo.twitchStream && (includeSmashggIgnore || !ignored))
		differences.push({ "name": "twitch", "local": po.twitch, "smashgg": spo.twitchStream, "ignored": ignored });


	ignored = po.isSmashggFieldIgnored("twitter", spo.twitterHandle);
	if (po.twitter != spo.twitterHandle && (includeSmashggIgnore || !ignored))
		differences.push({ "name": "twitter", "local": po.twitter, "smashgg": spo.twitterHandle, "ignored": ignored });


	ignored = po.isSmashggFieldIgnored("city", spo.city);
	if (po.city != spo.city && (includeSmashggIgnore || !ignored))
		differences.push({ "name": "twitter", "local": po.twitter, "smashgg": spo.city, "ignored": ignored });


	return differences;
}