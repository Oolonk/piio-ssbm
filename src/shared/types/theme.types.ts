export interface IThemeField {
  name: string;
  label: string;
  type?: 'text' | 'select' | 'checkbox' | 'color' | 'time' | 'dropdown' | 'scenes';
  options?: string[];
  checkbox?: boolean;
  multi?: boolean;
  multiple?: boolean;
  default?: string;
  matchlist?: boolean;
  [key: string]: unknown;
}

export interface ITheme {
  dir: string;
  name: string;
  resolution: [number, number] | null;
  fields: IThemeField[];
  caster: number;
  path?: string;
}
