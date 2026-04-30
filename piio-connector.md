# PiioConnector API Documentation

`PiioConnector` is the main API for overlay themes. It handles the WebSocket connection to Piio, manages subscriptions, and provides typed access to scoreboard data.

---

## Constructor

```javascript
var piio = new PiioConnector(name, subscriptions);
```

| Parameter       | Type                   | Description |
|----------------|------------------------|-------------|
| `name`          | `string`               | Unique identifier for this overlay instance |
| `subscriptions` | `string \| string[]`   | Which data streams to receive (optional) |

**Examples:**

```javascript
// With subscriptions
var piio = new PiioConnector("ui", ["scoreboard", "slippiFrame"]);
var piio = new PiioConnector("bottombar", ["scoreboard", "obsSceneChanged"]);
var piio = new PiioConnector("intermission", ["scoreboard", "streamQueue"]);

// Without subscriptions (e.g. only needs the ready event)
var piio = new PiioConnector("commentator");
```

---

## Events

### `piio.on(name, callback)`

Registers a persistent listener for the given event.

```javascript
piio.on("scoreboard", (data) => {
    console.log(piio.cache.scoreboard);
});
```

### `piio.once(name, callback)`

Registers a listener that fires only once.

---

## Available Subscriptions

| Name                  | When it fires |
|----------------------|---------------|
| `ready`               | Connection established and initial data received |
| `scoreboard`          | Any scoreboard change (players, scores, fields, etc.) |
| `slippiFrame`         | Every Slippi game frame — fires at 60fps during a game |
| `slippiGameStarted`   | A new Slippi game begins |
| `slippiGameEnded`     | A Slippi game ends |
| `slippiStockDeath`    | A stock is lost |
| `slippiPercentChange` | Damage percent changes |
| `slippiStats`         | Stats resolved after calling `piio.slippi.getGamesStats()` |
| `obsSceneChanged`     | OBS switches to a different scene |
| `obsSceneList`        | The OBS scene list is updated |
| `streamQueue`         | Stream queue updated from StartGG or ParryGG |
| `overlay-trigger`     | Overlay visibility toggled from Piio |

The last received value per subscription is cached and replayed to new connections.

---

## Cache — `piio.cache.scoreboard`

The `cache` object holds the latest data received from Piio. It is always up to date after a subscription event fires.

### Full structure

```javascript
piio.cache.scoreboard = {
    type: "singles" | "teams" | "crews",

    matchformat: {
        type: 0 | 1 | 2,    // 0=freeplay, 1=best-of, 2=first-to
        value: number        // e.g. 5 for "Best of 5"
    },

    teams: {
        1: {
            name: string,
            score: number,
            players: IPlayer[],
            characters: ([string, number] | null)[],
            state: 0 | 1 | 2,     // 0=neutral, 1=winners, 2=losers
            selected: number | null,
            out: boolean[]
        },
        2: { /* same */ }
    },

    caster: [
        {
            name: string,
            displayname: string,
            pronoun: string,
            country: string,
            team: string[],   // array of team IDs
            twitter: string,
            bluesky: string
        },
        // ...
    ],

    ports: {
        1: [teamNum, playerNum] | null,
        2: [teamNum, playerNum] | null,
        3: [teamNum, playerNum] | null,
        4: [teamNum, playerNum] | null,
    },

    fields: {
        "fieldname": {
            value: string | string[],
            enabled: boolean      // only relevant when checkbox: true in manifest
        }
    }
}
```

### Common access patterns

```javascript
// Match type
piio.cache.scoreboard.type                              // "singles" | "teams" | "crews"

// Match format
piio.cache.scoreboard.matchformat.type                  // 0 | 1 | 2
piio.cache.scoreboard.matchformat.value                 // e.g. 5

// Scores and team names
piio.cache.scoreboard.teams[1].score                    // 2
piio.cache.scoreboard.teams[1].players.length           // 1 (singles) or 2 (doubles)

// Custom fields
piio.cache.scoreboard.fields.round.value                // "Winners Finals"
piio.cache.scoreboard.fields.countdown.value            // "18:30"
piio.cache.scoreboard.fields.countdown.enabled          // true | false
piio.cache.scoreboard.fields.bottombar.value            // "rotation"

// Casters
piio.cache.scoreboard.caster[0].name                    // "HungryBox"
piio.cache.scoreboard.caster[0].twitter                 // "LiquidHbox"
piio.cache.scoreboard.caster[0].bluesky                 // ""
piio.cache.scoreboard.caster[0].team                    // ["teamId"]

// Port assignments: ports[portNumber] → [teamNum, playerNum]
piio.cache.scoreboard.ports[1]                          // [1, 0] or null
```

---

## Match Format Constants

```javascript
PiioConnector.MATCHFORMAT_TYPE.FREEPLAY   // 0
PiioConnector.MATCHFORMAT_TYPE.BESTOF     // 1
PiioConnector.MATCHFORMAT_TYPE.FIRSTTO    // 2
```

