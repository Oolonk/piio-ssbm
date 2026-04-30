import { IpcService } from '../services/IpcService';
import { ObsStatusView } from '../views/ObsStatusView';
import { ClientSettingsModel } from '../models/ClientSettingsModel';
import { WebSocketService } from '../services/WebSocketService';

export class ObsController {
  constructor(
    private readonly ipc: IpcService,
    private readonly view: ObsStatusView,
    private readonly settings: ClientSettingsModel,
    private readonly ws: WebSocketService
  ) {
    this.wireIpc();
  }

  private wireIpc(): void {
    this.ipc.on('obs_status', (_e, status) => {
      this.view.update(status as 'disconnected' | 'connected' | 'connecting' | 'reconnecting');
    });

    this.ipc.on('obsCurrentSceneChanged', (_e, name) => {
      this.ipc.set('obsCurrentScene', name);
      this.settings.applySetting('obsCurrentScene', name);
    });

    this.ipc.on('obsSceneListChanged', (_e, list) => {
      this.ipc.set('obsSceneList', list);
      this.settings.applySetting('obsSceneList', list);
      const s = this.settings.getState();
      this.view.updateSceneDropdowns(s.obsSceneList, s.obsSceneListValues);
    });
  }

  start(): void {
    this.ipc.send('obs', 'start');
  }

  stop(): void {
    this.ipc.send('obs', 'stop');
  }

  onSceneDropdownChanged(dropdownId: string, scene: string): void {
    const s = this.settings.getState();
    const updated = { ...s.obsSceneListValues, [dropdownId]: scene };
    this.ipc.set('obsSceneListValues', updated);
    this.settings.applySetting('obsSceneListValues', updated);
  }

  onSceneToggleChanged(buttonId: string, checked: boolean): void {
    const s = this.settings.getState();
    const updated = { ...s.obsSceneListSelected, [buttonId]: checked };
    this.ipc.set('obsSceneListSelected', updated);
    this.settings.applySetting('obsSceneListSelected', updated);
    this.view.initSceneToggleButtons(updated);
  }

  onSlippiGameStarted(data: { players: { length: number } }): void {
    const s = this.settings.getState();
    const isTeams = data.players.length > 2;
    setTimeout(() => {
      if (s.slippiStartByType) {
        const key = isTeams ? 'obs-startdoubles' : 'obs-startsingles';
        const toggleKey = `${key}-toggle`;
        if (s.obsSceneListSelected[toggleKey] && s.obsSceneListValues[key]) {
          this.ipc.send('switchScene', s.obsSceneListValues[key]);
        }
      } else if (s.obsSceneListSelected['obs-startall-toggle'] && s.obsSceneListValues['obs-startall']) {
        this.ipc.send('switchScene', s.obsSceneListValues['obs-startall']);
      }
    }, s.obsSlippiDelayStart);
  }

  onSlippiGameEnded(data: { gameEndMethod: number }): void {
    const s = this.settings.getState();
    const isLra = data.gameEndMethod === 7;
    const delay = isLra ? s.obsSlippiDelayQuit : s.obsSlippiDelayEnd;
    setTimeout(() => {
      if (!s.slippiStopByWinner) {
        if (s.obsSceneListSelected['obs-stopall-toggle'] && s.obsSceneListValues['obs-stopall']) {
          this.ipc.send('switchScene', s.obsSceneListValues['obs-stopall']);
        }
      }
    }, delay);
  }
}
