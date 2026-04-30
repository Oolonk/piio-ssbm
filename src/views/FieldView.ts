import { createElement } from '../utils/DomUtils';
import type { IThemeField } from '@shared/types/theme.types';
import type { IFieldValue } from '@shared/types/scoreboard.types';

export class FieldView {
  private container = document.getElementById('fields');

  build(
    fields: IThemeField[],
    currentValues: Record<string, IFieldValue>,
    onChanged: (name: string, value: string | string[], enabled?: boolean) => void
  ): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    for (const field of fields) {
      const item = createElement({ type: 'div', className: 'item', append: this.createFieldElement(field, onChanged) });

      if (field.checkbox) {
        const cbx = createElement({ type: 'input', id: `field-${field.name}-cbx`, className: 'toggle' }) as HTMLInputElement;
        (cbx as HTMLInputElement).type = 'checkbox';
        cbx.onchange = (e) => {
          onChanged(field.name, (document.getElementById(`field-${field.name}`) as HTMLInputElement)?.value ?? '', (e.target as HTMLInputElement).checked);
        };
        item.appendChild(cbx);
        item.classList.add('hascheckbox');
      }
      this.container.appendChild(item);
    }
  }

  private createFieldElement(
    field: IThemeField,
    onChanged: (name: string, value: string | string[], enabled?: boolean) => void
  ): HTMLElement {
    const tplId = `fields-${field.type}-tpl`;
    const tpl = (document.getElementById(tplId) ?? document.getElementById('fields-text-tpl')) as HTMLTemplateElement | null;
    const el = createElement({ type: 'div', className: `field-${field.type}` });
    const label = createElement({ type: 'div', className: 'label' });
    label.innerText = field.label;
    el.appendChild(label);
    if (tpl) el.appendChild(tpl.content.cloneNode(true));

    const inputEl = el.getElementsByClassName('ref')[0] as HTMLInputElement | HTMLSelectElement | null;
    if (!inputEl) return el;

    switch (field.type) {
      case 'time': {
        const btn = el.getElementsByTagName('button')[0];
        if (btn) {
          btn.onclick = () => {
            const now = new Date();
            const refEl = el.getElementsByTagName('input')[0];
            const offsetHour = (el.getElementsByClassName('field-time-offset')[0]?.getElementsByTagName('input')[0] as HTMLInputElement)?.value ?? '0';
            const offsetMin = (el.getElementsByClassName('field-time-offset')[0]?.getElementsByTagName('input')[1] as HTMLInputElement)?.value ?? '0';
            now.setTime(now.getTime() + Number(offsetHour) * 3_600_000 + Number(offsetMin) * 60_000);
            refEl.value = now.toTimeString().slice(0, 5);
            refEl.dispatchEvent(new Event('input'));
          };
        }
        break;
      }
      case 'dropdown': {
        const options = (field as { options?: string[] }).options ?? ['(No options available)'];
        (inputEl as HTMLSelectElement).innerHTML = '';
        options.forEach((opt) => {
          const optEl = document.createElement('option');
          optEl.value = opt;
          optEl.innerText = opt;
          (inputEl as HTMLSelectElement).appendChild(optEl);
        });
        break;
      }
      case 'scenes': {
        if ((field as { multiple?: boolean }).multiple) {
          inputEl.setAttribute('multiple', '1');
          inputEl.setAttribute('size', '1');
        }
        break;
      }
    }

    inputEl.id = `field-${field.name}`;
    inputEl.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      const value = (target as HTMLSelectElement).multiple
        ? Array.from((target as HTMLSelectElement).selectedOptions).map((o) => o.value)
        : target.value;
      onChanged(field.name, value);
    });

    return el;
  }

  updateValues(fields: Record<string, IFieldValue>): void {
    for (const [name, fv] of Object.entries(fields)) {
      const el = document.getElementById(`field-${name}`) as HTMLInputElement | null;
      if (el) el.value = Array.isArray(fv.value) ? fv.value[0] ?? '' : fv.value;
      const cbx = document.getElementById(`field-${name}-cbx`) as HTMLInputElement | null;
      if (cbx) cbx.checked = fv.enabled;
    }
  }
}
