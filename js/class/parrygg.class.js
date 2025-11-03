import {
    TournamentServiceClient,
    GetTournamentRequest,
    GetTournamentsRequest,
    GetTournamentsOptions,
    TournamentsFilter,
    AdminFilter,
    AdminFilterPermission,
    MatchServiceClient,
    StartMatchRequest,
    SetMatchResultRequest,
    MatchResult,
    MatchResultSlotMutation,
    SlugType,
    MatchState,
    BracketServiceClient,
    GetBracketRequest,
    EventServiceClient,
    GetEventRequest,
    PhaseServiceClient,
    GetPhaseRequest,
    Entrant,
    Tournament,
    Match,
    Phase,
    Event,
    Seed,
    BracketType,
} from '@parry-gg/client';
class ParryggWrapper {
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
        this.client = new UserServiceClient('https://grpcweb.parry.gg');
        this.event = null;
        this.tournamentClient = new TournamentServiceClient('https://grpcweb.parry.gg');
    }

    set Token(val) {
        this.token = val.trim();
    }

    set SelectedTournament(val) {
        if (this.selectedTournament == val) { return; }
        this.selectedTournament = val;
        this.SelectedStream = null;
    }

    async findTournaments(term){
        const request = new GetTournamentsRequest();
        const tournamentsFilter = new TournamentsFilter();
        const adminFilter = new AdminFilter();
        const options = new GetTournamentsOptions();
        this.tournamentClient.getTournaments(

        )
    }

}