import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

const { SlippiGame, Ports, ConnectionStatus } = require('@slippi/slippi-js');
const { SlpLiveStream, SlpRealTime } = require('@vinceau/slp-realtime');
const { watch } = require('object-watcher');

interface SlippiCache {
  settings: unknown;
  options: unknown;
  lastFinalizedFrame: unknown;
  latestFrameIndex: unknown;
  settingsComplete?: unknown;
  frame: unknown;
  gameEnd: unknown;
  lras: unknown;
  combo: unknown;
}

export class SlippiIntegration {
  slippiIP: string;
  slippiPort: number;
  slippiFolder: string;
  readonly connectionStatus: typeof ConnectionStatus;
  realtime: unknown;
  slippiType: 'console' | 'dolphin';
  stream: unknown;
  status: unknown;
  autoconnect: boolean;
  port: number;
  autoscore: boolean;
  cache: SlippiCache;
  readonly event: EventEmitter;
  private isEndedRecently: boolean;
  private gameEnded: unknown;
  private gameStarted: unknown;
  private frame: number;
  private sceneFrameCounter: number;
  private playerbackup: unknown[];

  constructor() {
    this.slippiIP = '127.0.0.1';
    this.slippiPort = 0;
    this.slippiFolder = '';
    this.connectionStatus = ConnectionStatus;
    this.slippiType = 'console';
    this.realtime = new SlpRealTime();
    this.stream = new SlpLiveStream(this.slippiType);
    this.status = ConnectionStatus.DISCONNECTED;
    this.autoconnect = false;
    this.port = 42070;
    this.autoscore = false;
    this.isEndedRecently = false;
    this.gameEnded = {};
    this.gameStarted = {};
    this.frame = 0;
    this.sceneFrameCounter = 0;
    this.playerbackup = [];
    this.event = new EventEmitter();
    this.cache = {
      settings: undefined,
      options: undefined,
      lastFinalizedFrame: undefined,
      latestFrameIndex: undefined,
      frame: undefined,
      gameEnd: undefined,
      lras: undefined,
      combo: undefined,
    };
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.event.on(event, listener);
  }

  setAutoConnect(val: boolean): void { this.autoconnect = val; }
  getAutoConnect(): boolean { return this.autoconnect; }
  setSlippiIP(val: string): void { this.slippiIP = val; }
  setSlippiPort(val: string | number): void { this.slippiPort = parseInt(String(val), 10); }
  setSlippiFolder(val: string): void { this.slippiFolder = val; }
  setSlippiType(val: 'console' | 'dolphin'): void { this.slippiType = val; }

