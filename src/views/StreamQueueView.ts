export class StreamQueueView {
  update(
    queue: unknown[],
    onApply: (item: unknown) => void,
    onSkip: (item: unknown) => void
  ): void {
    const el = document.getElementById('stream-queue');
    if (!el) return;
    el.innerHTML = '';

    queue.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'stream-queue-item';
      row.innerText = this.getItemLabel(item);

      const applyBtn = document.createElement('button');
      applyBtn.innerText = 'Apply';
      applyBtn.onclick = () => onApply(item);

      const skipBtn = document.createElement('button');
      skipBtn.innerText = 'Skip';
      skipBtn.onclick = () => onSkip(item);

      row.appendChild(applyBtn);
      row.appendChild(skipBtn);
      el.appendChild(row);
    });
  }

  private getItemLabel(item: unknown): string {
    const i = item as Record<string, unknown>;
    return (i.label as string) ?? (i.name as string) ?? JSON.stringify(item);
  }
}
