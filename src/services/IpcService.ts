import type { IClientSetting } from '@shared/types/ipc.types';

const { ipcRenderer } = require('electron');

export class IpcService {
  async get(name: 'settings'): Promise<IClientSetting[]>;
  async get(name: string): Promise<unknown>;
  async get(name: string): Promise<unknown> {
    return ipcRenderer.invoke('get', name) as Promise<unknown>;
  }

  async set(name: string, value: unknown): Promise<boolean> {
    return ipcRenderer.invoke('set', name, value) as Promise<boolean>;
  }

  send(channel: string, data?: unknown): void {
    ipcRenderer.send(channel, data);
  }

  on(channel: string, listener: (event: unknown, data: unknown) => void): () => void {
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }

  once(channel: string, listener: (event: unknown, data: unknown) => void): void {
    ipcRenderer.once(channel, listener);
  }

  async openWindow(
    name: string,
    params?: Record<string, unknown>,
    dialog = false
  ): Promise<unknown> {
    return ipcRenderer.invoke('openWindow', { name, params, dialog });
  }

  removeListener(channel: string, listener: (event: unknown, data: unknown) => void): void {
    ipcRenderer.removeListener(channel, listener);
  }

  removeAllListeners(channel: string): void {
    ipcRenderer.removeAllListeners(channel);
  }
}
