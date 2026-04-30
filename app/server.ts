import * as path from 'path';
import * as fs from 'fs-extra';
import * as net from 'net';
import * as os from 'os';
import { EventEmitter } from 'events';
import { APP } from './window-manager';

const express = require('express');
const ExpressWs = require('express-ws');
const WebSocket = require('ws');
const bonjour = require('bonjour')({ multicast: false });

declare const APPRES: string;

function defaultPort(): number {
  return process.platform === 'win32' ? 80 : 8000;
}

interface ExtendedWebSocket {
  isAlive: boolean;
  subscriptions: string[];
  _SELF: { id?: string; name?: string } | null;
  receiveAll: boolean;
  hasPassword?: boolean;
  send: (data: string) => void;
  terminate: () => void;
  ping: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  readyState: number;
}

interface DynStatic {
  (req: unknown, res: unknown, next: () => void): void;
  setPath: (newPath: string) => void;
}

export class Server {
  readonly event: EventEmitter;
  port: number;
  root: string;
  webPath: string;
  theme: string;
  apiPassword: string;
  themeManifest: Record<string, unknown>;
  msgCache: Record<string, string>;

  private server: ReturnType<typeof express>;
  private expressWs: ReturnType<typeof ExpressWs>;
  private bonjour: typeof bonjour;
  private pingInterval: number;
  private socket: ReturnType<typeof import('dgram').createSocket>;
  private themeWatcher: fs.FSWatcher | null;
  private dynStatic: DynStatic | null;
  private about: Record<string, unknown>;

  constructor() {
    this.server = express();
    this.expressWs = ExpressWs(this.server);
    this.port = defaultPort();
    this.bonjour = bonjour;
    this.pingInterval = 10;
    this.socket = require('dgram').createSocket('udp4');
    this.event = new EventEmitter();
    this.theme = '';
    this.apiPassword = '';
    this.webPath = '';
    this.root = '';
    this.themeManifest = {};
    this.msgCache = {};
    this.themeWatcher = null;
    this.dynStatic = null;
    this.about = {
      name: 'PIIO',
      version: APP.getVersion(),
      host: os.hostname(),
      apiVersion: 1,
    };
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.event.on(event, listener);
  }

  async start(): Promise<void> {
    this.themeWatcher = fs.watch(path.join(APPRES, 'themes'));
    this.themeWatcher.on('change', () => this.event.emit('themefolder-changed'));

    this.bonjour.publish({
      name: `${os.hostname()}-${(Math.random() + 1).toString(36).substring(7)}`,
      type: 'piio',
      port: this.port,
      txt: this.about,
    });

    this.dynStatic = this.createDynStatic(
      path.join(this.webPath, 'themes/' + this.theme)
    );

    this.server.use('/assets', express.static(path.join(this.webPath, 'assets')));

    this.server.get(
      '/:filename',
      (
        req: { params: { filename: string } },
        res: { write: (s: string) => void; end: () => void },
        next: () => void
      ) => {
        try {
          const cont = fs.readFileSync(
            path.join(
              this.webPath,
              'themes/' + this.theme,
              req.params.filename + '.html'
            ),
            'utf8'
          );
          const folders = this.themeManifest.folders as
            | { css?: string; js?: string }
            | undefined;

          res.write('<!DOCTYPE html>\r\n<html>\r\n<head>\r\n');
          res.write('<meta charset="UTF-8" />\r\n');
          res.write('<link rel="icon" type="image/x-icon" href="/favicon.svg">\r\n');
          res.write(
            `<title>Piio | ${(this.themeManifest.name as string) || this.theme} | ${req.params.filename} ${this.themeManifest.resolution ? '[' + (this.themeManifest.resolution as number[]).join(',') + ']' : ''}</title>\r\n`
          );

          const styles = this.themeManifest.styles as string[] | undefined;
          if (styles) {
            for (const href of styles) {
              res.write(`<link rel="stylesheet" href="${href}" type="text/css" />\r\n`);
            }
          }
          res.write(
            `<link rel="stylesheet" href="${folders?.css ? folders.css + '/' : ''}${req.params.filename}.css" type="text/css" />\r\n`
          );

          const scripts = this.themeManifest.scripts as string[] | undefined;
          if (scripts) {
            for (const src of scripts) {
              res.write(`<script type="text/javascript" src="${src}"></script>\r\n`);
            }
          }

          res.write('<script type="text/javascript" src="/all.js"></script>\r\n');
          res.write(
            `<script type="text/javascript" src="${folders?.js ? folders.js + '/' : ''}${req.params.filename}.js"></script>\r\n`
          );
          res.write(
            `<script type="text/javascript">var __FILENAME__ = "${req.params.filename}";</script>\r\n`
          );
          res.write('</head>\r\n');

          const resolution = this.themeManifest.resolution as number[] | undefined;
          if (resolution) {
            res.write(
              `<body style="width:${resolution[0] ?? 'auto'}px;height:${resolution[1] ?? 'auto'}px;">\r\n`
            );
          } else {
            res.write('<body>\r\n');
          }
          res.write(cont);
          res.write('\r\n</body>\r\n</html>\r\n');
          res.end();
        } catch {
          next();
        }
      }
    );

    this.server.use(this.dynStatic);

    this.server.get(
      '/all.js',
      (req: unknown, res: { writeHead: (code: number, headers: Record<string, string>) => void; sendFile: (p: string) => void; status: (code: number) => { send: (s: string) => void } }) => {
        const bundlePath = path.join(this.root, '..', 'js', 'dist', 'all.js');
        if (fs.existsSync(bundlePath)) {
          (res as unknown as { sendFile: (p: string) => void }).sendFile(bundlePath);
        } else {
          (res as unknown as { status: (n: number) => { send: (s: string) => void } })
            .status(404)
            .send('Overlay bundle not built. Run: npm run build:overlay');
        }
      }
    );

    this.server.get(
      '/about.json',
      (_req: unknown, res: { writeHead: (c: number, h: Record<string, string>) => void; write: (s: string) => void; end: () => void }) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(
          JSON.stringify(
            {
              name: 'PIIO',
              version: APP.getVersion(),
              host: os.hostname(),
              apiPassword: this.apiPassword !== '',
              apiVersion: 1,
            },
            null,
            4
          )
        );
        res.end();
      }
    );

