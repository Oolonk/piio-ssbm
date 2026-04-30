import type { ICharacter } from '../../src/shared/types/character.types';

export class Character implements ICharacter {
  _id: string;
  name: string;
  shorten: string;
  defaultSkin: number;
  skins: string[];
  game: string;
  slippiId?: string;

  constructor(params?: Partial<ICharacter>) {
    const p = params ?? {};
    this._id = p._id ?? '';
    this.name = p.name ?? '';
    this.shorten = p.shorten ?? '';
    this.defaultSkin = p.defaultSkin ?? 0;
    this.skins = p.skins ?? [];
    this.game = p.game ?? '';
    if (p.slippiId !== undefined) {
      this.slippiId = p.slippiId;
    }
  }

  getSkin(index: number): string | null {
    if (this.skins.length > index) {
      return this.skins[index];
    }
    return this.DefaultSkin;
  }

  get DefaultSkin(): string | null {
    if (this.skins.length > 0) {
      if (this.skins.length <= this.defaultSkin) {
        this.defaultSkin = 0;
      }
      return this.skins[this.defaultSkin];
    }
    return null;
  }

  get Shorten(): string {
    return this.shorten ? this.shorten : this.name;
  }

  get ID(): string {
    return this._id;
  }

  get SkinCount(): number {
    return this.skins.length;
  }
}
