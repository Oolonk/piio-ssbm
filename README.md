# piio (Custom Version for Super Smash Bros. Melee)
This is a fork from [piio](https://github.com/MYI-Liva/piio) made by Liva


## Added changes to this fork:
- Added Slippi support
- Added OBS support
- When Obs and Slippi is activated you can activate the Auto Scene Switcher
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
- Ability to add/remove casters on the fly
- Update dependencies
- Auto light and dark mode depends on settings off the computer
- Updated Seatorder logic
  - In crews only the two enabled players are shown

## Example
To fetch data at the overlay page site via Javascript see [this example](themes/default/test.html)

## Information:
This project is not maintained by Liva or the piio team. If you have question DM me!
<!---
## Social Media or Donation Link

### Oolonk:
<a href="https://twitter.com/RDF_Dortimus51" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://abs.twimg.com/favicons/twitter.2.ico'></a>
<a href="https://bsky.app/profile/oolonk.bsky.app" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://abs.twimg.com/favicons/twitter.2.ico'></a>
<a href="https://twitch.tv/Oolonk" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://brand.twitch.tv/assets/logos/svg/glitch/purple.svg' border='0'  ></a>(Inactive) 
<a href="https://ko-fi.com/oolonk" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://az743702.vo.msecnd.net/cdn/kofi3.png?v=0' border='0' alt='Buy Me a Tea at ko-fi.com' ></a>

### BerlinMelee:
<a href="https://twitter.com/BerlinMelee" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://abs.twimg.com/favicons/twitter.2.ico'></a>
<a href="https://bsky.app/profile/berlinmelee.bsky.app" target="_blank"><img height='35' style='border:0px;height:46px;' src='https://abs.twimg.com/favicons/twitter.2.ico'></a>
<a href='https://twitch.tv/BerlinMelee' target="_blank"><img height='35' style='border:0px;height:46px;' src='https://brand.twitch.tv/assets/logos/svg/glitch/purple.svg' border='0'  ></a>
[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate/?hosted_button_id=4QEHK2EBPMGDY)

