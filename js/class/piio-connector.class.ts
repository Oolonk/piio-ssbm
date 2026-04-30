import { WSWrapper } from './ws.class';
import { Player } from './player.class';
import { Character } from './character.class';
import type { IScoreboard, TeamNumber } from '../../src/shared/types/scoreboard.types';
import type { IPlayer } from '../../src/shared/types/player.types';

declare const __FILENAME__: string;

type ConnectorCallback = (data: unknown) => void;

interface ConnectorCallbacks {
  on: Record<string, ConnectorCallback[]>;
  once: Record<string, ConnectorCallback[]>;
  any: ConnectorCallback[];
}

interface ConnectorCache {
  scoreboard: Partial<IScoreboard>;
  team: Record<string, unknown>;
  character: Record<string, unknown>;
  country: Record<string, unknown>;
  game: Record<string, unknown>;
  pride: Record<string, unknown>;
  obs: { activeScene?: string; sceneList?: string[] };
  streamQueue: unknown[];
}

interface SourceVisibleBindArg {
  source?: string;
  element?: HTMLElement;
  visibleClass?: string;
  hiddenClass?: string;
  default?: boolean;
}

interface TeamNameOptions {
  before?: string;
  after?: string;
  delimiter?: string;
}

interface SlippiMove {
  name: string;
  shortName: string;
}

export class PiioConnector {
  address: string;
  port: string;
  id: string;
  name: string;
  ws: WSWrapper | null;
  debug: boolean;
  private messageIdCounter: number;
  private awaitingCommandReturns: Record<string, ConnectorCallback>;
  requests: string | string[];
  subscriptions: string[];
  cache: ConnectorCache;
  private readonly _callbacks: ConnectorCallbacks;

  static readonly MATCHFORMAT_TYPE = {
    FREEPLAY: 0,
    BESTOF: 1,
    FIRSTTO: 2,
    0: 'FREEPLAY',
    1: 'BESTOF',
    2: 'FIRSTTO',
  } as const;

  constructor(name?: string, requests?: string | string[]) {
    this.address = location.hostname;
    this.port = location.port;
    this.id = Date.now().toString(32) + Math.ceil(Math.random() * 1000).toString(32);
    this.name = name ?? this.id;
    this.ws = null;
    this._callbacks = { on: {}, once: {}, any: [] };
    this.debug = false;
    this.messageIdCounter = 1;
    this.awaitingCommandReturns = {};
    this.requests = requests ?? ['scoreboard'];
    this.subscriptions = Array.isArray(this.requests) ? [...this.requests] : [this.requests];

    this.cache = {
      scoreboard: {},
      team: {},
      character: {},
      country: {},
      game: {},
      pride: {},
      obs: {},
      streamQueue: [],
    };

    this.init();
    document.onreadystatechange = () => this.init();
  }

  init(): void {
    if (document.readyState !== 'complete') return;
    this.connect();
    this.sourceVisibleBind(this.name);
  }

  connect(): void {
    this.ws = new WSWrapper(this.address, this.port, true);
    this.ws.on('data', (data) => {
      const d = data as Record<string, unknown>;
      if ('type' in d && 'data' in d) {
        const processed = this.processdata(d);
        this.fire(processed['type'] as string, processed['data']);
      }
    });
    this.ws.on('open', () => {
      this.register();
      this.subscriptions.forEach((subName) => this.ws!.send({ type: 'subscribe', data: subName }));
      if (!Array.isArray(this.requests)) this.requests = [this.requests];
      this.requests.forEach((req) => this.request(req));
      this.fire('ready');
    });
  }

  register(): void {
    this.ws?.send({ type: 'register', data: { id: this.id, name: this.name, filename: __FILENAME__ } });
  }

  request(name: string): void {
    this.ws?.send({ type: 'request', data: name });
  }

  subscribe(name: string): void {
    this.subscriptions.push(name);
    if (this.ws?.Open) {
      this.ws.send({ type: 'subscribe', data: name });
    }
  }

  command(module: string, args: unknown, cb?: ConnectorCallback): void {
    const mid = this.messageIdCounter++;
    if (cb && typeof cb === 'function') {
      this.awaitingCommandReturns[`${module}-cmd-return-${mid}`] = cb;
    }
    this.ws?.send({ type: `${module}-cmd`, data: args, mid });
  }

