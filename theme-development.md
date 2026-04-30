# Piio Theme Development Guide

Themes are HTML/CSS/JS overlays that connect to the Piio app via WebSocket and receive live scoreboard data. Each theme lives in its own folder under `themes/` and is selected in the Piio settings.

---

## Table of Contents

1. [Folder Structure](#folder-structure)
2. [manifest.json](#manifestjson)
3. [Overlay HTML Files](#overlay-html-files)
4. [Connecting with PiioConnector](#connecting-with-piioconnector)
5. [Subscriptions & Events](#subscriptions--events)
6. [Scoreboard Data](#scoreboard-data)
7. [Player Data](#player-data)
8. [Character Data](#character-data)
9. [Caster Data](#caster-data)
10. [Custom Fields](#custom-fields)
11. [Utility Classes](#utility-classes)
12. [Asset URLs](#asset-urls)
13. [Full Example](#full-example)

---

## Folder Structure

```
themes/
└── my-theme/
    ├── manifest.json        ← required
    ├── scoreboard.html      ← overlay page (any name)
    ├── lowerthird.html      ← another overlay page
    ├── style/               ← CSS files (folder name configured in manifest)
    │   ├── scoreboard.css
    │   └── lowerthird.css
    └── script/              ← JS files (folder name configured in manifest)
        ├── scoreboard.js
        └── lowerthird.js
```

Each `.html` file in the theme folder becomes one overlay accessible in Piio. The filename (without extension) is the overlay's identifier and is available as the global variable `__FILENAME__` at runtime.

---

## manifest.json

The manifest describes the theme and its configuration options.

```json
{
  "name": "My Theme",
  "resolution": [1920, 1080],
  "author": "Your Name",
  "caster": 3,
  "folders": {
    "css": "style",
    "js": "script"
  },
  "fields": [
    {
      "name": "round",
      "label": "Round",
      "type": "text",
      "span": 2,
      "checkbox": true
    },
    {
      "name": "show_logo",
      "label": "Show Logo",
      "type": "checkbox"
    },
    {
      "name": "countdown",
      "label": "Countdown",
      "type": "time",
      "checkbox": true
    }
  ]
}
```

### Top-level fields

| Field        | Type              | Description |
|-------------|-------------------|-------------|
| `name`       | `string`          | Display name shown in Piio |
| `resolution` | `[number, number]` | Overlay dimensions `[width, height]`, or `null` for dynamic |
| `author`     | `string`          | Theme author name |
| `caster`     | `number`          | How many caster slots this theme uses |
| `folders`    | `object`          | Folder names for `css` and `js` assets |
| `fields`     | `array`           | Custom configurable fields (see below) |

### Field types

Each entry in `fields` adds a control to the Piio UI and becomes readable in overlays via `piio.getField(name)`.

| `type`       | UI control         | Notes |
|-------------|--------------------|-------|
| `text`       | Text input         | Single line |
| `select`     | Dropdown           | Requires `options` array |
| `checkbox`   | Checkbox           | Returns `"true"` / `"false"` as string |
| `color`      | Color picker       | Returns hex string e.g. `"#ff0000"` |
| `time`       | Time/date input    | Intended for countdowns |
| `dropdown`   | Dropdown           | Alternative select variant |
| `scenes`     | OBS scene list     | Returns scene name |

Additional field properties:

| Property    | Type      | Description |
|------------|-----------|-------------|
| `name`      | `string`  | Identifier used in `getField(name)` |
| `label`     | `string`  | Label shown in Piio |
| `checkbox`  | `boolean` | Adds an enable/disable toggle next to the field |
| `span`      | `number`  | How many columns the field spans in the UI |
| `default`   | `string`  | Default value |
| `multi`     | `boolean` | Allow multiple values (returns `string[]`) |
| `matchlist` | `boolean` | Pre-fills from the current match list |

---

## Overlay HTML Files

Each `.html` file in the theme folder is served as a standalone overlay page. You write a regular HTML file — Piio automatically injects:

- `<meta charset="UTF-8">`
- A `<style>` tag enforcing the manifest resolution
- The file `{folders.css}/{filename}.css` if it exists
- The file `{folders.js}/{filename}.js` if it exists
- `/all.js` — the Piio overlay bundle (provides `PiioConnector`, `Player`, `Character`, `WSWrapper`, `SavedValue`, `Countdown` as globals)
- `var __FILENAME__ = "scoreboard";` — the overlay's own filename without extension

You **do not** need to add a script tag for `/all.js` yourself.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Scoreboard</title>
</head>
<body>
  <div id="p1-name"></div>
  <div id="p2-name"></div>

  <script>
    var piio = new PiioConnector("scoreboard", ["scoreboard"]);

    piio.on("scoreboard", function() {
      document.getElementById("p1-name").textContent = piio.getPlayer(1).name;
      document.getElementById("p2-name").textContent = piio.getPlayer(2).name;
    });
  </script>
</body>
</html>
```

---

## Connecting with PiioConnector

`PiioConnector` is the main API available to every overlay.

### Constructor

```javascript
var piio = new PiioConnector(name, subscriptions);
```

| Parameter       | Type                   | Description |
|----------------|------------------------|-------------|
| `name`          | `string`               | Unique name for this overlay instance |
| `subscriptions` | `string` or `string[]` | Which data streams to receive |

### Core events

```javascript
// Fires once when the connection is established and initial data is received
piio.on("ready", function(data) { /* ... */ });

// Fires whenever subscribed data changes
piio.on("scoreboard", function(data) { /* ... */ });
piio.on("slippiFrame", function(data) { /* ... */ });
```

### Listening to events

```javascript
// Persistent listener
piio.on("scoreboard", function(data) { console.log(data); });

// One-time listener
piio.once("scoreboard", function(data) { console.log("first update only", data); });
```

### Firing custom events

```javascript
piio.fire("my-event", { foo: "bar" });
```

---

## Subscriptions & Events

Pass subscription names to the `PiioConnector` constructor to receive those events. The last received value is cached and replayed immediately when the overlay connects.

| Subscription          | Trigger |
|----------------------|---------|
| `scoreboard`          | Any scoreboard change (player names, scores, characters, etc.) |
| `slippiFrame`         | Every Slippi game frame (high frequency — use carefully) |
| `slippiGameStarted`   | A new Slippi game begins |
| `slippiGameEnded`     | A Slippi game ends |
| `slippiStockDeath`    | A stock is lost |
| `slippiPercentChange` | Damage percent changes |
| `slippiStats`         | Stats resolved after `piio.slippi.getGamesStats()` |
| `obsSceneChanged`     | OBS switches to a different scene |
| `obsSceneList`        | The OBS scene list is updated |
| `streamQueue`         | Stream queue is updated (from StartGG / ParryGG) |
| `overlay-trigger`     | Overlay visibility is toggled from Piio |

```javascript
var piio = new PiioConnector("my-overlay", [
  "scoreboard",
  "slippiGameStarted",
  "slippiGameEnded",
  "obsSceneChanged"
]);
```

---

## Scoreboard Data

All scoreboard data is accessed through `piio` methods after the `"scoreboard"` event fires (or in `"ready"`). You never need to parse the raw event payload — use the getter methods instead.

### Teams and players

Teams are numbered `1` (left/player 1) and `2` (right/player 2).

```javascript
// Team name (e.g. in teams/crews mode)
piio.getTeamName(1);            // → "Team Alpha"
piio.getTeamName(1, { short: true }); // → abbreviated

// Score
piio.getScore(1);               // → 2
piio.getScore(2);               // → 1

// Bracket state: 0 = neutral, 1 = winners, 2 = losers
piio.getState(1);               // → 1

// Number of players per team
piio.TeamSize;                  // → 1 (singles), 2 (doubles), etc.

// All players of a team
piio.getTeamPlayers(1);         // → Player[]

// Specific player (playerNum is 0-based)
piio.getPlayer(1, 0);           // → Player | null
piio.getPlayer(2);              // → active/selected player

// In crews/ironman: active player index
piio.getSelectedPlayer(1);      // → 0

// Players ordered by their seat/port position
piio.getPlayersByPosition();    // → (Player | null)[]

// Port assignment (1–4)
piio.getPort(1, 0);             // → 1
```

### Match format

```javascript
// Match format type: 0 = freeplay, 1 = best-of, 2 = first-to
// Use constants for clarity:
PiioConnector.MATCHFORMAT_TYPE.FREEPLAY  // 0
PiioConnector.MATCHFORMAT_TYPE.BESTOF    // 1
PiioConnector.MATCHFORMAT_TYPE.FIRSTTO   // 2
```

### Game

```javascript
piio.getGame();    // → { _id: "melee", name: "Super Smash Bros. Melee", ... } | null
piio.Game;         // same, as getter property
```

---

## Player Data

`getPlayer()` returns a `Player` object with the following properties:

```javascript
var p = piio.getPlayer(1, 0);

p.name          // "Mango"
p.displayname   // "Mango" (custom display name, falls back to name)
p.firstname     // "Joseph"
p.lastname      // "Marquez"
p.pronoun       // "he/him"
p.country       // "US"  (ISO country code)
p.city          // "Los Angeles"
p.region        // "West Coast"
p.twitter       // "C9Mango"
p.bluesky       // ""
p.twitch        // "c9mango"
p.slippicode    // "MANG#0"
p.team          // [] (array of team IDs from DB)
p.pride         // [] (array of pride flag IDs)
p.smashgg       // 12345 (StartGG user ID)
p.parrygg       // "abc123"

// Computed getters
p.InDB          // true if player exists in the local database
p.HasSmashgg    // true if smashgg ID is set
p.PhotoPath     // "assets/player/photo/{id}.png"

// Get player's team names (pass teams from DB if available)
p.getDisplayName(teams);  // returns "TeamName | PlayerName" or just name
```

### Country data

```javascript
// Returns the country database entry or null
piio.getCountry(1, 0);   // → { _id: "US", name: "United States", ... } | null
```

### Pride flags

```javascript
piio.getPride(1, 0);  // → array of pride flag objects
```

### Team affiliations

```javascript
piio.getPlayerTeams(1, 0);  // → array of team objects from DB
```

---

## Character Data

```javascript
// Returns a Character object or null
var char = piio.getCharacter(1, 0);

char.ID           // "fox"
char.name         // "Fox"
char.Shorten      // "Fox" (abbreviated name)
char.DefaultSkin  // "0" (default skin index)
char.SkinCount    // 6

// Get a specific skin value by index
char.getSkin(0);  // → "0"
char.getSkin(2);  // → "2"
```

Character icons are stored at:
```
{APPRES}/assets/character/{game}/{characterId}/stock/{skin}.png
```

Use `piio.getPictureUrl(url)` to verify an asset URL exists before setting it as a `background-image`.

---

## Caster Data

Casters are numbered starting at `1`. The number of caster slots is defined by `"caster"` in the manifest.

```javascript
var caster = piio.getCaster(1);
caster.name        // "HungryBox"
caster.displayname // "HungryBox"
caster.twitter     // "LiquidHbox"

piio.getCasterCountry(1);   // → country object or null
piio.getCasterPride(1);     // → array of pride flag objects
```

---

## Custom Fields

Fields defined in `manifest.json` are readable via:

```javascript
// Returns { value: string | string[], enabled: boolean }
var field = piio.getField("round");
field.value    // "Winners Finals"
field.enabled  // true (when checkbox is checked)

// Shorthand for just the value
piio.getFieldValue("round");  // → "Winners Finals"
```

Fields with `checkbox: true` have an enable toggle — check `field.enabled` before showing the value.

```javascript
piio.on("scoreboard", function() {
  var round = piio.getField("round");
  var el = document.getElementById("round");
  el.style.display = round.enabled ? "block" : "none";
  el.textContent = round.value;
});
```

---

## Utility Classes

### SavedValue

Simple per-overlay key-value store that persists values across updates.

```javascript
var saved = new SavedValue();

saved.set("lastScore1", 0);
saved.get("lastScore1");           // → 0

// Returns true if the current stored value equals the provided value.
// If it doesn't match and overwrite is true (default), updates the stored value.
saved.isSet("lastScore1", 2);      // → false, stores 2

saved.clear();                     // → clears all values
```

Useful for detecting changes:

```javascript
piio.on("scoreboard", function() {
  var score = piio.getScore(1);
  if (!saved.isSet("score1", score)) {
    // Score changed — trigger animation
    animateScore();
  }
});
```

### Countdown

Countdown timer bound to a target date/time.

```javascript
var cd = new Countdown();

// Set the target time (ISO string, timestamp, or Date object)
cd.Due = "18:30:00";          // today at 18:30
cd.Due = 1700000000000;       // Unix timestamp in ms
cd.Due = new Date("2025-12-01T20:00:00");

// Read formatted time remaining
cd.String;       // "04:32"      (MM:SS, or HH:MM:SS if > 1 hour)
cd.LongString;   // "04:32"      (always includes MM:SS)
cd.FullString;   // "00:04:32"   (always HH:MM:SS)
cd.Value;        // 272000       (milliseconds remaining)

// Individual components (zero-padded strings)
cd.Components;   // { h: "00", m: "04", s: "32" }

// State checks
cd.isPast;       // true if Due is in the past
cd.isFuture;     // true if Due is in the future
cd.isVisible;    // true if Visible && isFuture

cd.Visible = true;   // toggle countdown visibility
```

Bind to a `"time"` field from the manifest:

```javascript
piio.on("scoreboard", function() {
  var field = piio.getField("countdown");
  cd.Due = field.value;
  cd.Visible = field.enabled;
});

// Update display every second
setInterval(function() {
  document.getElementById("countdown").textContent = cd.String;
}, 1000);
```

### WSWrapper

Low-level WebSocket wrapper. **Normally you do not need this** — `PiioConnector` wraps it. Use it only if you need a custom WebSocket connection.

```javascript
var ws = new WSWrapper("localhost", 4000);

ws.on("open", function() { console.log("connected"); });
ws.on("data-scoreboard", function(data) { console.log(data); });

ws.send("ping");
ws.send({ type: "subscribe", data: "scoreboard" });

ws.Open;        // → true if connected
ws.reconnect;   // → true (auto-reconnect enabled by default)
```

---

## Asset URLs

Assets bundled with Piio are served under `/assets/`. Use `piio.getPictureUrl(path)` to check whether an image exists before displaying it.

| Asset type       | Path pattern |
|-----------------|--------------|
| Player photo     | `assets/player/photo/{player._id}.png` |
| Character stock  | `assets/character/{game}/{charId}/stock/{skin}.png` |
| Country flag     | `assets/country/{countryCode}.png` or `.svg` |

```javascript
var url = "assets/player/photo/" + piio.getPlayer(1).ID + ".png";
var resolved = piio.getPictureUrl(url);
if (resolved) {
  document.getElementById("photo").style.backgroundImage = "url('" + resolved + "')";
}
```

---

## Slippi Integration

If Slippi is connected, frame-by-frame data is available.

```javascript
var piio = new PiioConnector("slippi-overlay", [
  "slippiFrame",
  "slippiGameStarted",
  "slippiGameEnded",
  "slippiStockDeath",
  "slippiPercentChange"
]);

piio.on("slippiGameStarted", function(data) {
  console.log("Game started:", data);
});

piio.on("slippiFrame", function(data) {
  // data contains per-frame player state: position, percent, stocks, etc.
});

// Get stats for the last N games
piio.slippi.getGamesStats(3).then(function(result) {
  console.log(result.data);
});

// Utility lookups
piio.slippi.moveId(22);          // → "Forward Smash"
piio.slippi.stages[8];           // → "Yoshi's Story"
piio.slippi.characters[2].name;  // → "Fox"
```

---

## Full Example

A minimal scoreboard overlay:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Scoreboard</title>
  <style>
    body { margin: 0; font-family: sans-serif; background: transparent; }
    #scoreboard { display: flex; justify-content: space-between; padding: 16px; }
    .player { text-align: center; }
    .name { font-size: 2em; font-weight: bold; color: white; }
    .score { font-size: 3em; color: gold; }
  </style>
</head>
<body>
  <div id="scoreboard">
    <div class="player">
      <div class="name" id="p1-name"></div>
      <div class="score" id="p1-score"></div>
    </div>
    <div class="player">
      <div class="name" id="p2-name"></div>
      <div class="score" id="p2-score"></div>
    </div>
  </div>

  <script>
    var piio = new PiioConnector("scoreboard", ["scoreboard"]);
    var saved = new SavedValue();

    function update() {
      var p1 = piio.getPlayer(1);
      var p2 = piio.getPlayer(2);

      document.getElementById("p1-name").textContent  = p1 ? p1.name : "";
      document.getElementById("p2-name").textContent  = p2 ? p2.name : "";
      document.getElementById("p1-score").textContent = piio.getScore(1);
      document.getElementById("p2-score").textContent = piio.getScore(2);

      // Animate score change
      var score1 = piio.getScore(1);
      if (!saved.isSet("score1", score1)) {
        document.getElementById("p1-score").classList.add("bump");
        setTimeout(function() {
          document.getElementById("p1-score").classList.remove("bump");
        }, 500);
      }
    }

    piio.on("ready", update);
    piio.on("scoreboard", update);
  </script>
</body>
</html>
```
