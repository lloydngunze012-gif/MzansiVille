# Polyfork catalogue survey (8 Nov 2026)

Nothing was downloaded. Source: Polyfork's documented catalogue API (`GET /api/assets?free=1&q=...`, 42 searches, 8 results each; plus the detail and a file-size header for three assets). Polyfork's fair-use note asks for fetching only what is needed, a User-Agent that names the product, and a back-off on HTTP 429. This survey sent more requests than that guidance suggests (about 420 in a burst, most of them returned nothing usable) and used curl's default User-Agent: do any follow-up by hand or with a small, named, rate-limited script.

## What the API gives, and what it doesn't

| You asked for | Where it comes from | Status |
| --- | --- | --- |
| Licence | `license` and `credit` on each asset's detail | Free meshes: CC BY 4.0 (credit line in `credit`) or the Polyfork licence (no credit, no redistribution). Checked on 2 assets; Polyfork's licensing page states it for all free meshes. |
| Poly count | `triangles` on every search row | Done for every asset below. |
| Part count | Detail: `draw_calls`, `materials`, `rigged_parts`, `detachable_parts` | Only 2 assets fetched: Cafe Parasol = 2 draw calls, 1 material, no rig; Yellow Cab = 5 draw calls, 1 material, 6 rigged parts (4 wheels, 2 steering). Not known for the rest. |
| File size | `Content-Length` of `/cdn/{id}.glb` | Measured for the 16-asset shortlist below (13-251 KB each). Not measured for the rest. |

Budget impact: see "Shortlist measured". Draco or meshopt, welding and merging into kit files (as `scripts/home-assets.mjs` does) should cut sizes further, but that is untested on Polyfork files.

Dimensions (`size_m`) are real metres, origin on the ground, which matches the game's scale.

## Shortlist measured (8 Nov)

16 assets, one detail request and one header-only size request each (no GLB bodies downloaded), 1.5 s apart, with a named User-Agent. No 429 or 403. All 16: CC BY 4.0, free. "Parts" = draw calls (meshes), plus rigged and detachable parts from the API. Size = the raw `.glb` as served (uncompressed, before Draco or merging).

| Asset | Tris | Draw calls | Materials | Rigged / detachable | GLB size |
| --- | --- | --- | --- | --- | --- |
| Cafe Counter | 534 | 2 | 1 | 0 / 1 | 61.5 KB |
| Cafe Table Set | 540 | 2 | 1 | 0 / 1 | 62.3 KB |
| Servery Counter | 528 | 6 | 1 | 2 / 3 | 124.2 KB |
| Coffee Kiosk | 886 | 3 | 1 | 2 / 0 | 101.8 KB |
| Turf Pitch Tile | 100 | 1 | 1 | 0 / 0 | 12.7 KB |
| Bleacher Stand Run | 341 | 1 | 1 | 0 / 0 | 39.5 KB |
| Match Goal | 662 | 2 | 1 | 0 / 0 | 105.9 KB |
| Computer Bench Run (Lit Monitors) | 502 | 3 | 2 | 0 / 1 | 59.2 KB |
| Office Desk | 280 | 2 | 1 | 3 / 0 | 33.5 KB |
| Lab Bench | 594 | 4 | 1 | 3 / 0 | 101.8 KB |
| Research Microscope | 650 | 4 | 1 | 2 / 1 | 75.3 KB |
| Welcome Week Tent Stall | 774 | 7 | 1 | 0 / 3 | 114.3 KB |
| Taxi Rank Sign | 418 | 1 | 1 | 0 / 0 | 48.3 KB |
| Team Minibus | 2,404 | 6 | 2 | 6 / 0 | 251.1 KB |
| Corrugated awning | 688 | 2 | 1 | 0 / 1 | 78.2 KB |
| Washing line | 776 | 9 | 1 | 6 / 2 | 125.3 KB |
| **All 16, one of each** | | | | | **1,395 KB (1.36 MB)** |

