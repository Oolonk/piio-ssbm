export interface ICharacter {
  _id: string;
  name: string;
  shorten: string;
  defaultSkin: number;
  skins: string[];
  game: string;
  slippiId?: string;
}

/** [characterId, skinIndex] – null means no character selected */
export type CharacterSelection = [string, number] | null;
