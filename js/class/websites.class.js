class WebsiteWrapper{
    constructor() {
        this.emitter = new (require("events"))();
        this.streamQueuePollInterval = 6000; // ms (6s)
        this.cacheMaxAge = 60000; // ms (60s)
        this.timers = {};
        this.cache = { sets: {}, tournaments: {}, players: {} };


        this.requestCounter = [];
        this.rateLimitTimeFrame = 60 * 1000; //  = seconds
        this.rateLimitAmount = 80; //  = requests
    }
    stopStreamQueuePolling() {
        if (this.timers.hasOwnProperty("streamQueuePoll")) {
            clearTimeout(this.timers.streamQueuePoll);
            this.emit("streamschanged", null);
        }
    }

    getCache(type, id, maxAge) {
        maxAge = maxAge == null ? this.cacheMaxAge : maxAge;
        if (!this.cache.hasOwnProperty(type) || !this.cache[type].hasOwnProperty(id) || this.cache[type][id].timestamp + maxAge < new Date().getTime()) {
            return null;
        }
        return this.cache[type][id].data;
    }

    setCache(type, id, data) {
        if (data == null || id == null || type == null) { return; }
        if (!this.cache.hasOwnProperty(type)) {
            this.cache[type] = {};
        }
        this.cache[type][id] = { data: data, timestamp: new Date().getTime() };
    }
    destroy() {
        this.stopStreamQueuePolling();
    }

    on(...args) {
        this.emitter.on(...args);
    }

    once(...args) {
        this.emitter.once(...args);
    }

    emit(...args) {
        this.emitter.emit(...args);
    }

    _requestCountIncrease() {
        this.requestCounter.push(new Date().getTime());
        this._requestCountCleanUp();
    }
}
/* --exclude-from-all */

class SmashggWrapper extends WebsiteWrapper {
    static ENDPOINT = "https://api.smash.gg/gql/alpha";
    static GROUP_TYPE = {
        SINGLE_ELIMINATION: 1,
        DOUBLE_ELIMINATION: 2,
        ROUND_ROBIN: 3,
        SWISS: 4,
        EXHIBITION: 5,
        CUSTOM_SCHEDULE: 6,
        MATCHMAKING: 7,
        ELIMINATION_ROUNDS: 8,

        1: "SINGLE_ELIMINATION",
        2: "DOUBLE_ELIMINATION",
        3: "ROUND_ROBIN",
        4: "SWISS",
        5: "EXHIBITION",
        6: "CUSTOM_SCHEDULE",
        7: "MATCHMAKING",
        8: "ELIMINATION_ROUNDS"
    }
    static EVENT_TYPE = {
        SINGLES: 1,
        TEAMS: 5,
        CREWS: 3,

        1: "SINGLES",
        5: "TEAMS",
        3: "CREWS"
    }
    static GRAPHQL_FIELDS = {
        STREAM: `id streamSource streamType streamName isOnline followerCount streamStatus streamLogo`,
        TOURNAMENT: `id name hashtag slug shortSlug startAt endAt state timezone venueAddress venueName images { id width height type url }`,
    }

    constructor() {
        super();
        this.token = "";
        this.streamQueuePollInterval = 6000; // ms (6s)
        this.cacheMaxAge = 60000; // ms (60s)
        this.timers = {};
        this.cache = { sets: {}, tournaments: {}, players: {} };


        this.requestCounter = [];
        this.rateLimitTimeFrame = 60 * 1000; //  = seconds
        this.rateLimitAmount = 80; //  = requests

        this.selectedTournament = null;
        this.selectedStream = null;
        this.streamQueueSetIdList = [];

    }

    set Token(val) {
        this.token = val.trim();
    }

    set SelectedTournament(val) {
        if (this.selectedTournament == val) { return; }
        this.selectedTournament = val;
        this.SelectedStream = null;
    }

    set SelectedStream(val) {
        if (this.selectedStream == val) { return; }
        this.selectedStream = val;
        if (this.selectedStream == null) {
            this.stopStreamQueuePolling();
        }
    }

    async getTournament(tournamentSlug, cacheMaxAge) {
        tournamentSlug = tournamentSlug == null ? this.selectedTournament : tournamentSlug;
        if (tournamentSlug == null) { return; }
        let tournament = this.getCache("tournament-smashgg", tournamentSlug, cacheMaxAge);
        if (tournament == null) {
            let res = await this.query(`query ($slug: String!) {
				tournament(slug: $slug){
					id name city countryCode createdAt rules hashtag numAttendees primaryContact primaryContactType shortSlug slug startAt endAt timezone tournamentType
					streams {
						id streamId streamName streamSource
					}
					waves {
						identifier
					}
					images {
						id width height ratio type url
					}
				}
			}`, { "slug": tournamentSlug });
            if (res == null) { return null; }
            tournament = res.tournament;
            this.setCache("tournament-smashgg", tournamentSlug, tournament);
        }
        return tournament;
    }

