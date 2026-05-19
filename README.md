# Did You Hear That?

*"Hey, put your ear to the door..."*

A tiny Foundry VTT module that lets **players preview ambient sounds by hovering the cursor over the canvas**. No tokens required, no server gymnastics. Each player hears it on their own client.

Great for spooky dungeons, busy taverns, and that one waterfall the GM keeps forgetting to point out.

## What it does

- Hover the cursor inside an ambient sound's radius → it plays.
- Move out → it stops (with a smooth fade).
- Respects everything the GM set: **volume, easing, base effect, muffled-through-walls effect**, and the player's global Ambient volume slider.
- Optional **origin marker icon** rendered at every non-hidden ambient sound, so players know where to hover. Icon is a Font Awesome Pro class — pick any glyph, size, and color in settings.
- GM is excluded by default — you already know where the sounds are.
- 100% client-side. Nothing broadcast, nothing synced, no extra load.

## Why it exists

Foundry's built-in `playAtPosition` only fires when a token enters the radius. Players without tokens, or just exploring the map with the cursor, get nothing. With this Theather of the Mind scenes can be filled with sound cues .

## Settings (per client/player)

| Setting                 | Default                   | Notes                                                                                      |
| ----------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Enabled                 | on                        | Toggle previews without disabling the module.                                              |
| Fade duration           | 300 ms                    | 0 = instant. Crank it up for dramatic creep-ins.                                           |
| Show sound origin icon  | on                        | Render a marker at every non-hidden ambient sound so players know where to hover.          |
| Sound origin icon class | `fa-solid fa-volume-high` | Any Font Awesome Pro class. Examples: `fa-solid fa-music`, `fa-duotone fa-waveform-lines`. |
| Sound origin icon size  | 64 px                     | Font size of the marker glyph.                                                             |
| Sound origin icon color | `#ffffff`                 | Hex color for the marker.                                                                  |

## Install

Manifest URL:

```text
https://github.com/mordachai/did-you-hear-that/releases/latest/download/module.json
```

## Compatibility

Foundry VTT **v13 minimum, v14 verified**. Plays nice with the Levels feature (uses document coords).

## License

See [LICENSE](LICENSE).
