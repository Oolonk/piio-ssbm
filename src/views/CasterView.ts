import { createElement } from '../utils/DomUtils';
import { Player } from '../../js/class/player.class';
import type { IPlayer } from '@shared/types/player.types';
import type { DatabaseService } from '../services/DatabaseService';

export class CasterView {
  private container = document.getElementById('caster');

  constructor(private readonly db: DatabaseService) {}

  build(
    casterCount: number,
    casters: IPlayer[],
    appRes: string,
    onSet: (index: number, player: IPlayer) => void,
    onEdit: (player: IPlayer) => void
  ): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    const tpl = document.getElementById('caster-item-tpl') as HTMLTemplateElement | null;
    if (!tpl) return;

    for (let casterNum = 0; casterNum < casterCount; casterNum++) {
      const item = createElement({ type: 'div', className: 'item', append: tpl.content.cloneNode(true) });
      const nameTbx = item.querySelector('input') as HTMLInputElement;
      let selectedIndex = -1;

      item.querySelector('.info')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const tbx = (e.currentTarget as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
        const searchEl = (e.currentTarget as HTMLElement).parentElement?.querySelector('.search');
        if (!searchEl || !tbx) return;
        searchEl.classList.add('visible');
        const idx = Array.prototype.indexOf.call(this.container!.children, item);
        tbx.value = casters[idx]?.name ?? '';
        tbx.focus();
        tbx.select();
      });

      item.querySelector('.info .player-options .player-edit-btn')?.addEventListener('click', (e) => {
        const idx = Array.prototype.indexOf.call(this.container!.children, item);
        onEdit(casters[idx]);
        e.stopPropagation();
      });

      const nameTxbInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const value = target.value.trim().toLowerCase();
        const selectionEl = target.parentElement?.querySelector('.selection');
        if (!selectionEl) return;

        this.db.get<Record<string, unknown>>('player', {
          name: { $regex: new RegExp(value, 'i') },
        }, { limit: 20 }).then((list) => {
          const players = list.map((x) => new Player(x as ConstructorParameters<typeof Player>[0]));
          selectionEl.innerHTML = '';
          selectedIndex = -1;
          if (value.length > 0) players.push(new Player({ name: target.value } as ConstructorParameters<typeof Player>[0]));
          players.unshift(new Player());
          selectedIndex = players.length - 1;

          players.forEach((po, index) => {
            const selItem = document.createElement('div');
            selItem.classList.add('item');
            selItem.classList.toggle('tmp', !po.InDB && po.name.length > 0);
            selItem.classList.toggle('clear', !po.InDB && po.name.length === 0);
            selItem.appendChild(createElement({ type: 'div', className: 'name', text: po.name }));

            if (po.country) {
              const countryEl = createElement({ type: 'img' }) as HTMLImageElement;
              countryEl.src = `${appRes}/assets/country/${po.country}.png`;
              countryEl.onerror = () => countryEl.remove();
              selItem.appendChild(countryEl);
            }
            if (po.team?.length) {
              const teamEl = createElement({ type: 'div', className: 'team' });
              this.db.get('team', { $or: ([] as string[]).concat(po.team).map((x) => ({ _id: x })) })
                .then((entry) => { teamEl.innerText = entry.map((x) => (x as { name: string }).name).join(', '); });
              selItem.appendChild(teamEl);
            }

            if (po.InDB && e.type === 'input' && (target.value === po.name || players.length === 1)) {
              selectedIndex = index;
            }
            selItem.classList.toggle('highlighted', selectedIndex === index);
            selItem.onclick = () => {
              nameTbx.blur();
              const idx = Array.prototype.indexOf.call(this.container!.children, item);
              onSet(idx, po);
            };
            selItem.onmousedown = (me) => me.preventDefault();
            selectionEl.appendChild(selItem);
          });
        });
      };

      nameTbx.oninput = nameTxbInput;
      nameTbx.onfocus = nameTxbInput;
      nameTbx.onblur = () => item.querySelector('.search')?.classList.remove('visible');
      nameTbx.onkeydown = (e: KeyboardEvent) => {
        const selectionEl = (e.target as HTMLInputElement).parentElement?.querySelector('.selection');
        if (!selectionEl) return;
        if (e.code === 'ArrowDown') { selectedIndex = Math.max(0, selectedIndex) + 1; e.preventDefault(); }
        if (e.code === 'ArrowUp') { selectedIndex = Math.max(0, selectedIndex - 1); e.preventDefault(); }
        const items = selectionEl.querySelectorAll('div.item');
        if (selectedIndex > -1) {
          if (selectedIndex >= items.length) selectedIndex = items.length - 1;
          items.forEach((el) => el.classList.remove('highlighted'));
          const sel = items[selectedIndex] as HTMLElement;
          sel?.classList.add('highlighted');
          const h = parseInt(getComputedStyle(sel ?? items[0]).height) || 30;
          (selectionEl as HTMLElement).scrollTop = selectedIndex * h - 150;
          if (e.code === 'Enter') { sel?.click(); e.preventDefault(); }
        }
      };
      this.container.appendChild(item);
    }
  }

  updateCaster(idx: number, co: IPlayer): void {
    const casterEl = this.container?.querySelectorAll<HTMLElement>('#caster > div')[idx];
    if (!casterEl) return;
    const handle = co.twitter || co.bluesky;
    casterEl.querySelector<HTMLElement>('.info .name')!.innerText = co.name;
    casterEl.querySelector<HTMLElement>('.info .twitter')!.innerText =
      handle ? `@${handle}` : '';
    const editBtn = casterEl.querySelector<HTMLButtonElement>('.info .player-options .player-edit-btn');
    if (editBtn) editBtn.disabled = !co.InDB;
  }

  setOutdated(idx: number, outdated: boolean): void {
    const casterEl = this.container?.querySelectorAll<HTMLElement>('#caster > div')[idx];
    casterEl?.querySelector('.player-edit-btn')?.classList.toggle('outdated', outdated);
  }
}