    async getTournamentParticipants(tournamentSlug, cacheMaxAge) {
        tournamentSlug = tournamentSlug == null ? this.selectedTournament : tournamentSlug;
        if (tournamentSlug == null) { return []; }
        let participants = this.getCache("getTournamentParticipants-smashgg", tournamentSlug, cacheMaxAge);
        if (participants == null) {
            participants = [];
            let page = 1;
            let perPage = 950;
            while (true) {
                let res = await this.query(`query ($slug: String!, $page: Int, $perPage: Int) {
					tournament(slug: $slug){
						participants(query: {
							perPage: $perPage
							page: $page
						  }) {
							nodes {
								player {
									id gamerTag prefix 
									user {
										name
										location {city country countryId state stateId}
										authorizations { externalUsername type }
										images { type url }
									}
								}
							}
						}
					}
				}`, { "slug": tournamentSlug, "page": page, "perPage": perPage });
                if (res == null) { return null; }
                try {
                    participants = participants.concat(res.tournament.participants.nodes.map(x => x));
                    if (res.tournament.participants.nodes.length < perPage) {
                        break; // there wont be more
                    }
                } catch (e) {
                    break; // end of list reached
                }
                page++;
            }
            this.setCache("getTournamentParticipants-smashgg", tournamentSlug, participants);
        }
        return participants;
    }

    async getSet(setId, cacheMaxAge) {
        if (setId == null) { return null; }
        let set = this.getCache("set-smashgg", setId, cacheMaxAge);
        if (set == null) {
            let res = await this.query(`query ($id: ID!) {
				set(id: $id){
					id completedAt startedAt fullRoundText  hasPlaceholder identifier round state winnerId
					slots {
						id  slotIndex
						entrant {
							id  name
							participants {
								id gamerTag 
								player { id gamerTag }
								user { id name }
							}
						}
					}
					stream  { id followerCount streamId streamName streamSource }
					phaseGroup {
						id numRounds bracketType displayIdentifier
						phase { id bracketType groupCount name }
						wave { id identifier }
					}
					event {
						id name type
						phaseGroups { 
							id displayIdentifier bracketType state
							rounds { id bestOf number }
						}
						phases {
							id name groupCount
						}
						videogame {
							id name displayName slug
						}
						tournament{
							shortSlug
							hashtag
							name
						}
					}
				}
			}`, { "id": setId });
            if (res == null) { return null; }
            set = res.set;
            this.setCache("set-smashgg", setId, set);
        }
        return set;
    }

    async findTournaments(term, page, perPage) {
        page = page || 1;
        perPage = perPage || 50;
        let res = await this.query(`query ($perPage: Int!, $page: Int!, $term: String!) {
			tournaments(query: {
				perPage: $perPage
				page: $page
				sortBy: "startAt desc"
				filter: {
					name: $term
				}
			}) {
				nodes {
					${SmashggWrapper.GRAPHQL_FIELDS.TOURNAMENT}
				}
			}
		}`, { "perPage": perPage, "page": page, "term": term });
        if (res == null) { return null; }
        return res.tournaments.nodes || [];
    }

    async findParticipants(term, page, perPage) {
        page = page || 1;
        perPage = perPage || 50;
        let res = await this.query(`query ($slug: String!, $perPage: Int!, $page: Int!, $term: String!) {
			tournament(slug: $slug){
				participants(query: {
					perPage: $perPage
					page: $page
					filter: {
						search: {
							fieldsToSearch: ["gamerTag"],
							searchString: $term	
						}
					}
				  }) {
					nodes {
						gamerTag
						player { id gamerTag prefix }
						user {
							name
							location {city country countryId state stateId}
							authorizations { externalUsername type }
							images { type url }
						}
					}
				}
			}
		}`, { "slug": this.selectedTournament, "perPage": perPage, "page": page, "term": term });
        if (res == null) { return null; }

        // fix country names (example: USA -> United States of America)
        if (res.tournament.participants.nodes) {
            res.tournament.participants.nodes.forEach((node) => {
                if (!node.user) { return; }
                node.user.location.country = this.constructor.convertCountryName(node.user.location.country, node.user.location.countryId);
            });
        }
        return res.tournament.participants.nodes || [];
    }