Real-world usage from a scoreboard overlay:

```javascript
piio.on("scoreboard", (data) => {
    var bestofText = "";
    switch (piio.cache.scoreboard.matchformat.type) {
        case PiioConnector.MATCHFORMAT_TYPE.BESTOF:
            bestofText = `Best of ${piio.cache.scoreboard.matchformat.value}`;
            break;
        case PiioConnector.MATCHFORMAT_TYPE.FIRSTTO:
            bestofText = `First to ${piio.cache.scoreboard.matchformat.value}`;
            break;
        default:
            bestofText = "Freeplay";
    }
    jQuery('#bestof').text(bestofText);
    jQuery('#phase').text(piio.cache.scoreboard.fields.round.value);
});
```

---

## Methods

### `piio.getPlayer(teamNum, playerNum?): Player | null`

Returns the player object for a given team. `teamNum` is `1` or `2`. `playerNum` is 0-based (default: currently selected player).

```javascript
var player = piio.getPlayer(1, 0);

player.name          // "Mango"
player.displayname   // custom display name, or name if not set
player.pronoun       // "he/him"
player.country       // "US"
player.team          // ["teamId1"]   array of team IDs
player.twitter       // "C9Mango"
player.bluesky       // ""
player._id           // database ID
```

Real-world usage combining player name and port color:

```javascript
var ports = piio.cache.scoreboard.ports;
var playerPos = ports[slippiPort];          // [teamNum, playerNum]
var player = piio.getPlayer(playerPos[0], playerPos[1]);
jQuery('#playername').text(player.name);
```

---

### `piio.getTeamPlayers(teamNum): Player[]`

Returns all players for a team.

```javascript
piio.getTeamPlayers(1);    // [Player, ...]
```

---

### `piio.getTeamName(teamNum): string`

Returns the team name (relevant in teams/crews mode).

```javascript
jQuery('#team1name').text(piio.getTeamName(1));
jQuery('#team2name').text(piio.getTeamName(2));
```

---

### `piio.getScore(teamNum): number | null`

```javascript
var score1 = piio.getScore(1);   // 2
var score2 = piio.getScore(2);   // 1
```

---

### `piio.getState(teamNum): number | null`

Returns the bracket state: `0` = neutral, `1` = winners bracket, `2` = losers bracket.

```javascript
if (piio.getState(1) == 1)
    jQuery('#gf1').text(" [W]");
else if (piio.getState(1) == 2)
    jQuery('#gf1').text(" [L]");
else
    jQuery('#gf1').text("");
```

---

### `piio.getPort(teamNum, playerNum?): string | null`

Returns the Slippi port number (1–4) assigned to a player.

```javascript
var port = piio.getPort(1, 0);   // "1"

if (port == "1") {
    jQuery('#playercard').css('color', 'rgb(var(--p1))');
} else if (port == "2") {
    jQuery('#playercard').css('color', 'rgb(var(--p2))');
}
```

---

### `piio.getCharacter(teamNum, playerNum?): Character | null`

```javascript
var char = piio.getCharacter(1, 0);
char.ID           // "fox"
char.name         // "Fox"
char.Shorten      // "Fox"
char.getSkin(0)   // skin value at index 0
```

---

### `piio.getPlayerTeams(teamNum, playerNum?): object[]`

Returns the player's team entries from the database.

```javascript
var teams = piio.getPlayerTeams(1, 0);
if (teams[0]) {
    jQuery('#teamname').text(teams[0].name);
    jQuery('#teamlogo').css('background-image',
        `url(${piio.getPictureUrl('assets/team/' + piio.getPlayer(1, 0).team[0])})`
    );
}
```

---

### `piio.getSelectedPlayer(teamNum): number`

Returns the index of the currently active player (used in crews/ironman modes).

---

### `piio.getPlayersByPosition(): (Player | null)[]`

Returns players ordered by their seat position.

---

### `piio.getCaster(casterNum): Player | null`

`casterNum` is 1-based.

```javascript
var caster = piio.getCaster(1);
caster.name      // "Commentator Name"
caster.pronoun   // "she/her"
```

For direct cache access (used in loops):

```javascript
for (let [i, caster] of piio.cache.scoreboard.caster.entries()) {
    jQuery(`#c${i+1}name`).text(caster.name);
    jQuery(`#c${i+1}pronoun`).text(caster.pronoun);

    let handle = caster.bluesky || caster.twitter;
    jQuery(`#c${i+1}handle`).text(handle ? `@${handle}` : '');
}
```

---

### `piio.getPictureUrl(url): string | false`

Checks whether an asset URL exists on the server. Returns the URL string if found, `false` if not.

Use this before setting `background-image` to avoid broken images.

```javascript
// Country flag
jQuery('#flag').css('background-image',
    `url(${piio.getPictureUrl('assets/country/' + player.country)})`
);

