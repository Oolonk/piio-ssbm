
const APPROOT = remote.getGlobal("APPROOT");

var _returnChannel = "";
var smashgg = new SmashggWrapper();
var parrygg = new ParryggWrapper();
var slugMatchTournament;
var currentPage =  {
    'smashgg': 1,
    'parrygg': 1
}
var infiniteScrollLoading = {
    'smashgg': false,
    'parrygg': false
};
var selectedTournament = null;
var selectedStream = null;
var usedTournamentWebsite = null;
ipcRenderer.on("data", async (event, data) => {
	smashgg.cache = data['smashgg-cache'];
	smashgg.Token = data['smashgg-token'];
    parrygg.cache = data['parrygg-cache'];
    parrygg.token = data['parrygg-token'];
    console.log(data);
	smashgg.SelectedTournament = data.tournamentSlug;
	smashgg.SelectedStream = data.streamId;
    parrygg.SelectedTournament = data.tournamentSlug;
    parrygg.SelectedStream = data.streamId;
    usedTournamentWebsite = data.tournamentWebsite;
    selectedStream = data.streamId;
    selectedTournament = data.tournamentSlug;
	fillTournamentInfo();
    console.log(usedTournamentWebsite);
    document.getElementById(`${usedTournamentWebsite}-tablink`).click();
});

ipcRenderer.on("returnchannel", (event, data) => _returnChannel = data);

async function fillTournamentInfo() {
    switch (usedTournamentWebsite) {
        case  "smashgg":
        var tournament = await smashgg.getTournament()
        document.querySelector("#info .title").innerText = (tournament ? tournament.name : "");
        let img = SmashggWrapper.getImage(tournament, "profile", 150);
        document.querySelector("#info .logo").style.backgroundImage = "url('" + img + "')";
        document.querySelector("#selected-tournament .bg").style.backgroundImage = "url('" + SmashggWrapper.getImage(tournament, "banner") + "')";

        var infoLines = [];
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
        break;
        case "parrygg":
            var tournament = await parrygg.getTournament();
            document.querySelector("#info .title").innerText = (tournament ? tournament.name : "");
            document.querySelector("#info .logo").style.backgroundImage = "url('" + (tournament.pictures != null ? tournament.pictures.banner : "") + "')";
            document.querySelector("#selected-tournament .bg").style.backgroundImage = "url('" + (tournament.pictures != null ?tournament.pictures.banner : "") + "')";
            // document.querySelector("#selected-tournament .bg").style.backgroundImage = "url('" + SmashggWrapper.getImage(tournament, "banner") + "')";

            var infoLines = [];
            if (tournament) {
                infoLines.push(getDateString(tournament.startDate.seconds, tournament.endDate.seconds, tournament.timeZone));

                if(tournament.address){
                    infoLines.push([tournament.address.administrativeAreaLevel1, tournament.address.countryCode].filter(x => x != null && x.length > 0).join(", "));
                }else if (tournament.venueAddress) {
                    infoLines.push(tournament.venueAddress);
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
            break;
    }

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
            selectedStream = smashgg.selectedStream;
		};
		el.appendChild(itemEl);
	});
}

var _fetchResultTimeout;
function search() {
	if (_fetchResultTimeout)
		clearTimeout(_fetchResultTimeout);
	_fetchResultTimeout = setTimeout(() => {
		currentPage = {
            'smashgg': 1,
            'parrygg': 1
        }
		slugMatchTournament = null;
		let el = document.getElementById('smashgg-results').truncate();
		el.onscroll = checkForLoad;
        el = document.getElementById('parrygg-results').truncate();
        el.onscroll = checkForLoad;
		fetchResults();
	}, 200);
}


function checkForLoad(e) {
    console.log(e);
    let id = e.target.id;
    let tournamentWebsite = id.replace('-results', '');
    let scrollLeft = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight;
    if (scrollLeft < 10 && !infiniteScrollLoading[tournamentWebsite]) {
        infiniteScrollLoading[tournamentWebsite] = true;
        fetchResults();
    }
}

