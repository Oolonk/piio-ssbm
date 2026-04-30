import { ParryggWrapper } from '../../js/class/websites.class';

export class ParryggService {
  readonly wrapper: ParryggWrapper;

  constructor() {
    this.wrapper = new ParryggWrapper();
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

  get selectedStream(): string | null {
    return this.wrapper.selectedStream;
  }

  setTournamentAndStream(tournamentSlug: string | null, streamId: string | null): void {
    this.wrapper.SelectedTournament = tournamentSlug;
    this.wrapper.SelectedStream = streamId;
  }

  async fetchStreamQueue(): Promise<unknown[]> {
    return this.wrapper.fetchStreamQueue();
  }

  setHideNotReadySets(val: boolean): void {
    this.wrapper.hideNotReadySets = val;
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.wrapper.on(event, listener);
  }
}
