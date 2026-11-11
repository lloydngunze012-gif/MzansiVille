# Audio credits

Every file in this folder is [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Attribution is not required. Names, titles, and source pages are recorded anyway so Game Dev can check the licence later.

Files were re-encoded to Ogg Vorbis and, where noted, trimmed or joined. Each `.ogg` also has an `.m4a` (AAC 96 kbps) copy made from it for Safari. The licence of the source was not changed.

| File | Title | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `kettle.ogg` | cooking_with_cover_01 (boiling water loop) | TinyWorlds | https://opengameart.org/content/boiling-water-loops | CC0 |
| `door.ogg` | Door Open SFX (`door_open.wav`) | Oiboo | https://opengameart.org/content/door-open-sfx | CC0 |
| `footsteps.ogg` | Wood footsteps 01–04 from 100 CC0 SFX #2, joined into one short walk | rubberduck | https://opengameart.org/content/100-cc0-sfx-2 | CC0 |
| `bus_engine.ogg` | Racing car engine loop 0, used here as the bus engine | domasx2 | https://opengameart.org/content/racing-car-engine-sound-loops | CC0 |
| `crowd.ogg` | Crowd shouting / speaking ambience | StarNinjas | https://opengameart.org/content/crowd-shoutingspeaking-ambience | CC0 |
| `music_campus.ogg` | Sherwood (chill background loop). The author asks that optional credit use the name Chris Murphy. | zesona | https://opengameart.org/content/sherwood | CC0 |

Notes for wiring:

- `kettle.ogg` is already a loop (about 5 seconds).
- `bus_engine.ogg` is a short engine loop (under a second). It is a car engine, not a field recording of a bus.
- `crowd.ogg` is people talking and shouting mixed into a crowd bed (about 27 seconds). It is not a recording of a campus. Edge fades were added so a loop does not click.
- `footsteps.ogg` is four wood steps with short gaps (about 1.7 seconds). Loop it for a walk.
- `music_campus.ogg` is a chill loop of about 35 seconds, not a song recorded for this game.
- `door.ogg` is a one-shot. Do not loop it.

## The four original tracks (8 Nov; in the game since the Sound job, 11 Nov)

These four were written for Soft Life by Claude Code. They are synthesised offline from scratch (sine, FM and noise voices in a Python script, no samples and no outside recordings), so they are original work released as CC0 1.0. Each is a gapless loop under 1 MB, as `.ogg` (Opus, 88 kbps) and `.m4a` (AAC 96 kbps).

| File | Name | Feel | Licence |
| --- | --- | --- | --- |
| `alt_slow_tar` | Slow Tar | slow amapiano, 108 BPM, log drum, Rhodes, 44 s | CC0 (original) |
| `alt_sunday_braai` | Sunday Braai | warm afro-house, 120 BPM, congas, pluck arpeggio, 48 s | CC0 (original) |
| `alt_kasi_morning` | Kasi Morning | gentle, 98 BPM, keys and a marimba tune, 39 s | CC0 (original) |
| `alt_golden_hour` | Golden Hour | deep house with amapiano log drum, 112 BPM, 43 s | CC0 (original) |

Since 11 Nov these four play in the game, by zone and time of day (`data/campusville/sound.json`), with `music_campus`.

## Ambience (Sound job, 11 Nov): no files

The ambience is made live in the browser by `src/soundscape.js` (Web Audio: filtered noise and oscillators), so it is ours and adds no download: sea waves and gulls, street hum, a hooter, wind. A passing vehicle is `bus_engine` played low and slow; the murmur inside places and the crowd are `crowd` (low-passed for the murmur). New audio files added by the Sound job: none (0 KB of the 1.5 MB allowed).

The creator groove variations ("mellow" and "bright") are the same live Web Audio synth as `src/groove.js`, with a different tempo and chords. Nothing recorded.
