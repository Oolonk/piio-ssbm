
var _returnChannel = "";
var smashgg = new SmashggWrapper();
var dataset, smashgg;
var currentPage = 1;
var infiniteScrollLoading = false;



ipcRenderer.on("data", (event, data) => {
	document.getElementById('smashgg-search-tbx').value = data.name;
	dataset = data.dataset;
});

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);


window.onload = init;

async function init() {
	await ipcRenderer.invoke("get", "smashgg-token").then(token => smashgg.Token = token);
	await ipcRenderer.invoke("get", "smashgg").then(data => smashgg.SelectedTournament = data.tournament);

	if (document.getElementById('smashgg-search-tbx').value.length > 0) {
		search();
	}
}

function search() {
	currentPage = 1;
	let el = document.getElementById('results').truncate();
	el.onscroll = checkForLoad;
	fetchResults();
}

function checkForLoad(e) {
	let scrollLeft = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight;
	if (scrollLeft < 10 && !infiniteScrollLoading) {
		infiniteScrollLoading = true;
		fetchResults();
	}
}

async function fetchResults() {
	let term = document.getElementById('smashgg-search-tbx').value;
	let players = await smashgg.findParticipants(term, currentPage, 50);
	if (term != document.getElementById('smashgg-search-tbx').value)
		return;
	let el = document.getElementById('results');
	let tpl = document.getElementById('result-item');
	players.forEach((player) => {
		let playerElm = tpl.content.cloneNode(true);

		playerElm.querySelector(".item").classList.toggle("selected", (dataset && dataset.smashgg == player.player.id));
		playerElm.querySelector(".gamertag").innerHTML = (player.player.prefix ? '<span class="prefix">' + player.player.prefix + '</span>' : '') + player.player.gamerTag;

		if (player.user) {
			playerElm.querySelector(".realname").innerText = player.user.name;
			playerElm.querySelector(".avatar").style.backgroundImage = "url('" + SmashggWrapper.getImage(player.user, "profile", 50) + "')";
			if (player.user.authorizations) {
				player.user.authorizations.forEach((account) => {
					playerElm.querySelector(".authorizations").appendChild(createElement({ "text": account.externalUsername, "className": "acc-" + account.type }));
				});
			}
		}


		playerElm.querySelector(".item").onclick = () => {
			ipcRenderer.send(_returnChannel, player);
			window.close();
		};

		el.appendChild(playerElm);

	});
	currentPage++;
	if (players.length == 0)
		el.onscroll = null;
	infiniteScrollLoading = false;
}