  processdata(data: Record<string, unknown>): Record<string, unknown> {
    console.log(data);
    const type = data['type'] as string;
    switch (type) {
      case 'scoreboard': {
        const payload = data['data'] as { scoreboard: IScoreboard; dbEntries: Record<string, Array<{ _id: string }>> };
        const sb = payload.scoreboard;
        const db = payload.dbEntries;
        this.cache.scoreboard = sb;
        const PlayerCtor = Player as unknown as new (params?: unknown) => IPlayer;
        for (const teamNum in sb.teams) {
          sb.teams[teamNum as unknown as TeamNumber].players = this.assignPrototype(
            sb.teams[teamNum as unknown as TeamNumber].players,
            PlayerCtor
          );
        }
        sb.caster = this.assignPrototype(sb.caster, PlayerCtor);
        for (const dbIndex in db) {
          for (const entry of db[dbIndex]) {
            (this.cache as unknown as Record<string, Record<string, unknown>>)[dbIndex][entry._id] = entry;
          }
        }
        data['data'] = sb;
        break;
      }
      case 'obsSceneChanged':
        this.cache.obs.activeScene = data['data'] as string;
        break;
      case 'obsSceneList':
        this.cache.obs.sceneList = data['data'] as string[];
        break;
      case 'streamQueue':
        this.cache.streamQueue = data['data'] as unknown[];
        break;
    }

    if (data['mid'] != null) {
      for (const i in this.awaitingCommandReturns) {
        if (`${type}-${data['mid']}` === i) {
          this.awaitingCommandReturns[i](data['data']);
          delete this.awaitingCommandReturns[i];
          break;
        }
      }
    }

    return data;
  }

  getPlayer(teamNum: TeamNumber, playerNum?: number | null): IPlayer | null {
    const pNum = playerNum ?? this.getSelectedPlayer(teamNum);
    const team = this.cache.scoreboard.teams?.[teamNum];
    if (team?.players?.[pNum] != null) return team.players[pNum];
    return null;
  }

  getPosition(teamNum: TeamNumber, playerNum?: number | null): number | undefined {
    const pNum = playerNum ?? this.getSelectedPlayer(teamNum);
    const seats = this.cache.scoreboard.seatorder ?? [];
    for (let i = 0; i < seats.length; i++) {
      if (seats[i][0] === teamNum && seats[i][1] === pNum) return i;
    }
    return undefined;
  }

  getPlayersByPosition(): (IPlayer | null)[] {
    const list: (IPlayer | null)[] = [];
    const seats = this.cache.scoreboard.seatorder ?? [];
    for (const seat of seats) {
      list.push(this.getPlayer(seat[0], seat[1]));
    }
    return list;
  }

  getSelectedPlayer(teamNum: TeamNumber): number {
    const team = this.cache.scoreboard.teams?.[teamNum];
    if (this.TeamSize > 1 && team?.selected != null) return team.selected;
    return 0;
  }

  getTeamName(teamNum: TeamNumber, options?: TeamNameOptions): string {
    const opts = options ?? {};
    const before = opts.before ?? '';
    const after = opts.after ?? '';
    const delimiter = opts.delimiter ?? ' / ';

    const team = this.cache.scoreboard.teams?.[teamNum];
    if (!team) return '';

    let value = '';
    if (!team.name || team.name.length === 0) {
      value = this.getTeamPlayers(teamNum).map((x) => x.name).join(delimiter);
    } else {
      value = team.name;
    }
    return before + value + after;
  }

  getTeamStatus(teamNum: TeamNumber, playerNum?: number | null): unknown {
    const sb = this.cache.scoreboard;
    if (sb.type !== 'crews' || !sb.teams?.[teamNum]) return null;

    const list = (sb.teams[teamNum].out ?? []).map((isOut, index) => ({
      out: isOut,
      selected: sb.teams![teamNum].selected === index,
    }));

    if (playerNum != null) return list[playerNum];
    return list;
  }

  getTeamPlayers(teamNum: TeamNumber): IPlayer[] {
    const team = this.cache.scoreboard.teams?.[teamNum];
    if (!team) return [];
    return team.players.filter((p) => p.name !== '');
  }

  getScore(teamNum: TeamNumber): number | null {
    return this.cache.scoreboard.teams?.[teamNum]?.score ?? null;
  }

  getState(teamNum: TeamNumber): number | null {
    return this.cache.scoreboard.teams?.[teamNum]?.state ?? null;
  }

  getCountry(teamNum: TeamNumber, playerNum?: number | null): unknown {
    const pNum = playerNum ?? this.getSelectedPlayer(teamNum);
    const player = this.getPlayer(teamNum, pNum);
    if (player && Object.prototype.hasOwnProperty.call(this.cache.country, player.country)) {
      return this.cache.country[player.country];
    }
    return null;
  }

