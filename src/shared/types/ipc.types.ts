export type IpcSendChannels =
  | 'slippi'
  | 'obs'
  | 'theme'
  | 'connectionType'
  | 'slippiPort'
  | 'slippiFolder'
  | 'obsIp'
  | 'obsPort'
  | 'obsPassword'
  | 'slippiautoscore'
  | 'apiPassword'
  | 'switchScene';

export type IpcReceiveChannels =
  | 'slippi_status'
  | 'obs_status'
  | 'slippiFrame'
  | 'slippiStarted'
  | 'slippiEnded'
  | 'slippiAddScore'
  | 'obsCurrentSceneChanged'
  | 'obsSceneListChanged'
  | 'obsSceneChanged'
  | 'themefolder-changed'
  | 'databaseChanged';

export interface IClientSetting {
  name: string;
  value: unknown;
}
