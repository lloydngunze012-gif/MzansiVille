# City job A: SunnyBay, the map (10 Nov)

Map, lots, travel rules and structure: `docs/world-designer/sunnybay.md`. Screenshots (390 x 844, on the PC, not committed) are in this folder; the names are below.

## What was built

1. **The world and its edges.** The campus sits in the middle of SunnyBay. East: beach and sea. North: hills. West and south: the highway ring, low rises past it. No void from anywhere: from campus you see the same city past the ring road; the Caf sits on lawn under a sky (the plum void is gone). Walking out of the Main Gate leads into the city behind a short curtain, no menu. "Welcome to SunnyBay" stands on an island in the gate road, facing you as you come out.
2. **Six districts.** Campus, Town centre, Suburbs, Beachfront, Township, Industrial: each its own ground and pavement colour, building style, props, green district signs at the borders, and a visible border (Main Road, Hill Road, Marine Drive and the sand, the Bay River with Unity Bridge and Market Bridge). Eight street people per district, skins from `skinmix.js`. The family homes' streets are signed in the Suburbs and the Township; the home scene is not merged.
3. **Eighteen place lots**, each with a lot, a sign and a door that shows "Opening soon" (a card when you arrive or tap it), and **twelve fenced wave 2 plots** with a "Coming soon" board.
4. **The map screen**, titled SunnyBay: district outlines and names, 18 pins and the campus, taxi stops, wave 2 dots, where you are, players per district. A pin shows walking, the taxi and the car with price and time. The campus map is the close-up (it has a "SunnyBay" button; the menu has "SunnyBay map").
5. **Travel.** Walking free, always. Minibus taxi from six stops: R15 next district, R25 across, 25 game minutes, about 2 s on screen; R5 in your pocket gets a friendly line and "Walk there". The car: a save with a licence and a car drives instantly for R8; the car is parked outside the place you drove to and outside your house on campus.
6. **Players in the city.** One Realtime room per district, cap 40 each (`campus`, `campus.town`, ...). Tested with three phones against real Supabase.
7. **Billboards.** Twelve boards from `data/campusville/billboards.json`: Woza, Lifecup, Greenway; house ads on the rest.

## Structure chosen, and why

Two scenes joined at the Main Gate by the curtain; inside the city one continuous world, no curtain between districts.

- The campus scene (2,900 lines, everything hangs off it) is left as it was two days before testers. Rebuilding it as one streamed world was the risk that could miss tomorrow.
- The city is one scene with everything merged: a district is 35 to 53 draw calls, so there was no need to cut it into districts with curtains.

## Performance

Real GPU (this PC), 390 x 844. Draw calls and triangles standing in each district (the person counts are 8 street people and you):

| District | Sims (default): calls / triangles | Eye | Top |
|---|---|---|---|
| Campus (outside the gate) | 38 / 56,677 | 14 / 51,463 | 36 / 56,621 |
| Town centre | 35 / 34,785 | 10 / 27,253 | 33 / 34,729 |
| Suburbs | 39 / 94,507 | 16 / 87,017 | 45 / 104,133 |
| Beachfront | 53 / 40,600 | 27 / 33,054 | 104 / 55,892 |
| Township | 36 / 72,284 | 20 / 54,778 | 46 / 78,258 |
| Industrial | 38 / 47,640 | 11 / 37,776 | 65 / 58,526 |

The whole city is 273,364 triangles; what is off screen is not drawn.

