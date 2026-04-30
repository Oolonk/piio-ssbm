import type { EventEmitter } from 'events';

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

interface CacheStore {
  [key: string]: CacheEntry;
}

export class WebsiteWrapper {
  protected emitter: EventEmitter;
  streamQueuePollInterval: number;
  cacheMaxAge: number;
  protected timers: Record<string, ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>>;
  protected cache: Record<string, CacheStore>;
  protected requestCounter: number[];
  protected rateLimitTimeFrame: number;
  protected rateLimitAmount: number;

  constructor() {
    this.emitter = new (require('events') as { new(): EventEmitter })();
    this.streamQueuePollInterval = 6000;
    this.cacheMaxAge = 60000;
    this.timers = {};
    this.cache = { sets: {}, tournaments: {}, players: {} };
    this.requestCounter = [];
    this.rateLimitTimeFrame = 60 * 1000;
    this.rateLimitAmount = 80;
  }

  stopStreamQueuePolling(): void {
    if (Object.prototype.hasOwnProperty.call(this.timers, 'streamQueuePoll')) {
      clearTimeout(this.timers.streamQueuePoll as ReturnType<typeof setTimeout>);
      this.emit('streamschanged', null);
    }
  }

  getCache<T>(type: string, id: string | number, maxAge?: number | null): T | null {
    const age = maxAge == null ? this.cacheMaxAge : maxAge;
    if (
      !Object.prototype.hasOwnProperty.call(this.cache, type) ||
      !Object.prototype.hasOwnProperty.call(this.cache[type], id) ||
      this.cache[type][String(id)].timestamp + age < Date.now()
    ) {
      return null;
    }
    return this.cache[type][String(id)].data as T;
  }

  setCache(type: string, id: string | number, data: unknown): void {
    if (data == null || id == null || type == null) return;
    if (!Object.prototype.hasOwnProperty.call(this.cache, type)) {
      this.cache[type] = {};
    }
    this.cache[type][String(id)] = { data, timestamp: Date.now() };
  }

  destroy(): void {
    this.stopStreamQueuePolling();
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  once(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.once(event, listener);
  }

  emit(event: string, ...args: unknown[]): void {
    this.emitter.emit(event, ...args);
  }

  protected _requestCountIncrease(): void {
    this.requestCounter.push(Date.now());
    this._requestCountCleanUp();
  }

  protected _requestCountCleanUp(): void {
    this.requestCounter = this.requestCounter.filter(
      (x) => x > Date.now() - this.rateLimitTimeFrame
    );
  }
}

// ---------------------------------------------------------------------------
// SmashggWrapper
// ---------------------------------------------------------------------------

interface SmashggPlayer {
  id: number;
  gamerTag: string;
  prefix?: string;
  user?: {
    name?: string;
    genderPronoun?: string;
    birthday?: string;
    location?: { city?: string; country?: string; countryId?: number; state?: string; stateId?: number };
    authorizations?: Array<{ externalUsername: string; type: string }>;
    images?: Array<{ type: string; url: string; width: number; height: number }>;
  };
  twitchStream?: string;
  twitterHandle?: string;
  city?: string;
}

interface SmashggSet {
  id: string | number;
  fullRoundText?: string;
  round?: number;
  identifier?: string;
  slots?: Array<{
    entrant?: {
      id: number;
      name: string;
      participants?: Array<{ gamerTag: string; player?: { id: number; gamerTag: string } }>;
    };
  }>;
  phaseGroup?: {
    id: number;
    displayIdentifier?: string;
    phase?: { id: number; name?: string };
  };
  event?: {
    id: number;
    name?: string;
    tournament?: { shortSlug?: string; hashtag?: string; name?: string };
  };
}

export class SmashggWrapper extends WebsiteWrapper {
  static readonly ENDPOINT = 'https://api.start.gg/gql/alpha';

  token: string;
  selectedTournament: string | null;
  selectedStream: number | null;
  private streamQueueSetIdList: (string | number)[];

  constructor() {
    super();
    this.token = '';
    this.selectedTournament = null;
    this.selectedStream = null;
    this.streamQueueSetIdList = [];
  }

  set Token(val: string) {
    this.token = val.trim();
  }

