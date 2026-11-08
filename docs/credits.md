# Credits: art packs

Rule (owner, 8 Nov): everything in the game is CC0, or CC BY 4.0 with credit. Everything shipped today is CC0 (public domain dedication): free for any use, no attribution required. We credit the makers anyway. A CC BY 4.0 asset needs its credit line here and on the in-game Credits screen (`#/credits`, `src/ui/render.js`), and a note when we changed it. Older packs are listed in `public/models/CREDITS.md` and `public/audio/CREDITS.md`; this file adds the day-1 home scene (leaving home) and is the place to record any new pack.

## Day 1: leaving home (`public/models/home/`)

Built by `scripts/home-assets.mjs` from the original downloads: each pack becomes one glTF binary kit file (every model a named node), welded, quantised and Draco-compressed. Loaded only on day 1 by `src/world/home.js`.

| File | Pack | Author | Source | Licence | What we use |
| --- | --- | --- | --- | --- | --- |
| `suburb-kit.glb` (99 KB) | City Kit (Suburban) 2.0 | Kenney | https://kenney.nl/assets/city-kit-suburban | CC0 1.0 (`License.txt` in the pack: http://creativecommons.org/publicdomain/zero/1.0/) | 8 houses, fences, driveways, paths, planters. Roofs and fences recoloured at load to South African palettes (`data/campusville/homes.json`). |
| `furniture-kit.glb` (105 KB) | Furniture Kit | Kenney | https://kenney.nl/assets/furniture-kit | CC0 1.0 (`License.txt` in the pack) | The family home inside: walls, windows, doorway, floors, stairs, bed, desk, kitchen, table and chairs, sofa, TV, rugs, boxes. Walls tinted per style. |
| `town-kit.glb` (290 KB) | Ultimate Textured Building Pack (Dec 2019), "Models with Materials" FBX | Quaternius | https://quaternius.com/packs/ultimatetexturedbuildings.html (download: the "Just give me the Download" Google Drive folder on that page) | CC0 1.0 (stated on the pack page: https://creativecommons.org/publicdomain/zero/1.0/) | 7 one- and two-storey buildings for the township street. Converted FBX to glTF with three.js; every material repainted from the style's palette (wall paint, roof, trim). |
| `dog.glb` (381 KB) | Ultimate Animated Animal Pack, Shiba Inu | Quaternius | https://quaternius.com/packs/ultimateanimatedanimals.html | CC0 1.0 (stated on the pack page) | The family dog. FBX to glTF; only the Idle, Walk and Gallop clips are kept. |

Also used in the home scene, already in the game (no new size): Kenney Nature Kit trees (`public/models/props/tree_*.glb`), Kenney Car Kit cars (`public/models/cars/`), Quaternius Ultimate Modular Men and Women (the family and neighbours, `public/models/people2/`). See `public/models/CREDITS.md`.

## Polyfork (CC BY 4.0, credit required)

Source: https://polyfork.dev (catalogue API: https://polyfork.dev/api/assets). The free low-poly meshes (GLB, FBX, USD, OBJ) are offered under CC BY 4.0 (credit and say what we changed) or the Polyfork licence (no credit, no redistribution of the files). We use CC BY 4.0, because the game ships the files. Licence page: https://polyfork.dev/licensing. Not covered by CC BY, so never used: the `.mjs` programs, HD editions, renders, thumbnails, private kits. The Polyfork name and logo are not licensed.

Credit line per asset, exactly as the asset's `credit` field gives it, e.g. `Cafe Parasol by Polyfork (https://polyfork.dev/asset/cafe-parasol-61a313), CC BY 4.0`. Record changes (recolour, Draco, merged into a kit) beside it.

Built by `scripts/caf-assets.mjs` (node scripts/caf-assets.mjs <dir of the seven .glb files>) into one file, `public/models/caf/caf-kit.glb` (52.8 KB, recoloured to the Caf palette on 8 Nov: honey wood, walnut, cream, plum, gold, warm steel, teal; the parasol canopy is plum with a gold edge by vertex position). Placed in the Caf scene (`src/world/caf.js`). Downloaded 8 Nov 2026 from `https://polyfork.dev/cdn/<id>.glb`, one at a time 1.5 s apart, with the User-Agent `MzansiVille-asset-check/1.0`.