  getPride(teamNum: TeamNumber, playerNum?: number | null): unknown[] {
    const pNum = playerNum ?? this.getSelectedPlayer(teamNum);
    const player = this.getPlayer(teamNum, pNum);
    if (!player) return [];
    const prideCache = this.cache.pride;
    const filtered = Object.keys(prideCache)
      .filter((key) => player.pride.includes(key))
      .reduce<Record<string, unknown>>((obj, key) => { obj[key] = prideCache[key]; return obj; }, {});
    return Object.values(filtered);
  }

  getPort(teamNum: TeamNumber, playerNum?: number | null): number | null {
    const pNum = playerNum ?? this.getSelectedPlayer(teamNum);
    const ports = this.cache.scoreboard.ports ?? [];
    for (let i = 0; i < ports.length; i++) {
      const p = ports[i];
      if (p != null && p[0] === teamNum && p[1] === pNum) return i;
    }
    return null;
  }

  getCharacter(teamNum: TeamNumber, playerNum?: number | null): Character | null {
    const pNum = playerNum ?? this.getSelectedPlayer(teamNum);
    const team = this.cache.scoreboard.teams?.[teamNum];
    if (!team || !team.characters[pNum] || this.TeamSize <= pNum) return null;
    const co = team.characters[pNum];
    if (co && Object.prototype.hasOwnProperty.call(this.cache.character, co[0])) {
      const c = new Character(this.cache.character[co[0]] as ConstructorParameters<typeof Character>[0]);
      c.defaultSkin = co[1];
      return c;
    }
    return null;
  }

  getPlayerTeams(teamNum: TeamNumber | IPlayer, playerNum?: number | null): unknown[] {
    const teams: unknown[] = [];
    let player: IPlayer | null;

    if (teamNum instanceof Player) {
      player = teamNum as IPlayer;
    } else {
      const pNum = playerNum ?? 0;
      player = this.getPlayer(teamNum as TeamNumber, pNum);
    }
    if (player == null) return [];

    player.team.forEach((teamID) => {
      if (Object.prototype.hasOwnProperty.call(this.cache.team, teamID)) {
        teams.push(this.cache.team[teamID]);
      }
    });
    return teams;
  }

  getCaster(casterNum: number): IPlayer | null {
    const casters = this.cache.scoreboard.caster;
    if (casters?.[casterNum - 1] != null) return casters[casterNum - 1];
    return null;
  }

  getCasterCountry(casterNum: number): unknown {
    const caster = this.getCaster(casterNum);
    if (caster && Object.prototype.hasOwnProperty.call(this.cache.country, caster.country)) {
      return this.cache.country[caster.country];
    }
    return null;
  }

  getCasterPride(casterNum: number): unknown[] {
    const caster = this.getCaster(casterNum);
    if (!caster) return [];
    const prideCache = this.cache.pride;
    const filtered = Object.keys(prideCache)
      .filter((key) => caster.pride.includes(key))
      .reduce<Record<string, unknown>>((obj, key) => { obj[key] = prideCache[key]; return obj; }, {});
    return Object.values(filtered);
  }

  getGame(): unknown {
    const sb = this.cache.scoreboard;
    if (!sb.game) return null;
    if (!Object.prototype.hasOwnProperty.call(this.cache.game, sb.game)) return null;
    return this.cache.game[sb.game];
  }

  getField(name: string): { value: string | string[]; enabled: boolean } {
    try {
      return this.cache.scoreboard.fields?.[name] ?? { value: '', enabled: false };
    } catch {
      return { value: '', enabled: false };
    }
  }

  getFieldValue(name: string): string | string[] {
    return this.getField(name).value;
  }

  get TeamSize(): number {
    const teams = this.cache.scoreboard.teams;
    if (!teams) return 1;
    return Math.max(teams[1]?.players.length ?? 0, teams[2]?.players.length ?? 0);
  }

  assignPrototype<T>(docs: T[], proto: new (params?: unknown) => T): T[] {
    return docs.map((doc) => new proto(doc));
  }

  resolve(dbName: string, id: string): unknown {
    return (this.cache as unknown as Record<string, Record<string, unknown>>)[dbName]?.[id];
  }

