# Credits: art packs

Every model and sound in the game is CC0 (public domain dedication): free for any use, no attribution required. We credit the makers anyway. Older packs are listed in `public/models/CREDITS.md` and `public/audio/CREDITS.md`; this file adds the day-1 home scene (leaving home) and is the place to record any new pack.

## Day 1: leaving home (`public/models/home/`)

Built by `scripts/home-assets.mjs` from the original downloads: each pack becomes one glTF binary kit file (every model a named node), welded, quantised and Draco-compressed. Loaded only on day 1 by `src/world/home.js`.

| File | Pack | Author | Source | Licence | What we use |
| --- | --- | --- | --- | --- | --- |
| `suburb-kit.glb` (99 KB) | City Kit (Suburban) 2.0 | Kenney | https://kenney.nl/assets/city-kit-suburban | CC0 1.0 (`License.txt` in the pack: http://creativecommons.org/publicdomain/zero/1.0/) | 8 houses, fences, driveways, paths, planters. Roofs and fences recoloured at load to South African palettes (`data/campusville/homes.json`). |
| `furniture-kit.glb` (105 KB) | Furniture Kit | Kenney | https://kenney.nl/assets/furniture-kit | CC0 1.0 (`License.txt` in the pack) | The family home inside: walls, windows, doorway, floors, stairs, bed, desk, kitchen, table and chairs, sofa, TV, rugs, boxes. Walls tinted per style. |
| `town-kit.glb` (290 KB) | Ultimate Textured Building Pack (Dec 2019), "Models with Materials" FBX | Quaternius | https://quaternius.com/packs/ultimatetexturedbuildings.html (download: the "Just give me the Download" Google Drive folder on that page) | CC0 1.0 (stated on the pack page: https://creativecommons.org/publicdomain/zero/1.0/) | 7 one- and two-storey buildings for the township street. Converted FBX to glTF with three.js; every material repainted from the style's palette (wall paint, roof, trim). |
| `dog.glb` (381 KB) | Ultimate Animated Animal Pack, Shiba Inu | Quaternius | https://quaternius.com/packs/ultimateanimatedanimals.html | CC0 1.0 (stated on the pack page) | The family dog. FBX to glTF; only the Idle, Walk and Gallop clips are kept. |

Also used in the home scene, already in the game (no new size): Kenney Nature Kit trees (`public/models/props/tree_*.glb`), Kenney Car Kit cars (`public/models/cars/`), Quaternius Ultimate Modular Men and Women (the family and neighbours, `public/models/people2/`). See `public/models/CREDITS.md`.

## Library (not art)

`public/draco/` (draco_decoder.wasm, draco_wasm_wrapper.js, 245 KB): the Draco mesh decoder from Google, shipped with three.js (`three/examples/jsm/libs/draco/gltf/`). Apache License 2.0.

## Size the home scene adds

| | |
| --- | --- |
| Models (4 kit files) | 875 KB |
| Draco decoder | 245 KB |
| Home scene code (`home` chunk, minified) | see the sprint report |
| Total | under 2 MB, fetched only on day 1 |
