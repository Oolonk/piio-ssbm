declare global {
  interface HTMLElement {
    truncate(): this;
    getIndex(): number;
    getIndexIn(parent: HTMLElement): number;
  }

  interface HTMLInputElement {
    insertValue(val: string): void;
  }
}

export {};