  sourceVisibleBind(arg: string | SourceVisibleBindArg): void {
    const params: Required<SourceVisibleBindArg> = {
      source: typeof arg === 'string' ? arg : (arg.source ?? ''),
      element: (typeof arg === 'object' ? arg.element : undefined) ?? document.body,
      visibleClass: (typeof arg === 'object' ? arg.visibleClass : undefined) ?? 'visible',
      hiddenClass: (typeof arg === 'object' ? arg.hiddenClass : undefined) ?? 'hidden',
      default: (typeof arg === 'object' ? arg.default : undefined) ?? true,
    };

    params.element.classList.toggle(params.visibleClass, params.default);
    params.element.classList.toggle(params.hiddenClass, !params.default);

    this.subscribe('overlay-trigger');
    this.on('overlay-trigger', (data) => {
      const d = data as { source: string; visible?: boolean | null };
      if (d.source !== params.source || !params.element) return;
      const visible = d.visible ?? params.element.classList.contains(params.hiddenClass);
      params.element.classList.toggle(params.visibleClass, visible);
      params.element.classList.toggle(params.hiddenClass, !visible);
    });
  }

  on(name: string, callback: ConnectorCallback): void {
    if (!Object.prototype.hasOwnProperty.call(this._callbacks.on, name)) {
      this._callbacks.on[name] = [];
    }
    this._callbacks.on[name].push(callback);
  }

  once(name: string, callback: ConnectorCallback): void {
    if (!Object.prototype.hasOwnProperty.call(this._callbacks.once, name)) {
      this._callbacks.once[name] = [];
    }
    this._callbacks.once[name].push(callback);
  }

  fire(name: string, data?: unknown): void {
    this._callbacks.on[name]?.forEach((cb) => cb(data));
    if (this._callbacks.once[name]) {
      this._callbacks.once[name].forEach((cb) => cb(data));
      this._callbacks.once[name] = [];
    }
  }

  getPictureUrl(url: string): string | false {
    if (!url) return false;
    for (const ext of ['svg', 'png', 'gif', 'jpg', 'jpeg']) {
      const req = new XMLHttpRequest();
      req.open('GET', `${url}.${ext}`, false);
      req.send();
      if (req.status === 200) return `${url}.${ext}`;
    }
    return false;
  }