  set SelectedTournament(val: string | null) {
    if (this.selectedTournament === val) return;
    this.selectedTournament = val;
    this.SelectedStream = null;
  }

  set SelectedStream(val: number | null) {
    if (this.selectedStream === val) return;
    this.selectedStream = val;
    if (this.selectedStream === null) {
      this.stopStreamQueuePolling();
    }
  }

  async getTournament(tournamentSlug?: string | null, cacheMaxAge?: number): Promise<unknown> {
    const slug = tournamentSlug ?? this.selectedTournament;
    if (slug == null) return undefined;
    let tournament = this.getCache('tournament-smashgg', slug, cacheMaxAge);
    if (tournament == null) {
      try {
        const res = await this.query<{ tournament: unknown }>(
          `query ($slug: String!) { tournament(slug: $slug){ id name city countryCode createdAt hashtag slug startAt endAt streams { id streamId streamName streamSource } } }`,
          { slug }
        );
        if (res == null) return null;
        tournament = (res as { tournament: unknown }).tournament;
        this.setCache('tournament-smashgg', slug, tournament);
      } catch {
        return null;
      }
    }
    return tournament;
  }

  async getSet(setId: number | string, cacheMaxAge?: number): Promise<SmashggSet | null> {
    if (setId == null) return null;
    let set = this.getCache<SmashggSet>('set-smashgg', setId, cacheMaxAge);
    if (set == null) {
      const res = await this.query<{ set: SmashggSet }>(
        `query ($id: ID!) { set(id: $id){ id fullRoundText identifier round state winnerId slots { id slotIndex entrant { id name participants { id gamerTag player { id gamerTag } } } } phaseGroup { id displayIdentifier phase { id name } } event { id name tournament { shortSlug hashtag name } } } }`,
        { id: setId }
      );
      if (res == null) return null;
      set = res.set;
      this.setCache('set-smashgg', setId, set);
    }
    return set;
  }

  async getPlayer(playerId: number | string | null, cacheMaxAge?: number): Promise<SmashggPlayer | null> {
    if (playerId == null) return null;
    let player = this.getCache<SmashggPlayer>('player-smashgg', String(playerId), cacheMaxAge);
    if (player == null) {
      const res = await this.query<{ player: SmashggPlayer }>(
        `query ($id: ID!) { player(id: $id){ id gamerTag user { name genderPronoun birthday location { city country countryId state stateId } authorizations { externalUsername type } images { type url } } } }`,
        { id: playerId }
      );
      if (res == null) return null;
      player = res.player;
      if (player?.user?.location) {
        player.user.location.country = SmashggWrapper.convertCountryName(
          player.user.location.country ?? '',
          player.user.location.countryId ?? 0
        );
      }
      this.setCache('player-smashgg', String(playerId), player);
    }
    return player;
  }

  async fetchStreamQueue(): Promise<SmashggSet[] | null> {
    if (this.selectedTournament == null || this.selectedStream == null) {
      this.stopStreamQueuePolling();
    }
    const res = await this.query<{ tournament: { streams: Array<{ id: number }>; streamQueue: Array<{ stream: { id: number }; sets: SmashggSet[] }> } }>(
      `query ($tourneySlug: String!){ tournament(slug:$tourneySlug){ streams { id } streamQueue { stream { id streamSource streamName } sets { id slots { entrant { name participants { gamerTag prefix } } } fullRoundText identifier round phaseGroup { displayIdentifier phase { name } } } } } }`,
      { tourneySlug: this.selectedTournament }
    );
    if (res == null) return null;

    if (!res.tournament.streams.some((x) => x.id === this.selectedStream)) {
      this.selectedStream = null;
      this.stopStreamQueuePolling();
    }

    let sets: SmashggSet[] = [];
    const queues = res.tournament.streamQueue;
    if (queues?.length > 0) {
      const queue = queues.find((x) => x.stream.id === this.selectedStream);
      if (queue && queue.sets && queue.sets.length > 0) sets = queue.sets;
    }

    const ids = sets.map((x) => x.id).join('-');
    if (ids !== this.streamQueueSetIdList.join('-')) {
      this.streamQueueSetIdList = sets.map((x) => x.id);
      this.emit('streamqueuechanged', sets);
    }
    return sets;
  }

