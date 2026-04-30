export class BackgroundWork {
  private workers: string[] = [];

  start(name: string): void {
    if (!this.workers.includes(name)) this.workers.push(name);
    this.check();
  }

  finish(name: string): void {
    const idx = this.workers.indexOf(name);
    if (idx > -1) this.workers.splice(idx, 1);
    this.check();
  }

  finishAll(): void {
    this.workers = [];
    this.check();
  }

  get isWorking(): boolean {
    return this.workers.length > 0;
  }

  private check(): void {
    document.body.classList.toggle('working', this.workers.length > 0);
  }
}