    async getPlayer(playerId, cacheMaxAge) {
        if (playerId == null) { return null; }
        let player = this.getCache("player-smashgg", playerId, cacheMaxAge);
        if (player == null) {
            let res = await this.query(`query ($id: ID!) {
				player(id: $id){ id gamerTag 
					user {
						name genderPronoun birthday 
						location {city country countryId state stateId}
						authorizations { externalUsername type }
						images { type url }
					}
				}
			}`, { "id": playerId });
            if (res == null) { return null; }
            player = res.player;
            this.setCache("player-smashgg", playerId, player);
        }

        // fix country names (example: USA -> United States of America)
        if (player.user && player.user.location) {
            player.user.location.country = this.constructor.convertCountryName(player.user.location.country, player.user.location.countryId);
        }

        return player;
    }

    async getPlayerPhoto(playerId, cacheMaxAge) {
        let player = await this.getPlayer(playerId, cacheMaxAge);
        if (player == null || player.user == null) { return null; }

        let url = this.constructor.getImage(player.user, "profile");

        return await fetch(url);
    }

    async findTournament(term) {
        let res = await this.query(`query ($term: String!) {
			tournament(slug: $term){
				${SmashggWrapper.GRAPHQL_FIELDS.TOURNAMENT}
			}
		}`, { "term": term });
        return res.tournament;
    }

    async fetchStreamQueue() {

        if (this.selectedTournament == null || this.selectedStream == null) {
            this.stopStreamQueuePolling();
        }

        let res = await this.query(`query ($tourneySlug: String!){
			tournament(slug:$tourneySlug){
				streams {
					id
				}
				streamQueue {
					stream {
						id streamSource streamName
					}
					sets{
						id
						slots {
							entrant {
								name
								team {
									name
								}
								participants {
									gamerTag
									prefix
								}
							}
						}
						fullRoundText identifier round
						phaseGroup {
							displayIdentifier
							phase {
								name
							}
						}
					}
				}
			}
		}`, { "tourneySlug": this.selectedTournament });

        if (res == null) {
            return null;
        }

        if (res.tournament.streams.some(x => x.id == this.selectedStream) == false) {
            // this tournament does not have a stream with selectedStream slug
            this.selectedStream = null;
            this.stopStreamQueuePolling();
        }

        let sets = [];
        let queues = res.tournament.streamQueue;
        if (queues != null && queues.length > 0) {
            let queue = queues.find(x => x.stream.id == this.selectedStream);
            if (queue != null && queue.sets != null && queue.sets.length > 0) {
                sets = queue.sets;
            }
        }

        if (sets.map(x => x.id).join("-") != this.streamQueueSetIdList.join("-")) {
            this.streamQueueSetIdList = sets.map(x => x.id);
            this.emit("streamqueuechanged", sets);
        }

        return sets;
    }

    startStreamQueuePolling(pollInterval) {
        this.stopStreamQueuePolling();

        this.query(`query ($id: ID!){
			stream(id:$id){
				id streamName
			}
		}`, { "id": this.selectedStream }).then((res) => {
            this.emit("streamschanged", res ? res.stream : null);
        });

        this.fetchStreamQueue();
        this.timers.streamQueuePoll = setInterval(() => this.fetchStreamQueue(), pollInterval || this.streamQueuePollInterval);
    }

    stopStreamQueuePolling() {
        if (this.timers.hasOwnProperty("streamQueuePoll")) {
            clearTimeout(this.timers.streamQueuePoll);
            this.emit("streamschanged", null);
        }
    }


    /*
    on error:
     - Rate limit exceeded
    - too complex
    return: null
    */
    query(query, vars, opName) {
        return new Promise((resolve, reject) => {

            // check token
            if (this.token == null || this.token.length < 4) {
                this.emit("fetch-error", { "type": "invalid-token", "data": "No authentication token provided" });
                return resolve(null);
            }

            this.request({
                "query": query,
                "operationName": opName,
                "variables": vars
            }).then((res) => {
                let errorData = { "type": "unknown", "data": "" };
                if (res.errors) { // syntax etc
                    res.errors.forEach((error) => {
                        let ed = Object.assign({}, errorData);
                        if (error.message.includes("Syntax Error")) {
                            ed.type = "syntax-error";
                        }
                        ed.data = error.message;

                        this.emit("fetch-error", ed);
                    });
                    return resolve(null);
                }
                if (res.success === false) {	// auth error
                    if (res.message.includes("Rate limit exceeded")) {
                        errorData.type = "rate-limit-exceeded";
                        errorData.data = "Too many requests";
                    } else if (res.message.includes("query complexity is too high")) {
                        errorData.type = "query-too-complex";
                        errorData.data = "Query complexity is too high";
                    } else if (res.message.includes("Invalid authentication token")) {
                        errorData.type = "invalid-token";
                        errorData.data = "Provided authentication token is invalid";
                    } else {
                        errorData.data = res.message;
                    }
                    this.emit("fetch-error", errorData);
                    return resolve(null);
                }

                // request ok
                this._requestCountIncrease();
                resolve(res.data);
            }).catch((e) => {
                this.emit("fetch-error", { "type": "unknown", "data": e });
                resolve(null);
            });
        });
    }

