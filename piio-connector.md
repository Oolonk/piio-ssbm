
### PiioConnector API Documentation

#### Constructor

```javascript
new PiioConnector(name, subscriptions)
```

- **name**: A string representing the name of the PiioConnector instance.
- **subscriptions**: An array of strings representing the events to subscribe to.

#### Methods

##### `on(name: string, callback: function)`

Registers a callback function to be executed when the specified event is triggered.

- **name**: The name of the event to listen for.
- **callback**: The function to execute when the event is triggered.

##### `once(name: string, callback: function)`

Registers a callback function to be executed only once when the specified event is triggered.

- **name**: The name of the event to listen for.
- **callback**: The function to execute when the event is triggered.

##### `getPlayer(teamNum: number, playerNum?: number): Player | null`

Returns the player object for the specified team and player number.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getPosition(teamNum: number, playerNum?: number): number | undefined`

Returns the position of the specified player in the team.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getPlayersByPosition(): Player[]`

Returns a list of players ordered by their position.

##### `getSelectedPlayer(teamNum: number): number`

Returns the selected player for the specified team.

- **teamNum**: The team number.

##### `getTeamName(teamNum: number, options?: object): string`

Returns the name of the specified team.

- **teamNum**: The team number.
- **options**: Additional options (optional).

##### `getTeamStatus(teamNum: number, playerNum?: number): object | null`

Returns the status of the specified team and player.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getTeamPlayers(teamNum: number): Player[]`

Returns a list of players for the specified team.

- **teamNum**: The team number.

##### `getScore(teamNum: number): number | null`

Returns the score of the specified team.

- **teamNum**: The team number.

##### `getState(teamNum: number): string | null`

Returns the state of the specified team.

- **teamNum**: The team number.

##### `getCountry(teamNum: number, playerNum?: number): Country | null`

Returns the country of the specified player.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getPride(teamNum: number, playerNum?: number): Pride[]`

Returns the pride flags of the specified player.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getPort(teamNum: number, playerNum?: number): number | null`

Returns the port number of the specified player.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getCharacter(teamNum: number, playerNum?: number): Character | null`

Returns the character of the specified player.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getPlayerTeams(teamNum: number, playerNum?: number): Team[]`

Returns a list of teams for the specified player.

- **teamNum**: The team number.
- **playerNum**: The player number (optional).

##### `getCaster(casterNum: number): Caster | null`

Returns the caster object for the specified caster number.

- **casterNum**: The caster number.

##### `getCasterCountry(casterNum: number): Country | null`

Returns the country of the specified caster.

- **casterNum**: The caster number.

##### `getCasterPride(casterNum: number): Pride[]`

Returns the pride flags of the specified caster.

- **casterNum**: The caster number.

##### `getGame(): Game | null`

Returns the current game object.

##### `getField(name: string): Field`

Returns the field object for the specified field name.

- **name**: The field name.

##### `getFieldValue(name: string): string`

Returns the value of the specified field.

- **name**: The field name.

##### `async getPlayersByStartGGId(ids: integer | integer[]): Promise<Object[]>`

Requests the all Players with the StartGG IDs.

- **ids**: An integer or an array of integers representing the StartGG IDs of the players.
- Returns a promise that resolves with an Object: {
  "data": Array of the players,
  "type": Name of the returned call
  }

##### `async getPlayersByParryGGId(ids: string | string[]): Promise<Object[]>`

Requests the all Players with the ParryGG IDs.

- **ids**: An integer or an array of integers representing the ParryGG IDs of the players.
- Returns a promise that resolves with an Object: {
  "data": Array of the players,
  "type": Name of the returned call
  }

##### `TeamSize: number`

Returns the size of the team.

##### `Game: Game`

Returns the current game object.

##### `getPictureUrl(url: string): string | false`

Returns the URL of the picture if it exists.

- **url**: The base URL of the picture.

#### SlippiConnector Methods

##### `slippi.moveId(move: number): string`

Returns the name of the move corresponding to the given move ID.

- **move**: The ID of the move.

##### `async slippi.getGamesStats(amount?: number): Promise<Object>`

Requests the statistics for a specified number of games.
As an addition it will be returned by the **slippiStats** subscription.

- **amount**: The number of games to retrieve statistics for (default is 1).
- Returns a promise that resolves with an Object: {
  "data": Array of game statistics,
  "type": Name of the returned call
  }

#### Subscription Parameters

- **ready**: Triggered when the PiioConnector instance is ready.
- **scoreboard**: Triggered when the scoreboard data changes.
- **slippiFrame**: Triggered when new Slippi frame data is available.
- **slippiGameStarted**: Triggered when a new Slippi game starts.
- **slippiGameEnded**: Triggered when a Slippi game ends.
- **obsSceneChanged**: Triggered when the OBS scene changes.
- **obsSceneList**: Triggered when the OBS scene list is updated.
- **slippiStats**: Triggered when the Stats will be resolved.
