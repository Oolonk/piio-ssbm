import type { TeamNumber } from '@shared/types/scoreboard.types';

export class ScoreboardView {
  updateScore(team: TeamNumber, score: number): void {
    const el = document.getElementById(`sb-score-val-${team}`) as HTMLInputElement | null;
    if (el) el.value = String(score);
  }

  updateTeamName(team: TeamNumber, name: string, playerNames: string[]): void {
    const tbx = document.getElementById(`sb-team-name-val-${team}`) as HTMLInputElement | null;
    if (tbx) {
      tbx.placeholder = playerNames.filter((n) => n.length > 0).join(' / ');
      tbx.value = name;
    }
  }

  updateTeamState(team: TeamNumber, state: 0 | 1 | 2): void {
    const el = document.getElementById(`sb-state-${team}`);
    el?.classList.toggle('winners', state === 1);
    el?.classList.toggle('losers', state === 2);
  }

  setMultiMode(multi: boolean): void {
    document.getElementById('sb')?.classList.toggle('multi', multi);
  }

  setTeamType(num: number): void {
    const types = ['teams', 'crews', 'ironman'];
    const sb = document.getElementById('sb');
    types.forEach((t, i) => sb?.classList.toggle(`teamtype-${t}`, i === num));
    (document.getElementById('team-type-select') as HTMLSelectElement | null)!.value = String(num);
  }

  setMatchFormat(type: number, value: number): void {
    const modeEl = document.getElementById('matchmaking-mode') as HTMLSelectElement | null;
    const valueEl = document.getElementById('matchmaking-value') as HTMLInputElement | null;
    if (modeEl) modeEl.value = String(type);
    if (valueEl) {
      valueEl.value = String(value);
      valueEl.style.display = type === 0 ? 'none' : '';
    }
  }

  setGame(gameId: string | null): void {
    const el = document.getElementById('game-select') as HTMLSelectElement | null;
    if (el && gameId) el.value = gameId;
  }

  setTheme(dir: string): void {
    const el = document.getElementById('theme-select') as HTMLSelectElement | null;
    if (el) el.value = dir;
  }

  setTeamSize(size: number): void {
    const el = document.getElementById('teamsize-select') as HTMLSelectElement | null;
    if (el) el.value = String(size);
  }

  setAutoUpdate(val: boolean): void {
    const cbx = document.getElementById('autoupdate-cbx') as HTMLInputElement | null;
    if (cbx) cbx.checked = val;
  }

  setAutoScore(val: boolean): void {
    const cbx = document.getElementById('autoscore-cbx') as HTMLInputElement | null;
    if (cbx) cbx.checked = val;
  }

  animateUpdate(): void {
    const btn = document.getElementById('update-btn');
    if (!btn) return;
    btn.classList.remove('changed', 'anim');
    void btn.offsetWidth;
    btn.classList.add('anim');
  }

  markChanged(): void {
    document.getElementById('update-btn')?.classList.add('changed');
  }

  setVersion(version: string): void {
    const el = document.getElementById('version');
    if (el) el.innerText = `v ${version}`;
  }

  showModal(name: string): void {
    const panel = document.querySelector('#modal .panel') as HTMLElement & { currentModalName?: string } | null;
    if (!panel) return;
    panel.innerHTML = '';
    panel.currentModalName = name;
    const tpl = document.getElementById(`${name}-modal-tpl`) as HTMLTemplateElement | null;
    if (tpl) panel.appendChild(tpl.content.cloneNode(true));
    (panel as HTMLElement).id = `${name}-modal`;
    document.body.classList.add('modal');
    window.addEventListener('keydown', this.modalHotkeys, true);
  }

  hideModal(): void {
    window.removeEventListener('keydown', this.modalHotkeys, true);
    document.body.classList.remove('modal');
  }

  private modalHotkeys = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.hideModal();
  };
}