  startStreamQueuePolling(pollInterval?: number): void {
    this.stopStreamQueuePolling();
    this.query<{ stream: { id: number; streamName: string } }>(
      `query ($id: ID!){ stream(id:$id){ id streamName } }`,
      { id: this.selectedStream }
    ).then((res) => {
      this.emit('streamschanged', res ? res.stream : null);
    });
    this.fetchStreamQueue();
    this.timers.streamQueuePoll = setInterval(
      () => this.fetchStreamQueue(),
      pollInterval ?? this.streamQueuePollInterval
    );
  }

  query<T = unknown>(query: string, vars?: Record<string, unknown>, opName?: string): Promise<T | null> {
    return new Promise((resolve) => {
      if (!this.token || this.token.length < 4) {
        this.emit('fetch-error', { type: 'invalid-token', data: 'No authentication token provided' });
        return resolve(null);
      }
      this.request({ query, operationName: opName, variables: vars })
        .then((res) => {
          if (!res) return resolve(null);
          const r = res as Record<string, unknown>;
          if (r['errors']) {
            (r['errors'] as Array<{ message: string }>).forEach((error) => {
              this.emit('fetch-error', { type: 'syntax-error', data: error.message });
            });
            return resolve(null);
          }
          if (r['success'] === false) {
            const msg = String(r['message'] ?? '');
            const type = msg.includes('Rate limit') ? 'rate-limit-exceeded'
              : msg.includes('query complexity') ? 'query-too-complex'
              : msg.includes('Invalid authentication') ? 'invalid-token'
              : 'unknown';
            this.emit('fetch-error', { type, data: msg });
            return resolve(null);
          }
          this._requestCountIncrease();
          resolve((r['data'] as T) ?? null);
        })
        .catch((e) => {
          this.emit('fetch-error', { type: 'unknown', data: e });
          resolve(null);
        });
    });
  }

  async request(args: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await fetch(SmashggWrapper.ENDPOINT, {
        method: 'POST',
        cache: 'no-cache',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(args),
      });
      return await response.json();
    } catch {
      return null;
    }
  }

  static comparePlayer(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
    includeIgnore?: boolean
  ): Array<{ field: string; local: unknown; smashgg: unknown; ignored: boolean }> {
    const normalized = SmashggWrapper.convertPlayerStructure(remote);
    const diffs: Array<{ field: string; local: unknown; smashgg: unknown; ignored: boolean }> = [];

    for (const key in local) {
      if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
      const ignored =
        Object.prototype.hasOwnProperty.call(local, 'smashggIgnore') &&
        Object.prototype.hasOwnProperty.call((local.smashggIgnore as Record<string, unknown>), key) &&
        (local.smashggIgnore as Record<string, unknown>)[key] === normalized[key];

      const differs = local[key] !== normalized[key];
      if (differs && (!ignored || includeIgnore)) {
        diffs.push({ field: key, local: local[key], smashgg: normalized[key], ignored });
      }
    }
    return diffs;
  }

  static convertPlayerStructure(data: Record<string, unknown>): Record<string, unknown> {
    const d = data as unknown as SmashggPlayer & { player?: { gamerTag: string } };
    const fixed: Record<string, unknown> = {
      name: d.player?.gamerTag ?? d.gamerTag ?? '',
      pronoun: '',
      firstname: '',
      lastname: '',
      country: '',
      city: '',
      twitter: '',
      twitch: '',
      steam: '',
      birthday: '',
    };
    if (d.user) {
      fixed.pronoun = d.user.genderPronoun ?? '';
      if (d.user.name) {
        const parts = d.user.name.split(' ');
        fixed.lastname = parts.length > 1 ? parts.pop()! : '';
        fixed.firstname = parts.join(' ');
      }
      d.user.authorizations?.forEach((acc) => {
        const k = acc.type.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(fixed, k)) {
          fixed[k] = acc.externalUsername;
        }
      });
      if (d.user.location) {
        fixed.country = d.user.location.country ?? '';
        fixed.city = d.user.location.city ?? '';
      }
    }
    return fixed;
  }

  static convertCountryName(countryName: string, countryId: number): string {
    if (countryId === 318 || countryName === 'US') return 'United States of America';
    if (countryName === 'CA') return 'Canada';
    return countryName;
  }
}

