import { EventEmitter } from 'events';
import { Player } from '../../js/class/player.class';
import type {
  IScoreboard, ITeamState, TeamNumber, IFieldValue,
} from '@shared/types/scoreboard.types';
import type { IPlayer } from '@shared/types/player.types';
import type { CharacterSelection } from '@shared/types/character.types';
import type { ITheme } from '@shared/types/theme.types';

const DEFAULT_TEAM = (): ITeamState => ({
  name: '',
  players: [],
  characters: [],
  state: 0,
  score: 0,
  selected: null,
  out: [],
});

const DEFAULT_STATE = (): IScoreboard => ({
  id: null,
  teams: { 1: DEFAULT_TEAM(), 2: DEFAULT_TEAM() },
  caster: [],
  seatorder: [],
  ports: [],
  matchformat: { type: 0, value: 0 },
  fields: {},
  game: null,
  startgg: { set: null, event: null, phaseGroup: null, phase: null },
  parrygg: { set: null, bracket: null, event: null, phase: null, tournament: null },
  type: 'teams',
  smashggtoken: null,
  parryggtoken: null,
  _D: null,
});

export class ScoreboardModel extends EventEmitter {
  private state: IScoreboard;

  constructor() {
    super();
    this.state = DEFAULT_STATE();
  }

  getState(): Readonly<IScoreboard> {
    return this.state;
  }

  loadFromObject(data: Partial<IScoreboard>): void {
    this.state = Object.assign(DEFAULT_STATE(), data);
    this.normalizePlayerInstances();
    this.emit('changed');
  }

  private normalizePlayerInstances(): void {
    for (const teamNum of [1, 2] as TeamNumber[]) {
      this.state.teams[teamNum].players = this.state.teams[teamNum].players.map(
        (p) => (p instanceof Player ? p : new Player(p as ConstructorParameters<typeof Player>[0]))
      );
    }
    this.state.caster = this.state.caster.map(
      (c) => (c instanceof Player ? c : new Player(c as ConstructorParameters<typeof Player>[0]))
    );
  }

  setPlayer(team: TeamNumber, idx: number, player: Player): void {
    this.state.teams[team].players[idx] = player;
    this.emit('teams-changed', team);
    this.emit('changed');
  }

  setTeamName(team: TeamNumber, name: string): void {
    this.state.teams[team].name = name;
    this.emit('teams-changed', team);
    this.emit('changed');
  }

  modifyScore(team: TeamNumber, inc: number, absolute = false): void {
    let value = Number(inc);
    if (!absolute) value += Number(this.state.teams[team].score);
    if (value < 0 || isNaN(value)) value = 0;
    this.state.teams[team].score = value;
    this.emit('changed', true);
  }

  setTeamState(team: TeamNumber, teamState: 0 | 1 | 2): void {
    this.state.teams[team].state = teamState;
    this.emit('changed', true);
  }

  setCharacter(team: TeamNumber, playerIdx: number, selection: CharacterSelection): void {
    this.state.teams[team].characters[playerIdx] = selection;
    this.emit('changed', true);
  }

  setPlayerActive(team: TeamNumber, playerIdx: number): void {
    this.state.teams[team].selected = playerIdx;
    this.emit('changed', true);
  }

  setPlayerOut(team: TeamNumber, playerIdx: number, out: boolean[]): void {
    this.state.teams[team].out = out;
    this.emit('changed', true);
  }

  setPort(portNum: number, assignment: [TeamNumber, number] | null): void {
    this.state.ports[portNum] = assignment;
    this.emit('changed', true);
  }

  setCaster(idx: number, caster: IPlayer): void {
    this.state.caster[idx] = caster;
    this.emit('caster-changed');
    this.emit('changed');
  }

  setSeatOrder(order: [TeamNumber, number][]): void {
    this.state.seatorder = order;
    this.emit('seatorder-changed');
    this.emit('changed', true);
  }

  setGame(gameId: string | null): void {
    this.state.game = gameId;
    this.emit('changed', true);
  }

  setMatchFormat(type: number, value?: number): void {
    this.state.matchformat.type = type as 0 | 1 | 2;
    if (value !== undefined) this.state.matchformat.value = value;
    this.emit('changed');
  }

