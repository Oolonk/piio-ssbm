export interface IPlayer {
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
  readonly InDB?: boolean;
  readonly HasSmashgg?: boolean;
  readonly ID?: string;
}

export type PlayerLike = Partial<IPlayer>;