Frame rate at 4x CPU throttle, walking, median of three 3 s samples: Campus 56.7, Town centre 56.7, Suburbs 57.0, Beachfront 57.1, Township 57.0, Industrial 56.9 fps (the screen's own rate). The fps telemetry is labelled by district (`city` + the district's id; #/smooth shows "SunnyBay: Town centre").

Honest limit: this is a desktop GPU with a slowed CPU, as in the Caf job. It says the city is light on the CPU (few draw calls); it does not prove a cheap Android's GPU. The owner's phone and the smoothness reports from testers are the real check.

## Content rule: hits

Searched src/, data/ and the site for alcohol, beer, wine, tavern, shebeen, club, bar, drunk, bet, casino, lotto (and hangover, pub, liquor, gamble, cocktail, and other places of worship).

Replaced:
- `src/world/surroundings.js`: the shop sign "TAVERN · ICE COLD" past the ring road. Gone with the old edge of town.
- `src/world/surroundings.js`: the taxi rank sign "TAXI RANK · TOWN · PINETOWN · DURBAN" (real places). Now "TAXI · TOWN · BEACHFRONT · SUBURBS".
- `hangover` (a save key and `hangoverEnergy` in meta.json, set by a party activity). Now `partyTired` / `partyTiredEnergy`. Players only ever saw "Thursday's party is still in your head".
- `data/campusville/activities.csv`: "leftovers are a gamble". Now "leftovers are a surprise".

Left alone (harmless): 228 "bar"/"bars" (progress bars, the top bar, CSS classes); "I joined three clubs by accident", "Book club Thursday", the website's "Clubs: start a club for anything" (student societies); "Pinky promise"; the taxi sticker "MAMA'S PRAYER"; "a stolen goat" (a law lecturer's case), "roommate steals your last packet", "Spam or a scam" (a report reason); "Cold drink", "Energy drink" (Greenway); res parties (dancing, no drink is named). Older notes in CLAUDE.md and docs/ that mention a campus tavern are history and were not rewritten.

`npm run check` now fails if one of the words comes back.

## What was cut or not done

- **Chat and player cards in the city.** Other players are visible with their name tags; tapping them does nothing yet and the Talk button is campus-only.
- **The game's menu, bottom bar and prompts are hidden in the city** (as in the Caf): the top bar stays. Card and leaderboard prompts wait until you are back on campus.
- **Street people only walk** up and down their pavement; you cannot talk to them.
- **The taxi ride** is a card with a minibus, not a 3D ride.
- **Your car is not solid** on campus or in the city (you can walk through it), and other players do not see it.
- **The 2D campus map** (the map view mode) has no city pin; its menu's "SunnyBay map" takes you out of the gate.
- **No new art.** Lot buildings are hand-built blocks with signs; brand billboards are drawn from the brand's name, line and colours until an image is set in billboards.json.

## Conflicts with the repo, and what I assumed

- The gatehouse building blocks the middle of the gate road on campus (as before); the route out walks round it. Not changed.
- The campus fence was not solid before (you could walk through it). It is now, with the gate as the only gap.
- "Bus to town" at the bus stop still takes you to Greenway Grocer on campus (as it did). The taxi stop outside the gate is the way into the city by vehicle.
- The old taxi rank stood where Varsity Road now leaves the gate; it moved beside the road and is the "Campus gate" stop.
- data/ is Cursor's, but this job needed two new data files (sunnybay.json, billboards.json) and two small data edits for the content rule (meta.json key, one activities.csv line).

## Tests

- `npm run check`: 67 sim checks (5 new: the plan, fares and the car, billboards, the content rule, street people's skins).
- `tests/e2e/city.spec.js` Y1 to Y8, 9 tests, all pass on the real GPU.
- `tests/e2e/city-quick.spec.js`: in the quick project, 18 s.
- `tests/presence/city.spec.js`: three phones, real Supabase, passes.

## Screenshots (390 px)

- The map: `y2-map.png`, `y2-map-mall-pin.png`, `y4-map-from-campus.png`, `presence-map-counts.png`
- Each district (Sims, Eye, Top): `y6-<district>-sims.png`, `-eye.png`, `-top.png`
- A border crossing: `y1-border-campus-to-town.png`, `y6-bridge-to-township.png`
- The welcome sign: `y1-out-of-the-gate-welcome.png`, `y6-welcome-sign.png`
- A billboard: `y6-billboard.png`
- An "Opening soon" door: `y6-door-opening-soon.png`, `y2-mall-door-opening-soon.png`; a wave 2 plot: `y6-wave2-plot.png`
- The car parked at res: `y4-car-parked-at-res.png`; at the Beach: `y4-car-parked-at-the-beach.png`
- Edges: `y6-beach-and-sea.png`, `y6-hills-from-suburbs.png`, `y6-whole-city.png`; from campus: `campus-looking-out-of-the-gate.png`, `campus-looking-north.png`; the Caf: `caf-top.png`
- Taxi: `y3-taxi-stop-card.png`, `y3-refused-friendly.png`

## For the owner's phone

1. On campus, walk to the Main Gate and tap the road past it. You should be outside facing "Welcome to SunnyBay" within a few seconds.
2. Walk down Varsity Road into Town centre. Does it stay smooth? Open the menu's frame rate on campus first, then compare by feel in each district.
3. Tap "SunnyBay map", tap the Mall, take the taxi. R15 should leave the top bar and you should be at the Mall's door with "Opening soon".
4. Walk to the Beachfront (or taxi): the arch, the sand, the sea. Look back: no empty space anywhere.
5. Cross Unity Bridge into the Township and Market Bridge into Industrial.
6. Walk back in through the gate.
7. With a second phone: both go to the same district. Do you see each other?
