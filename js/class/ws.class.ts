type WsCallback = (data: unknown) => void;
type WsAnyCallback = (name: string, data: unknown) => void;

interface WsCallbacks {
  on: Record<string, WsCallback[]>;
  once: Record<string, WsCallback[]>;
  any: WsAnyCallback[];
}

export class WSWrapper {
  url: string;
  port: number | string;
  reconnect: boolean;
  reconnectAttempts: number;
  private ws: WebSocket | null;
  private reconnectCounter: number;
  private readonly reconnectTimer: number;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null;
  private readonly _callbacks: WsCallbacks;

  constructor(url: string | null, port?: number | string, autoconnect = true) {
    this.ws = null;
    this.url = url ?? '127.0.0.1';
    this.port = port ?? 8000;
    this.reconnect = true;
    this.reconnectAttempts = 5;
    this.reconnectCounter = 0;
    this.reconnectTimer = 2000;
    this.reconnectTimeout = null;
    this._callbacks = { on: {}, once: {}, any: [] };

    if (autoconnect) {
      this.connect();
    }
  }

  connect(): void {
    const pattern = /^((ws|wss):\/\/)/;
    const url = (pattern.test(this.url) ? '' : 'ws://') + this.url;
    try {
      this.ws = new WebSocket(`${url}:${this.port}`);
    } catch (err) {
      this._wsErrored(err);
      console.log(err);
      return;
    }
    this.ws.onopen = (e) => this._wsOpened(e);
    this.ws.onclose = (e) => this._wsClosed(e);
    this.ws.onerror = (e) => this._wsErrored(e);
    this.ws.onmessage = (e) => this._wsMessage(e);
  }

  private _wsOpened(e: Event): void {
    console.log(`WebSocket connected to ${this.url}:${this.port}`);
    this.reconnectCounter = 0;
    this.emit('open', e);
  }

  private _wsClosed(e: CloseEvent): void {
    console.log(`WebSocket to ${this.url}:${this.port} has disconnected`);
    if (this.reconnect && this.reconnectAttempts > this.reconnectCounter) {
      this.reconnectCounter++;
      this._reconnect();
    } else {
      this.reconnectCounter = 0;
    }
    this.emit('close', e);
  }

  private _wsErrored(e: unknown): void {
    this.emit('error', e);
  }

  private _wsMessage(e: MessageEvent): void {
    this.emit('message', e.data);
    try {
      const data = JSON.parse(e.data as string) as Record<string, unknown>;
      this.emit('data', data);
      if ('type' in data && 'data' in data) {
        this.emit(`data-${data['type']}`, data['data']);
      }
    } catch (err) {
      console.error(err);
    }
  }

  private _reconnect(): void {
    this.emit('reconnect');
    console.log(`Reconnect to ${this.url} in ${this.reconnectTimer} ms`);
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => this.connect(), this.reconnectTimer);
  }

  on(name: string, callback: WsCallback): void {
    if (!Object.prototype.hasOwnProperty.call(this._callbacks.on, name)) {
      this._callbacks.on[name] = [];
    }
    this._callbacks.on[name].push(callback);
  }

  any(callback: WsAnyCallback): void {
    this._callbacks.any.push(callback);
  }

  once(name: string, callback: WsCallback): void {
    if (!Object.prototype.hasOwnProperty.call(this._callbacks.once, name)) {
      this._callbacks.once[name] = [];
    }
    this._callbacks.once[name].push(callback);
  }

  emit(name: string, data?: unknown): void {
    this._callbacks.any.forEach((cb) => cb(name, data));
    if (Object.prototype.hasOwnProperty.call(this._callbacks.on, name)) {
      this._callbacks.on[name].forEach((cb) => cb(data));
    }
    if (Object.prototype.hasOwnProperty.call(this._callbacks.once, name)) {
      this._callbacks.once[name].forEach((cb) => cb(data));
      this._callbacks.once[name] = [];
    }
  }

  send(arg1: string | object, arg2?: unknown): boolean {
    let data: unknown = arg2 !== undefined ? { type: arg1, data: arg2 } : arg1;
    if (!this.Open) {
      console.error('Socket not connected', this.url, this.port);
      console.log('attempted to send:', data);
      return false;
    }
    if (typeof data !== 'string') {
      try {
        data = JSON.stringify(data);
      } catch (err) {
        console.error(err);
        return false;
      }
    }
    this.ws!.send(data as string);
    return true;
  }

  get Open(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
