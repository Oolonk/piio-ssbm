
var _returnChannel = "";
var parrygg = new ParryggWrapper();
var dataset;
var currentPage = 1;
var infiniteScrollLoading = false;



ipcRenderer.on("data", (event, data) => {
	document.getElementById('parrygg-search-tbx').value = data.name;
	dataset = data.dataset;
});

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);


window.onload = init;

async function init() {
	await ipcRenderer.invoke("get", "parrygg-token").then(token => parrygg.Token = token);
	await ipcRenderer.invoke("get", "parrygg").then(data => parrygg.SelectedTournament = data.tournament);

	if (document.getElementById('parrygg-search-tbx').value.length > 0) {
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
	let term = document.getElementById('parrygg-search-tbx').value;
	let players = await parrygg.findParticipants(term, currentPage, 50);
    console.log(players);
	if (term != document.getElementById('parrygg-search-tbx').value)
		return;
	let el = document.getElementById('results');
	let tpl = document.getElementById('result-item');
	players.forEach((player) => {
		let playerElm = tpl.content.cloneNode(true);

		playerElm.querySelector(".item").classList.toggle("selected", (dataset && dataset.parrygg == player.id));
		playerElm.querySelector(".gamertag").innerHTML = (player.prefix ? '<span class="prefix">' + player.prefix + '</span>' : '') + player.gamerTag;

		if (player) {
			playerElm.querySelector(".realname").innerText = player.firstName + (player.lastName ? " " + player.lastName : "");
			playerElm.querySelector(".avatar").style.backgroundImage = "url('" + player.pictures.avatar + "')";
			if (player.authorizations) {
				player.authorizations.forEach((account) => {
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