Changes to every asset below (CC BY 4.0 asks us to say so): the rig removed (skins, animation, joint weights, rig metadata; doors, trays, wheels and folds stay in their closed rest pose), every node transform baked, one mesh per prop, vertex colours re-mapped to the Soft Life palette (ink, paper, line, yellow, green, clay, blue, muted), then welded, quantised and Draco-compressed. Sizes and triangle counts are unchanged from the catalogue.

| Kit node | Asset | Credit line | Size before to after |
| --- | --- | --- | --- |
| `cafe-counter` | Cafe Counter | Cafe Counter by Polyfork (https://polyfork.dev/asset/cafe-counter-d8b226), CC BY 4.0 | 61.5 KB to 5.0 KB |
| `servery-counter` | Servery Counter | Servery Counter by Polyfork (https://polyfork.dev/asset/servery-counter-3afbb9), CC BY 4.0 | 124.2 KB to 5.2 KB |
| `cafe-table-set` | Cafe Table Set | Cafe Table Set by Polyfork (https://polyfork.dev/asset/cafe-table-set-1868d1), CC BY 4.0 | 62.3 KB to 5.3 KB |
| `folding-dining-table` | Folding Dining Table | Folding Dining Table by Polyfork (https://polyfork.dev/asset/folding-dining-table-7b68ce), CC BY 4.0 | 93.9 KB to 5.9 KB |
| `bar-stool` | Bar Stool | Bar Stool by Polyfork (https://polyfork.dev/asset/bar-stool-878f03), CC BY 4.0 | 53.9 KB to 4.8 KB |
| `campus-coffee-kiosk` | Campus Coffee Kiosk | Campus Coffee Kiosk by Polyfork (https://polyfork.dev/asset/campus-coffee-kiosk-ec2395), CC BY 4.0 | 77.9 KB to 6.2 KB |
| `cafe-parasol` | Cafe Parasol | Cafe Parasol by Polyfork (https://polyfork.dev/asset/cafe-parasol-61a313), CC BY 4.0 | 103.2 KB to 23.7 KB |

Sum of the seven: 576.9 KB to 56.1 KB alone, 52.6 KB as one kit file. With the shared Draco decoder (245 KB, already shipped for the day-1 home scene) the cafeteria kit is 297.6 KB of the 2 MB budget.

The in-game Credits screen lists the same seven credit lines (`src/ui/render.js`, `credits()`). When a prop is added or removed, change this table and that list together.

Survey of the catalogue for the campus (no downloads): `docs/polyfork-survey.md`.

## Library (not art)

`public/draco/` (draco_decoder.wasm, draco_wasm_wrapper.js, 245 KB): the Draco mesh decoder from Google, shipped with three.js (`three/examples/jsm/libs/draco/gltf/`). Apache License 2.0.

## Size the home scene adds

| | |
| --- | --- |
| Models (4 kit files) | 875 KB |
| Draco decoder | 245 KB |
| Home scene code (`home` chunk, minified) | see the sprint report |
| Total | under 2 MB, fetched only on day 1 |

## The website (`site/`)

| File | What | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| `site/public/fonts/graduate-latin.woff2` (6 KB) | Graduate (headings), latin subset | Eduardo Tunni | https://fonts.google.com/specimen/Graduate | SIL Open Font License 1.1 |
| `site/public/fonts/figtree-latin.woff2` (20 KB) | Figtree variable 400-700 (body), latin subset | Erik Kennedy | https://fonts.google.com/specimen/Figtree | SIL Open Font License 1.1 |
| (build time only, not shipped) | `qrcode` npm package: draws the QR code to the game into the page | Ryan Day and contributors | https://www.npmjs.com/package/qrcode | MIT |
| (local only, not shipped) | `sharp` npm package: makes the WebP images (`npm run images`) | Lovell Fuller and contributors | https://www.npmjs.com/package/sharp | Apache License 2.0 |

The fonts are served from the site itself, not from Google, so no third party sees a visitor. The poster (`site/public/img/poster*.webp`) is made from the game's own cover (`public/cover.jpg`), and `share.jpg` is copied from the game at build time.
