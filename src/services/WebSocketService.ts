import { WSWrapper } from '../../js/class/ws.class';

const remote = require('@electron/remote');

export class WebSocketService {
  private ws: WSWrapper | null = null;

  connect(port?: number): void {
    const resolvedPort = port ?? (remote.getGlobal('ARGV') as Record<string, unknown>)?.port;
    this.ws = new WSWrapper(null, resolvedPort != null ? (resolvedPort as number | string) : undefined);

    this.ws.on('open', () => {
      this.ws?.send(JSON.stringify({ type: 'subscribe', data: '*' }));
    });
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.ws?.on(event, listener);
  }

  send(type: string, data: unknown): void {
    this.ws?.send(type, data);
  }

  sendRaw(message: string): void {
    this.ws?.send(message);
  }

  get instance(): WSWrapper | null {
    return this.ws;
  }
}
