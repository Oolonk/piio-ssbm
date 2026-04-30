import { ScoreboardModel } from '../models/ScoreboardModel';
import { ThemeModel } from '../models/ThemeModel';
import { MatchModel } from '../models/MatchModel';
import { ClientSettingsModel } from '../models/ClientSettingsModel';
import { ScoreboardView } from '../views/ScoreboardView';
import { PlayerView } from '../views/PlayerView';
import { CasterView } from '../views/CasterView';
import { FieldView } from '../views/FieldView';
import { SeatOrderView } from '../views/SeatOrderView';
import { CharacterSelectView } from '../views/CharacterSelectView';
import { StreamQueueView } from '../views/StreamQueueView';
import { SlippiStatusView } from '../views/SlippiStatusView';
import { ObsStatusView } from '../views/ObsStatusView';
import { WebSocketService } from '../services/WebSocketService';
import { DatabaseService } from '../services/DatabaseService';
import { IpcService } from '../services/IpcService';
import { EventBus } from '../utils/EventBus';
import { BackgroundWork } from '../utils/BackgroundWork';
import { Player } from '../../js/class/player.class';
import { Character } from '../../js/class/character.class';
import { ObsController } from './ObsController';
import { SlippiController } from './SlippiController';
import { TournamentController } from './TournamentController';
import { SettingsController } from './SettingsController';
import type { TeamNumber } from '@shared/types/scoreboard.types';
import type { CharacterSelection } from '@shared/types/character.types';
import type { IPlayer } from '@shared/types/player.types';

const remote = require('@electron/remote');
const fs = require('fs') as typeof import('fs');

export class ScoreboardController {
  private bus: EventBus;
  private bgWork: BackgroundWork;
  private streamQueue: unknown[] = [];
  private timeouts: Record<string, ReturnType<typeof setTimeout>> = {};
  private appRes: string;

  constructor(
    private readonly scoreboard: ScoreboardModel,
    private readonly theme: ThemeModel,
    private readonly match: MatchModel,
    private readonly settings: ClientSettingsModel,
    private readonly sbView: ScoreboardView,
    private readonly playerView: PlayerView,
    private readonly casterView: CasterView,
    private readonly fieldView: FieldView,
    private readonly seatOrderView: SeatOrderView,
    private readonly charSelectView: CharacterSelectView,
    private readonly streamQueueView: StreamQueueView,
    private readonly slippiStatusView: SlippiStatusView,
    private readonly obsStatusView: ObsStatusView,
    private readonly ws: WebSocketService,
    private readonly db: DatabaseService,
    private readonly ipc: IpcService,
    private readonly obsCtrl: ObsController,
    private readonly slippiCtrl: SlippiController,
    private readonly tournamentCtrl: TournamentController,
    private readonly settingsCtrl: SettingsController,
  ) {
    this.bus = new EventBus();
    this.bgWork = new BackgroundWork();
    this.appRes = remote.getGlobal('APPRES') as string;
  }

  async init(): Promise<void> {
    this.bus.hold('scoreboardchanged');
    this.bgWork.start('init');

    await this.settingsCtrl.loadAndApply();
    this.wireModelToViews();
    this.wireUserInputEvents();
    this.wireIpcEvents();
    this.wireModelEvents();

    if (!this.theme.isLoaded()) {
      const firstTheme = await this.theme.getThemesList();
      await this.theme.load(firstTheme[0]?.dir ?? 0);
    }

    // Load persisted scoreboard state
    try {
      const data = await fs.promises.readFile('scoreboard.json', 'utf8');
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        this.scoreboard.loadFromObject(parsed);
        this.scoreboard.setGame(parsed.game as string | null);
      } catch { /* ignore parse errors */ }
    } catch {
      this.scoreboard.setGame(null);
    }
    const state = this.scoreboard.getState();
    const teamSize = Math.max(state.teams[1].players.length, 1);
    this.scoreboard.setTeamSize(teamSize);
    this.bus.release('scoreboardchanged');
    this.bus.fire('themechanged');

    this.ws.connect();
    this.ws.on('data-cmd', (data: unknown) => this.handleWsCommand(data as Record<string, unknown>));

