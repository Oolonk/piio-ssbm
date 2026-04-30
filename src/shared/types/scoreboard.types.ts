import type { IPlayer } from './player.types';
import type { CharacterSelection } from './character.types';

export type TeamNumber = 1 | 2;
export type TeamType = 'teams' | 'crews' | 'ironman';

export interface ITeamState {
  name: string;
  players: IPlayer[];
  characters: CharacterSelection[];
  score: number;
  /** 0 = neutral, 1 = winners bracket, 2 = losers bracket */
  state: 0 | 1 | 2;
  /** Active player index for crews/ironman mode */
  selected: number | null;
  /** Eliminated flags per player (crews/ironman mode) */
  out: boolean[];
}

export interface IStartGGRef {
  set: string | null;
  event: string | null;
  phaseGroup: string | null;
  phase: string | null;
}

export interface IParryGGRef {
  set: string | null;
  bracket: string | null;
  event: string | null;
  phase: string | null;
  tournament: string | null;
}

export interface IMatchFormat {
  /** 0 = freeplay, 1 = best-of, 2 = first-to */
  type: 0 | 1 | 2;
  value: number;
}

export interface IFieldValue {
  value: string | string[];
  enabled: boolean;
}

export interface IScoreboard {
  id: string | null;
  teams: Record<TeamNumber, ITeamState>;
  caster: IPlayer[];
  seatorder: [TeamNumber, number][];
  ports: ([TeamNumber, number] | null)[];
  matchformat: IMatchFormat;
  fields: Record<string, IFieldValue>;
  game: string | null;
  startgg: IStartGGRef;
  parrygg: IParryGGRef;
  smashggtoken: string | null;
  parryggtoken: string | null;
  type: TeamType;
  _D: Date | null;
}
