export interface WsMessage {
  type: string;
  data?: unknown;
  mid?: string | number | null;
  password?: string;
}

export interface WsCommand extends WsMessage {
  type: 'command';
  module: string;
  args?: unknown;
}

export interface WsResponse extends WsMessage {
  type: 'response';
  ok: boolean;
}

export type WsCommandName =
  | 'score'
  | 'clear'
  | 'swap'
  | 'update'
  | 'smashgg-next'
  | 'character';

export interface WsClientInfo {
  id: string;
  name: string;
  filename: string | null;
}
