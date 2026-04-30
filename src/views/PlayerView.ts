import { createElement, fileExists } from '../utils/DomUtils';
import { Player } from '../../js/class/player.class';
import { Character } from '../../js/class/character.class';
import type { TeamNumber } from '@shared/types/scoreboard.types';
import type { IPlayer } from '@shared/types/player.types';
import type { CharacterSelection } from '@shared/types/character.types';
import type { DatabaseService } from '../services/DatabaseService';

const PORT_AMOUNT = 4;

export class PlayerView {
  constructor(private readonly db: DatabaseService) {}

  buildTeamPlayerList(
    teams: Record<TeamNumber, { players: IPlayer[]; characters: CharacterSelection[]; selected: number | null; out: boolean[]; score: number }>,
    game: string | null,
    ports: ([TeamNumber, number] | null)[],
    type: string,
    onPlayerNameInput: (e: Event, team: TeamNumber, idx: number) => void,
    onCharacterSelect: (team: TeamNumber, idx: number) => void,
    onEditPlayer: (e: Event) => void,
    onSetActive: (team: TeamNumber, idx: number) => void,
    onSetOut: (team: TeamNumber, idx: number) => void,
    onAssignPort: (portNum: number, team: TeamNumber, idx: number) => void,
    onSwap: (team: TeamNumber, idx: number) => void,
    onTeamSwap: () => void,
  ): void {
    const teamSize = Math.max(teams[1].players.length, teams[2].players.length);
    document.getElementById('sb')?.classList.toggle('multi', teamSize > 1);
    const tpl = document.getElementById('sb-player-tpl') as HTMLTemplateElement | null;

    for (const teamNum of [1, 2] as TeamNumber[]) {
      const teamPlayerField = document.getElementById(`sb-players-${teamNum}`);
      if (!teamPlayerField || !tpl) continue;
      teamPlayerField.innerHTML = '';

      for (let i = 0; i < teamSize; i++) {
        const playerItemEl = createElement({
          type: 'div',
          className: 'player-item',
          id: `playeritem-${teamNum}-${i}`,
          append: tpl.content.cloneNode(true),
        });

        const playerNameElm = playerItemEl.querySelector('input.playername') as HTMLInputElement;
        const characterBtn = playerItemEl.querySelector('.character-select-btn');
        const playerEditBtn = playerItemEl.querySelector('.player-edit-btn');
        const playerAddBtn = playerItemEl.querySelector('.player-create-btn');
        const portsBtns = playerItemEl.querySelector('.player-ports') as HTMLElement;
        const playerSelectCxb = playerItemEl.querySelector('.player-select') as HTMLInputElement;
        const playerOutCxb = playerItemEl.querySelector('.player-out');

        (playerItemEl as HTMLElement & { dataset: DOMStringMap }).dataset.team = String(teamNum);
        (playerItemEl as HTMLElement & { dataset: DOMStringMap }).dataset.player = String(i);

        playerNameElm.id = `playername-${teamNum}-${i}`;
        playerNameElm.value = teams[teamNum].players[i]?.name ?? '';
        playerNameElm.tabIndex = teamNum * teamSize + i;
        playerNameElm.oninput = (e) => onPlayerNameInput(e, teamNum, i);

        characterBtn?.addEventListener('click', () => onCharacterSelect(teamNum, i));
        playerEditBtn?.addEventListener('click', onEditPlayer);
        playerAddBtn?.addEventListener('click', onEditPlayer);
        playerSelectCxb.onclick = () => onSetActive(teamNum, i);
        playerOutCxb?.addEventListener('click', () => onSetOut(teamNum, i));

        portsBtns.id = `playerport-${teamNum}-${i}`;
        portsBtns.innerHTML = '';
        for (let portNum = 1; portNum <= PORT_AMOUNT; portNum++) {
          const portBtn = document.createElement('div');
          portBtn.classList.add('port');
          portBtn.innerText = String(portNum);
          portBtn.id = `playerport-${portNum}-${teamNum}-${i}`;
          portBtn.onclick = () => onAssignPort(portNum, teamNum, i);
          portsBtns.appendChild(portBtn);
        }

        teamPlayerField.appendChild(playerItemEl);
      }

      const swapField = document.getElementById(`sb-players-swap-${teamNum}`);
      if (swapField) {
        swapField.innerHTML = '';
        for (let s = 1; s < teamSize; s++) {
          swapField.appendChild(createElement({
            type: 'button',
            onclick: () => onSwap(teamNum, s),
          }));
        }
      }
    }
  }