Findings:
- The earlier guess of a fixed 105-110 KB overhead was wrong: sizes run from 13 KB to 251 KB and follow poly count and part count (more rigged and detachable parts, more bytes). A flat tile is 13 KB; a 6-mesh rigged minibus is 251 KB.
- One of each of the 16 is 1.36 MB raw, under the 2 MB budget before Draco, welding or merging into kit files. Only one of each, though: a LAN room needs one bench model reused many times (instancing costs nothing), so reuse, not copies, keeps it small.
- Cheapest per use: Turf Pitch Tile, Office Desk, Bleacher Stand Run, Computer Bench Run, Cafe Counter and Table Set (all under 65 KB).
- Heaviest, worth stripping rig data or skipping: Team Minibus (251 KB, 6 rigged parts), Washing line (125 KB, 9 meshes), Servery Counter (124 KB). The rigged parts (wheels, doors, hinges) are of no use to us; check that the `.glb` can be re-exported with the rig removed, or Draco and merge will mostly remove the cost anyway.
- Every shortlisted asset is single-material or two-material: fits our palette recolouring (as the Quaternius township buildings are recoloured).
- Credit lines are in each asset's `credit` field; none is in the game yet, so `docs/credits.md` is unchanged.

## Where the catalogue fits the campus

Search counts for generic words are fuzzy (e.g. "washing line" returned 404 matches), so they are not worth quoting. What matters is the kits. These Polyfork kits are directly useful: `university`, `school`, `research-lab`, `stadium`, `office`, `open-plan`, `modern-restaurant-cafe`.

### Cafe / restaurant (kit `modern-restaurant-cafe`, `university`)
- Cafe Counter 534 tris, 2 x 1.4 x 1 m (`cafe-counter-d8b226`, kit university)
- Cafe Table Set 540 tris (`cafe-table-set-1868d1`, university)
- Servery Counter 528 tris, 2 m (`servery-counter-3afbb9`, school): fits the cafeteria
- Folding Dining Table 728 tris, 2.4 m (`folding-dining-table-7b68ce`, school)
- Counter Stool 802 / Bar Stool 470-498 tris (`counter-stool-73553a`, `bar-stool-878f03`, `bar-stool-0de3c8`)
- Cafe Storefront Unit 400 tris, 8 m wide (`cafe-storefront-unit-443728`); Corner Restaurant Unit 562 tris (`corner-restaurant-unit-d85304`)
- Cafe Parasol 660 tris (`cafe-parasol-61a313`), Wall Sconce 310, Encaustic Floor Tile 470, Restaurant Highchair 600
- Coffee Kiosk 886 tris, 4 m (`coffee-kiosk-406d3e`); Campus Coffee Kiosk 638 tris (`campus-coffee-kiosk-ec2395`, university)
- Also: Cafe Customer 3,539 tris (a character; the game has its own people, so skip)

### Stadium / sports (kit `stadium`, `school`, `university`)
- Match Goal 662 tris, 7.56 m (`match-goal-a98b60`); Training Goal 712 (`training-goal-50f1ca`); Football Goal 630 (`football-goal-78fee1`, school)
- Turf Pitch Tile 100 tris, 4 x 4 m (`turf-pitch-tile-aca1ef`): cheapest way to lay a pitch
- Bleacher Stand Run 341 tris, 4 m (`bleacher-stand-run-1627c2`, university)
- Match Scoreboard 592 (`match-scoreboard-58f51e`); Stadium Clock Post 650; Substitutes' Bench 580 (`substitutes-bench-ea0ef7`); Players' Tunnel 1,176; Clubhouse 1,508; Perimeter Wall Run 586; Groundskeeper's Store Shed 1,539
- Basketball: Yard Basketball Post 558 (`yard-basketball-post-b71ee3`, school), Backboard 724; Gym Floor Mat 444
- Stadium Terrain 25,328 tris, 92 x 101 m: far too heavy for phones; skip
- No rugby posts or cricket gear turned up in these searches.

