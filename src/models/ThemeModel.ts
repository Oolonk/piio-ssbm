import { EventEmitter } from 'events';
import { ThemeWrapper } from '../../js/class/theme.class';
import type { ITheme } from '@shared/types/theme.types';

export class ThemeModel extends EventEmitter {
  private current: ThemeWrapper | null = null;

  async load(nameOrIndex?: string | number): Promise<void> {
    const resolved = nameOrIndex ?? 0;
    const theme = await ThemeWrapper.getTheme(resolved);
    if (!theme) return;
    this.current = theme;
    this.emit('changed', this.current);
  }

  async getThemesList(): Promise<ThemeWrapper[]> {
    return ThemeWrapper.getThemesList();
  }

  get theme(): ThemeWrapper | null {
    return this.current;
  }

  get data(): ITheme | null {
    return this.current as unknown as ITheme | null;
  }

  get dir(): string {
    return (this.current as unknown as { dir?: string })?.dir ?? '';
  }

  get casterCount(): number {
    return (this.current as unknown as { caster?: number })?.caster ?? 2;
  }

  set casterCount(val: number) {
    if (this.current) {
      (this.current as unknown as { caster: number }).caster = val;
      this.emit('changed', this.current);
    }
  }

  isLoaded(): boolean {
    return this.current !== null;
  }

  isSame(nameOrIndex: string | number): boolean {
    return (this.current as unknown as { dir?: string | number })?.dir === nameOrIndex;
  }
}