  async updatePlayerUI(
    teamNum: TeamNumber,
    playerNum: number,
    player: IPlayer,
    character: CharacterSelection,
    game: string | null,
    ports: ([TeamNumber, number] | null)[],
    selected: number | null,
    out: boolean[],
    appRes: string
  ): Promise<void> {
    const pEl = document.getElementById(`playeritem-${teamNum}-${playerNum}`);
    if (!pEl) return;

    const co = character
      ? new Character(await this.db.getSingle<Record<string, unknown>>('character', character[0]) ?? {})
      : new Character({});

    (pEl.querySelector('input.playername') as HTMLInputElement)?.insertValue(player.name);
    await this.updateCharacterIcon(teamNum, playerNum, game, co.ID, co.getSkin(character?.[1] ?? 0), co.Shorten);

    (pEl.querySelector('.player-select') as HTMLInputElement).checked = selected === playerNum;
    pEl.querySelector('.player-out')?.classList.toggle('out', out[playerNum] ?? false);
    (pEl.querySelector('.player-edit-btn') as HTMLButtonElement).disabled = !player.InDB;
    (pEl.querySelector('.player-create-btn') as HTMLButtonElement).disabled = player.name.length === 0;

    for (let portNum = 1; portNum <= PORT_AMOUNT; portNum++) {
      const hasPort =
        ports[portNum] != null &&
        ports[portNum]![0] === teamNum &&
        ports[portNum]![1] === playerNum;
      document.getElementById(`playerport-${portNum}-${teamNum}-${playerNum}`)?.classList.toggle('checked', hasPort);
    }

    pEl.querySelector('.player-edit-btn')?.classList.toggle(
      'mergeable',
      !isNaN(parseInt(String(player.smashggMergeable))) &&
        (parseInt(String(player.smashgg)) === 0 || isNaN(parseInt(String(player.smashgg))))
    );
    pEl.querySelector('.player-create-btn')?.classList.toggle(
      'new',
      !isNaN(parseInt(String(player.smashgg))) && !player.InDB
    );

    if (player.InDB) {
      this.db
        .get('team', { $or: ([] as string[]).concat(player.team ?? []).map((x) => ({ _id: x })) })
        .then((entry) => {
          const value = entry.map((x) => (x as { name: string }).name).join(', ');
          pEl.querySelector<HTMLElement>('.team')!.innerText = value;
          pEl.classList.toggle('hasteam', value.length > 0);
        });
      this.db
        .count('player', { name: { $regex: new RegExp(`^${player.name}$`, 'i') } })
        .then((count) => {
          (pEl.getElementsByClassName('player-multi-btn')[0] as HTMLButtonElement).disabled = count <= 1;
        });
      const countryPath =
        `${appRes}/assets/country/${player.country}` +
        (require('fs').existsSync(`${appRes}/assets/country/${player.country}.png`) ? '.png' : '.svg');
      pEl.querySelector<HTMLElement>('.country')!.style.backgroundImage = `url('${countryPath}')`;
    } else {
      pEl.querySelector<HTMLElement>('.team')!.innerText = '';
      pEl.classList.remove('hasteam');
      (pEl.querySelector('.player-multi-btn') as HTMLButtonElement).disabled = true;
      pEl.querySelector<HTMLElement>('.country')!.style.backgroundImage = '';
    }
  }

  async updateCharacterIcon(
    teamNum: TeamNumber,
    playerNum: number,
    game: string | null,
    id: string,
    skin: string | number | null,
    label: string
  ): Promise<void> {
    const charBtn = document.querySelector(`#playeritem-${teamNum}-${playerNum} button.character-select-btn .icon`) as HTMLElement | null;
    if (!charBtn) return;
    const imagePath = `${remote?.getGlobal?.('APPRES') ?? ''}/assets/character/${game}/${id}/stock/${skin}.png`;
    const exists = id && game ? await fileExists(imagePath) : false;
    charBtn.innerText = exists ? '' : label;
    charBtn.style.backgroundImage = exists ? `url('${imagePath}')` : '';
  }

  updatePortButtons(
    teamNum: TeamNumber,
    playerNum: number,
    ports: ([TeamNumber, number] | null)[]
  ): void {
    for (let portNum = 1; portNum <= PORT_AMOUNT; portNum++) {
      const hasPort =
        ports[portNum] != null &&
        ports[portNum]![0] === teamNum &&
        ports[portNum]![1] === playerNum;
      document.getElementById(`playerport-${portNum}-${teamNum}-${playerNum}`)?.classList.toggle('checked', hasPort);
    }
  }

  setOutdated(teamNum: TeamNumber, playerNum: number, outdated: boolean): void {
    document
      .getElementById(`playeritem-${teamNum}-${playerNum}`)
      ?.querySelector('.player-edit-btn')
      ?.classList.toggle('outdated', outdated);
  }
}

declare const remote: { getGlobal: (key: string) => unknown } | undefined;