    _requestCountIncrease() {
        this.requestCounter.push(new Date().getTime());
        this._requestCountCleanUp();
    }

    _requestCountCleanUp() {
        this.requestCounter = this.requestCounter.filter(x => x > new Date().getTime() - this.rateLimitTimeFrame);
        //console.log("Requests: "+this.requestCounter.length+" / "+this.rateLimitAmount);
    }

    async request(args) {
        const fetchResponse = await fetch(SmashggWrapper.ENDPOINT, {
            method: 'POST',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.token
            },
            body: JSON.stringify(args)
        });
        return await fetchResponse.json();
    }

    destroy() {
        this.stopStreamQueuePolling();
    }

    static comparePlayer(local, remote, includeIgnore) {
        // normalize remote structure to local structure
        remote = this.convertPlayerStructure(remote);

        let diffs = [];

        for (let key in local) {
            if (!remote.hasOwnProperty(key)) { continue }

            let ignored = false;
            if (local.hasOwnProperty("smashggIgnore") && local.smashggIgnore.hasOwnProperty(key)) {
                ignored = (local.smashggIgnore[key] == remote[key]);
            }

            let compareResult = false;
            switch (key) {
                case "country":
                function recursiveNationCompare(country, countryName) {
                    if (country == null) { return false; }
                    if (country.name == countryName) { return true; }
                    if (country.nation == null || country.nation.length == 0) { return false; }
                    return recursiveNationCompare(country.nation, countryName);
                }
                    compareResult = !recursiveNationCompare(local[key], remote[key]);
                    break;
                default: compareResult = local[key] != remote[key]; break;
            }

            if (compareResult) {
                if (!ignored || includeIgnore) {
                    diffs.push({ "field": key, "local": local[key], "smashgg": remote[key], "ignored": ignored });
                }
            }
        }
        return diffs;
    }

    static convertPlayerStructure(data) {
        let fixed = {
            "name": data.gamerTag,
            "pronoun": "",
            "firstname": "",
            "lastname": "",
            "country": "",
            "city": "",
            "twitter": "",
            "twitch": "",
            "steam": "",
            "birthday": ""
        };
        if (data.player) {
            fixed.name = data.player.gamerTag;
        }
        if (data.user) {
            fixed.pronoun = data.user.genderPronoun || "";
            fixed.birthday = data.user.birthday == null || data.user.birthday.split(" ").length - 1 != 2 ? null : this.formatDate(data.user.birthday);
            if (data.user.name) {
                let nameSplit = data.user.name.split(" ");
                if (nameSplit.length > 1) {
                    fixed.lastname = nameSplit.pop();
                }
                fixed.firstname = nameSplit.join(" ");
            }
            if (data.user.authorizations) {
                data.user.authorizations.forEach((acc) => {
                    if (!fixed.hasOwnProperty(acc.type.toLowerCase())) { return }
                    fixed[acc.type.toLowerCase()] = acc.externalUsername;
                });
            }
            if (data.user.location) {
                fixed.country = data.user.location.country;
                fixed.city = data.user.location.city;
            }
        }

        return fixed;
    }
    static formatDate(date) {
        let d = new Date(date),
            month = '' + (d.getMonth() + 1),
            day = '' + d.getDate(),
            year = d.getFullYear();

        if (month.length < 2)
            month = '0' + month;
        if (day.length < 2)
            day = '0' + day;

        return [year, month, day].join('-');
    }

    static convertCountryName(countryName, countryId) {
        switch (countryId) {
            case 318: return "United States of America";
            default:
                switch (countryName) {
                    case 'US':
                        return "United States of America";
                    case 'CA':
                        return "Canada";
                    default:
                        return countryName;
                }
        }
    }

    static getImage(entity, type, size) {
        size = (size == null ? Infinity : size);
        if (entity == null || entity.images == null) {
            return null;
        }

        let current;
        entity.images.forEach((img) => {
            if (img.type == type) {
                if (!current) {
                    current = img;
                } else {
                    if (img.width > size && img.height > size) {
                        if (img.width < current.width && img.height < current.height) {
                            current = img;
                        }
                    }
                }
            }
        });
        return current ? current.url : null;
    }

}
class ParryggWrapper extends WebsiteWrapper{
    static ENDPOINT = "https://grpcweb.parry.gg";
    constructor() {
        super();
        this.parrygg = require('@parry-gg/client');
        this.emitter = new (require("events"))();
        this.token = "";
        this.streamQueuePollInterval = 6000; // ms (6s)
        this.cacheMaxAge = 60000; // ms (60s)
        this.timers = {};
        this.cache = { sets: {}, tournaments: {}, players: {} };
        this.events = {};


        this.requestCounter = [];
        this.rateLimitTimeFrame = 60 * 1000; //  = seconds
        this.rateLimitAmount = 80; //  = requests

        this.selectedTournament = null;
        this.selectedStream = null;
        this.brackets = [];
        this.streamQueueSetIdList = [];
        this.client = new this.parrygg.UserServiceClient(ParryggWrapper.ENDPOINT);
        this.event = null;
        this.tournamentClient = new this.parrygg.TournamentServiceClient(ParryggWrapper.ENDPOINT);
        this.bracketClient = new this.parrygg.BracketServiceClient(ParryggWrapper.ENDPOINT);
        this.userClient = new this.parrygg.UserServiceClient(ParryggWrapper.ENDPOINT);
        this.matchClient = new this.parrygg.MatchServiceClient(ParryggWrapper.ENDPOINT);
        this.tournamentObject = null;
        this.eventClient = new this.parrygg.EventServiceClient(ParryggWrapper.ENDPOINT);
        this.phaseClient = new this.parrygg.PhaseServiceClient(ParryggWrapper.ENDPOINT);
    }

