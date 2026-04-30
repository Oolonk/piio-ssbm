import type { TeamNumber } from '@shared/types/scoreboard.types';
import type { IPlayer } from '@shared/types/player.types';

export class SeatOrderView {
  private container = document.getElementById('seatorder');
  private glueOption = document.getElementById('seatorder-glue-option');

  build(
    seatorder: [TeamNumber, number][],
    teams: Record<TeamNumber, { players: IPlayer[] }>,
    onReorder: (newOrder: [TeamNumber, number][], affectedSeat?: [TeamNumber, number]) => void
  ): void {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.container.classList.toggle('visible', seatorder.length > 0);

    for (const [seatIdx, seat] of seatorder.entries()) {
      const item = document.createElement('div');
      const po = teams[seat[0]].players[seat[1]];
      item.innerText =
        po?.name ||
        `${seat[0] === 1 ? 'Left' : 'Right'} Team - ${seat[1] + 1}. Player`;
      item.classList.toggle('hasname', (po?.name?.length ?? 0) > 0);
      item.classList.add(`team${seat[0]}`);
      this.makeSortable(item, null, (indexList) => {
        const newOrder = indexList.map((x) => seatorder[x[0]]) as [TeamNumber, number][];
        onReorder(newOrder, seat);
      });
      this.container.appendChild(item);
    }
  }

  get isGlued(): boolean {
    return this.glueOption?.classList.contains('enabled') ?? false;
  }

  toggleGlue(): void {
    this.glueOption?.classList.toggle('enabled');
  }

  private makeSortable(
    elm: HTMLElement,
    exclude: string[] | null,
    callback: (indexList: [number, number, HTMLElement][]) => void
  ): void {
    elm.classList.add('dragable');
    elm.onpointerdown = (e: PointerEvent) => {
      let initPos = e.clientX;
      const origPos: number[] = [];
      let indexList: [number, number, HTMLElement][] = [];
      const parentEl = elm.parentNode as HTMLElement;
      let threshold = 20;

      if (exclude) {
        for (const sel of exclude) {
          const excEl = parentEl.querySelector(sel);
          if (excEl && e.composedPath().includes(excEl)) return;
        }
      }

      parentEl.childNodes.forEach((child) =>
        origPos.push((child as HTMLElement).getBoundingClientRect().x)
      );

      elm.onmousemove = (me: MouseEvent) => {
        if (Math.abs(me.x - initPos) > threshold) {
          threshold = 0;
          elm.setPointerCapture(e.pointerId);
          document.body.classList.add('noPointer');
          elm.classList.add('dragging');
          indexList = [];
          (parentEl.childNodes as NodeListOf<HTMLElement>).forEach((child, idx) =>
            indexList.push([idx, child.getBoundingClientRect().x, child])
          );
          indexList.sort((a, b) => a[1] - b[1]);
          indexList.forEach((item, index) => {
            item[2].style.transform = `translate(${origPos[index] - origPos[item[0]]}px, 0px)`;
          });
          elm.style.transform = `translate(${me.x - initPos}px,-3px)`;
        }
      };
      window.onpointerup = (ue: PointerEvent) => {
        (elm as HTMLElement).onmousemove = null;
        document.body.classList.remove('noPointer');
        elm.releasePointerCapture(ue.pointerId);
        elm.classList.remove('dragging');
        (parentEl.childNodes as NodeListOf<HTMLElement>).forEach((child) => {
          child.style.transform = 'translate(0px, 0px)';
        });
        if (indexList.length > 1) {
          indexList.forEach((item) => item[2].parentNode?.insertBefore(indexList[item[0]][2], item[2]));
          callback(indexList);
          window.onpointerup = null;
        }
      };
    };
  }
}