// ---------------------------------------------------------------------------
// ParryggWrapper
// ---------------------------------------------------------------------------

export class ParryggWrapper extends WebsiteWrapper {
  static readonly ENDPOINT = 'https://grpcweb.parry.gg';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parrygg: any;
  token: string;
  selectedTournament: string | null;
  selectedStream: string | null;
  hideNotReadySets: boolean;
  private streamQueueSetIdList: string[];
  brackets: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected tournamentClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected bracketClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected userClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected matchClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected eventClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected phaseClient: any;

  constructor() {
    super();
    this.parrygg = require('@parry-gg/client');
    this.emitter = new (require('events') as { new(): EventEmitter })();
    this.token = '';
    this.selectedTournament = null;
    this.selectedStream = null;
    this.hideNotReadySets = true;
    this.streamQueueSetIdList = [];
    this.brackets = [];
    this.client = new this.parrygg.UserServiceClient(ParryggWrapper.ENDPOINT);
    this.tournamentClient = new this.parrygg.TournamentServiceClient(ParryggWrapper.ENDPOINT);
    this.bracketClient = new this.parrygg.BracketServiceClient(ParryggWrapper.ENDPOINT);
    this.userClient = new this.parrygg.UserServiceClient(ParryggWrapper.ENDPOINT);
    this.matchClient = new this.parrygg.MatchServiceClient(ParryggWrapper.ENDPOINT);
    this.eventClient = new this.parrygg.EventServiceClient(ParryggWrapper.ENDPOINT);
    this.phaseClient = new this.parrygg.PhaseServiceClient(ParryggWrapper.ENDPOINT);
  }

  get createAuthMetadata(): Record<string, string> {
    return { 'X-API-KEY': this.token };
  }

  set Token(val: string) {
    this.token = val.trim();
  }

  set SelectedTournament(val: string | null) {
    if (this.selectedTournament === val) return;
    this.selectedTournament = val;
    this.SelectedStream = null;
  }

  set SelectedStream(val: string | null) {
    this.selectedStream = val;
  }

  async getTournament(tournamentSlug?: string | null, cacheMaxAge?: number): Promise<unknown> {
    const slug = tournamentSlug ?? this.selectedTournament;
    if (slug == null) return undefined;
    let tournament = this.getCache('tournament-parry', slug, cacheMaxAge);
    if (tournament == null) {
      const request = new this.parrygg.GetTournamentRequest();
      request.setTournamentSlug(slug);
      try {
        const response = await this.tournamentClient.getTournament(request, this.createAuthMetadata);
        tournament = Object.assign(
          response.getTournament().toObject(),
          this.getAdditionalTournamentInfos(response.getTournament().toObject())
        );
        this.setCache('tournament-parry', slug, tournament);
      } catch {
        return null;
      }
    }
    return tournament;
  }

  async getSet(setId: string, cacheMaxAge?: number): Promise<unknown> {
    if (setId == null) return null;
    let set = this.getCache('set-parry', setId, cacheMaxAge);
    if (set == null) {
      const request = new this.parrygg.GetMatchRequest();
      request.setId(setId);
      try {
        const response = await this.matchClient.getMatch(request, this.createAuthMetadata);
        set = Object.assign(
          response.getMatch().toObject(),
          await this.getAdditionalSetInfos(response.getMatch().toObject())
        );
        this.setCache('set-parry', setId, set);
      } catch (error) {
        console.error(error);
        return null;
      }
    }
    return set;
  }

  async getPlayer(playerId: string | null, cacheMaxAge?: number): Promise<unknown> {
    if (playerId == null) return null;
    let player = this.getCache('player-parry', playerId, cacheMaxAge);
    if (player == null) {
      const request = new this.parrygg.GetUserRequest();
      request.setId(playerId);
      try {
        const response = await this.userClient.getUser(request, this.createAuthMetadata);
        player = response.getUser().toObject();
        player = Object.assign(player as object, await this.getAdditionalUserInfos(player as Record<string, unknown>));
        this.setCache('player-parry', playerId, player);
      } catch {
        return null;
      }
    }
    return player;
  }