    get createAuthMetadata() {
        return {
            'X-API-KEY': this.token,
        };
    }

    set Token(val) {
        this.token = val.trim();
    }

    set SelectedTournament(val) {
        if (this.selectedTournament == val) { return; }
        this.selectedTournament = val;
        this.SelectedStream = null;
    }

    static comparePlayer(local, remote, includeIgnore) {
        // normalize remote structure to local structure
        remote = this.convertPlayerStructure(remote);

        let diffs = [];

        for (let key in local) {
            if (!remote.hasOwnProperty(key)) { continue }

            let ignored = false;
            if (local.hasOwnProperty("parryggIgnore") && local.parryggIgnore.hasOwnProperty(key)) {
                ignored = (local.parryggIgnore[key] == remote[key]);
            }

            let compareResult = false;
            switch (key) {
                case "country":
                function recursiveNationCompare(country, countryName) {
                    if (country == null) { return false; }
                    if (country.name == countryName) { return true; }
                    if (country.nation == null || country.nation.length == 0) { return false; }
                    return recursiveNationCompare(country.nation, countryName);
                }
                    compareResult = !recursiveNationCompare(local[key], remote[key]);
                    break;
                case "region":
                    compareResult = local[key].name != remote[key];
                    break;
                default: compareResult = local[key] != remote[key]; break;
            }

            if (compareResult) {
                if (!ignored || includeIgnore) {
                    diffs.push({ "field": key, "local": local[key], "parrygg": remote[key], "ignored": ignored });
                }
            }
        }
        return diffs;
    }
    static convertPlayerStructure(data) {
        let fixed = {
            "name": data.gamerTag,
            "pronoun": "",
            "firstname": "",
            "lastname": "",
            "country": "",
            "city": "",
            // "twitter": "",
            // "twitch": "",
            // "steam": "",
            // "birthday": ""
        };
        if (data.player) {
            fixed.name = data.gamerTag;
        }
        fixed.pronoun = data.pronouns;
        fixed.lastname = data.lastName;
        fixed.firstname = data.firstName;
        fixed.city = data.locationCity;
        fixed.country = data.country;
        fixed.region = data.state;
        // console.log(data);
        // console.log(fixed);
        return fixed;
    }

    getSetRoundName(set, bracket) {
        var matchList = bracket.matchesList;
        //get highest round number for winners and losers
        var highestWinnersRound = 0;
        var highestLosersRound = 0;
        matchList.forEach(match => {
            if(!match.grandFinals) {
                if (match.winnersSide) {
                    if (match.round > highestWinnersRound) {
                        highestWinnersRound = match.round;
                    }
                } else {
                    if (match.round > highestLosersRound) {
                        highestLosersRound = match.round;
                    }
                }
            }
        });
        if (bracket.type == parrygg.parrygg.BracketType.BRACKET_TYPE_DOUBLE_ELIMINATION) {
            if (set.grandFinals) {
                return "Grand Finals";
            } else if(set.winnersSide){
                if(set.round === highestWinnersRound){
                    return "Winners Final";
                } else if(set.round === highestWinnersRound -1){
                    return "Winners Semi-Final";
                } else if(set.round === highestWinnersRound -2){
                    return "Winners Quarter-Final";
                }
                return "Winners Round " + set.round;
            } else {
                if(set.round === highestLosersRound){
                    return "Losers Final";
                } else if(set.round === highestLosersRound -1){
                    return "Losers Semi-Final";
                } else if(set.round === highestLosersRound -2){
                    return "Losers Quarter-Final";
                } else if(set.round === highestLosersRound -3){
                    return "Losers Top 8";
                }
                return "Losers Round " + set.round;
            }
        } else if(bracket.type === parrygg.parrygg.BracketType.BRACKET_TYPE_SINGLE_ELIMINATION) {
            return "Round " + set.round;
        } else if(bracket.type === parrygg.parrygg.BracketType.BRACKET_TYPE_ROUND_ROBIN) {
            var round = bracket.name;
            if(round == "Bracket"){
                round = "Round Robin";
            }
            return round;
        }
        return "";
    }

