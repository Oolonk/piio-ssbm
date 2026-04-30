interface CountdownComponents {
  s: string;
  m: string;
  h: string;
}

export class Countdown {
  private _due: Date | null;
  private _visible: boolean;
  private readonly _margin: number;

  constructor() {
    this._due = null;
    this._visible = true;
    this._margin = 7200000; // 2 hours in ms
  }

  get String(): string {
    const arr: string[] = [];
    const c = this.Components;
    if (c.h !== '00') arr.push(c.h);
    if (c.m !== '00' || c.h !== '00') arr.push(c.m);
    arr.push(c.s);
    return arr.join(':');
  }

  get LongString(): string {
    const arr: string[] = [];
    const c = this.Components;
    if (c.h !== '00') arr.push(c.h);
    arr.push(c.m);
    arr.push(c.s);
    return arr.join(':');
  }

  get FullString(): string {
    const c = this.Components;
    return `${c.h}:${c.m}:${c.s}`;
  }

  get Components(): CountdownComponents {
    let s = Math.ceil(this.Value / 1000);
    let m = Math.floor(s / 60);
    let h = Math.floor(m / 60);
    s = s % 60;
    m = m % 60;
    return {
      h: h < 10 ? `0${h}` : String(h),
      m: m < 10 ? `0${m}` : String(m),
      s: s < 10 ? `0${s}` : String(s),
    };
  }

  get Value(): number {
    if (this.isPast) return 0;
    return this._due!.getTime() - new Date().getTime();
  }

  get isVisible(): boolean {
    return this._visible && this.isFuture;
  }

  set Visible(state: boolean) {
    this._visible = state;
  }

  set Due(value: string | number | Date) {
    const now = new Date();
    let resolved: Date;

    if (typeof value === 'string') {
      const timeArr = value.split(':');
      const timeStr = `${timeArr[0] ?? '00'}:${timeArr[1] ?? '00'}:${timeArr[2] ?? '00'}`;
      resolved = new Date(
        `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${timeStr}`
      );
      if (now > resolved) {
        resolved.setDate(resolved.getDate() + 1);
      }
    } else if (typeof value === 'number') {
      resolved = new Date(value);
    } else {
      resolved = value;
    }

    if (resolved instanceof Date) {
      this._due = resolved;
    }
  }

  get Due(): Date | null {
    return this._due;
  }

  get isPast(): boolean {
    return this._due !== null && this._due < new Date();
  }

  get isFuture(): boolean {
    return this._due !== null && this._due > new Date();
  }
}
