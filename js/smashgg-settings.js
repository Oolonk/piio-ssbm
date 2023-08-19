
const APPROOT = remote.getGlobal("APPROOT");

var _returnChannel = "";
var smashgg = new SmashggWrapper();
var slugMatchTournament;
var currentPage = 1;
var infiniteScrollLoading = false;

ipcRenderer.on("data", async (event, data) => {
	smashgg.cache = data.cache;
	smashgg.Token = data.token;
	smashgg.SelectedTournament = data.tournamentSlug;
	smashgg.SelectedStream = data.streamId;
	fillTournamentInfo();
});

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);

async function fillTournamentInfo() {
	let tournament = await smashgg.getTournament();
	document.querySelector("#info .title").innerText = (tournament ? tournament.name : "");
	let img = SmashggWrapper.getImage(tournament, "profile", 150);
	document.querySelector("#info .logo").style.backgroundImage = "url('" + img + "')";
	document.querySelector("#selected-tournament .bg").style.backgroundImage = "url('" + SmashggWrapper.getImage(tournament, "banner") + "')";

	let infoLines = [];
	if (tournament) {
		infoLines.push(getDateString(tournament.startAt, tournament.endAt, tournament.timezone));
		if (tournament.city || tournament.countryCode) {
			infoLines.push([tournament.city, tournament.countryCode].filter(x => x != null && x.length > 0).join(", "));
		}
		if (tournament.numAttendees) {
			infoLines.push(tournament.numAttendees + " attendees");
		}
		if (tournament.hashtag) {
			infoLines.push("#" + tournament.hashtag);
		}
	}
	document.querySelector("#info .info").innerHTML = infoLines.join("<br />");
	displayChannels(tournament && tournament.streams ? tournament.streams : []);
}

function displayChannels(channels) {
	let el = document.getElementById('channel-select').truncate();
	let tpl = document.getElementById('channel-item');
	channels.forEach((stream) => {
		let channelItem = tpl.content.cloneNode(true);
		let itemEl = channelItem.querySelector('.item');
		itemEl.classList.toggle("selected", stream.id == smashgg.selectedStream);
		itemEl.querySelector(".name").innerText = stream.streamName;
		itemEl.querySelector(".logo").style.backgroundImage = "url('img/" + stream.streamSource.toLowerCase() + "-icon.svg')";

		itemEl.onclick = () => {
			smashgg.SelectedStream = stream.id;
			el.querySelectorAll(".item").forEach((elm) => elm.classList.remove("selected"));
			itemEl.classList.add("selected");
		};
		el.appendChild(itemEl);
	});
}

var _fetchResultTimeout;
function search() {
	if (_fetchResultTimeout)
		clearTimeout(_fetchResultTimeout);
	_fetchResultTimeout = setTimeout(() => {
		currentPage = 1;
		slugMatchTournament = null;
		let el = document.getElementById('results').truncate();
		el.onscroll = checkForLoad;
		fetchResults();
	}, 200);
}


function checkForLoad(e) {
	let scrollLeft = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight;
	if (scrollLeft < 10 && !infiniteScrollLoading) {
		infiniteScrollLoading = true;
		fetchResults();
	}
}

async function fetchResults() {
	let el = document.getElementById('results');
	let searchTbx = document.getElementById('smashgg-search-tbx')
	let term = searchTbx.value.trim();
	el.classList.toggle("visible", term.length > 0);

	if (term.length == 0) {
		return;
	}

	el.classList.add("fetching");

	let tournaments = await smashgg.findTournaments(term, currentPage, 50);
	if (term != searchTbx.value) { return; } // abort due to changed term while executing async request

	if (currentPage == 1) {
		let tournament = await smashgg.findTournament(term);
		if (term != searchTbx.value) { return; } // abort due to changed term while executing async request
		if (tournament) {
			tournament.matchedSlug = true;
			slugMatchTournament = tournament;
			tournaments.unshift(tournament);
		}
	}

	if (slugMatchTournament) {
		tournaments = tournaments.filter(x => x.id != slugMatchTournament.id || x.matchedSlug);
	}

	el.classList.toggle("noresults", currentPage == 1 && tournaments.length == 0);
	tournaments.forEach((tournament) => el.appendChild(buildItem(tournament)));
	currentPage++;
	if (tournaments.length == 0) {
		el.onscroll = null;
	}
	infiniteScrollLoading = false;
	el.classList.remove("fetching");
}

function buildItem(tournament) {
	let tpl = document.getElementById('result-item');
	let tEl = tpl.content.cloneNode(true);

	tEl.querySelector(".item").classList.toggle("selected", smashgg.selectedTournament == tournament.id);
	tEl.querySelector(".item").classList.toggle("matchedSlug", tournament.matchedSlug == true);

	let img = SmashggWrapper.getImage(tournament, "profile", 50);
	if (img) {
		tEl.querySelector(".logo").style.backgroundImage = "url('" + img + "')";
	}

	tEl.querySelector(".name").innerText = tournament.name;
	tEl.querySelector(".date").innerText = getDateString(tournament.startAt, tournament.endAt, tournament.timezone);
	tEl.querySelector(".item").onclick = () => selectTournament(tournament.slug);
	return tEl.querySelector(".item");
}

async function selectTournament(slug) {
	document.body.classList.add("locked");
	smashgg.SelectedTournament = null;
	await fillTournamentInfo();
	smashgg.SelectedTournament = slug;
	await fillTournamentInfo();
	document.body.classList.remove("locked");
}

function save() {
	ipcRenderer.send(_returnChannel, {
		"tournamentSlug": smashgg.selectedTournament,
		"streamId": smashgg.selectedStream
	})
	window.close();
}

function cancel() {
	window.close();
}

function getDateString(start, end, timezone) {
	let startDate = new Date(start * 1000);
	let endDate = new Date(end * 1000);
	if (timezone) {
		let diff = 0;
		try {
			let invdate = new Date(startDate.toLocaleString('en-US', { timeZone: timezone }));
			diff = startDate.getTime() - invdate.getTime();
		} catch (e) { }
		startDate = new Date(startDate.getTime() + diff);
		endDate = new Date(endDate.getTime() + diff);
	}
	let startString = startDate.getDate() + "-" + startDate.getMonth() + '-' + startDate.getYear();
	let endString = endDate.getDate() + "-" + endDate.getMonth() + '-' + endDate.getYear();
	let out = startDate.toLocaleDateString();
	if (startString != endString) {
		out += " - " + endDate.toLocaleDateString();
	}
	return out;
}