export type ObsStatus = 'disconnected' | 'connected' | 'connecting' | 'reconnecting';

export class ObsStatusView {
  private startBtn = document.getElementById('start-obs-btn') as HTMLButtonElement | null;
  private stopBtn = document.getElementById('stop-obs-btn') as HTMLButtonElement | null;
  private statusEl = document.getElementById('obs-status');

  update(status: ObsStatus): void {
    switch (status) {
      case 'disconnected':
        if (this.startBtn) { this.startBtn.disabled = false; this.startBtn.style.display = 'inherit'; }
        if (this.stopBtn) this.stopBtn.style.display = 'none';
        if (this.statusEl) this.statusEl.innerHTML = 'Disconnected to OBS';
        break;
      case 'connected':
        if (this.startBtn) { this.startBtn.disabled = true; this.startBtn.style.display = 'none'; }
        if (this.stopBtn) this.stopBtn.style.display = 'inherit';
        if (this.statusEl) this.statusEl.innerHTML = 'Connected to OBS';
        break;
      case 'connecting':
      case 'reconnecting':
        if (this.startBtn) { this.startBtn.disabled = true; this.startBtn.style.display = 'none'; }
        if (this.stopBtn) this.stopBtn.style.display = 'inherit';
        if (this.statusEl) this.statusEl.innerHTML = status === 'connecting' ? 'Connecting to OBS' : 'Reconnecting to OBS';
        break;
    }
  }

  setVisible(visible: boolean): void {
    document.querySelectorAll('.obsbtn-div').forEach((el) =>
      el.classList.toggle('hide', !visible)
    );
  }

  updateSceneDropdowns(sceneList: string[], sceneListValues: Record<string, string>): void {
    document.querySelectorAll<HTMLSelectElement>('.obsSceneDropdown').forEach((dropdown) => {
      const selected = sceneListValues[dropdown.id] ?? '';
      dropdown.innerHTML = '';
      const emptyOpt = document.createElement('option');
      emptyOpt.text = '';
      emptyOpt.value = '';
      dropdown.add(emptyOpt);
      sceneList.forEach((scene, j) => {
        const opt = document.createElement('option');
        opt.text = scene;
        opt.value = scene;
        dropdown.add(opt);
        if (scene === selected) dropdown.selectedIndex = j + 1;
      });
    });
  }

  initSceneToggleButtons(sceneListSelected: Record<string, boolean>): void {
    document.querySelectorAll<HTMLInputElement>('.obsSceneButtons').forEach((btn) => {
      if (sceneListSelected[btn.id] !== undefined) {
        btn.checked = sceneListSelected[btn.id];
      }
    });
  }
}
