export type SlippiStatus = 'disconnected' | 'connected' | 'connecting' | 'reconnecting';

export class SlippiStatusView {
  private startBtn = document.getElementById('start-slippi-btn') as HTMLButtonElement | null;
  private stopBtn = document.getElementById('stop-slippi-btn') as HTMLButtonElement | null;
  private statusEl = document.getElementById('slippi-status');
  private slippiItems = document.getElementsByClassName('slippi-item');

  update(status: SlippiStatus): void {
    switch (status) {
      case 'disconnected':
        this.startBtn?.removeAttribute('disabled');
        if (this.startBtn) { this.startBtn.style.display = 'inherit'; this.startBtn.innerHTML = 'START SLIPPI'; }
        if (this.stopBtn) this.stopBtn.style.display = 'none';
        if (this.statusEl) this.statusEl.innerHTML = 'Disconnected to Slippi';
        Array.from(this.slippiItems).forEach((el) => { (el as HTMLElement).style.display = 'none'; });
        break;
      case 'connected':
        if (this.startBtn) { this.startBtn.disabled = true; this.startBtn.style.display = 'none'; }
        if (this.stopBtn) this.stopBtn.style.display = 'inherit';
        if (this.statusEl) this.statusEl.innerHTML = 'Connected to Slippi';
        Array.from(this.slippiItems).forEach((el) => { (el as HTMLElement).style.display = ''; });
        break;
      case 'connecting':
        if (this.startBtn) { this.startBtn.disabled = true; this.startBtn.style.display = 'none'; }
        if (this.stopBtn) this.stopBtn.style.display = 'inherit';
        if (this.statusEl) this.statusEl.innerHTML = 'Connecting to Slippi';
        Array.from(this.slippiItems).forEach((el) => { (el as HTMLElement).style.display = ''; });
        break;
      case 'reconnecting':
        if (this.startBtn) { this.startBtn.disabled = true; this.startBtn.style.display = 'none'; }
        if (this.stopBtn) this.stopBtn.style.display = 'inherit';
        if (this.statusEl) this.statusEl.innerHTML = 'Reconnecting to Slippi';
        Array.from(this.slippiItems).forEach((el) => { (el as HTMLElement).style.display = ''; });
        break;
    }
  }

  setVisible(visible: boolean): void {
    document.querySelectorAll('.slippibtn-div').forEach((el) =>
      el.classList.toggle('hide', !visible)
    );
  }

  setStartByTypeVisible(value: boolean): void {
    document.querySelectorAll('.slippiStartByType-div').forEach((el) =>
      el.classList.toggle('hide', !value)
    );
    document.querySelectorAll('.slippiNonStartByType-div').forEach((el) =>
      el.classList.toggle('hide', value)
    );
  }

  setStopByWinnerVisible(value: boolean): void {
    document.querySelectorAll('.slippiStopByWinner-div').forEach((el) =>
      el.classList.toggle('hide', !value)
    );
    document.querySelectorAll('.slippiNonStopByWinner-div').forEach((el) =>
      el.classList.toggle('hide', value)
    );
  }
}
