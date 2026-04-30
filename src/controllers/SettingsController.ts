import { ClientSettingsModel } from '../models/ClientSettingsModel';
import { IpcService } from '../services/IpcService';
import { SmashggService } from '../services/SmashggService';
import { ParryggService } from '../services/ParryggService';

export class SettingsController {
  constructor(
    private readonly settings: ClientSettingsModel,
    private readonly ipc: IpcService,
    private readonly smashgg: SmashggService,
    private readonly parrygg: ParryggService
  ) {}

  async loadAndApply(): Promise<void> {
    await this.settings.load();
    this.applyAll();
  }

  applyAll(): void {
    const s = this.settings.getState();

    smashgg: {
      this.smashgg.setToken(s.smashggToken);
    }
    parrygg: {
      this.parrygg.setToken(s.parryggToken);
      this.parrygg.setHideNotReadySets(false);
    }

    this.ipc.send('connectionType', s.slippiStartByType);
    this.ipc.send('apiPassword', s.apiPassword);
  }

  async toggleAutoUpdate(value?: boolean): Promise<void> {
    const next = value ?? !this.settings.get('autoupdate');
    await this.settings.save('autoupdate', next);
    (document.getElementById('autoupdate-cbx') as HTMLInputElement | null)!.checked = next;
  }

  async toggleAutoScore(value?: boolean): Promise<void> {
    const next = value ?? !this.settings.get('autoscore');
    await this.settings.save('autoscore', next);
    this.ipc.send('slippiautoscore', next);
    (document.getElementById('autoscore-cbx') as HTMLInputElement | null)!.checked = next;
  }

  async set(name: string, value: unknown): Promise<void> {
    await this.settings.save(name, value);
  }
}