    getAdditionalTournamentInfos(tournament) {
        return {
            slug: this.getSlug(tournament),
            pictures: this.getTournamentPictures(tournament)
        }
    }

    async getAdditionalUserInfos(user) {
        let additional =  {
            country: await this.convertCountry(user.locationCountry),
            state: await this.convertRegion(user.locationCountry, user.locationState),
            pictures: this.getUserPictures(user)
        }
        return await additional;
    }
    async convertRegion(countryCode, regionCode){
        // var country = await this.convertCountry(countryCode);
        var json = await fetch(`./json/states.json`);
        var states = await json.json();
        var region = states.filter((state) => state.iso2 === regionCode && state.country_code === countryCode);
        // console.log(region);
        if(region[0]){
            return region[0].name;
        }
        return null;
    }
    async convertCountry(countryCode){
        var json = await fetch(`./json/countries.json`);
        json = await json.json();
        var country = await json.filter((country) => country.iso2 === countryCode);
        // console.log(country);
        if(country[0]){
            return country[0].name;
        }
        return null;
    }

    getSlug(tournament) {
        var slug =
            tournament.slugsList.find(
                (slug) => slug.type === this.parrygg.SlugType.SLUG_TYPE_CUSTOM,
            )?.slug || '';
        if(slug === ''){
            slug = tournament.slugsList.find(
                (slug) => slug.type === this.parrygg.SlugType.SLUG_TYPE_PRIMARY,
            )?.slug || '';
        }
        return slug;
    }

    getTournamentPictures(tournament) {
        return{
            'banner': tournament.imagesList.find(
                (image) => image.type === this.parrygg.ImageType.IMAGE_TYPE_BANNER,
            )?.url || ''
        };

    }

    getUserPictures(tournament) {
        return{
            'banner': tournament.imagesList.find(
                (image) => image.type === this.parrygg.ImageType.IMAGE_TYPE_BANNER,
            )?.url || '',
            'avatar': tournament.imagesList.find(
                (image) => image.type === this.parrygg.ImageType.IMAGE_TYPE_AVATAR,
            )?.url || ''
        };

    }

    async findTournaments(name){
        const request = new this.parrygg.GetTournamentsRequest();
        const tournamentsFilter = new this.parrygg.TournamentsFilter();
        const options = new this.parrygg.GetTournamentsOptions();
        options.setReturnPermissions(true);
        request.setFilter(tournamentsFilter);
        request.setOptions(options);
        try {
            const response = await this.tournamentClient.getTournaments(
                request,
                this.createAuthMetadata,
            );
            return response.getTournamentsList()
                .sort((a, b) => {
                    return b.getStartDate().getSeconds() - a.getStartDate().getSeconds();
                })
                .map((tournament) => (Object.assign(tournament.toObject(), this.getAdditionalTournamentInfos(tournament.toObject()))))
                .filter((tournament) => tournament.name.toLowerCase().includes(name.toLowerCase()));
        }catch (error) {

        }
        return [];
    }

    async getPhase(phaseId, cacheMaxAge) {
        if (phaseId == null) { return; }
        let phase = this.getCache("phase-parry", phaseId, cacheMaxAge);
        if( phase == null) {
            const request = new this.parrygg.GetPhaseRequest();
            request.setId(phaseId);
            try {

                const response = await this.phaseClient.getPhase(
                    request,
                    this.createAuthMetadata,
                );
                this.setCache("phase-parry", phaseId, response.getPhase().toObject());
                return response.getPhase().toObject();
            } catch (error) {
                return null;
            }
        }
        return phase;
    }

