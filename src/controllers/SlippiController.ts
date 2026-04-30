import { IpcService } from '../services/IpcService';
import { SlippiStatusView } from '../views/SlippiStatusView';
import { ScoreboardModel } from '../models/ScoreboardModel';
import { DatabaseService } from '../services/DatabaseService';
import { Character } from '../../js/class/character.class';
import type { TeamNumber } from '@shared/types/scoreboard.types';

export class SlippiController {
  constructor(
    private readonly ipc: IpcService,
    private readonly view: SlippiStatusView,
    private readonly scoreboard: ScoreboardModel,
    private readonly db: DatabaseService,
    private readonly onSetCharacter: (
      team: TeamNumber,
      playerIdx: number,
      charId: string,
      costumeIdx: number
    ) => void,
    private readonly onAddScore: (team: TeamNumber, inc: number) => void
  ) {
    this.wireIpc();
  }

  private wireIpc(): void {
    this.ipc.on('slippi_status', (_e, status) => {
      this.view.update(status as Parameters<SlippiStatusView['update']>[0]);
    });

    this.ipc.on('slippiStarted', (_e, data) => {
      const state = this.scoreboard.getState();
      (data as { players: { port: number; characterId: number; characterColor: number }[] }).players.forEach(
        (player) => {
          const portNum = player.port;
          const portAssignment = state.ports[portNum];
          if (portAssignment != null) {
            this.db
              .getSingle<Record<string, unknown>>('character', {
                slippiId: String(player.characterId),
                game: state.game,
              })
              .then((char) => {
                if (char != null) {
                  this.onSetCharacter(
                    portAssignment[0],
                    portAssignment[1],
                    char._id as string,
                    player.characterColor
                  );
                }
              });
          }
        }
      );
    });

    this.ipc.on('slippiAddScore', (_e, port) => {
      const state = this.scoreboard.getState();
      const portNum = port as number;
      if (state.type === 'teams' && portNum != null && portNum > 0) {
        const assignment = state.ports[portNum];
        if (assignment != null) {
          this.onAddScore(assignment[0], 1);
        }
      }
    });
  }

  start(): void {
    this.ipc.send('slippi', 'start');
  }

  stop(): void {
    this.ipc.send('slippi', 'stop');
  }
}
