import { SmashggWrapper } from '../../js/class/websites.class';
import type { IPlayer } from '@shared/types/player.types';

export class SmashggService {
  readonly wrapper: SmashggWrapper;

  constructor() {
    this.wrapper = new SmashggWrapper();
  }

  setToken(token: string): void {
    this.wrapper.Token = token;
  }

  get token(): string {
    return this.wrapper.token;
  }

  get selectedTournament(): string | null {
    return this.wrapper.selectedTournament;
  }

  get selectedStream(): number | null {
    return this.wrapper.selectedStream;
  }

  setTournamentAndStream(tournamentSlug: string | null, streamId: number | null): void {
    this.wrapper.SelectedTournament = tournamentSlug;
    this.wrapper.SelectedStream = streamId;
  }

  async fetchStreamQueue(): Promise<unknown[]> {
    return (await this.wrapper.fetchStreamQueue()) ?? [];
  }

  comparePlayer(local: IPlayer, remote: Record<string, unknown>): Array<{ field: string; local: unknown; smashgg: unknown; ignored: boolean }> {
    return SmashggWrapper.comparePlayer(local as unknown as Record<string, unknown>, remote);
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.wrapper.on(event, listener);
  }
}
