import { createElement, fileExists } from '../utils/DomUtils';
import { Character } from '../../js/class/character.class';
import type { CharacterSelection } from '@shared/types/character.types';
import type { TeamNumber } from '@shared/types/scoreboard.types';

export class CharacterSelectView {
  private filterTerm = '';
  private filterTimeout: ReturnType<typeof setTimeout> | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  async build(
    characters: Character[],
    currentSelection: CharacterSelection,
    game: string | null,
    appRes: string,
    onSelect: (teamNum: TeamNumber, playerNum: number, charId: string, costumeIdx: number) => void,
    teamNum: TeamNumber,
    playerNum: number
  ): Promise<void> {
    const rosterEl = document.getElementById('character-select-roster');
    const skinsEl = document.getElementById('character-select-skins');
    if (!rosterEl || !skinsEl) return;
    rosterEl.innerHTML = '';
    skinsEl.innerHTML = '';

    const assetPath = `${appRes}/assets/character/${game}`;
    characters.push(new Character({}));

    for (const co of characters) {
      const rosterItem = createElement({ type: 'div', className: 'item', text: co.Shorten });

      if (co.DefaultSkin) {
        const stockPath = `${assetPath}/${co.ID}/stock/${co.DefaultSkin}.png`;
        const ok = await fileExists(stockPath);
        if (ok) {
          rosterItem.innerText = '';
          const iconEl = createElement({ type: 'div', className: 'icon' });
          (iconEl as HTMLElement).style.backgroundImage = `url('${stockPath}')`;
          rosterItem.appendChild(iconEl);
        }
      }

      const isSelected =
        (currentSelection && currentSelection[0] === co.ID) ||
        (currentSelection == null && co.ID === '');
      rosterItem.classList.toggle('selected', isSelected);
      (rosterItem as HTMLElement & { filterTerms: string[] }).filterTerms = [
        co.name?.toLowerCase() ?? '',
        co.shorten?.toLowerCase() ?? '',
      ];

      const showSkins = async () => {
        if (co.SkinCount <= 1) {
          onSelect(teamNum, playerNum, co.ID, co.DefaultSkin as unknown as number);
          return;
        }
        skinsEl.innerHTML = '';
        co.skins.forEach((skin, index) => {
          const skinItem = createElement({ type: 'div', className: 'item', text: String(skin) });
          const skinPath = `${assetPath}/${co.ID}/stock/${skin}.png`;
          fileExists(skinPath).then((ok) => {
            if (!ok) return;
            skinItem.innerText = '';
            const iconEl = createElement({ type: 'div', className: 'icon' });
            (iconEl as HTMLElement).style.backgroundImage = `url('${skinPath}')`;
            skinItem.appendChild(iconEl);
          });
          skinItem.classList.toggle(
            'selected',
            !!(currentSelection && currentSelection[0] === co.ID && currentSelection[1] === index)
          );
          skinItem.onclick = () => onSelect(teamNum, playerNum, co.ID, index);
          skinsEl.appendChild(skinItem);
        });
      };

      if (currentSelection && currentSelection[0] === co.ID && co.SkinCount > 2) {
        await showSkins();
      }
      rosterItem.onclick = () => showSkins();
      rosterEl.appendChild(rosterItem);
    }
  }

  installKeyboardFilter(onDone: () => void): void {
    this.filterTerm = '';
    this.keyboardHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      const rosterEl = document.getElementById('character-select-roster');
      if (!rosterEl) return;

      if (e.keyCode >= 65 && e.keyCode <= 90 || e.keyCode === 32) {
        this.filterTerm += e.key;
      }
      if (e.keyCode === 8) this.filterTerm = '';
      if (e.keyCode === 13) {
        const visible = rosterEl.querySelectorAll('.item:not(.filtered)');
        if (visible.length === 1) {
          (visible[0] as HTMLElement).click();
        } else {
          const exact = Array.from(visible).filter((x) =>
            ((x as HTMLElement & { filterTerms: string[] }).filterTerms ?? []).includes(this.filterTerm)
          );
          if (exact.length >= 1) (exact[0] as HTMLElement).click();
        }
      }

      rosterEl.querySelectorAll('.item').forEach((item) => {
        const terms = (item as HTMLElement & { filterTerms?: string[] }).filterTerms ?? [];
        item.classList.toggle('filtered', !terms.join(',').includes(this.filterTerm));
      });

      if (this.filterTimeout) clearTimeout(this.filterTimeout);
      this.filterTimeout = setTimeout(() => {
        this.filterTerm = '';
        this.refreshFilter();
      }, 1000);
    };
    window.addEventListener('keydown', this.keyboardHandler, true);
  }

  private refreshFilter(): void {
    const rosterEl = document.getElementById('character-select-roster');
    rosterEl?.querySelectorAll('.item').forEach((item) => item.classList.remove('filtered'));
  }

  removeKeyboardFilter(): void {
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler, true);
      this.keyboardHandler = null;
    }
    if (this.filterTimeout) clearTimeout(this.filterTimeout);
  }
}
