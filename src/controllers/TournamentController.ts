import { SmashggService } from '../services/SmashggService';
import { ParryggService } from '../services/ParryggService';
import { IpcService } from '../services/IpcService';
import { EventBus } from '../utils/EventBus';
import type { IScoreboard } from '@shared/types/scoreboard.types';
import type { IPlayer } from '@shared/types/player.types';

export type TournamentWebsite = 'smashgg' | 'parrygg' | null;

export class TournamentController {
  private activeWebsite: TournamentWebsite = null;

  constructor(
    private readonly smashgg: SmashggService,
    private readonly parrygg: ParryggService,
    private readonly ipc: IpcService,
    private readonly bus: EventBus
  ) {}

  setActiveWebsite(website: TournamentWebsite): void {
    this.activeWebsite = website;
  }

  async openStreamQueueOptions(
    scoreboard: Readonly<IScoreboard>,
    smashggToken: string,
    parryggToken: string
  ): Promise<void> {
    const windowSettings = await this.ipc.openWindow(
      'streamqueue-settings',
      {
        tournamentSlug:
          this.activeWebsite === 'smashgg'
            ? this.smashgg.selectedTournament
            : this.parrygg.selectedTournament,
        streamId:
          this.activeWebsite === 'smashgg'
            ? this.smashgg.selectedStream
            : this.parrygg.selectedStream,
        'smashgg-token': smashggToken,
        'parrygg-token': parryggToken,
        tournamentWebsite: this.activeWebsite,
      },
      true
    ) as Record<string, unknown> | null;

    if (!windowSettings) return;

    this.activeWebsite = windowSettings['tournamentWebsite'] as TournamentWebsite;
    await this.ipc.set('tournamentWebsite', this.activeWebsite);

    const tournamentSlug = windowSettings['tournamentSlug'] as string | null;
    const streamId = windowSettings['streamId'];

    switch (this.activeWebsite) {
      case 'smashgg':
        this.smashgg.setTournamentAndStream(tournamentSlug, streamId as number | null);
        await this.ipc.set('smashgg', {
          tournament: tournamentSlug,
          stream: streamId,
        });
        await this.ipc.set('parrygg', { tournament: '', stream: null });
        break;
      case 'parrygg':
        this.parrygg.setTournamentAndStream(tournamentSlug, streamId as string | null);
        await this.ipc.set('parrygg', {
          tournament: this.parrygg.selectedTournament,
          stream: this.parrygg.selectedStream,
        });
        await this.ipc.set('smashgg', { tournament: '', stream: null });
        break;
    }
  }

  async getStreamQueue(): Promise<unknown[]> {
    switch (this.activeWebsite) {
      case 'smashgg': return this.smashgg.fetchStreamQueue();
      case 'parrygg': return this.parrygg.fetchStreamQueue();
      default: return [];
    }
  }

  async getDifferences(player: IPlayer): Promise<{
    smashgg: { differences: Array<{ field: string; local: unknown; smashgg: unknown; ignored: boolean }> };
    parrygg: { differences: unknown[] };
  }> {
    const smashggDiffs = this.smashgg.comparePlayer(
      player,
      player as unknown as Record<string, unknown>
    );
    return {
      smashgg: { differences: smashggDiffs },
      parrygg: { differences: [] },
    };
  }
}