### Office / computer desks for a LAN (kit `university`, `office`, `open-plan`)
- Computer Bench Run (Lit Monitors) 502 tris, 2 x 1.34 x 1.5 m (`computer-bench-run-lit-87d9cf`, university): the best match, a row of lit monitors on one bench
- Office Desk 280 tris (`office-desk-021eb3`, open-plan); Sit-Stand Desk 464; Faculty Office Desk 414 (`faculty-office-desk-a6575a`); Teacher's Desk 532
- Desk Monitor 304 (`desk-monitor-32cfce`); Laptop 626; Desk Keyboard 818; Small Server Rack 708 (`small-server-rack-8ae0a4`)
- Office Chair 636, Task Chair 698, Meeting Chair 464 (`meeting-chair-731ce0`)

### Lab benches and equipment (kit `research-lab`, `school`)
- Lab Bench 594 tris, 2 m (`lab-bench-740e7b`, school); Lab Stool 492-642; Write-up Desk 554
- Microscope 732 (`microscope-e7b9d5`), Research Microscope 650 (`research-microscope-77ce04`), Spectrophotometer 598, Glassware Set on Rack 692, Lab Notebook 302, Lab Coat Rack 575, PPE Dispenser 606, Fire Point Station 783
- Lab Wall 202 and Lab Floor Tile 118 tris for building a room
- No beaker alone, fume hood or centrifuge turned up. Characters (Graduate Student, Senior Scientist, Bench Researcher, about 3,800-3,900 tris) are heavy; skip.

### Taxi rank and transport
- Taxi Rank Sign 418 tris, 0.84 x 3 x 0.64 m (`taxi-rank-sign-f5f39d`, kit airport)
- Team Minibus 2,404 tris, 2.38 x 2.4 x 5.5 m (`team-minibus-f14295`): the closest to a minibus taxi (`minibus` returned only this). 5.5 m long, white-ish team van, not a Quantum or Hiace, so it would need recolouring and a roof sign
- Bus Shelter 308 tris, 4 x 2.6 x 1.9 m (`bus-shelter-f786b4`); we already have our own shelter
- City Taxi 1,970 and Yellow Cab 1,926 tris (US-style cabs, wrong look; recolourable, rigged wheels)
- Car Park Tile 512 (university), Boxy Delivery Van 1,116, Kei Van 2,070

### Stalls
- Welcome Week Tent Stall 774 tris, 3 m (`welcome-week-tent-stall-c27020`, university): good for the SRC tables on the Quad
- Market Stall 592 tris (`market-stall-94937d`); Mercado Stall 800; Fruit Stand 968 (`fruit-stand-4cc7d7`); Hot Dog Cart 764 (`hot-dog-cart-115192`)
- Refreshment Kiosk 1,086 (stadium); Container Snack Kiosk 1,918 (skatepark)
- `braai` returned 0 results.

### Township props (the weak spot)
- Nothing township-specific. `spaza` returned 0, `shack` returned 5 (Mine Shack, Miner's Shack, Fisherman Shack, Mountain Refuge Hut, Souvenir Stand: wild-west, pirate and alpine looks, 1,465-2,100 tris each).
- Possibly usable, from kit `salvage-commons`: Corrugated Awning 688 tris, 4 m (`corrugated-awning-e758eb`) and Washing Line 776 tris, 4 m (`washing-line-06b44e`). Also Clothes Line 616 (cozy-farm).
- Verdict: keep the Quaternius township buildings; use Polyfork only for the awning and washing line, and look at the `salvage-commons` kit by hand for more.

## Suggested next step
1. Choose which of the 16 above we want, and where (cafeteria, pitch, LAN room, lab, taxi rank, Quad stalls, township).
2. Download only those GLBs, one at a time, with the named User-Agent; run them through the Draco/merge pipeline (`scripts/home-assets.mjs` style); measure the result against the 2 MB budget.
3. Each asset that ships gets its `credit` line in `docs/credits.md` and on the in-game Credits screen.
4. Township props stay the gap: look at the `salvage-commons` kit by hand on polyfork.dev.
