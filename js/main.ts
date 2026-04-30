import { installDomPrototypes } from '../src/utils/DomUtils';

installDomPrototypes();

// Models
import { ScoreboardModel } from '../src/models/ScoreboardModel';
import { ThemeModel } from '../src/models/ThemeModel';
import { MatchModel } from '../src/models/MatchModel';
import { ClientSettingsModel } from '../src/models/ClientSettingsModel';

// Views
import { ScoreboardView } from '../src/views/ScoreboardView';
import { PlayerView } from '../src/views/PlayerView';
import { CasterView } from '../src/views/CasterView';
import { FieldView } from '../src/views/FieldView';
import { SeatOrderView } from '../src/views/SeatOrderView';
import { CharacterSelectView } from '../src/views/CharacterSelectView';
import { StreamQueueView } from '../src/views/StreamQueueView';
import { SlippiStatusView } from '../src/views/SlippiStatusView';
import { ObsStatusView } from '../src/views/ObsStatusView';

// Services
import { IpcService } from '../src/services/IpcService';
import { DatabaseService } from '../src/services/DatabaseService';
import { WebSocketService } from '../src/services/WebSocketService';
import { SmashggService } from '../src/services/SmashggService';
import { ParryggService } from '../src/services/ParryggService';

// Controllers
import { SettingsController } from '../src/controllers/SettingsController';
import { ObsController } from '../src/controllers/ObsController';
import { SlippiController } from '../src/controllers/SlippiController';
import { TournamentController } from '../src/controllers/TournamentController';
import { ScoreboardController } from '../src/controllers/ScoreboardController';
import type { TeamNumber } from '../src/shared/types/scoreboard.types';

// ─── Services ─────────────────────────────────────────────────────────────────
const ipc = new IpcService();
const db = new DatabaseService();
const ws = new WebSocketService();
const smashgg = new SmashggService();
const parrygg = new ParryggService();

// ─── Models ───────────────────────────────────────────────────────────────────
const scoreboardModel = new ScoreboardModel();
const themeModel = new ThemeModel();
const matchModel = new MatchModel(db);
const settingsModel = new ClientSettingsModel(ipc);

// ─── Views ────────────────────────────────────────────────────────────────────
const sbView = new ScoreboardView();
const playerView = new PlayerView(db);
const casterView = new CasterView(db);
const fieldView = new FieldView();
const seatOrderView = new SeatOrderView();
const charSelectView = new CharacterSelectView();
const streamQueueView = new StreamQueueView();
const slippiStatusView = new SlippiStatusView();
const obsStatusView = new ObsStatusView();

// ─── Sub-controllers ──────────────────────────────────────────────────────────
const settingsCtrl = new SettingsController(settingsModel, ipc, smashgg, parrygg);
const obsCtrl = new ObsController(ipc, obsStatusView, settingsModel, ws);

// Declare scoreboardController early to break the circular reference;
// slippiCtrl captures it by closure so it's resolved at call time.
let scoreboardController: ScoreboardController;

const slippiCtrl = new SlippiController(
  ipc,
  slippiStatusView,
  scoreboardModel,
  db,
  (team: TeamNumber, playerIdx: number, charId: string, costumeIdx: number) => {
    scoreboardController.setCharacter(team, playerIdx, charId, costumeIdx);
  },
  (team: TeamNumber, inc: number) => scoreboardController.modifyScore(team, inc)
);

const tournamentCtrl = new TournamentController(smashgg, parrygg, ipc, null!);

// ─── Main controller ──────────────────────────────────────────────────────────
scoreboardController = new ScoreboardController(
  scoreboardModel,
  themeModel,
  matchModel,
  settingsModel,
  sbView,
  playerView,
  casterView,
  fieldView,
  seatOrderView,
  charSelectView,
  streamQueueView,
  slippiStatusView,
  obsStatusView,
  ws,
  db,
  ipc,
  obsCtrl,
  slippiCtrl,
  tournamentCtrl,
  settingsCtrl
);

// Expose for HTML event handlers
(window as unknown as Record<string, unknown>)['scoreboardController'] = scoreboardController;