  readonly slippi = {
    moveId: (move: number): string => {
      const key = move.toString();
      if (Object.prototype.hasOwnProperty.call(this.slippi.moves, key)) {
        return (this.slippi.moves as Record<string, SlippiMove>)[key].name;
      }
      return `Unknown MoveID: ${move}`;
    },
    getGamesStats: async (amount = 1): Promise<void> => {
      if (this.ws?.Open) {
        const randomId = Math.random().toString(36).substring(2, 15);
        this.ws.send({ type: 'getSlippiStats', data: { length: amount, id: this.id, mid: randomId } });
        this.ws.once(`getSlippiStats-${randomId}`, (data) => {
          console.log(data);
        });
      }
    },
    moves: {
      '1': { name: 'Miscellaneous', shortName: 'misc' },
      '2': { name: 'Jab', shortName: 'jab' },
      '3': { name: 'Jab', shortName: 'jab' },
      '4': { name: 'Jab', shortName: 'jab' },
      '5': { name: 'Rapid Jabs', shortName: 'rapid-jabs' },
      '6': { name: 'Dash Attack', shortName: 'dash' },
      '7': { name: 'Forward Tilt', shortName: 'ftilt' },
      '8': { name: 'Up Tilt', shortName: 'utilt' },
      '9': { name: 'Down Tilt', shortName: 'dtilt' },
      '10': { name: 'Forward Smash', shortName: 'fsmash' },
      '11': { name: 'Up Smash', shortName: 'usmash' },
      '12': { name: 'Down Smash', shortName: 'dsmash' },
      '13': { name: 'Neutral Air', shortName: 'nair' },
      '14': { name: 'Forward Air', shortName: 'fair' },
      '15': { name: 'Back Air', shortName: 'bair' },
      '16': { name: 'Up Air', shortName: 'uair' },
      '17': { name: 'Down Air', shortName: 'dair' },
      '18': { name: 'Neutral B', shortName: 'neutral-b' },
      '19': { name: 'Side B', shortName: 'side-b' },
      '20': { name: 'Up B', shortName: 'up-b' },
      '21': { name: 'Down B', shortName: 'down-b' },
      '50': { name: 'Getup Attack', shortName: 'getup' },
      '51': { name: 'Getup Attack (Slow)', shortName: 'getup-slow' },
      '52': { name: 'Grab Pummel', shortName: 'pummel' },
      '53': { name: 'Forward Throw', shortName: 'fthrow' },
      '54': { name: 'Back Throw', shortName: 'bthrow' },
      '55': { name: 'Up Throw', shortName: 'uthrow' },
      '56': { name: 'Down Throw', shortName: 'dthrow' },
      '61': { name: 'Edge Attack (Slow)', shortName: 'edge-slow' },
      '62': { name: 'Edge Attack', shortName: 'edge' },
    } as Record<string, SlippiMove>,
    stages: {
      '2': 'Fountain of Dreams', '3': 'Pokémon Stadium', '4': "Princess Peach's Castle",
      '5': 'Kongo Jungle', '6': 'Brinstar', '7': 'Corneria', '8': "Yoshi's Story",
      '9': 'Onett', '10': 'Mute City', '11': 'Rainbow Cruise', '12': 'Jungle Japes',
      '13': 'Great Bay', '14': 'Hyrule Temple', '15': 'Brinstar Depths', '16': "Yoshi's Island",
      '17': 'Green Greens', '18': 'Fourside', '19': 'Mushroom Kingdom I', '20': 'Mushroom Kingdom II',
      '22': 'Venom', '23': 'Poké Floats', '24': 'Big Blue', '25': 'Icicle Mountain',
      '26': 'Icetop', '27': 'Flat Zone', '28': 'Dream Land N64', '29': "Yoshi's Island N64",
      '30': 'Kongo Jungle N64', '31': 'Battlefield', '32': 'Final Destination',
    } as Record<string, string>,
    characters: {
      '0': { name: 'Captain Falcon', shortName: 'Falcon', colors: ['Black', 'Red', 'White', 'Green', 'Blue'] },
      '1': { name: 'Donkey Kong', shortName: 'DK', colors: ['Black', 'Red', 'Blue', 'Green'] },
      '2': { name: 'Fox', colors: ['Red', 'Blue', 'Green'] },
      '3': { name: 'Mr. Game & Watch', shortName: 'G&W', colors: ['Red', 'Blue', 'Green'] },
      '4': { name: 'Kirby', colors: ['Yellow', 'Blue', 'Red', 'Green', 'White'] },
      '5': { name: 'Bowser', colors: ['Red', 'Blue', 'Black'] },
      '6': { name: 'Link', colors: ['Red', 'Blue', 'Black', 'White'] },
      '7': { name: 'Luigi', colors: ['White', 'Blue', 'Red'] },
      '8': { name: 'Mario', colors: ['Yellow', 'Black', 'Blue', 'Green'] },
      '9': { name: 'Marth', colors: ['Red', 'Green', 'Black', 'White'] },
      '10': { name: 'Mewtwo', colors: ['Red', 'Blue', 'Green'] },
      '11': { name: 'Ness', colors: ['Yellow', 'Blue', 'Green'] },
      '12': { name: 'Peach', colors: ['Daisy', 'White', 'Blue', 'Green'] },
      '13': { name: 'Pikachu', colors: ['Red', 'Party Hat', 'Cowboy Hat'] },
      '14': { name: 'Ice Climbers', shortName: 'ICs', colors: ['Green', 'Orange', 'Red'] },
      '15': { name: 'Jigglypuff', shortName: 'Puff', colors: ['Red', 'Blue', 'Headband', 'Crown'] },
      '16': { name: 'Samus', colors: ['Pink', 'Black', 'Green', 'Purple'] },
      '17': { name: 'Yoshi', colors: ['Red', 'Blue', 'Yellow', 'Pink', 'Cyan'] },
      '18': { name: 'Zelda', colors: ['Red', 'Blue', 'Green', 'White'] },
      '19': { name: 'Sheik', colors: ['Red', 'Blue', 'Green', 'White'] },
      '20': { name: 'Falco', colors: ['Red', 'Blue', 'Green'] },
      '21': { name: 'Young Link', shortName: 'YLink', colors: ['Red', 'Blue', 'White', 'Black'] },
      '22': { name: 'Dr. Mario', shortName: 'Doc', colors: ['Red', 'Blue', 'Green', 'Black'] },
      '23': { name: 'Roy', colors: ['Red', 'Blue', 'Green', 'Yellow'] },
      '24': { name: 'Pichu', colors: ['Red', 'Blue', 'Green'] },
      '25': { name: 'Ganondorf', shortName: 'Ganon', colors: ['Red', 'Blue', 'Green', 'Purple'] },
    } as Record<string, { name: string; shortName?: string; colors?: string[] }>,
  };
}
