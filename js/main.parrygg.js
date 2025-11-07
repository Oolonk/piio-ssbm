const parrygg = new ParryggWrapper();
var streamvar = {}
parrygg.on("streamschanged", (stream) => {
    document.querySelector("#stream-queue .list .title .channel").innerText = (stream == null ? "No stream selected" : stream.streamName);
});
parrygg.on("streamqueuechanged", displayStreamQueue);
parrygg.on("streamqueuechanged", (sets) => {
    _ws.send(JSON.stringify({ "type": "stream-queue", "data": sets }));1
});

on("ws-ready", async () => {
    await ipcRenderer.invoke("get", "parrygg-token").then(token => parrygg.Token = token);
    await ipcRenderer.invoke("get", "parrygg").then((data) => {
        parrygg.SelectedTournament = data.tournament;
        parrygg.SelectedStream = data.stream;
    });
    parrygg.startStreamQueuePolling();
});

