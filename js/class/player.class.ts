import type { IPlayer, PlayerLike } from '../../src/shared/types/player.types';
import type { ITeam } from '../../src/shared/types/database.types';

export interface PlayerDifference {
  name: string;
  local: unknown;
  smashgg: unknown;
  ignored: boolean;
}

export class Player implements IPlayer {
  _id: string;
  name: string;
  displayname: string;
  firstname: string;
  lastname: string;
  birthday: Date | null;
  pronoun: string;
  twitter: string;
  bluesky: string;
  twitch: string;
  steam: string;
  slippicode: string;
  country: string;
  city: string | null;
  team: string[];
  pride: string[];
  region: string;
  smashgg: string | number;
  smashggIgnore: Record<string, string>;
  parrygg: string | string[];
  parryggIgnore: Record<string, string>;
  lastActivity: Date | null;
  smashggMergeable?: number;

  constructor(params?: PlayerLike) {
    const p = params ?? {};
    this._id = p._id ?? '';
    this.name = p.name ?? '';
    this.displayname = p.displayname ?? '';
    this.firstname = p.firstname ?? '';
    this.lastname = p.lastname ?? '';
    this.birthday = p.birthday ?? null;
    this.pronoun = p.pronoun ?? '';
    this.twitter = p.twitter ?? '';
    this.bluesky = p.bluesky ?? '';
    this.twitch = p.twitch ?? '';
    this.steam = p.steam ?? '';
    this.slippicode = p.slippicode ?? '';
    this.country = p.country ?? '';
    this.city = p.city ?? null;
    this.team = p.team ?? [];
    this.pride = p.pride ?? [];
    this.region = p.region ?? '';
    this.smashgg = p.smashgg ?? 0;
    this.smashggIgnore = p.smashggIgnore ?? {};
    this.parrygg = p.parrygg ?? [];
    this.parryggIgnore = p.parryggIgnore ?? {};
    this.lastActivity = p.lastActivity ?? null;
    if (p.smashggMergeable !== undefined) {
      this.smashggMergeable = p.smashggMergeable;
    }
  }

  getDisplayName(teams: ITeam[], prefixClass?: string): string {
    if (this.displayname.length > 0) {
      return this.displayname;
    }
    const validTeams = teams.filter((x) => x != null && x.prefix != null);
    let name = this.name;
    const prefix = validTeams.map((x) => x.prefix).join(' ');
    if (validTeams.length === 1 && validTeams[0].regex && validTeams[0].regex !== '') {
      const re = new RegExp(validTeams[0].regex);
      if (this.name.match(validTeams[0].prefix)) {
        return this.name.replace(re, validTeams[0].prefix);
      }
    }
    if (prefix.length > 0) {
      let val = prefix + (validTeams.length === 1 ? validTeams[0].delimiter ?? ' | ' : ' | ');
      if (prefixClass !== undefined && prefixClass.length > 0) {
        val = `<span class="${prefixClass}">${val}</span>`;
      }
      name = val + this.name;
    }
    return name;
  }

  isSmashggFieldIgnored(name: string, value: string): boolean {
    if (Object.prototype.hasOwnProperty.call(this.smashggIgnore, name)) {
      return this.smashggIgnore[name] === value;
    }
    return false;
  }

  get ID(): string {
    return this._id;
  }

  get InDB(): boolean {
    return !(this._id === '' || this._id === null);
  }

  get HasSmashgg(): boolean {
    return !isNaN(parseInt(String(this.smashgg))) && this.smashgg !== 0;
  }

  get HasParrygg(): boolean {
    return Array.isArray(this.parrygg)
      ? this.parrygg.length > 0
      : Boolean(this.parrygg);
  }

  get PhotoPath(): string {
    return `assets/player/photo/${this.ID}.png`;
  }
}
