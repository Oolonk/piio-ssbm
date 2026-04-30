import type { ITheme, IThemeField } from '../../src/shared/types/theme.types';

declare const remote: { getGlobal(key: string): unknown };

export class ThemeWrapper implements ITheme {
  dir: string;
  name: string;
  resolution: [number, number] | null;
  fields: IThemeField[];
  caster: number;

  constructor() {
    this.dir = '';
    this.name = '';
    this.resolution = [0, 0];
    this.fields = [];
    this.caster = 2;
  }

  get Name(): string {
    return this.name ? this.name : this.dir;
  }

  get Path(): string {
    return `themes/${this.dir}/`;
  }

  static getThemesList(): Promise<ThemeWrapper[]> {
    return new Promise((resolve, reject) => {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const themePath = path.join(remote.getGlobal('APPRES') as string, 'themes');

      fs.readdir(themePath, { withFileTypes: true }, (err, dirs) => {
        if (err) { return reject(err); }

        const filteredDirs = dirs.filter((x) => x.isDirectory());
        const promises = filteredDirs.map(
          (dir) =>
            new Promise<ThemeWrapper>((res) => {
              const theme = new ThemeWrapper();
              theme.dir = dir.name;
              fs.readFile(path.join(themePath, dir.name, 'manifest.json'), 'utf8', (readErr, data) => {
                if (!readErr) {
                  const manifest = JSON.parse(data) as Partial<ITheme>;
                  Object.assign(theme, manifest);
                }
                res(theme);
              });
            })
        );

        Promise.all(promises).then((list) => {
          list.sort((a, b) => (a.name > b.name ? 1 : -1));
          resolve(list);
        });
      });
    });
  }

  static async getTheme(val: string | number): Promise<ThemeWrapper | undefined> {
    const themes = await ThemeWrapper.getThemesList();
    switch (typeof val) {
      case 'string': return themes.find((x) => x.dir === val);
      case 'number': return themes[val];
      default: return themes[0];
    }
  }
}
