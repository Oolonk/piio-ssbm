type Listener<T = unknown> = (data: T) => void;

interface Callbacks {
  on: Record<string, Listener[]>;
  once: Record<string, Listener[]>;
  hold: string[];
}

export class EventBus {
  private callbacks: Callbacks = { on: {}, once: {}, hold: [] };

  on<T = unknown>(name: string, fn: Listener<T>): void {
    if (!this.callbacks.on[name]) this.callbacks.on[name] = [];
    this.callbacks.on[name].push(fn as Listener);
  }

  once<T = unknown>(name: string, fn: Listener<T>): void {
    if (!this.callbacks.once[name]) this.callbacks.once[name] = [];
    this.callbacks.once[name].push(fn as Listener);
  }

  fire<T = unknown>(name: string, data?: T): boolean {
    if (this.callbacks.hold.includes(name)) return false;
    this.callbacks.on[name]?.forEach((cb) => cb(data));
    if (this.callbacks.once[name]) {
      this.callbacks.once[name].forEach((cb) => cb(data));
      this.callbacks.once[name] = [];
    }
    return true;
  }

  hold(name: string): void {
    if (!this.callbacks.hold.includes(name)) this.callbacks.hold.push(name);
  }

  release(name: string): void {
    const idx = this.callbacks.hold.indexOf(name);
    if (idx > -1) this.callbacks.hold.splice(idx, 1);
  }

  off(name: string, fn: Listener): void {
    if (this.callbacks.on[name]) {
      this.callbacks.on[name] = this.callbacks.on[name].filter((cb) => cb !== fn);
    }
  }
}