  async startSlippi(): Promise<void> {
    const s = this.stream as { destroy?: () => void };
    if (s?.destroy) s.destroy();

    this.stream = new SlpLiveStream(this.slippiType);
    const stream = this.stream as {
      start: (ip: string, port: number) => Promise<void>;
      parser: {
        latestFrameIndex: number;
        lastFinalizedFrame: number;
        frames: Record<number, unknown>;
        settings: unknown;
        options: unknown;
        settingsComplete: unknown;
      };
      end: () => void;
      destroy: () => void;
    };

    stream.start(this.slippiIP, this.slippiType === 'dolphin' ? Ports.DEFAULT : this.slippiPort)
      .catch((err: unknown) => console.error(err));

    this.realtime = new SlpRealTime();
    const rt = this.realtime as {
      setStream: (s: unknown) => void;
      game: { start$: { subscribe: (cb: (p: unknown) => void) => void }; end$: { subscribe: (cb: (p: unknown) => void) => void } };
      stock: { playerDied$: { subscribe: (cb: (p: unknown) => void) => void }; percentChange$: { subscribe: (cb: (p: unknown) => void) => void } };
      combo: { comboComputer: { combos: unknown } };
    };
    rt.setStream(this.stream);

    if (this.slippiType === 'dolphin') this.autoconnect = true;

    watch(stream.parser, 'latestFrameIndex', (_prop: string, oldValue: number, newValue: number) => {
      if (oldValue === newValue) return;
      const frame = stream.parser.frames[newValue] as { start: { frame: number; sceneFrameCounter: number }; players: unknown[] } | undefined;
      if (frame) {
        this.frame = frame.start.frame;
        this.sceneFrameCounter = frame.start.sceneFrameCounter;
      }
    });

    watch(stream.parser, 'lastFinalizedFrame', (_prop: string, _old: number, newValue: number) => {
      this.cache.settings = stream.parser.settings;
      this.cache.options = stream.parser.options;
      this.cache.lastFinalizedFrame = newValue;
      this.cache.settingsComplete = stream.parser.settingsComplete;
      this.cache.latestFrameIndex = stream.parser.latestFrameIndex;
      this.cache.gameEnd = null;
      this.cache.lras = null;
      this.cache.frame = stream.parser.frames[newValue];
      this.cache.combo = rt.combo.comboComputer.combos;

      const frame = stream.parser.frames[newValue] as { players: unknown[] } | undefined;
      for (let i = 0; i < 4; i++) {
        if (frame) {
          if (frame.players[i]) {
            this.playerbackup[i] = frame.players[i];
          } else {
            (frame.players)[i] = this.playerbackup[i];
          }
        }
      }
      this.cache = { ...this.cache };
      this.event.emit('frame');
    });

    rt.game.start$.subscribe((payload: unknown) => {
      this.gameStarted = payload;
      this.event.emit('started', payload);
    });

    rt.game.end$.subscribe((payload: unknown) => {
      this.cache.settings = stream.parser.settings;
      this.cache.options = stream.parser.options;
      this.cache.lastFinalizedFrame = stream.parser.lastFinalizedFrame;
      this.cache.settingsComplete = stream.parser.settingsComplete;
      this.cache.latestFrameIndex = stream.parser.latestFrameIndex;
      this.cache.frame = stream.parser.frames[stream.parser.lastFinalizedFrame];
      this.cache.combo = rt.combo.comboComputer.combos;
      const p = payload as { gameEndMethod: unknown; winnerPlayerIndex: number };
      this.cache.gameEnd = p.gameEndMethod;
      this.cache.lras = p.winnerPlayerIndex;
      this.cache = { ...this.cache };
      this.event.emit('frame');
      this.gameEnded = payload;
      this.event.emit('ended', payload);

      if (!this.isEndedRecently) {
        this.isEndedRecently = true;
        this.addScoreToScoreboard(p);
        setTimeout(() => { this.isEndedRecently = false; }, 300);
      }
    });

    rt.stock.playerDied$.subscribe((payload: unknown) => this.event.emit('stockDeath', payload));
    rt.stock.percentChange$.subscribe((payload: unknown) => this.event.emit('percentChange', payload));
  }

  stopSlippi(): void {
    this.autoconnect = false;
    const s = this.stream as { end: () => void; destroy: () => void };
    s.end();
    s.destroy();
  }

  async restartSlippi(): Promise<void> {
    this.stream = null;
    await this.startSlippi();
  }

  async getStats(games: number | string): Promise<{ stats: unknown[]; settings: unknown[]; metadata: unknown[] }> {
    const folder = this.slippiFolder;
    let files = fs.readdirSync(folder)
      .map((v) => ({ name: v }))
      .filter((f) => f.name.endsWith('.slp'));

    files = files.sort((a, b) => {
      const g1 = new SlippiGame(path.normalize(`${folder}/${a.name}`));
      const g2 = new SlippiGame(path.normalize(`${folder}/${b.name}`));
      const t1: string = g1.getMetadata()?.startAt ?? '1';
      const t2: string = g2.getMetadata()?.startAt ?? '1';
      return Number(t2.replace(/\D/g, '')) - Number(t1.replace(/\D/g, ''));
    });

    const filePaths = files.map((v) => path.normalize(`${folder}/${v.name}`));
    const count = parseInt(String(games), 10);
    const result: { stats: unknown[]; settings: unknown[]; metadata: unknown[] } = {
      stats: [],
      settings: [],
      metadata: [],
    };

    for (let i = 0; i < count; i++) {
      const game = new SlippiGame(filePaths[i]);
      result.stats[count - i - 1] = game.getStats();
      result.settings[count - i - 1] = game.getSettings();
      result.metadata[count - i - 1] = game.getMetadata();
    }
    return result;
  }

  private addScoreToScoreboard(data: { winnerPlayerIndex: number }): void {
    if (this.autoscore) {
      this.event.emit('addScore', data.winnerPlayerIndex);
    }
  }
}
