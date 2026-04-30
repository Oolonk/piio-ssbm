import { EventEmitter } from 'events';
import type { IClientSetting } from '@shared/types/ipc.types';
import type { IpcService } from '../services/IpcService';

export interface IClientSettings {
  autoupdate: boolean;
  autoscore: boolean;
  autoupdateThreshold: number;
  fixedSidebar: boolean;
  fixedStreamQueue: boolean;
  teamSize: number | null;
  smashggToken: string;
  parryggToken: string;
  showSmashggToken: boolean;
  showParryggToken: boolean;
  obsSlippiDelayStart: number;
  obsSlippiDelayEnd: number;
  obsSlippiDelayQuit: number;
  slippiStartByType: boolean;
  slippiStopByWinner: boolean;
  obsCurrentScene: string;
  obsSceneList: string[];
  obsSceneListValues: Record<string, string>;
  obsSceneListSelected: Record<string, boolean>;
  tournamentWebsite: string | null;
  theme: string | null;
  apiPassword: string;
}

const defaults: IClientSettings = {
  autoupdate: false,
  autoscore: false,
  autoupdateThreshold: 500,
  fixedSidebar: true,
  fixedStreamQueue: false,
  teamSize: null,
  smashggToken: '',
  parryggToken: '',
  showSmashggToken: false,
  showParryggToken: false,
  obsSlippiDelayStart: 0,
  obsSlippiDelayEnd: 2000,
  obsSlippiDelayQuit: 0,
  slippiStartByType: false,
  slippiStopByWinner: false,
  obsCurrentScene: '',
  obsSceneList: [],
  obsSceneListValues: {},
  obsSceneListSelected: {},
  tournamentWebsite: null,
  theme: null,
  apiPassword: '',
};

export class ClientSettingsModel extends EventEmitter {
  private state: IClientSettings;

  constructor(private readonly ipc: IpcService) {
    super();
    this.state = { ...defaults };
  }

  async load(): Promise<IClientSetting[]> {
    const settings = await this.ipc.get('settings');
    this.applyAll(settings);
    return settings;
  }

  applyAll(settings: IClientSetting[]): void {
    settings.forEach((row) => this.applySetting(row.name, row.value));
  }

  applySetting(name: string, value: unknown): void {
    switch (name) {
      case 'autoupdate': this.state.autoupdate = Boolean(value); break;
      case 'autoscore': this.state.autoscore = Boolean(value); break;
      case 'autoupdateThreshold': this.state.autoupdateThreshold = Number(value); break;
      case 'fixedSidebar': this.state.fixedSidebar = Boolean(value); break;
      case 'fixedStreamQueue': this.state.fixedStreamQueue = Boolean(value); break;
      case 'smashgg-token': this.state.smashggToken = String(value ?? ''); break;
      case 'parrygg-token': this.state.parryggToken = String(value ?? ''); break;
      case 'showSmashggToken': this.state.showSmashggToken = Boolean(value); break;
      case 'showParryggToken': this.state.showParryggToken = Boolean(value); break;
      case 'obsSlippiDelayStart': this.state.obsSlippiDelayStart = parseInt(String(value), 10) || 0; break;
      case 'obsSlippiDelayEnd': this.state.obsSlippiDelayEnd = parseInt(String(value), 10) || 2000; break;
      case 'obsSlippiDelayQuit': this.state.obsSlippiDelayQuit = parseInt(String(value), 10) || 0; break;
      case 'slippiStartByType': this.state.slippiStartByType = Boolean(value); break;
      case 'slippiStopByWinner': this.state.slippiStopByWinner = Boolean(value); break;
      case 'obsCurrentScene': this.state.obsCurrentScene = String(value ?? ''); break;
      case 'obsSceneList': this.state.obsSceneList = Array.isArray(value) ? value as string[] : []; break;
      case 'obsSceneListValues': this.state.obsSceneListValues = (value as Record<string, string>) ?? {}; break;
      case 'obsSceneListSelected': this.state.obsSceneListSelected = (value as Record<string, boolean>) ?? {}; break;
      case 'tournamentWebsite': this.state.tournamentWebsite = value as string | null; break;
      case 'theme': this.state.theme = value as string | null; break;
      case 'apiPassword': this.state.apiPassword = String(value ?? ''); break;
    }
    this.emit('changed', name, value);
  }

  async save(name: string, value: unknown): Promise<void> {
    this.applySetting(name, value);
    await this.ipc.set(name, value);
  }

  getState(): Readonly<IClientSettings> {
    return this.state;
  }

  get<K extends keyof IClientSettings>(key: K): IClientSettings[K] {
    return this.state[key];
  }
}