// Team logo
jQuery('#teamlogo').css('background-image',
    `url(${piio.getPictureUrl('assets/team/' + player.team[0])})`
);

// Player photo
jQuery('#photo').css('background-image',
    `url(${piio.getPictureUrl('assets/player/photo/' + player._id)})`
);
```

---

### `piio.getField(name): { value: string | string[], enabled: boolean }`

```javascript
var field = piio.getField("round");
field.value    // "Winners Finals"
field.enabled  // true (only meaningful when checkbox: true in manifest)
```

Shorthand for just the value:

```javascript
piio.getFieldValue("round");   // "Winners Finals"
```

---

### `piio.getGame(): object | null`

Returns the current game object.

---

### `async piio.getPlayersByStartGGId(ids): Promise<object>`

Requests players from the database by their StartGG IDs.

```javascript
const result = await piio.getPlayersByStartGGId([12345, 67890]);
// result.data  → array of player objects
// result.type  → name of the returned call
```

---

### `async piio.getPlayersByParryGGId(ids): Promise<object>`

Same as above but for ParryGG IDs.

---

## Slippi Integration

```javascript
var piio = new PiioConnector("overlay", ["slippiFrame", "slippiGameStarted", "slippiGameEnded"]);

piio.on("slippiGameStarted", (data) => {
    console.log("Game started", data.settings);
});

piio.on("slippiFrame", (data) => {
    // data.settings.players   → player info (port, characterId, etc.)
    // data.frame.players      → per-frame state (percent, stocks, position)
    // data.latestFrameIndex   → current frame number
    // data.gameEnd            → game end type (null during game)
    // data.lras               → true if LRAS
    // data.combo              → active combos

    var frame = data.latestFrameIndex < 0 ? 0 : data.latestFrameIndex;
    var maxtime = data.settings.startingTimerSeconds * 60;
    var minutes = Math.floor((maxtime - frame) / 3600);
    var seconds = Math.floor(((maxtime - frame) % 3600) / 60);
    jQuery('#timer').text(`${minutes}:${seconds.toString().padStart(2, '0')}`);
});
```

### `piio.slippi.getGamesStats(amount?): Promise<object>`

Requests statistics for the last N games. Also triggers the `slippiStats` event.

```javascript
piio.slippi.getGamesStats(3).then((result) => {
    console.log(result.data);   // array of game stats
});
```

### `piio.slippi.moveId(moveId): string`

Converts a numeric move ID to its name.

```javascript
piio.slippi.moveId(22);   // "Forward Smash"
```

### `piio.slippi.stages`

Map of stage IDs to stage names.

```javascript
piio.slippi.stages[8];    // "Yoshi's Story"
```

### `piio.slippi.characters`

Map of internal character IDs to character info.

---

## OBS Integration

```javascript
var piio = new PiioConnector("bottombar", ["scoreboard", "obsSceneChanged"]);

piio.on("obsSceneChanged", (scene) => {
    // scene is the scene name string
    if (scene.includes("game")) {
        jQuery('#bottombar').animate({ bottom: "0px" }, 500);
    } else {
        jQuery('#bottombar').animate({ bottom: "25px" }, 500);
    }
});
```

---

## Stream Queue

```javascript
var piio = new PiioConnector("intermission", ["scoreboard", "streamQueue"]);

piio.on("streamQueue", (data) => {
    // data is an array of upcoming sets
    $('#streamqueuelist').empty();
    for (let i = 0; i < Math.min(data.length, 5); i++) {
        let set = data[i];
        let vs = set.slots
            .map(slot => slot.entrant ? slot.entrant.name : 'N/A')
            .join(' vs. ');
        $('#streamqueuelist').append(`
            <div class="set">
                <div class="round">${set.fullRoundText}</div>
                <div class="vs">${vs}</div>
            </div>
        `);
    }
});
```

---

## Full Commentator Example

Complete real-world implementation of a commentator overlay:

```javascript
var piio = new PiioConnector("commentator");

piio.on("scoreboard", () => {
    piio.cache.scoreboard.caster.forEach((caster, index) => {
        const y = index + 1;

        // Name and pronoun
        jQuery(`#c${y}name`).text(caster.name);
        jQuery(`#c${y}pronoun`).text(caster.pronoun);

        // Country flag
        jQuery(`#c${y}flag`).css('background-image',
            `url(${piio.getPictureUrl('assets/country/' + caster.country)})`
        );

        // Team prefix (if team is set)
        if (caster.team.length > 0) {
            jQuery(`#c${y}team`).text(piio.cache.team[caster.team].prefix);
            jQuery(`#c${y}teamicon`).css('background-image',
                `url(${piio.getPictureUrl('assets/team/' + caster.team)})`
            );
        }

        // Prefer Bluesky over Twitter
        let handle = caster.bluesky || caster.twitter;
        jQuery(`#c${y}handle`).text(handle ? `@${handle}` : '');
    });
});
```
