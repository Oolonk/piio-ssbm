export { Player } from './player.class';
export { Character } from './character.class';
export { WSWrapper } from './ws.class';
export { PiioConnector } from './piio-connector.class';
export { SavedValue } from './savedvalue.class';
export { Countdown } from './countdown.class';

import { Player } from './player.class';
import { Character } from './character.class';
import { WSWrapper } from './ws.class';
import { PiioConnector } from './piio-connector.class';
import { SavedValue } from './savedvalue.class';
import { Countdown } from './countdown.class';

// Expose classes as globals so themes can use e.g. `new PiioConnector(...)` directly.
(window as unknown as Record<string, unknown>)['PiioConnector'] = PiioConnector;
(window as unknown as Record<string, unknown>)['Player'] = Player;
(window as unknown as Record<string, unknown>)['Character'] = Character;
(window as unknown as Record<string, unknown>)['WSWrapper'] = WSWrapper;
(window as unknown as Record<string, unknown>)['SavedValue'] = SavedValue;
(window as unknown as Record<string, unknown>)['Countdown'] = Countdown;
