const parrygg = new ParryggWrapper();
var streamvar = {}
parrygg.on("streamschanged", (stream) => {
    document.querySelector("#stream-queue .list .title .channel").innerText = (stream == null ? "No stream selected" : stream.streamName);
    document.querySelector("#stream-queue .list .title").dataset.site = "parrygg";
});
// parrygg.on("streamqueuechanged", displayStreamQueue);
parrygg.on("streamqueuechanged", (sets) => {
    _ws.send(JSON.stringify({ "type": "stream-queue", "data": sets }));1
});

on("ws-ready", async () => {
    await ipcRenderer.invoke("get", "parrygg-token").then(token => parrygg.Token = token);
    await ipcRenderer.invoke("get", "parrygg").then((data) => {
        parrygg.SelectedTournament = data.tournament;
        parrygg.SelectedStream = data.stream;
        if(parrygg.selectedTournament != null && parrygg.selectedTournament != '') {
            parrygg.setBrackets();
        }
    });
    if(await parrygg.SelectedTournament != null) {
        parrygg.startStreamQueuePolling();
    }
});

async function displayParryggCurrent() {
    let set = await parrygg.getSet(scoreboard.parrygg.set);
    document.querySelector("#stream-queue .current").innerText = (set ? set.slots.map(x => x.entrant ? x.entrant.name : "N/A").join(" vs ") : 'No set selected');
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
    if (tournamentSlug != null && tournamentSlug != '') {
        await parrygg.setBrackets();
        parrygg.startStreamQueuePolling();
    } else {
        parrygg.stopStreamQueuePolling();
    }
}