    this.sbView.setVersion(remote.app.getVersion() as string);
    this.bgWork.finish('init');
  }

  private wireModelToViews(): void {
    this.scoreboard.on('changed', (immediate?: boolean) => {
      this.bus.fire('scoreboardchanged', immediate);
    });
    this.scoreboard.on('teams-changed', (team?: TeamNumber) => {
      this.bus.fire('scoreboardteamschanged', team);
    });
    this.scoreboard.on('caster-changed', () => {
      this.bus.fire('scoreboardcasterchanged');
    });
    this.scoreboard.on('seatorder-changed', () => {
      this.bus.fire('scoreboardseatorderchanged');
    });
    this.scoreboard.on('startgg-changed', () => {
      this.bus.fire('scoreboardsmashggchanged');
    });
    this.theme.on('changed', () => {
      this.bus.fire('themechanged');
    });
  }

  private wireModelEvents(): void {
    this.bus.on('scoreboardchanged', (immediate?: boolean) => this.onScoreboardChanged(Boolean(immediate)));
    this.bus.on('scoreboardteamschanged', (team?: TeamNumber) => this.insertTeamUI(team ?? null));
    this.bus.on('scoreboardcasterchanged', () => this.insertCasterUI());
    this.bus.on('scoreboardseatorderchanged', () => this.rebuildSeatOrder());
    this.bus.on('themechanged', () => this.onThemeChanged());
    this.bus.on('streamqueuechanged', () => this.ws.send('streamQueue', this.streamQueue));
    this.bus.on('load', () => this.init());
    this.bus.on('update', () => this.sbView.animateUpdate());

    this.db.on('player-changed', (docs: unknown) => this.onPlayerChanged(docs as Record<string, unknown>[]));
    this.db.on('player-changed', () => this.buildPlayerAutoCompleteList());
    this.db.on('game-changed', () => this.buildGameSelection());

    addEventListener('load', () => this.bus.fire('load'));
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.keyCode === 83) { e.preventDefault(); this.update(); }
    }, true);
  }

  private wireUserInputEvents(): void {
    document.getElementById('autoupdate-cbx')?.addEventListener('change', (e) => {
      this.settingsCtrl.toggleAutoUpdate((e.target as HTMLInputElement).checked);
    });
    document.getElementById('autoscore-cbx')?.addEventListener('change', (e) => {
      this.settingsCtrl.toggleAutoScore((e.target as HTMLInputElement).checked);
    });
    document.getElementById('game-select')?.addEventListener('change', (e) => {
      this.scoreboard.setGame((e.target as HTMLSelectElement).value);
    });
    document.getElementById('theme-select')?.addEventListener('change', (e) => {
      this.setTheme((e.target as HTMLSelectElement).value);
    });
    document.getElementById('teamsize-select')?.addEventListener('change', (e) => {
      this.scoreboard.setTeamSize(parseInt((e.target as HTMLSelectElement).value));
    });
    document.getElementById('team-type-select')?.addEventListener('change', (e) => {
      const types = ['teams', 'crews', 'ironman'] as const;
      const num = parseInt((e.target as HTMLSelectElement).value);
      this.scoreboard.setType(types[num]);
      this.sbView.setTeamType(num);
      this.rebuildSeatOrder();
    });
    document.getElementById('matchmaking-mode')?.addEventListener('change', (e) => {
      this.scoreboard.setMatchFormat(parseInt((e.target as HTMLSelectElement).value));
    });
    document.getElementById('matchmaking-value')?.addEventListener('change', (e) => {
      const state = this.scoreboard.getState();
      this.scoreboard.setMatchFormat(state.matchformat.type, parseInt((e.target as HTMLInputElement).value));
    });
    for (const team of [1, 2] as TeamNumber[]) {
      document.getElementById(`sb-team-name-val-${team}`)?.addEventListener('input', (e) => {
        this.scoreboard.setTeamName(team, (e.target as HTMLInputElement).value);
      });
      document.getElementById(`sb-score-val-${team}`)?.addEventListener('change', (e) => {
        this.modifyScore(team, parseInt((e.target as HTMLInputElement).value), true);
      });
      document.getElementById(`score-inc-${team}`)?.addEventListener('click', () => this.modifyScore(team, 1));
      document.getElementById(`score-dec-${team}`)?.addEventListener('click', () => this.modifyScore(team, -1));
      document.getElementById(`sb-state-${team}`)?.addEventListener('click', () => {
        const current = this.scoreboard.getState().teams[team].state;
        this.setTeamState(team, ((current + 1) % 3) as 0 | 1 | 2);
      });
    }
    document.getElementById('update-btn')?.addEventListener('click', () => this.update());
    document.getElementById('new-match-btn')?.addEventListener('click', () => this.newMatch());
    document.getElementById('clear-btn')?.addEventListener('click', () => this.scoreboard.clearBoard());
    document.getElementById('swap-teams-btn')?.addEventListener('click', () => this.scoreboard.swap(null));
    document.getElementById('seatorder-glue-option')?.addEventListener('click', () => {
      this.seatOrderView.toggleGlue();
      this.rebuildSeatOrder();
    });
  }

  private wireIpcEvents(): void {
    this.ipc.on('themefolder-changed', () => this.buildThemeSelection());
    this.ipc.on('slippiFrame', (_e, data) => {
      this.ws.send('slippiFrame', data);
    });
    this.ipc.on('slippiStarted', (_e, data) => {
      this.obsCtrl.onSlippiGameStarted(data as { players: { length: number } });
    });
    this.ipc.on('slippiEnded', (_e, data) => {
      this.obsCtrl.onSlippiGameEnded(data as { gameEndMethod: number });
      this.ws.send('slippiGameEnded', data);
    });
    this.ipc.on('obsCurrentSceneChanged', (_e, name) => {
      this.ws.send('obsSceneChanged', name);
    });
  }

  private async onThemeChanged(): Promise<void> {
    this.bgWork.start('setTheme');
    const state = this.scoreboard.getState();
    const t = this.theme.data;
    if (t) {
      this.scoreboard.correctDynamicProperties(t);
      this.fieldView.build(t.fields ?? [], state.fields, (name, value, enabled) => {
        this.scoreboard.setFieldValue(name, value);
        if (enabled !== undefined) this.scoreboard.setFieldEnabled(name, enabled);
      });
      this.scoreboard.setCasterSize(this.theme.casterCount);
      await this.rebuildCasterList();
      await this.buildThemeSelection();
      this.insertScoreboardData();
    }
    this.bgWork.finish('setTheme');
  }

  private onScoreboardChanged(noThreshold: boolean): void {
    if (this.settings.get('autoupdate')) {
      if (this.timeouts['autoupdate']) clearTimeout(this.timeouts['autoupdate']);
      this.timeouts['autoupdate'] = setTimeout(
        () => this.update(),
        noThreshold ? 5 : this.settings.get('autoupdateThreshold')
      );
    }
    this.sbView.markChanged();
  }

  modifyScore(team: TeamNumber, inc: number, absolute = false): void {
    this.scoreboard.modifyScore(team, inc, absolute);
    this.sbView.updateScore(team, this.scoreboard.getState().teams[team].score);
  }

  setTeamState(team: TeamNumber, state: 0 | 1 | 2): void {
    this.scoreboard.setTeamState(team, state);
    this.sbView.updateTeamState(team, state);
  }

  async setTheme(name: string): Promise<void> {
    if (this.theme.isSame(name)) return;
    this.bgWork.start('setTheme');
    await this.theme.load(name);
    this.sbView.setTheme(this.theme.dir);
    this.ipc.send('theme', this.theme.dir);
    this.bus.fire('themechanged');
    this.bgWork.finish('setTheme');
  }

  async setCharacter(
    teamNum: TeamNumber,
    playerNum: number,
    charId: string,
    costumeIdx: number
  ): Promise<void> {
    const selection: CharacterSelection = charId ? [charId, costumeIdx] : null;
    const state = this.scoreboard.getState();
    const co = charId
      ? new Character(await this.db.getSingle<Record<string, unknown>>('character', charId) ?? {})
      : new Character({});
    await this.playerView.updateCharacterIcon(
      teamNum, playerNum, state.game, co.ID, co.getSkin(costumeIdx), co.Shorten
    );
    this.scoreboard.setCharacter(teamNum, playerNum, selection);
  }

  async openCharacterSelect(teamNum: TeamNumber, playerNum: number): Promise<void> {
    this.bgWork.start('openCharacterSelect');
    const state = this.scoreboard.getState();
    this.sbView.showModal('character-select');
    const selection = state.teams[teamNum].characters[playerNum];
    const chars = await this.db.get<Record<string, unknown>>('character', { game: state.game });
    const characters = chars.map((x) => new Character(x));
    await this.charSelectView.build(
      characters, selection, state.game, this.appRes,
      (t, p, id, skin) => {
        this.setCharacter(t, p, id, skin);
        this.sbView.hideModal();
      },
      teamNum, playerNum
    );
    this.charSelectView.installKeyboardFilter(() => this.sbView.hideModal());
    this.bgWork.finish('openCharacterSelect');
  }

  async update(): Promise<void> {
    const now = new Date();
    this.scoreboard.setTimestamp(now);
    const state = this.scoreboard.getState();

    for (const teamNum of [1, 2] as TeamNumber[]) {
      this.db.update(
        'player',
        { $or: state.teams[teamNum].players.map((x) => ({ _id: x._id })) },
        { lastActivity: now },
        true
      );
    }

    const dbEntries = await this.collectDatabaseEntries(state);
    if ((state as Record<string, unknown>)['_D'] !== now) return;

    this.ws.send('scoreboard', { scoreboard: state, dbEntries });
    await this.insertMatchList(state);
    fs.writeFileSync('scoreboard.json', JSON.stringify(state));
    this.bus.fire('update');
  }

  private async collectDatabaseEntries(
    sb: ReturnType<ScoreboardModel['getState']>
  ): Promise<Record<string, unknown[]>> {
    const dbData: Record<string, Array<{ _id: string }>> = {
      country: [], character: [], team: [], game: [], pride: [],
    };
    for (const teamNum of [1, 2] as TeamNumber[]) {
      sb.teams[teamNum].players.forEach((player) => {
        dbData.country.push({ _id: player.country });
        (player.pride ?? []).forEach((p) => dbData.pride.push({ _id: p }));
        (player.team ?? []).forEach((t) => dbData.team.push({ _id: t }));
      });
      sb.teams[teamNum].characters
        .filter((x): x is [string, number] => x != null)
        .forEach((x) => dbData.character.push({ _id: x[0] }));
    }
    sb.caster.forEach((caster) => {
      dbData.country.push({ _id: caster.country });
      (caster.pride ?? []).forEach((p) => dbData.pride.push({ _id: p }));
      (caster.team ?? []).forEach((t) => dbData.team.push({ _id: t }));
    });
    if (sb.game) dbData.game.push({ _id: sb.game });

    const result: Record<string, unknown[]> = {};
    for (const dbName of Object.keys(dbData) as Array<keyof typeof dbData>) {
      const filtered = dbData[dbName].filter((x) => x._id != null && x._id.length > 0);
      result[dbName] = await this.db.get(dbName as never, { $or: filtered });
    }
    return result;
  }

  async insertMatchList(sb: ReturnType<ScoreboardModel['getState']>): Promise<void> {
    if (sb.id == null) await this.newMatch(true);
    const data = await this.db.getSingle<Record<string, unknown>>('match', { _id: sb.id });
    if (!data) return;

    const entry: Record<string, unknown> = {
      ...data,
      teams: {},
      game: sb.game,
      type: sb.type,
      smashgg: sb.startgg,
      _D: new Date(),
    };

    for (const teamNum of [1, 2] as TeamNumber[]) {
      (entry.teams as Record<string, unknown>)[teamNum] = {
        name: '',
        players: sb.teams[teamNum].players
          .filter((p) => p.name.length > 0)
          .map((p, idx) => ({ _id: p._id, name: p.name, team: p.team })),
      };
    }
    for (const teamNum of [1, 2] as TeamNumber[]) {
      for (const [charIdx, character] of sb.teams[teamNum].characters.entries()) {
        if (!character || !character[0]) continue;
        const player = sb.teams[teamNum].players[charIdx];
        if (!player?._id?.length) continue;
        const chars = entry.characters as Record<string, string[]> ?? {};
        if (!chars[player._id]) chars[player._id] = [];
        if (!chars[player._id].includes(character[0])) chars[player._id].push(character[0]);
        entry.characters = chars;
      }
    }
    sb.caster.forEach((caster) => {
      if (!caster.name.length) return;
      const casters = entry.caster as Array<{ _id: string; name: string }>;
      const alreadyIn = casters.some(
        (c) => (c._id?.length && c._id === caster._id) || (!c._id?.length && c.name === caster.name)
      );
      if (!alreadyIn) casters.push({ _id: caster._id, name: caster.name });
    });

    const themeData = this.theme.data;
    if (themeData?.fields) {
      themeData.fields.forEach((field) => {
        if (field['matchlist']) {
          (entry.fields as Record<string, unknown>)[field.name] = sb.fields[field.name]?.value;
        }
      });
    }

    await this.match.update(entry);
  }

  async newMatch(noClear = false): Promise<void> {
    await this.match.createNew();
    if (!noClear) this.scoreboard.clearBoard();
    await this.match.applyLastId();
    this.scoreboard.setMatchId(this.match.id);
  }

  private async rebuildCasterList(): Promise<void> {
    const state = this.scoreboard.getState();
    this.casterView.build(
      this.theme.casterCount,
      state.caster,
      this.appRes,
      (idx, player) => this.setCaster(idx, player),
      (player) => this.editPlayer(player)
    );
  }

  async setCaster(idx: number, player: IPlayer): Promise<void> {
    this.bgWork.start('setCaster');
    this.scoreboard.setCaster(idx, player);
    this.casterView.updateCaster(idx, player);

    if (player.HasSmashgg && player.InDB) {
      const id = player.ID;
      this.tournamentCtrl.getDifferences(player).then((res) => {
        if (this.scoreboard.getState().caster[idx]._id !== id) return;
        const outdated =
          res.smashgg.differences.length > 0 || res.parrygg.differences.length > 0;
        this.casterView.setOutdated(idx, outdated);
      });
    }
    this.bus.fire('scoreboardchanged');
    this.bgWork.finish('setCaster');
  }

  async editPlayer(arg: IPlayer | Event): Promise<void> {
    let po: IPlayer | null = null;
    let parentEl: HTMLElement | null = null;
    let returnId: number | undefined;

    if (arg instanceof Event) {
      parentEl = (arg.currentTarget as HTMLElement).closest('div.player-item') as HTMLElement;
      const { team, player } = (parentEl as HTMLElement & { dataset: { team: string; player: string } }).dataset;
      const state = this.scoreboard.getState();
      po = state.teams[Number(team) as TeamNumber].players[Number(player)];
      returnId = Math.floor(Math.random() * 100000);
      (parentEl as HTMLElement & { dataset: DOMStringMap }).dataset.returnId = String(returnId);
      if ((arg.currentTarget as HTMLElement).classList.contains('player-create-btn')) {
        po = new Player({ ...po, _id: '' });
      }
    } else {
      po = arg;
    }

    await this.ipc.openWindow('database-entry', { db: 'player', entry: po });
  }

  private async insertTeamUI(teamNum: TeamNumber | null): Promise<void> {
    if (teamNum === null) {
      await this.insertTeamUI(1);
      await this.insertTeamUI(2);
      return;
    }
    const state = this.scoreboard.getState();
    state.teams[teamNum].players.forEach((_, playerNum) => {
      this.playerView.updatePlayerUI(
        teamNum, playerNum,
        state.teams[teamNum].players[playerNum],
        state.teams[teamNum].characters[playerNum],
        state.game, state.ports,
        state.teams[teamNum].selected,
        state.teams[teamNum].out,
        this.appRes
      );
    });
    this.sbView.updateTeamName(
      teamNum,
      state.teams[teamNum].name,
      state.teams[teamNum].players.map((p) => p.name)
    );
    this.sbView.updateScore(teamNum, state.teams[teamNum].score);
    this.sbView.updateTeamState(teamNum, state.teams[teamNum].state as 0 | 1 | 2);
  }

  private insertCasterUI(): void {
    const state = this.scoreboard.getState();
    state.caster.forEach((caster, idx) => this.setCaster(idx, caster));
  }

  private insertScoreboardData(): void {
    const state = this.scoreboard.getState();
    this.fieldView.updateValues(state.fields);
    const type = (['teams', 'crews', 'ironman'] as const).indexOf(state.type);
    this.sbView.setTeamType(type >= 0 ? type : 0);
    this.sbView.setMatchFormat(state.matchformat.type, state.matchformat.value);
    this.bus.fire('scoreboardteamschanged');
    this.bus.fire('scoreboardcasterchanged');
    this.bus.fire('scoreboardchanged', true);
  }

  private async rebuildSeatOrder(): Promise<void> {
    const state = this.scoreboard.getState();
    const glued = this.seatOrderView.isGlued;

    let order = [...state.seatorder] as [TeamNumber, number][];
    if (glued && order.length > 0) {
      const first = order[0][0];
      const groups: Record<number, [TeamNumber, number][]> = { 1: [], 2: [] };
      order.forEach((s) => groups[s[0]].push(s));
      order = [...groups[first], ...groups[first === 1 ? 2 : 1]];
    }

    this.seatOrderView.build(
      order,
      state.teams,
      (newOrder, affectedSeat) => {
        this.scoreboard.setSeatOrder(newOrder);
        if (glued && affectedSeat) this.rebuildSeatOrder();
      }
    );
  }

  private async buildPlayerAutoCompleteList(): Promise<void> {
    this.bgWork.start('buildPlayerAutoCompleteList');
    const players = await this.db.get<Record<string, unknown>>('player');
    const frag = document.createDocumentFragment();
    const namesAdded: string[] = [];
    players.forEach((p) => {
      const name = p.name as string;
      if (namesAdded.includes(name)) return;
      const opt = document.createElement('option');
      opt.value = name;
      frag.appendChild(opt);
      namesAdded.push(name);
    });
    const datalist = document.getElementById('playernames');
    if (datalist) {
      datalist.innerHTML = '';
      datalist.appendChild(frag);
    }
    this.bgWork.finish('buildPlayerAutoCompleteList');
    this.ws.send('playersList', players);
  }

  private async buildGameSelection(): Promise<void> {
    const el = document.getElementById('game-select');
    if (!el) return;
    el.innerHTML = '';
    const games = await this.db.get<Record<string, unknown>>('game');
    const state = this.scoreboard.getState();
    games.forEach((game) => {
      const opt = document.createElement('option');
      opt.value = game._id as string;
      opt.innerText = game.name as string;
      opt.selected = state.game === game._id;
      el.appendChild(opt);
    });
  }

  private async buildThemeSelection(): Promise<void> {
    const el = document.getElementById('theme-select');
    if (!el) return;
    el.innerHTML = '';
    const themes = await this.theme.getThemesList();
    themes.forEach((t) => {
      const opt = document.createElement('option');
      const dir = (t as unknown as { dir: string }).dir;
      const name = (t as unknown as { name: string; Name: string }).Name ?? (t as unknown as { name: string }).name;
      opt.value = dir;
      opt.innerText =
        name + (themes.some((x) => (x as unknown as { name: string }).name === (t as unknown as { name: string }).name && (x as unknown as { dir: string }).dir !== dir) ? ` (${dir})` : '');
      opt.selected = this.theme.dir === dir;
      el.appendChild(opt);
    });
  }

  private onPlayerChanged(docs: Record<string, unknown>[]): void {
    const state = this.scoreboard.getState();
    for (const teamNum of [1, 2] as TeamNumber[]) {
      for (let playerNum = 0; playerNum < state.teams[teamNum].players.length; playerNum++) {
        const po = state.teams[teamNum].players[playerNum];
        const txb = document.querySelector(`#playeritem-${teamNum}-${playerNum} input.playername`) as HTMLInputElement | null;
        docs.forEach((doc) => {
          if (doc.name === txb?.value || doc._id === po._id) {
            txb?.dispatchEvent(new Event('input'));
          }
        });
      }
    }
    const oldIds = state.caster.map((x) => x._id);
    const newIds = docs.map((x) => x._id);
    const affected = oldIds.filter((id) => newIds.includes(id));
    affected.forEach((pId) => {
      const idx = oldIds.indexOf(pId);
      this.scoreboard.setCaster(idx, new Player(docs[newIds.indexOf(pId)] as ConstructorParameters<typeof Player>[0]));
    });
    if (affected.length > 0) this.bus.fire('scoreboardcasterchanged');
  }

  private handleWsCommand(data: Record<string, unknown>): void {
    switch (data.name) {
      case 'score':
        this.modifyScore(data.team as TeamNumber, data.value as number, data.absolute as boolean);
        break;
      case 'clear': this.scoreboard.clearBoard(); break;
      case 'swap': this.scoreboard.swap(null); break;
      case 'update': this.update(); break;
      case 'character':
        this.setCharacter(
          data.team as TeamNumber,
          data.player as number,
          (data.character as { id: string }).id,
          (data.character as { skin: number }).skin
        );
        break;
    }
  }
}
