export class SavedValue {
  private values: Record<string, unknown>;

  constructor() {
    this.values = {};
  }

  isSet(name: string, value: unknown, overwrite = true): boolean {
    const isIdentical = this.get(name) === value;
    if (!isIdentical && overwrite) {
      this.set(name, value);
    }
    return isIdentical;
  }

  set(name: string, value: unknown): void {
    this.values[name] = value;
  }

  get(name: string): unknown {
    if (!Object.prototype.hasOwnProperty.call(this.values, name)) {
      this.values[name] = '';
    }
    return this.values[name];
  }

  clear(): void {
    this.values = {};
  }
}
