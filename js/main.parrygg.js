const parrygg = new ParryggWrapper();
var streamvar = {}
parrygg.on("streamschanged", (stream) => {
    document.querySelector("#stream-queue .list .title .channel").innerText = (stream == null ? "No stream selected" : parrygg.tournamentObject.name);
    document.querySelector("#stream-queue .list .title").dataset.site = "parrygg";
});
parrygg.on("streamqueuechanged", displayParryggStreamQueue);
parrygg.on("streamqueuechanged", (sets) => {
    _ws.send(JSON.stringify({ "type": "stream-queue", "data": sets }));1
});

on("ws-ready", async () => {
    await ipcRenderer.invoke("get", "parrygg-token").then(token => parrygg.Token = token);
    await ipcRenderer.invoke("get", "parrygg").then(async (data) => {
        parrygg.SelectedTournament = data.tournament;
        parrygg.SelectedStream = data.stream;
        parrygg.tournamentObject = await parrygg.getTournament(this.selectedTournament);
        if(parrygg.selectedTournament != null && parrygg.selectedTournament != '') {
            parrygg.setBrackets();
            await parrygg.startStreamQueuePolling();
        }
    });
});

async function displayParryggCurrent() {
    let set = await parrygg.getSet(scoreboard.parrygg.set);
    var entrants = await Promise.all(await set.slotsList.map(async slot => (
        await parrygg.getEntrantFromSeedAndBracket(slot.seedId, scoreboard.parrygg.bracket)
    )));
    document.querySelector("#stream-queue .current").innerText = (entrants ? entrants.map(x =>
        x ? x.name : "N/A").join(" vs ") : 'No set selected'
    );
    for (let itemEl of document.querySelectorAll("#stream-queue .list .sets > div")) {
        itemEl.classList.toggle("selected", set && itemEl.dataset.setId == set.id);
    }
}


async function getParryggDifferences(player) {
    let res = { "differences": [], "player": player };
    if (!player.InDB || !player.HasParrygg) { return res; }

    player = await db.resolveRelations("player", player);
    let parryggPlayer = await parrygg.getPlayer(player.parrygg);
    console.log("comparing player", player, parryggPlayer);
    res.differences = ParryggWrapper.comparePlayer(player, parryggPlayer);
    return res;
}

on("scoreboardparryggchanged", displayParryggCurrent);

async function applyParryggSettings(tournamentSlug, streamId) {
    parrygg.SelectedTournament = tournamentSlug;
    parrygg.SelectedStream = streamId;
    parrygg.tournamentObject = await parrygg.getTournament(this.selectedTournament);
    if (tournamentSlug != null && tournamentSlug != '') {
        await parrygg.setBrackets();
        parrygg.startStreamQueuePolling();
    } else {
        parrygg.stopStreamQueuePolling();
    }
}

async function displayParryggStreamQueue(sets) {
    let tournament = parrygg.tournamentObject;
    let setIds = sets.map(x => x.id);
    let el = document.getElementById("stream-queue");
    let listEl = el.querySelector(".list .sets");

    el.classList.toggle("empty", sets.length == 0);
    el.querySelector(".list .title .setcount").innerText = sets.length;

    // add/edit sets
    sets.forEach(async (set, idx) => {
        set.fullRoundText = parrygg.getSetRoundName(set, await parrygg.getBracket(set.bracket.id));
        var entrants = await Promise.all(await set.slotsList.map(async slot => (
            await parrygg.getEntrantFromSeedAndBracket(slot.seedId, set.bracket.id)
        )));
        let item = document.getElementById("stream-queue-item-" + set.id);
        if (!item) {
            item = createElement({ "id": "stream-queue-item-" + set.id });
            item.dataset.setId = set.id;
            item.appendChild(createElement({ "className": "round" }));
            item.appendChild(createElement({ "className": "names" }));
            item.appendChild(createElement({ "className": "indentifier" }));
            item.onclick = (e) => applyParryggSet(set.id, set.bracket.id, set.phase.id, set.event.id, set.tournament.id);
            listEl.appendChild(item);
        }
        item.style.transform = "translateY(" + (40 * idx) + "px)";
        item.querySelector(".indentifier").innerText = set.identifier;
        item.querySelector(".round").innerText = set.fullRoundText;
        var entrant1 = await entrants[0] || {};
        var entrant2 = await entrants[1] || {};
        item.querySelector(".names").innerText = (await entrant1.name || "N/A") + " Vs. " + (await entrant2.name || "N/A");
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


async function applyParryggSet(setId, bracketId, phaseId, eventId, tournamentId) {
    bgWork.start("applyParryggSet");
    clearBoard();
    let teamSize = 1;
    var set = await parrygg.getSet(setId, 0);
    var bracket = await parrygg.getBracket(bracketId, 0);
    var event = await parrygg.getEvent(eventId, 0);
    var phase = await parrygg.getPhase(phaseId, 0);
    var tournament = await parrygg.getTournamentById(tournamentId, 0);
    scoreboard.startgg = {
        set: null,
        event: null,
        phaseGroup: null,
        phase: null
    }
    scoreboard.parrygg.set = set.id;
    scoreboard.parrygg.bracket = bracket.id;
    scoreboard.parrygg.event = event.id;
    scoreboard.parrygg.phase = event.id;
    scoreboard.parrygg.tournament = tournament.id;

    var entrants = await Promise.all(await set.slotsList.map(async slot => (
        await parrygg.getEntrantFromSeedAndBracket(slot.seedId, bracketId)
    )));
    console.log({
        "set": set,
        "bracket": bracket,
        "phase": phase,
        "event": event,
        "tournament": tournament,
        "entrants": entrants
    });
    let slotIndex = 0;
    for (let slot of entrants) {

        scoreboard.teams[(slotIndex + 1)].name = (slot.name ? slot.name : "");
        var participantIdx = 0;
        if(!slot.entrant || !slot.entrant.usersList) {
            slotIndex++;
            continue;
        }
        for (let participant of slot.entrant.usersList) {
            // get all players which have same smashgg ID or same name
            let res = await db.get("player", {  "parrygg": participant.id  }, Player);

            // filter only with matching smashgg ID
            let exactRes = res.filter(x => x.smashgg == participant.id).slice(0, 1);
            let insertPlayer;
            if (exactRes.length == 1) {
                // has matching ID - just insert
                insertPlayer = exactRes[0];
            } else if (res.length > 0) {
                // has matching name - insert and set mergable
                insertPlayer = res[0];
                insertPlayer.parryggMergable = participant.id;
            } else {
                // no matching player found - create temp and insert
                insertPlayer = { "name": participant.gamerTag, "id": participant.id };
            }
            scoreboard.teams[(slotIndex + 1)].players[participantIdx] = new Player(insertPlayer);
            participantIdx++;
        }
        teamSize = Math.max(teamSize, slot.entrant.usersList.length);


        slotIndex++;
    }

    setTeamSize(teamSize);
    set.fullRoundText = parrygg.getSetRoundName(set, bracket);
    set.eventName = event.name;
    set.slug = tournament.slug;
    set.hashtag = '';
    set.tournamentName = tournament.name;
    set.all = set;
    _theme.fields.forEach((field) => {
        if (field.hasOwnProperty("smashgg") && field.type == "text" && set.hasOwnProperty(field.smashgg)) {
            document.getElementById('field-' + field.name).value = set[field.smashgg];
            scoreboard.fields[field.name].value = set[field.smashgg];
        }
    });

    fire("scoreboardparryggchanged");
    fire("scoreboardteamschanged");
    fire("scoreboardchanged");

    bgWork.finish("applyParryggSet");
}