async function fetchResults() {
	let el = document.getElementById('smashgg-results');
	let searchTbx = document.getElementById('tournament-search-tbx')
	let term = searchTbx.value.trim();
	el.classList.toggle("visible", term.length > 0);

	if (term.length == 0) {
		return;
	}

	el.classList.add("fetching");

	let startggTournaments = await smashgg.findTournaments(term, currentPage.smashgg, 50);
    console.log(startggTournaments);
	if (term != searchTbx.value) { return; } // abort due to changed term while executing async request

	if (currentPage.smashgg == 1) {
		let startggTournament = await smashgg.findTournament(term);
		if (term != searchTbx.value) { return; } // abort due to changed term while executing async request
		if (startggTournament) {
            startggTournament.matchedSlug = true;
			slugMatchTournament = startggTournament;
            startggTournaments.unshift(startggTournament);
		}
	}

	if (slugMatchTournament) {
        startggTournaments = startggTournaments.filter(x => x.id != slugMatchTournament.id || x.matchedSlug);
	}

	el.classList.toggle("noresults", currentPage.smashgg == 1 && startggTournaments.length == 0);
    startggTournaments.forEach((tournament) => el.appendChild(buildItem(tournament, "smashgg")));
	currentPage.smashgg++;
	if (startggTournaments.length == 0) {
		el.onscroll = null;
	}
	infiniteScrollLoading.smashgg = false;
	el.classList.remove("fetching");
    // Parrygg section
    slugMatchTournament = null;
    el = document.getElementById('parrygg-results');
    el.classList.toggle("visible", term.length > 0);

    if (term.length == 0) {
        return;
    }

    el.classList.add("fetching");
    let parryggTournaments = await parrygg.findTournaments(term, currentPage.parrygg, 50);
    if (term != searchTbx.value) { return; }
    if (currentPage.parrygg == 1) {
        let parryggTournament = await parrygg.getTournament(term);
        if (term != searchTbx.value) { return; }
        if (parryggTournament) {
            parryggTournament.matchedSlug = true;
            slugMatchTournament = parryggTournament;
            parryggTournaments.unshift(parryggTournament);
        }
    }else{
        parryggTournaments = [];
    }

    if (slugMatchTournament) {
        parryggTournaments = parryggTournaments.filter(x => x.id != slugMatchTournament.id || x.matchedSlug);
    }

    el.classList.toggle("noresults", currentPage.parrygg == 1 && parryggTournaments.length == 0);
    parryggTournaments.forEach((tournament) => el.appendChild(buildItem(tournament, "parrygg")));
    currentPage.parrygg++;
    if (startggTournaments.length == 0) {
        el.onscroll = null;
    }
    infiniteScrollLoading.parrygg = false;
    el.classList.remove("fetching");

}

function buildItem(tournament, tournamentWebsite) {
	let tpl = document.getElementById('result-item');
	let tEl = tpl.content.cloneNode(true);

	tEl.querySelector(".item").classList.toggle("selected", smashgg.selectedTournament == tournament.id);
	tEl.querySelector(".item").classList.toggle("matchedSlug", tournament.matchedSlug == true);

    switch (tournamentWebsite){
        case "smashgg":
            let img = SmashggWrapper.getImage(tournament, "profile", 50);
            if (img) {
                tEl.querySelector(".logo").style.backgroundImage = "url('" + img + "')";
            }
            tEl.querySelector(".name").innerText = tournament.name;
            tEl.querySelector(".date").innerText = getDateString(tournament.startAt, tournament.endAt, tournament.timezone);
            tEl.querySelector(".item").onclick = () => selectTournament(tournament.slug, tournamentWebsite);
            break;
        case "parrygg":
            console.log(tournament);
            tEl.querySelector(".logo").style.backgroundImage = "url('" + tournament.pictures.banner + "')";
            tEl.querySelector(".name").innerText = tournament.name;
            tEl.querySelector(".date").innerText = getDateString(tournament.startDate.seconds, tournament.endDate.seconds, tournament.timezone);
            tEl.querySelector(".item").onclick = () => selectTournament(tournament.primarySlug, tournamentWebsite);
    }
	return tEl.querySelector(".item");
}

async function selectTournament(slug, tournamentWebsite) {
	document.body.classList.add("locked");
    usedTournamentWebsite = tournamentWebsite;
    switch (usedTournamentWebsite) {
        case "smashgg":
            smashgg.SelectedTournament = null;
            smashgg.SelectedTournament = slug;
            await fillTournamentInfo();
            selectedTournament = smashgg.selectedTournament;
            selectedStream = smashgg.selectedStream;
        case "parrygg":
            parrygg.SelectedTournament = null;
            parrygg.SelectedTournament = slug;
            await fillTournamentInfo();
            selectedTournament = parrygg.selectedTournament;
            selectedStream = parrygg.selectedStream;
    }
    document.body.classList.remove("locked");
}

function save() {
	ipcRenderer.send(_returnChannel, {
		"tournamentSlug": selectedTournament,
		"streamId": selectedStream,
        "tournamentWebsite": usedTournamentWebsite
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
function openTab(evt, tabName) {
    // Declare all variables
    var i, tabcontent, tablinks;

    // Get all elements with class="tabcontent" and hide them
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}