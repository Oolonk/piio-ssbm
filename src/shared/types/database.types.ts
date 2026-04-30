export type DbName =
  | 'player'
  | 'character'
  | 'game'
  | 'team'
  | 'country'
  | 'match'
  | 'pride'
  | 'region'
  | 'dbstruct';

export interface IDbQuery {
  [key: string]: unknown;
}

export interface IDbParams {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  page?: number;
  resolve?: number;
}

export interface IGame {
  _id: string;
  name: string;
  shorten?: string;
  videogameId?: number;
}

export interface ITeam {
  _id: string;
  name: string;
  shorten?: string;
  prefix: string;
  website?: string;
  delimiter?: string;
  regex?: string;
  backgroundcolor?: string;
  textcolor?: string;
}

export interface ICountry {
  _id: string;
  name: string;
  continent: string;
  nation: string | null;
}

export interface IPride {
  _id: string;
  name: string;
}

export interface IRegion {
  _id: string;
  name: string;
}

export interface IMatchRecord {
  _id: string;
  teams: Record<string, {
    name: string;
    players: Array<{ _id: string; name: string; team: string[] }>;
  }>;
  caster: Array<{ _id: string; name: string }>;
  characters: Record<string, string[]>;
  fields: Record<string, string>;
  game: string;
  type: string;
  smashgg?: unknown;
  _D: Date;
  [key: string]: unknown;
}

export interface IDbStruct {
  _id: string;
  name: string;
  db: string;
  field: string;
  type: string;
  index?: number;
  relation?: DbName;
  multi?: boolean | null;
  required?: boolean;
  label?: string;
  default?: unknown;
  hidden?: boolean;
}

export interface DbAction {
  type: 'add' | 'update' | 'remove' | 'get';
  db: DbName;
  query?: IDbQuery;
  doc?: unknown;
  params?: IDbParams;
}