  setFieldValue(name: string, value: string | string[]): void {
    if (this.state.fields[name]) {
      this.state.fields[name].value = value;
    } else {
      this.state.fields[name] = { value, enabled: true };
    }
    this.emit('changed');
  }

  setFieldEnabled(name: string, enabled: boolean): void {
    if (this.state.fields[name]) this.state.fields[name].enabled = enabled;
    this.emit('changed', true);
  }

  setType(type: IScoreboard['type']): void {
    this.state.type = type;
  }

  setTeamSize(size: number): void {
    for (const teamNum of [1, 2] as TeamNumber[]) {
      this.state.teams[teamNum].players.splice(size);
      for (let i = this.state.teams[teamNum].players.length; i < size; i++) {
        this.state.teams[teamNum].players.push(new Player());
      }
    }
    this.emit('teams-changed');
  }

  setCasterSize(count: number): void {
    this.state.caster.splice(count);
    for (let i = this.state.caster.length; i < count; i++) {
      this.state.caster.push(new Player());
    }
    this.emit('caster-changed');
  }

  swap(team: TeamNumber | null, playerIdx?: number): void {
    if (team === null) {
      const tmp = this.state.teams[1];
      this.state.teams[1] = this.state.teams[2];
      this.state.teams[2] = tmp;
      this.state.seatorder.forEach((seat) => { seat[0] = seat[0] === 1 ? 2 : 1; });
      this.state.ports.forEach((port) => {
        if (port != null) port[0] = port[0] === 1 ? 2 : 1;
      });
    } else if (playerIdx !== undefined) {
      const t = this.state.teams[team];
      const i = playerIdx;
      [t.players[i - 1], t.players[i]] = [t.players[i], t.players[i - 1]];
      [t.characters[i - 1], t.characters[i]] = [t.characters[i], t.characters[i - 1]];
      [t.out[i - 1], t.out[i]] = [t.out[i], t.out[i - 1]];
      if (t.selected === i) t.selected = i - 1;
      else if (t.selected === i - 1) t.selected = i;
      this.state.seatorder.forEach((seat) => {
        if (seat[0] !== team) return;
        if (seat[1] === i - 1) seat[1] = i;
        else if (seat[1] === i) seat[1] = i - 1;
      });
      this.state.ports.forEach((port) => {
        if (port == null || port[0] !== team) return;
        if (port[1] === i - 1) port[1] = i;
        else if (port[1] === i) port[1] = i - 1;
      });
    }
    this.emit('seatorder-changed');
    this.emit('teams-changed');
    this.emit('changed', true);
  }

  clearBoard(): void {
    for (const teamNum of [1, 2] as TeamNumber[]) {
      const t = this.state.teams[teamNum];
      t.players = t.players.map(() => new Player());
      t.characters = t.characters.map(() => null);
      t.name = '';
      t.score = 0;
      t.state = 0;
    }
    this.state.ports = [null, null, null, null] as unknown as IScoreboard['ports'];
    this.state.startgg = { set: null, event: null, phaseGroup: null, phase: null };
    this.emit('startgg-changed');
    this.emit('teams-changed');
    this.emit('changed', true);
  }

  correctDynamicProperties(theme: ITheme): void {
    const fields = theme.fields ?? [];
    for (const fieldName of Object.keys(this.state.fields)) {
      if (!fields.some((f) => f.name === fieldName)) {
        delete this.state.fields[fieldName];
      }
    }
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(this.state.fields, field.name)) {
        const val: IFieldValue = {
          value: '',
          enabled: !field.checkbox,
        };
        this.state.fields[field.name] = val;
      }
    }
  }

  setMatchId(id: string | null): void {
    this.state.id = id;
  }

  setStartGG(data: IScoreboard['startgg']): void {
    this.state.startgg = data;
    this.emit('startgg-changed');
  }

  setParryGG(data: IScoreboard['parrygg']): void {
    this.state.parrygg = data;
    this.emit('startgg-changed');
  }

  setTimestamp(date: Date): void {
    (this.state as unknown as Record<string, unknown>)['_D'] = date;
  }
}
