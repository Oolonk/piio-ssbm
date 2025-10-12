# piio (Custom Version for Super Smash Bros. Melee)
This is a fork from [piio](https://github.com/MYI-Liva/piio) made by Liva


## Added changes to this fork:
- Added Slippi support
  - Added Auto Game Score increment
- Added OBS support
- When OBS and Slippi is activated you can activate the Auto Scene Switcher
- New fields: 
    - For Player: City, Slippi-Code, Pride-Flags, Bluesky (StartGG has no implementation for Bluesky)
    - For Teams: primary color, secondary color
    - For Game: videogameID (ID of StartGG)
- Ability to use SVG files in the assets tab
- New autofill fields:
    - tournamentName: tournament name
    - slug: tournament slug E.g.: (https://start.gg/**Genesis**)
- Send new data to the overlay:
    - StartGG token
    - StartGG data: SetId, EventId, PhaseGroupId, PhaseId
    - Stream set list
    - Obs scene switched
    - New Methods: 
        - `getPlayersByStartGGId(ids: integer | integer[]): Promise<Object[]>`
- Ability to add/remove casters on the fly
- Update dependencies
- Auto light and dark mode depends on settings off the computer
- Updated Seatorder logic
  - In crews only the two enabled players are shown

## Example
To fetch data at the overlay page site via Javascript see [this example](themes/default/test.html)

## Information:
This project is not maintained by Liva or the piio team. If you have question DM me!

## Social Media 

### Oolonk:
<a href="https://bsky.app/profile/oolonk.de" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://bsky.social/about/images/favicon-32x32.png'></a>
