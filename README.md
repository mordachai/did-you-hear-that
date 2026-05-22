[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/W7W01A1ZN1)

![Foundry v13](https://img.shields.io/badge/foundry-v13-green?style=for-the-badge) ![Foundry v14](https://img.shields.io/badge/foundry-v14-blue?style=for-the-badge)  ![Github All Releases](https://img.shields.io/github/downloads/mordachai/did-you-hear-that/total.svg?style=for-the-badge) ![GitHub Release](https://img.shields.io/github/v/release/mordachai/did-you-hear-that?display_name=tag&style=for-the-badge&label=Current%20version)  [![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fdid-you-hear-that&color=bf360c&style=for-the-badge)](https://forge-vtt.com/bazaar/package/vagabond)

# Did You Hear That?

*"Hey, put your ear to the door..."*

A tiny Foundry VTT module that lets **players preview ambient sounds by hovering the cursor over the canvas**. No tokens required, no server gymnastics. Each player hears it on their own client.

Great for spooky dungeons, busy taverns, and that one waterfall the GM keeps forgetting to point out.

<img width="1166" height="766" alt="image" src="https://github.com/user-attachments/assets/8899c921-e541-47f0-8ca8-d7464301152b" />

## What it does

- Hover the cursor inside an ambient sound's radius → it plays.
- Move out → it stops (with a smooth fade).
- Respects everything the GM set: **volume, easing, base effect, muffled-through-walls effect**, and the player's global Ambient volume slider.
- Optional **origin marker icon** rendered at every non-hidden ambient sound, so players know where to hover. Icon is a Font Awesome Pro class — pick any glyph, size, and color in settings.
- GM view is clean, no markers.
- 100% client-side. Nothing broadcast, nothing synced, no extra load.

## Why it exists

Foundry's built-in `playAtPosition` only fires when a token enters the radius. Players without tokens, or just exploring the map with the cursor, get nothing. So this a module developed for Theather of the Mind scenes, where they can be filled with sound cues to help immersion or give clues to players.

## Settings

Player-side (each client controls their own):

| Setting                | Default | Notes                                                                  |
| ---------------------- | ------- | ---------------------------------------------------------------------- |
| Enabled                | on      | Toggle previews without disabling the module.                          |
| Show sound origin icon | on      | Hide the on-canvas marker if you find it visually noisy.               |

GM-side (world settings, apply to everyone):

| Setting                   | Default           | Notes                                                                                                    |
| ------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Fade duration             | 300 ms            | 0 = instant. Crank it up for dramatic creep-ins.                                                         |
| Sound origin icon class   | `fa-light fa-ear` | Any Font Awesome Pro class. Examples: `fa-solid fa-volume-high`, `fa-solid fa-music`, `fa-light fa-ear`. |
| Sound origin icon size    | 32 px             | Font size of the marker glyph.                                                                           |
| Sound origin icon color   | `#ffffff`         | Hex color for the marker.                                                                                |
| Sound origin icon opacity | 0.5               | Marker transparency. 0 = invisible, 1 = fully opaque.                                                    |

## Install

Manifest URL:

```text
https://github.com/mordachai/did-you-hear-that/releases/latest/download/module.json
```

- OR -

Look for "did you hear that" in modules install search

## Compatibility

Foundry VTT **v13 minimum, v14 verified**. Plays nice with the Levels feature (uses document coords).

## License

See [LICENSE](LICENSE).