  async getEntrantFromSeedAndBracket(
    slotId: string | null,
    bracketId: string | null,
    cacheMaxAge?: number
  ): Promise<{ id: string | null; name: string }> {
    const fallback = { id: null, name: 'N/A' };
    if (slotId == null || bracketId == null) return fallback;

    let participant = this.getCache('entrantfromseedandbracket-parry', `${slotId}|${bracketId}`, cacheMaxAge);
    if (participant == null) {
      const bracket = await this.getBracket(bracketId);
      if (bracket == null) return fallback;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = bracket as any;
      let found = b.seedsList?.find((seed: { id: string }) => seed.id === slotId);
      if (!found) return fallback;
      found = found.eventEntrant;
      if (found?.name === '' && found?.entrant?.usersList?.length > 0) {
        const u = found.entrant.usersList[0];
        found.name = u.sponsorName ? `${u.sponsorName} | ${u.gamerTag}` : u.gamerTag;
      }
      this.setCache('entrantfromseedandbracket-parry', `${slotId}|${bracketId}`, found);
      participant = found;
    }
    return participant as { id: string | null; name: string };
  }

  async getBracket(bracketId: string, cacheMaxAge?: number): Promise<unknown> {
    if (bracketId == null) return null;
    let bracket = this.getCache('bracket-parry', bracketId, cacheMaxAge);
    if (bracket == null) {
      const request = new this.parrygg.GetBracketRequest();
      request.setId(bracketId);
      try {
        const response = await this.bracketClient.getBracket(request, this.createAuthMetadata);
        bracket = response.getBracket().toObject();
        this.setCache('bracket-parry', bracketId, bracket);
      } catch {
        return null;
      }
    }
    return bracket;
  }

  async fetchStreamQueue(): Promise<unknown[]> {
    if (this.selectedTournament == null) this.stopStreamQueuePolling();
    const sets = await this.getSetsFromStreamQueue();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = sets.map((x: any) => x.match?.id).join('-');
    if (ids !== this.streamQueueSetIdList.join('-')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.streamQueueSetIdList = sets.map((x: any) => x.id);
      this.emit('streamqueuechanged', sets);
    }
    return sets;
  }

