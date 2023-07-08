/* --exclude-from-all */

class SmashggWrapper {
	constructor() {
		this.emitter = new (require("events"))();
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
		let tournament = this.getCache("tournament", tournamentSlug, cacheMaxAge);
		if (tournament == null) {
			var res = await this.query(`query ($slug: String!) {
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
			this.setCache("tournament", tournamentSlug, tournament);
		}
		return tournament;
	}

	async getTournamentParticipants(tournamentSlug, cacheMaxAge) {
		tournamentSlug = tournamentSlug == null ? this.selectedTournament : tournamentSlug;
		if (tournamentSlug == null) { return []; }
		let participants = this.getCache("getTournamentParticipants", tournamentSlug, cacheMaxAge);
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
			this.setCache("getTournamentParticipants", tournamentSlug, participants);
		}
		return participants;
	}

	async getSet(setId, cacheMaxAge) {
		if (setId == null) { return null; }
		let set = this.getCache("set", setId, cacheMaxAge);
		if (set == null) {
			var res = await this.query(`query ($id: ID!) {
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
			this.setCache("set", setId, set);
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
					${this.constructor.GRAPHQL_FIELDS.TOURNAMENT}
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
		let player = this.getCache("player", playerId, cacheMaxAge);
		if (player == null) {
			var res = await this.query(`query ($id: ID!) {
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
			this.setCache("player", playerId, player);
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
				${this.constructor.GRAPHQL_FIELDS.TOURNAMENT}
			}
		}`, { "term": term });
		return res.tournament;
	}

	async fetchStreamQueue() {

		if (this.selectedTournament == null || this.selectedStream == null) {
			this.stopStreamQueuePolling();
		}

		var res = await this.query(`query ($tourneySlug: String!){
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
							}
						}
						fullRoundText identifier round
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
		const fetchResponse = await fetch(this.constructor.ENDPOINT, {
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

	on(...args) {
		this.emitter.on(...args);
	}

	once(...args) {
		this.emitter.once(...args);
	}

	emit(...args) {
		this.emitter.emit(...args);
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
		var d = new Date(date),
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
			default: return countryName;
		}
	}

	static getImage(entity, type, size) {
		size = (size == null ? Infinity : size);
		if (entity == null || entity.images == null) {
			return null;
		}

		var current;
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

SmashggWrapper.ENDPOINT = "https://api.start.gg/gql/alpha";

SmashggWrapper.GROUP_TYPE = {
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

SmashggWrapper.EVENT_TYPE = {
	SINGLES: 1,
	TEAMS: 5,
	CREWS: 3,

	1: "SINGLES",
	5: "TEAMS",
	3: "CREWS"
}

SmashggWrapper.GRAPHQL_FIELDS = {
	STREAM: `id streamSource streamType streamName isOnline followerCount streamStatus streamLogo`,
	TOURNAMENT: `id name hashtag slug shortSlug startAt endAt state timezone venueAddress venueName images { id width height type url }`,
}