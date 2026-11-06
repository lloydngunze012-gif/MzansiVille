# Day 1: leaving home (6 Nov)

Not deployed (owner: don't deploy until told). Everything is pushed to main.

Screenshots and the fps file are in this folder on the build machine only (repo rule: test images are never committed). Every file named below is in `docs/sprints/home/`.

## Screenshots

Both home styles, from all three cameras, by day (412-ish phone, 390x844 at 2x, real GPU):

| | Suburban (From: Durban) | Township (From: Soweto) |
| --- | --- | --- |
| Bedroom, Top / Sims / Eye | `suburban_1_bedroom_top.png`, `_sims`, `_eye` | `township_1_bedroom_top.png`, `_sims`, `_eye` |
| Out of the window | `suburban_2_window.png` | `township_2_window.png` |
| Breakfast with the family | `suburban_3_breakfast.png`, `suburban_4_sibling.png` | `township_3_breakfast.png`, `township_4_sibling.png` |
| The street, Top / Sims / Eye | `suburban_5_street_top.png`, `_sims`, `_eye` | `township_5_street_top.png`, `_sims`, `_eye` |
| The drive | `suburban_6_drive.png` | `township_6_drive.png` |

The drop-off at UMzansi's Main Gate (both styles): `*_7_gate_arrive.png` (the car comes up the gate road), `*_8_gate_goodbye.png`, `*_9_hug.png`, `*_10_money.png` ("For food, not for parties", under the UNIVERSITY OF MZANSI · MAIN GATE sign), `*_11_suitcase.png` (the gold dots, the suitcase), `*_12_door.png` (your roommate at Thekwini House).

Bus stop: `13_bus_stop.png`, `14_bus_stop_card.png`, `15_greenway_after_bus.png`.

## Size added (all fetched only on day 1)

| | |
| --- | --- |
| `public/models/home/suburb-kit.glb` (Kenney City Kit Suburban) | 99 KB |
| `public/models/home/furniture-kit.glb` (Kenney Furniture Kit) | 105 KB |
| `public/models/home/town-kit.glb` (Quaternius Ultimate Textured Buildings, recoloured) | 290 KB |
| `public/models/home/dog.glb` (Quaternius Shiba Inu, 3 clips) | 381 KB |
| `public/draco/` (Draco decoder, wasm) | 245 KB |
| `home` code chunk + DRACOLoader chunk (minified) | 36 KB (28.5 + 7.5) |
| **Total** | **about 1.15 MB** (budget 2 MB) |

The drop-off (`dropoff.js`) is in the campus chunk and reuses the campus's own car models: no new downloads. Every pack, source URL and licence: `docs/credits.md`.

## Frame rate (this PC, Edge on the real GPU, 390x844)

`fps.json` (requestAnimationFrame count over 3 s, `tests/e2e/day1-extra.spec.js`):

| Scene | fps |
| --- | --- |
| Before: the old day-1 opening (the res room, now day 2) | 60 |
| After: home, suburban (bedroom, street through the window) | 59 |
| After: home, township | 49 |
| Campus at the Main Gate (unchanged) | 39 |

The township street costs ~10 fps more than the suburban one (the Quaternius buildings have more triangles). Phone numbers still to come from the owner.

## What each part did

1. **Stuck fade**: every fade in `morning.js` goes through `underFade`, which always lifts it. `morning.spec.js` plays the morning to the end without and with the caf breakfast and checks the Continue button is on top.
2. **Home scene** (`src/world/home.js`): playable like campus (tap to walk, swipe to look, Top/Sims/Eye, the same movement code). Wake upstairs; "Look out of the window" (the street: neighbour watering, the dog in the yard, parked cars, houses across the road); downstairs on the kit stairs; breakfast at the table with your parent and sibling (the embarrassing line, "can I have your room?", three replies, saved in `run.home.sibling`); grab your bags by the door; out the front door, the dog trots after you; get in the car. About a minute at normal speed.
3. **Two styles** in `data/campusville/homes.json`, picked from "From" (suburban: Durban, Joburg, Pretoria, Cape Town, Elsewhere in Africa, Overseas; township: Soweto, Eastern Cape, Limpopo, Mpumalanga, Free State, North West; no answer: suburban). Each has its own houses, colours, fences or palisades, a spaza shop and high mast light (township), parked cars, family car, breakfast, lines and pocket money. Adding a style is data only. The family wears your skin and hair colour.
4. **Never empty**: 4 rows of houses (about 30), fences along every plot, street trees, lamps every 18 m, 4 people walking the pavements, 2 neighbours chatting, a neighbour watering, the dog, 3 parked cars. Fog well past the last row. Checked from Top, Sims and Eye in both styles.
5. **CC0 assets**: Kenney City Kit (Suburban) and Furniture Kit (glTF); Quaternius Ultimate Textured Building Pack (FBX converted with three.js, every material repainted in SA palettes); Quaternius Shiba Inu. `scripts/home-assets.mjs` rebuilds them from the downloads; Draco throughout.
6. **Drop-off** (`src/world/dropoff.js`): the car drives a fixed path up the gate road and stops in front of the Main Gate; goodbye, hug, R600 (suburban) / R400 (township) "for food, not for parties"; the car U-turns and leaves. You roll your suitcase to your house door (gold dots, or "Take my bags to ..." walks you); your roommate meets you there; today's goals start.
7. **Res morning on day 2**; from day 3 you wake in your house as before. **Bus stop** by the gate: "Bus to town" (R10, one slot) rides into town and walks you to Greenway Grocer, whose card opens.

## Tests

- `tests/e2e/home.spec.js`: both styles, bedroom to house door (2 pass).
- `tests/e2e/morning.spec.js`: the res morning on day 2, three runs (3 pass; the old late-bus test stays skipped).
- `tests/e2e/day1-extra.spec.js`: bus stop to Greenway, and the fps (2 pass).
- `npm run check`: 51 sim checks pass.
- Not run: the full suite.

## Still open

- The hug is the two of you stepping close and swaying (no arm-around animation in the character pack).
- The window view is a fixed shot through the bedroom window, not free look, and it frames the road and the houses across it: the neighbour and the dog it talks about are out of frame (to the left, in the yard). Needs a re-aim.
- Inside the house, the walls are Kenney furniture-kit walls (plain); the outside shell is a kit house. You switch between them at the front door with a short fade.
- The family's look copies your skin and hair colour; faces are the pack's.
- The family car keeps the Car Kit's own colours (the tint in homes.json multiplies a light grey, so it barely shows).
- "Bus to town" returns you to campus after the ride (town itself isn't a place yet; Greenway is still by the gate).