    this.server.get(
      '/checkPassword/:password',
      (
        req: { params: { password: string } },
        res: { writeHead: (c: number, h: Record<string, string>) => void; write: (s: string) => void; end: () => void }
      ) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const isValid =
          this.apiPassword === req.params.password || this.apiPassword === '';
        res.write(JSON.stringify({ valid: isValid }, null, 4));
        res.end();
      }
    );

    this.server.get(
      '/favicon.svg',
      (_req: unknown, res: { writeHead: (c: number, h: Record<string, string>) => void; write: (s: string) => void; end: () => void }) => {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        const cont = fs.readFileSync(
          path.join(this.root, '..', 'img', 'logo.svg'),
          'utf8'
        );
        res.write(cont);
        res.end();
      }
    );

    this.server.get(
      '/',
      (_req: unknown, res: { writeHead: (c: number, h: Record<string, string>) => void; write: (s: string) => void; end: () => void }) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.readdir(
          path.join(this.webPath, 'themes/' + this.theme),
          (err: NodeJS.ErrnoException | null, files: string[]) => {
            if (err) throw err;
            let manifest: Record<string, unknown> | undefined;
            try {
              manifest = JSON.parse(
                fs.readFileSync(
                  path.join(
                    this.webPath,
                    'themes/' + this.theme + '/manifest.json'
                  ),
                  'utf8'
                )
              ) as Record<string, unknown>;
            } catch { /* manifest is optional */ }

            res.write(
              `<html><head><title>${this.theme} | piio overlays</title><meta charset="UTF-8" />`
            );
            res.write('<link rel="icon" type="image/x-icon" href="/favicon.svg">');
            res.write(`<style>
body { font-family:segoe ui, arial; color: black; margin:0; background: #dee3ed; }
@media (prefers-color-scheme: dark) { body { color:white; background: #121721; } #top { background:#092334 !important; color: white !important; } }
#top { position:relative; background:#6f899a; font-weight:bold; font-size:40px; color:black; padding:4px 15px; }
.meta { position:absolute; right:10px; top:6px; font-size:12px; opacity:0.9; font-weight:normal; text-align:right; }
#overlay-list a { display:block; width:300px; color:inherit; font-size:16px; font-weight:bold; text-transform:uppercase; padding:10px; border:1px solid #eee; margin:10px; border-radius:5px; text-decoration:none; transition:all 100ms; }
#overlay-list a:hover { color:#fff; background:#000; transition:all 0ms; }
#info { padding:20px; }
</style>`);
            res.write('</head><body>');
            res.write('<div id="top">');
            res.write(
              manifest?.name ? (manifest.name as string) : this.theme
            );
            const m = manifest ?? {};
            res.write(`<div class="meta">
<div>${m.author ?? ''}</div>
<div>${m.resolution != null ? `${(m.resolution as number[])[0]} x ${(m.resolution as number[])[1]}` : 'dynamic resolution'}</div>
<div>${m.caster ?? 0} caster</div>
</div>`);
            res.write('</div>');
            res.write('<div id="overlay-list" style="display:flex;flex-wrap:wrap;">');
            files
              .filter((x) => x.endsWith('.html'))
              .forEach((file) => {
                const fileName = file.slice(0, -5);
                res.write(`<a href="${fileName}">${fileName}</a>`);
              });
            res.write('</div><div id="info">');
            if (manifest) {
              res.write('<h3>Custom fields:</h3>');
              (manifest.fields as Array<{ label: string }> ?? []).forEach((field) => {
                res.write(`<li>${field.label}</li>`);
              });
            } else {
              res.write(
                `<b>manifest.json</b> not found in "themes/${this.theme}/manifest.json"`
              );
            }
            res.write('</div></body></html>');
            res.end();
          }
        );
      }
    );

    this.server.ws(
      '/',
      (ws: ExtendedWebSocket, _req: unknown) => {
        ws.isAlive = true;
        ws.subscriptions = [];
        ws._SELF = null;
        ws.receiveAll = false;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', (...args: unknown[]) => {
          const msg = args[0] as string;
          try {
            let data: unknown[] = JSON.parse(msg) as unknown[];
            if (!Array.isArray(data)) data = [data];
            (data as Array<Record<string, unknown>>).forEach((d) => {
              this.handleMessage(d, ws);
              this.broadcast(JSON.stringify(d), ws);
            });
          } catch (error) {
            console.error('WS parse error:', error);
          }
        });
        ws.on('close', () => this.broadcastRegisteredOverlays());
      }
    );

    this.server.get(
      '/*splat',
      (_req: unknown, res: { sendStatus: (n: number) => void }) =>
        res.sendStatus(404)
    );

    this.checkPort(this.port)
      .then(() => {
        console.log('Start server on port', this.port);
        this.server.listen(this.port, () => this.event.emit('listening'));
        this.socket.bind(0);
        setInterval(() => this.ping(), this.pingInterval * 1000);
      })
      .catch(() => this.event.emit('port-in-use'));
  }

  private checkPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.once('listening', () => { server.close(); resolve(); });
      server.listen(port);
    });
  }

  private handleMessage(inData: Record<string, unknown>, ws: ExtendedWebSocket): void {
    this.event.emit(`data-${inData.type}`, inData.data);
    switch (inData.type) {
      case 'request': return this.responseRequest(ws, inData.data as string);
      case 'subscribe': return subscribeClient(ws, inData.data as string);
      case 'register': return this.registerOverlay(ws, inData.data);
      case 'api': {
        if (
          inData.password !== this.apiPassword &&
          this.apiPassword !== '' &&
          !ws.hasPassword
        ) {
          ws.send(
            JSON.stringify({ type: 'error', data: 'Invalid API password', mid: inData.mid })
          );
        } else {
          const apiData = inData.data as Record<string, unknown>;
          const type = (apiData.name as string) ?? '';
          switch (type) {
            case 'subscribe': {
              let subscriptionCalls: string[] = [];
              switch (apiData.type) {
                case 'dmx':
                  subscriptionCalls = [
                    'dmx-channel', 'slippiGameStarted', 'slippiGameEnded',
                    'slippiStockDeath', 'slippiPercentChange', 'scoreboard',
                  ];
                  break;
                case 'app':
                  subscriptionCalls = ['app', 'scoreboard', 'streamQueue'];
                  break;
              }
              if (subscriptionCalls.length === 0) {
                ws.send(
                  JSON.stringify({
                    type: 'api',
                    data: { name: 'subscribe', success: false, err: 'Invalid Type to subscribe' },
                    mid: inData.mid,
                  })
                );
              } else {
                try {
                  subscriptionCalls.forEach((call) => subscribeClient(ws, call));
                  ws.send(
                    JSON.stringify({
                      type: 'api',
                      data: { name: 'subscribe', success: true },
                      mid: inData.mid,
                    })
                  );
                  ws.hasPassword = true;
                } catch (err) {
                  ws.send(JSON.stringify({ type: 'error', data: err, mid: inData.mid }));
                }
              }
              break;
            }
            default:
              this.event.emit(
                'api',
                apiData,
                (outData: Record<string, unknown>) => {
                  outData.mid = inData.mid;
                  ws.send(JSON.stringify(outData));
                }
              );
          }
        }
        break;
      }
    }
  }

  setTheme(val: string): void {
    if (this.theme === val) return;
    this.theme = val;
    this.themeManifest = {};
    fs.readFile(
      path.join(this.webPath, 'themes/' + this.theme, 'manifest.json'),
      'utf8',
      (err: NodeJS.ErrnoException | null, cont: string) => {
        if (!err) {
          try { this.themeManifest = JSON.parse(cont) as Record<string, unknown>; }
          catch { /* invalid JSON */ }
        }
        if (this.dynStatic) {
          this.dynStatic.setPath(
            path.join(this.webPath, 'themes/' + this.theme)
          );
        }
      }
    );
  }

  private responseRequest(client: ExtendedWebSocket, type: string): void {
    if (Object.prototype.hasOwnProperty.call(this.msgCache, type)) {
      client.send(this.msgCache[type]);
    }
  }

  private registerOverlay(client: ExtendedWebSocket, name: unknown): void {
    client._SELF = name as { id?: string; name?: string };
    this.broadcastRegisteredOverlays();
  }

  private broadcastRegisteredOverlays(): void {
    this.broadcast(
      JSON.stringify({ type: 'registered-overlays', data: this.getOverlays() })
    );
  }

  getOverlays(): Array<{ id?: string; name?: string }> {
    const list: Array<{ id?: string; name?: string }> = [];
    (this.expressWs.getWss() as { clients: Set<ExtendedWebSocket> }).clients.forEach(
      (client) => { if (client._SELF) list.push(client._SELF); }
    );
    return list;
  }

  private createDynStatic(staticPath: string): DynStatic {
    let statics = express.static(staticPath);
    const dyn: DynStatic = (req, res, next) => statics(req, res, next);
    dyn.setPath = (newPath: string) => { statics = express.static(newPath); };
    return dyn;
  }

  broadcast(data: string | Record<string, unknown>, sender: ExtendedWebSocket | null = null): void {
    const sendObj =
      typeof data === 'string'
        ? (JSON.parse(data) as Record<string, unknown>)
        : data;
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    this.msgCache[sendObj.type as string] = jsonStr;
    (this.expressWs.getWss() as { clients: Set<ExtendedWebSocket> }).clients.forEach(
      (client) => {
        if (
          (sender === null || client !== sender) &&
          (client.subscriptions.includes(sendObj.type as string) || client.receiveAll) &&
          client.readyState === WebSocket.OPEN
        ) {
          client.send(jsonStr);
        }
      }
    );
  }

  sendToID(data: string | Record<string, unknown>, id: string): void {
    const sendObj =
      typeof data === 'string'
        ? (JSON.parse(data) as Record<string, unknown>)
        : data;
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    this.msgCache[sendObj.type as string] = jsonStr;
    (this.expressWs.getWss() as { clients: Set<ExtendedWebSocket> }).clients.forEach(
      (client) => {
        if (
          client._SELF?.id === id &&
          client.readyState === WebSocket.OPEN
        ) {
          client.send(jsonStr);
        }
      }
    );
  }

  private ping(): void {
    (this.expressWs.getWss() as { clients: Set<ExtendedWebSocket> }).clients.forEach(
      (client) => {
        if (!client.isAlive) { client.terminate(); return; }
        client.isAlive = false;
        if (client.readyState === 1) client.ping();
      }
    );
  }
}

function subscribeClient(ws: ExtendedWebSocket, name: string): void {
  if (name === '*') {
    ws.receiveAll = true;
  } else if (!ws.subscriptions.includes(name)) {
    ws.subscriptions.push(name);
  }
}