    async getTournament(tournamentSlug, cacheMaxAge) {
        tournamentSlug = tournamentSlug == null ? this.selectedTournament : tournamentSlug;
        if (tournamentSlug == null) { return; }
        let tournament = this.getCache("tournament-parry", tournamentSlug, cacheMaxAge);
        if( tournament == null) {
            const request = new this.parrygg.GetTournamentRequest();
            request.setTournamentSlug(tournamentSlug);
            try {

                const response = await this.tournamentClient.getTournament(
                    request,
                    this.createAuthMetadata,
                );
                var returnObject = Object.assign(response.getTournament().toObject(), this.getAdditionalTournamentInfos(response.getTournament().toObject()));
                this.setCache("tournament-parry", tournamentSlug, returnObject);
                return returnObject;
            } catch (error) {
                return null;
            }
        }
        return tournament;
    }
    async getTournamentById(tournamentId, cacheMaxAge) {
        if (tournamentId == null) { return; }
        let tournament = this.getCache("tournamentId-parry", tournamentId, cacheMaxAge);
        if( tournament == null) {
            const request = new this.parrygg.GetTournamentRequest();
            const tournamentIdentifier = new this.parrygg.TournamentIdentifier();
            tournamentIdentifier.setId(tournamentId);
            request.setTournamentIdentifier(tournamentIdentifier);
            try {

                const response = await this.tournamentClient.getTournament(
                    request,
                    this.createAuthMetadata,
                );
                var returnObject = Object.assign(response.getTournament().toObject(), this.getAdditionalTournamentInfos(response.getTournament().toObject()));
                this.setCache("tournamentId-parry", tournamentId, returnObject);
                return returnObject;
            } catch (error) {
                return null;
            }
        }
        return tournament;
    }
    async findParticipants(tag) {
        const request = new this.parrygg.GetUsersRequest();
        // request.setTournamentId(this.selectedTournament.id);
        const filter = new this.parrygg.UsersFilter();
        filter.setGamerTag(tag);
        request.setFilter(filter);
        try {
            const response = await this.userClient.getUsers(
                request,
                this.createAuthMetadata,
            );
            var returns =  Promise.all(response.getUsersList()
                .map(async (user) => await Object.assign(user.toObject(), await this.getAdditionalUserInfos(user.toObject()))));
            return await returns;

        } catch (error) {}
            return [];
        }
    async getPlayer(playerId, cacheMaxAge) {
        if (playerId == null) {
            return null;
        }
        let player = this.getCache("player-parry", playerId, cacheMaxAge);
        if (player == null) {
            const request = new this.parrygg.GetUserRequest();
            request.setId(playerId);
            try {
                const response = await this.userClient.getUser(
                    request,
                    this.createAuthMetadata,
                );
                player = response.getUser().toObject();
                player = await Object.assign(player, await this.getAdditionalUserInfos(player));
                this.setCache("player-parry", playerId, player);
            }
            catch (error) {
                return null;
            }
        }

        return player;
    }

    async setBrackets() {
        this.brackets = [];
        var tournament = await this.getTournament(this.selectedTournament);
        var tournamentSlug = await tournament.slug;
        var events = [];
        tournament.eventsList.forEach(event => {
            var phases = [];
            event.phasesList.forEach(phase => {
                var brackets = [];
                phase.bracketsList.forEach(bracket => {
                    brackets.push(bracket.id);
                })
                phases[phase.id] = {name: phase.slug, brackets: brackets};
            })
            events[event.id] = {name: event.name, phases: phases};
        })
        this.brackets = {tournament: tournamentSlug, events: events};
    }

    async getSetsFromStreamQueue() {
        var sets = [];
        if (!this.brackets || !this.brackets.events) {
            return sets;
        }

        // Iterate events (works for arrays or objects)
        for (const [eventId, event] of Object.entries(this.brackets.events)) {
            if (!event.phases) { continue; }
            // Iterate phases (works for arrays or objects)
            for (const [phaseId, phase] of Object.entries(event.phases)) {
                const bracketIds = phase.brackets;
                if (!Array.isArray(bracketIds) || bracketIds.length === 0) { continue; }

                // Create promises for all bracket fetches in this phase
                const bracketPromises = bracketIds.map(async (bracketId) => {
                    var bracket = await this.getBracket(bracketId);
                    if( bracket === null) {
                        return null;
                    }
                    var matches =  bracket.matchesList;
                    var rightStates = [this.parrygg.MatchState.MATCH_STATE_PENDING, this.parrygg.MatchState.MATCH_STATE_IN_PROGRESS, this.parrygg.MatchState.MATCH_STATE_READY];
                    //
                    return matches.filter(match => rightStates.includes(match.state)).map(match => Object.assign(match, {event: {id: eventId, name: event.name}, phase: {id: phaseId, name: phase}, bracket: {id: bracketId}, tournament: {id: this.tournamentObject.id, name: this.tournamentObject.name}}));
                });

                // Wait for all brackets in this phase and add successful results
                const results = await Promise.all(bracketPromises);
                results.forEach(r => { if (r) {
                    r.forEach(bracket => {
                      sets.push(bracket);
                    })} });
            }
        }
        return await sets;

    }

