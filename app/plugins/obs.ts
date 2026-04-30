import { EventEmitter } from 'events';
const { OBSWebSocket } = require('obs-websocket-js');

export class ObsIntegration {
  private readonly obs: typeof OBSWebSocket;
  ip: string;
  port: number;
  password: string;
  readonly event: EventEmitter;
  sceneList: string[];

  constructor() {
    this.obs = new OBSWebSocket();
    this.ip = '127.0.0.1';
    this.port = 4455;
    this.password = '';
    this.event = new EventEmitter();
    this.sceneList = [];
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.event.on(event, listener);
  }

  setIp(ip: string | null): void {
    this.ip = ip || '127.0.0.1';
  }

  setPort(port: number | null): void {
    this.port = port ?? 4455;
  }

  setPassword(password: string): void {
    this.password = password;
  }

  async startObs(): Promise<boolean> {
    try {
      await this.obs.connect(`ws://${this.ip}:${this.port}`, this.password);
      console.log('Connected to OBS Websocket');

      this.obs.on('CurrentProgramSceneChanged', (e: { sceneName: string }) => {
        this.event.emit('CurrentSceneChanged', e.sceneName);
      });

      this.obs.on('SceneListChanged', (value: { scenes: Array<{ sceneName: string }> }) => {
        this.sceneList = value.scenes.map((s) => s.sceneName);
        setTimeout(() => this.event.emit('SceneListChanged', this.sceneList), 20);
      });

      this.obs.on('CurrentSceneCollectionChanged', () => {
        this.obs.call('GetSceneList').then((value: { scenes: Array<{ sceneName: string }> }) => {
          this.sceneList = value.scenes.map((s) => s.sceneName);
          setTimeout(() => this.event.emit('SceneListChanged', this.sceneList), 20);
        });
      });

      const sceneListResult = await this.obs.call('GetSceneList') as { scenes: Array<{ sceneName: string }> };
      this.sceneList = sceneListResult.scenes
        .filter((s) => s.sceneName !== undefined)
        .map((s) => s.sceneName);
      setTimeout(() => this.event.emit('SceneListChanged', this.sceneList), 20);

      const currentScene = await this.obs.call('GetCurrentProgramScene') as { sceneName: string };
      this.event.emit('CurrentSceneChanged', currentScene.sceneName);

      return true;
    } catch (error) {
      console.log("Couldn't connect to OBS Websocket");
      console.error(error);
      return false;
    }
  }

  async stopObs(): Promise<boolean> {
    try {
      await this.obs.disconnect();
      console.log('Disconnected from OBS Websocket');
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async setCurrentScene(sceneName: string): Promise<boolean> {
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