  async getSetsFromStreamQueue(): Promise<unknown[]> {
    const request = new this.parrygg.GetMatchesRequest();
    const matchesFilter = new this.parrygg.MatchesFilter();
    const tournamentIdentifier = new this.parrygg.TournamentIdentifier();
    tournamentIdentifier.setTournamentSlug(this.selectedTournament);
    matchesFilter.setTournament(tournamentIdentifier);
    request.setFilter(matchesFilter);
    try {
      const response = await this.matchClient.getMatches(request, this.createAuthMetadata);
      let sets = response.getMatchesList();
      sets = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sets.map(async (set: any) => Object.assign(set.toObject(), await this.getAdditionalSetInfos(set.toObject())))
      );
      const rightStates = [
        this.parrygg.MatchState.MATCH_STATE_IN_PROGRESS,
        this.parrygg.MatchState.MATCH_STATE_READY,
      ];
      if (!this.hideNotReadySets) {
        rightStates.push(this.parrygg.MatchState.MATCH_STATE_PENDING);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sets.filter((match: any) => rightStates.includes(match.match.state));
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  startStreamQueuePolling(pollInterval?: number): void {
    this.stopStreamQueuePolling();
    this.emit('streamschanged', 'no stream rn');
    this.fetchStreamQueue();
    this.timers.streamQueuePoll = setInterval(
      () => this.fetchStreamQueue(),
      pollInterval ?? this.streamQueuePollInterval
    );
  }

  stopStreamQueuePolling(): void {
    if (Object.prototype.hasOwnProperty.call(this.timers, 'streamQueuePoll')) {
      clearTimeout(this.timers.streamQueuePoll as ReturnType<typeof setTimeout>);
      this.emit('streamschanged', null);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAdditionalTournamentInfos(tournament: any): Record<string, unknown> {
    return {
      slug: this.getSlug(tournament),
      primarySlug: this.getSlug(tournament, true),
      pictures: this.getTournamentPictures(tournament),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAdditionalUserInfos(user: any): Promise<Record<string, unknown>> {
    return {
      country: await this.convertCountry(user.locationCountry),
      state: await this.convertRegion(user.locationCountry, user.locationState),
      pictures: this.getUserPictures(user),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getAdditionalSetInfos(set: any): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set.hierarchy?.pathsList?.forEach((path: any) => {
      switch (path.type) {
        case this.parrygg.PathType.PATH_TYPE_EVENT: result.event = path; break;
        case this.parrygg.PathType.PATH_TYPE_PHASE: result.phase = path; break;
        case this.parrygg.PathType.PATH_TYPE_BRACKET: result.bracket = path; break;
        case this.parrygg.PathType.PATH_TYPE_TOURNAMENT: result.tournament = path; break;
      }
    });
    return result;
  }

  async convertRegion(countryCode: string, regionCode: string): Promise<string | null> {
    const json = await fetch('./json/states.json');
    const states = await json.json() as Array<{ iso2: string; country_code: string; name: string }>;
    const region = states.filter((s) => s.iso2 === regionCode && s.country_code === countryCode);
    return region[0]?.name ?? null;
  }

  async convertCountry(countryCode: string): Promise<string | null> {
    const json = await fetch('./json/countries.json');
    const countries = await json.json() as Array<{ iso2: string; name: string }>;
    const country = countries.find((c) => c.iso2 === countryCode);
    return country?.name ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSlug(tournament: any, primary = false): string {
    let slug =
      tournament.slugsList?.find((s: { type: unknown; slug: string }) =>
        s.type === this.parrygg.SlugType.SLUG_TYPE_CUSTOM
      )?.slug ?? '';
    if (slug === '' || primary) {
      slug =
        tournament.slugsList?.find((s: { type: unknown; slug: string }) =>
          s.type === this.parrygg.SlugType.SLUG_TYPE_PRIMARY
        )?.slug ?? '';
    }
    return slug;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTournamentPictures(tournament: any): Record<string, string> {
    return {
      banner:
        tournament.imagesList?.find(
          (img: { type: unknown; url: string }) => img.type === this.parrygg.ImageType.IMAGE_TYPE_BANNER
        )?.url ?? '',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUserPictures(user: any): Record<string, string> {
    return {
      banner: user.imagesList?.find((img: { type: unknown; url: string }) => img.type === this.parrygg.ImageType.IMAGE_TYPE_BANNER)?.url ?? '',
      avatar: user.imagesList?.find((img: { type: unknown; url: string }) => img.type === this.parrygg.ImageType.IMAGE_TYPE_AVATAR)?.url ?? '',
    };
  }

  static comparePlayer(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
    includeIgnore?: boolean
  ): Array<{ field: string; local: unknown; parrygg: unknown; ignored: boolean }> {
    const normalized = ParryggWrapper.convertPlayerStructure(remote);
    const diffs: Array<{ field: string; local: unknown; parrygg: unknown; ignored: boolean }> = [];

    for (const key in local) {
      if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
      const ignored =
        Object.prototype.hasOwnProperty.call(local, 'parryggIgnore') &&
        Object.prototype.hasOwnProperty.call((local.parryggIgnore as Record<string, unknown>), key) &&
        (local.parryggIgnore as Record<string, unknown>)[key] === normalized[key];

      const differs = local[key] !== normalized[key];
      if (differs && (!ignored || includeIgnore)) {
        diffs.push({ field: key, local: local[key], parrygg: normalized[key], ignored });
      }
    }
    return diffs;
  }

  static convertPlayerStructure(data: Record<string, unknown>): Record<string, unknown> {
    const d = data as {
      gamerTag?: string;
      pronouns?: string;
      lastName?: string;
      firstName?: string;
      locationCity?: string;
      country?: string;
      state?: string;
    };
    return {
      name: d.gamerTag ?? '',
      pronoun: d.pronouns ?? '',
      firstname: d.firstName ?? '',
      lastname: d.lastName ?? '',
      city: d.locationCity ?? '',
      country: d.country ?? '',
      region: d.state ?? '',
    };
  }
}