    async getEntrantFromSeedAndBracket(slotId, bracketId, cacheMaxAge) {
        var participant = {
            id: null,
            name: "TBD",
        };
        if (slotId == null || bracketId == null) {
            return participant;
        }
        let participantNew = this.getCache("entrantfromseedandbracket-parry", slotId + '|' + bracketId, cacheMaxAge);
        if (participantNew == null) {
            var bracket = await this.getBracket(bracketId);
            if( bracket !== null) {
                participantNew = bracket.seedsList.find(seed => seed.id === slotId);
                if(participantNew == undefined){
                    return participant;
                }
                participantNew = participantNew.eventEntrant;
                if(participantNew.name == ""){
                    if(participantNew.entrant.usersList.length > 0){
                        participantNew.name = participantNew.entrant.usersList[0].gamerTag;
                    }
                }
                this.setCache("entrantfromseedandbracket-parry", slotId + '|' + bracketId, participantNew);
            }
        }

        return participantNew;
    }
    async getBracket(bracketId, cacheMaxAge) {
        if (bracketId == null) {
            return null;
        }
        var bracket = this.getCache("bracket-parry", bracketId, cacheMaxAge);
        if (bracket == null) {
            const request = new this.parrygg.GetBracketRequest();
            request.setId(bracketId);

            try {

                const response = await this.bracketClient.getBracket(
                    request,
                    this.createAuthMetadata,
                );
                bracket =  response.getBracket().toObject();
                this.setCache("bracket-parry", bracketId, bracket);
            }
            catch (error) {
                return null;
            }
        }
        // console.log(bracket);
        return bracket;
    }
    async getEvent(eventId, cacheMaxAge) {
        if (eventId == null) {
            return null;
        }
        var event = this.getCache("event-parry", eventId, cacheMaxAge);
        if (event == null) {
            const request = new this.parrygg.GetEventRequest();
            request.setId(eventId);

            try {

                const response = await this.eventClient.getEvent(
                    request,
                    this.createAuthMetadata,
                );
                event =  response.getEvent().toObject();
                this.setCache("event-parry", eventId, event);
            }
            catch (error) {
                return null;
            }
        }
        // console.log(event);
        return event;
    }

    async fetchStreamQueue() {
        // if (this.selectedTournament == null || this.selectedStream == null) {
        if (this.selectedTournament == null) {
            this.stopStreamQueuePolling();
        }

        var sets = await this.getSetsFromStreamQueue();
        // if (res.tournament.streams.some(x => x.id == this.selectedStream) == false) {
        //     // this tournament does not have a stream with selectedStream slug
        //     this.selectedStream = null;
        //     this.stopStreamQueuePolling();
        // }

        // let queues = res.tournament.streamQueue;
        // if (queues != null && queues.length > 0) {
        //     let queue = queues.find(x => x.stream.id == this.selectedStream);
        //     if (queue != null && queue.sets != null && queue.sets.length > 0) {
        //         sets = queue.sets;
        //     }
        // }

        if (sets.map(x => x.id).join("-") != this.streamQueueSetIdList.join("-")) {
            this.streamQueueSetIdList = sets.map(x => x.id);
            this.emit("streamqueuechanged", sets);
        }

        return sets;
    }

    async getSet(setId, cacheMaxAge) {
        if (setId == null) { return null; }
        let set = this.getCache("set-parry", setId, cacheMaxAge);
        if (set == null) {
            const request = new this.parrygg.GetMatchRequest();
            request.setId(setId);
            try {
                const response = await this.matchClient.getMatch(
                    request,
                    this.createAuthMetadata,
                );
                set = Object.assign(response.getMatch().toObject(), {});
                this.setCache("set-parry", setId, set);
            } catch (error) {
                console.error(error);
                return null;
            }
        }
        return set;
    }

    startStreamQueuePolling(pollInterval) {
        this.stopStreamQueuePolling();

        this.emit("streamschanged", 'no stream rn');

        this.fetchStreamQueue();
        this.timers.streamQueuePoll = setInterval(() => this.fetchStreamQueue(), pollInterval || this.streamQueuePollInterval);
    }

    stopStreamQueuePolling() {
        if (this.timers.hasOwnProperty("streamQueuePoll")) {
            clearTimeout(this.timers.streamQueuePoll);
            this.emit("streamschanged", null);
        }
    }
}