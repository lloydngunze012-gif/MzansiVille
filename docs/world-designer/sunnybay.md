# SunnyBay: the map

City job A (owner, 10 Nov), with the places of job B (same day). The University of Mzansi sits in the middle of SunnyBay, a fictional coastal city. This file is the map: the districts, where every lot is, the travel rules, the structure, and how the places work (Places). The designer reads it before changing a place. The Things to do lists are in `docs/world-designer/city.md`.

Everything here comes from ONE data file, `data/campusville/sunnybay.json`. Move a lot, rename a road or change a fare there and the 3D city, the map screen and the tests follow.

## The city in one picture

North is up. One square is about 60 m. The campus fence has one gap: the Main Gate, on the south side.

```
                     h i l l s   (north)
 highway  +-----------+---------------------------+-----------+
    |     |           |          SUBURBS          |           |
    |     |  TOWN-    |  Hiking trail*   Church   |  Skate    |
    |     |  SHIP     |  Gym      Swimming pool*  |  park*    |  s
    |     |           |  Cars     Greenway SB     |           |  e
    |     |  Family   |  (family homes: Jacaranda |  Park     |  a
    |     |  homes    |   Close)                  |           |
    |  r  |  (High    +------- Hill Road ---------+  BEACH-   |  a
    |  i  |  Mast St) |        C A M P U S        |  FRONT    |  n
    |  v  |           |      ( ring road )   Radio*  Beach    |  d
    |  e  |  Laundro* === Unity Bridge / Unity Road ===== arch|
    |  r  |  Hall*    |      ( fence, gate S )    |           |  b
    |     |  Night    |   WELCOME TO SUNNYBAY     |  Arcade   |  e
    |     |  market*  +------- Main Road ---------+           |  a
    |     +-----------+        TOWN CENTRE        |  Aqua-    |  c
    |     |  Studio*  |  Library Clinic Bank  Lifecup  Mall   |  rium*   |  h
    |     |  Driving  === Market Bridge / Market Street ======|
    |     |  school   |  Gallery*  Barber   Tech*  |           |
    |     |  Taxi rank|            Lounge   Boutique*          |
    |     |  Petrol   |        (Varsity Road runs  |           |
    |     |  Stadium  |         south from the gate)           |
    |     |  INDUSTRIAL                            |           |
          +-----------+----------------------------+-----------+
                        h i g h w a y   (south)
   * = wave 2: a fenced, empty plot with a "Coming soon" board
```

Metres, x east, z south, the campus at (0, 0): the same frame as the campus scene, so a spot on campus and a spot in the city never disagree.

## The edges (no void)

- **East:** the beach (sand from x = 250), the surf at x = 296, then sea to the horizon.
- **North:** two rows of hills behind the Suburbs.
- **West and south:** the highway ring with a barrier, low rises and veld past it.
- **Middle:** the campus, seen from the city as its fence, lawn, paths and its buildings as plain blocks in their own colours (houses in house colours).
- From campus you see the same city past the ring road (houses as plain blocks, no cars or signs), not the old ring of random buildings.
- The Caf sits on the campus lawn under a sky; the plum void is gone.

## Districts

Players see "district". In code a district is a data pack (`src/districts`), so the parts of the city are **parts** (`PARTS`, `partAt(x, z)` in `src/city/plan.js`).

| District | id | Where (x0, z0 to x1, z1) | Ground | Building style | Border you cross |
|---|---|---|---|---|---|
| Campus | `campus` | -160, -125 to 150, 125 | lawn green | the campus behind its fence; lawns and trees in the corners | the fence and the ring road |
| Town centre | `town` | -160, 125 to 150, 330 | paving grey | blocks of flats, shops, two towers (Kenney City Kit) | Main Road, a "Town centre" sign |
| Suburbs | `suburbs` | -160, -300 to 150, -125 | deep green | houses with gardens, big trees (Kenney City Kit Suburban) | Hill Road, a "Suburbs" sign |
| Beachfront | `beachfront` | 150, -300 to 300, 330 | sand | pastel blocks, palms, the promenade, parasols | Marine Drive, the ground turns to sand |
| Township | `township` | -340, -300 to -160, 100 | red earth | small bright houses close together, tin-roof rooms, a water tower, a high mast light, a spaza | the Bay River: Unity Bridge |
| Industrial | `industrial` | -340, 100 to -160, 330 | concrete | warehouses with saw-tooth roofs, containers, chimneys, trucks | the Bay River: Market Bridge; Factory Road from the Township |

Every district has its own ground colour and pavement colour, green district signs where a road crosses a border, street lamps, and eight people walking its pavements (skins from `src/world/skinmix.js`, the Cast Rule).

**Family homes.** Day 1's home scene stays its own scene. Its streets are marked in the city by a street sign: "Jacaranda Close · Family homes" in the Suburbs (118, -196) and "High Mast Street · Family homes" in the Township (-300, -222). `homes` in the data file.

## Roads

Varsity Road (from the gate south through Town centre), Main Road (campus/town border), Market Street (through Town centre, over Market Bridge, through Industrial), Hill Road (campus/suburbs border), Oak Avenue and Crescent Road (Suburbs), Marine Drive (the Beachfront's border), Unity Road (west over Unity Bridge into the Township; east to the beach), River Road (the east bank), Bokamoso Street and Thuto Street (Township), Factory Road (Industrial), Pier Road (to the promenade). The ring road round the campus joins them. All are 8 m wide with pavements, a centre line, kerb lines and zebra crossings where two roads meet.

## The 18 place lots (wave 1)

Each has a lot, a sign and a door (or a gate, for the open ones). `door` is where a player stands when they have arrived; the place opens from there (see Places, below).

| Place | id | District | Centre (x, z) | Door (x, z) | What stands there |
|---|---|---|---|---|---|
| Mall | `mall` | Town centre | 96, 178 | 96, 198.4 | a wide two-storey block, canopy, parking with cars |
| Bank | `bank` | Town centre | -32, 192 | -32, 202.4 | columns and a pediment |
| Clinic | `clinic` | Town centre | -72, 192 | -72, 202.4 | a white block, teal roof |
| SunnyBay Public Library | `city_library` | Town centre | -118, 190 | -118, 202.4 | columns, sandstone |
| Barber and salon | `barber` | Town centre | -22, 246 | -11.6, 246 | a yellow shop on Varsity Road |
| Lifecup cafe | `lifecup` | Town centre | 26, 196 | 26, 203.4 | a small shop, orange roof |
| Lounge | `lounge` | Town centre | -24, 286 | -11.6, 286 | a plum shop, gold roof |
| Gym | `gym` | Suburbs | -62, -240 | -62, -228.6 | a dark block, orange roof |
| Church | `church` | Suburbs | 72, -244 | 72, -228.6 | a nave with a pitched roof, a steeple and a cross |
| Car dealership | `dealership` | Suburbs | -72, -160 | -72, -149.6 | a glass-front showroom, a forecourt of cars, bunting |
| Greenway SunnyBay | `greenway_city` | Suburbs | 62, -160 | 62, -146.6 | the big supermarket: green fascia, canopy, trolleys, parking |
| Beach | `beach` | Beachfront | 262, 0 | 252, 0 | the arch onto the sand, a lifeguard tower, parasols |
| Park | `park` | Beachfront | 198, -82 | 198, -40 | a lawn, paths, a pond, trees, benches, a gate |
| Arcade and bowling | `arcade` | Beachfront | 198, 90 | 198, 104.4 | a pink block with giant pins and a ball on the roof |
| Taxi rank | `taxi_rank` | Industrial | -215, 182 | -204, 204 | a paved yard, two long shelters, minibuses |
| Petrol station (with car wash) | `petrol` | Industrial | -214, 252 | -214, 223 | a canopy over four pumps, the shop, the wash bay |
| Stadium | `stadium` | Industrial | -302, 272 | -268, 272 | an oval of stands round a pitch, floodlights |
| Driving school | `driving_school` | Industrial | -300, 160 | -268, 160 | a fenced yard with cones, an office, the learner's car |

Names that would clash are already decided: the campus Library, Greenway Grocer and Sports Centre stay; the city has the **SunnyBay Public Library**, **Greenway SunnyBay** and the **Gym**. `npm run check` fails if a city lot takes a campus place's name.

## The 12 wave 2 plots

A fenced, empty plot (22 x 16 m) with a board: "COMING SOON" and the place's name. How one opens: Places, below. On the map they are small grey dots.

| Place | id | District | Centre (x, z) |
|---|---|---|---|
| Recording studio | `studio` | Industrial | -216, 132 |
| Campus radio station | `radio` | Campus | 128, -104 |
| Aquarium | `aquarium` | Beachfront | 198, 186 |
| Night market | `night_market` | Township | -220, 52 |
| Swimming pool | `pool` | Suburbs | 118, -256 |
| Skate park | `skate` | Beachfront | 198, -200 |
| Phone and tech shop | `tech` | Town centre | 40, 246 |
| Fashion boutique | `boutique` | Town centre | 40, 286 |
| Hiking trail | `trail` | Suburbs | -122, -280 |
| Art gallery | `gallery` | Town centre | -76, 246 |
| Community hall | `hall` | Township | -302, -60 |
| Laundromat | `laundromat` | Township | -220, -60 |

The Township has no wave 1 place (city.md puts none there); it has its taxi stop, the family homes' street and three wave 2 plots.

## Travel rules

- **Walking** always works and is free. No one is ever stranded: a taxi you cannot pay for offers "Walk there".
- **Minibus taxi.** Six stops: Campus gate (just outside the Main Gate), Town centre, Suburbs, Beachfront, Township, and the Taxi rank (Industrial's stop). R15 to the next district, R25 across the city, 25 game minutes (the clock never runs past the end of the current slot). The ride is a moment of about 2 s, not a cutscene. From a stop's card you ride to another stop; from the map you ride to a place's door. Not enough money: a friendly line, no money taken, and "Walk there".
  - Next to each other (R15): Campus with Town centre, Suburbs, Beachfront, Township; Town centre with Beachfront and Industrial; Suburbs with Beachfront and Township; Township with Industrial. Anything else is R25.
- **Car.** Works when the save has both `run.licence === true` and `run.car` (any object, e.g. `{ id: 'first' }`). Trips are instant and cost R8 petrol. `run.carAt` says where it is parked: `'res'` (outside your house on campus, the default) or a lot's id (outside that place). You drive from where the car is: on campus when it is at res, in the city within 60 m of it; otherwise the map says where it is parked. Driving to the campus pin parks it at res.
  - **The licence and the car come from the places** (job B): the driving school's test sets `run.licence`, the dealership sets `run.car` and parks it outside (`run.carAt = 'dealership'`).
- **Getting in and out.** Walk out of the Main Gate (a tap on the road at or past the gate): a short curtain, then you stand outside the gate facing the "Welcome to SunnyBay" sign, which stands beside the road on the east kerb of the forecourt (x 15.5, z 121; job I, 12 Nov: it stood in the middle of Varsity Road and the cars drove through it). No prop stands on a lane: street lamps skip any spot on a road, the "Campus" border pole is beside River Road. The Main Gate's sheet on campus says "SunnyBay is 5 min by taxi" with Take a taxi (out of the gate to the Campus gate stop, whose card asks where to) and Walk; two yellow signposts on campus (by the Quad and just inside the gate) point to it. Walk in through the gate to go back. A save left in the city (`run.cityAt = { x, z }`) loads straight back there.
- **The map** (`src/world/map.js`, `createCityMap`; job I, 12 Nov: the whole map): titled "UMzansi & SunnyBay"; district outlines and names, a pin per place and one for the campus, yellow squares for taxi stops and the taxis' round as a dashed yellow line, grey dots for wave 2, "You are here", how many players are in each district. Zoom (+, −, "UMzansi", "Me", the mouse wheel) and drag to move about; from 1.9x every place and every stop is named, and every campus building has its own pin (`.cm-cpin`): on campus a tap walks you there, in SunnyBay it offers the ways back to campus and walks you on through the gate. A tap on a place shows the ways there with the price and the time, and in SunnyBay "Request a ride". On campus the minimap opens the campus close-up, which has a "Whole map" button; the menu has "Map".
- **Taxi times** (job I): a taxi calls at every stop every `travel.taxi.every` (5) game minutes, each stop two minutes after the one before (`plan.js nextTaxi`). Each stop's shelter has a board "NEXT TAXI 07:42", and its card says "Wait for the next taxi (N min)"; a ride from a stop adds those minutes to the clock. **Request a ride** (the menu and the map): a taxi comes to where you stand after `requestWait` (3) game minutes for `requestExtra` (R10) more than the fare.

Fares and lines are in `sunnybay.json` under `travel`; "Opening soon" words under `soon`.

## Structure (and why)

**Two scenes joined at the Main Gate by a short curtain; inside the city, one continuous world with no curtain between districts.**

- The campus scene is left as it is (2,900 lines that every other system hangs off, two days before testers). It gained a solid fence, the walk out of the gate, the city seen past its ring road, and your car at res.
- The city is its own scene (`src/world/city.js`), like the Caf: its own renderer, the shared player, camera and input. All five outer districts and the outside of the campus are one world you cross on foot without loading anything.
- It holds the frame rate because the still parts are built once and merged (`src/world/citybuild.js`): every model is baked to vertex colours and merged with the hand-built boxes into one mesh per 128 m cell (one draw call each), the ground is four layered meshes, and every sign and billboard shares one texture. A district draws 35 to 53 calls in the normal view.

## Rooms (players in the city)

One Supabase Realtime room per district, each with the launch job's cap of 40 (`src/presence.js`): the campus keeps `campus` (then `campus-2`...), and the districts are `campus.town`, `campus.suburbs`, `campus.beachfront`, `campus.township`, `campus.industrial` (then `-2`, `-3`). You see the players in the district you are in. Outside the campus fence but inside the Campus district you share the campus room, so players on the ring road and players on campus see each other where they really are. The room changes once you have been in a district for 1.5 s (no flapping on a border). The map's counts come from listening in on each room's presence for a moment (nothing is broadcast), kept for 20 s.

## Billboards

Twelve boards along the main roads, driven by `data/campusville/billboards.json` (brand, line, image, link, start and end date, how many boards). Woza, Lifecup and Greenway at launch; a board with no ad running shows a University of Mzansi house ad in that house's colours. A tap on a board shows its card (and "Visit" if it has a link).

## Where the code is

| What | File |
|---|---|
| The plan, travel rules, fares | `src/city/plan.js` (data: `data/campusville/sunnybay.json`) |
| What each billboard shows | `src/city/billboards.js` (data: `data/campusville/billboards.json`) |
| The still parts of the city | `src/world/citybuild.js` |
| The city scene (walking, doors, taxi, car, street people, other players, its UI) | `src/world/city.js` |
| The SunnyBay map view | `src/world/map.js` (`createCityMap`) |
| In and out, the clock, the save | `src/main.js` (`enterCity`, `exitCity`, `cityPaid`, `citySaved`) |
| The gate, the fence, the car at res | `src/world/scene.js` (`cityCheck`, `walkOut`, `arriveFromCity`, `syncCar`) |
| The city seen from campus | `src/world/surroundings.js` |
| Tests | `tests/e2e/city.spec.js` (Y1-Y8), `tests/e2e/city-quick.spec.js` (quick project), `tests/presence/city.spec.js`, `npm run check` |

## Places (City job B, 10 Nov)

The 18 wave 1 places are open. A tap on a place's building, door or entrance walks you there; arriving opens the place.

### Three templates

| Template | What it is | Places |
|---|---|---|
| **Room** | a small interior you walk into through the door (14 x 11 m; the dealership 18 x 12) | Bank, Clinic, Barber and salon, Lifecup cafe, Lounge, Car dealership |
| **Hall** | a big interior (20 x 15 m; the library 18 x 14, the gym 18 x 13, the arcade 20 x 14, the church 14 x 20) | Mall, SunnyBay Public Library, Gym, Church, Greenway SunnyBay, Arcade and bowling |
| **Open ground** | the lot itself: no interior, no loading | Beach, Park, Taxi rank, Petrol station, Stadium, Driving school |

- **Room and Hall.** The door takes you in behind a half-second veil with the place's name; you stand just inside, facing the room. The room is built from data when you enter and thrown away when you leave. It is two draw calls (one mesh for the floor, walls and every prop; one for the sign and the labels) plus the people. Its walls only show from inside, so the camera always looks into the room. **Way back out:** the "Leave" button, the mat by the door (walk onto it or tap it), or any trip from the map; you come out at the same door. A save left inside a place loads at its door.
- **Open ground.** The entrance opens the list where you stand. The place's props stand round the entrance and are merged into the city's own meshes (no extra draw calls).
- **People.** Each place has one staff member and 2 to 4 patrons, standing where the data says, skins from `src/world/skinmix.js` (the Cast Rule). They are unnamed (a role only: "Barista", "Teller"), so docs/cast.md lists no new names. A tap on the staff opens the list. At an open-ground place they appear when you are within 70 m.
- **Players.** Everyone in the same place sees each other; the mini card, Wave and chat work as they do on the street. The Race to the pier is offered only outdoors (not inside a Room or Hall).

### Things to do

`docs/world-designer/city.md` is the source: 30 places x 10 rows. `npm run city-data` (scripts/city-build.mjs) writes `data/campusville/city.json` from it, and `npm run check` fails if the two disagree. All 300 rows are in the file; a place is playable when it has a wave 1 lot.

The list is a bottom sheet (at most 60% of the screen). Each row shows its name, minutes, cost (or what a gig pays) and the stat changes. A row that cannot be picked is grey, with the reason:

| Reason shown | When |
|---|---|
| Closed now. Opens Social 13:00 | the place is shut in this slot (the door itself says so, before the list) |
| Morning to Social only | the row has its own hours |
| Needs R45. You have R20. | not enough money |
| Needs a driver's licence / Needs a car of your own | the row's Needs column |
| Do the yard lesson first / Do the road lesson first | the driving school's order |
| One city gig a day. Back tomorrow. | a paid city gig was already worked this game day |
| Already yours / You have your licence / You already own a car | bought once |
| Needs 2 slots. 1 left today. / No time left today. Home to bed. | the day's time |

- **Slots.** city.md's Morning, Lecture, Social, Free, Night are the game's phases: Morning = wake and transit, Free = leisure. Outside a place's Open line the door says when it opens; if that is later the same day there is a "Skip to Social 13:00" button (the same step as the campus's own Skip button).
- **Time.** A quick row (15 to 30 minutes) is a third of a day slot: the first opens a slot, the next two ride in it (a part-used slot does not carry over the night). Any other row takes its minutes divided by that part of the day's `meta.slotMinutes`, rounded, at least 1 and at most 3 slots. The clock moves by the row's minutes, never past the end of that part of the day.
- **Better with friends here.** Any other player in the same place counts (NPCs never do). Alone the Social is half, rounded down, and the result card says so.
- **Gigs.** Pay goes into Money; one paid city gig per game day per player, across all places. Campus jobs keep their own rules.
- **Show-offs.** The dearest row of each place. Bought once; saved in `run.showoffs`; the latest three show on the buyer's full player card.
- **Licence and car.** Driving school: the yard lesson, then the road lesson, then the test, which sets `run.licence`. Dealership: the first car (R4,500) or the used runabout (R12,000) needs the licence and sets `run.car` (`{ id: 'first' | 'runabout' }`); the car is then parked outside the dealership (`run.carAt`). The petrol station's car rows need `run.car`.
- **Result.** The existing result card, with the row's own result line.

### How a place is dressed from data

`data/campusville/city_places.json`, one entry per place:

```
"lifecup": {
  "heading": "Lifecup cafe",          its heading in city.md
  "template": "room",                 room | hall | open
  "size": [14, 11],                   optional: metres, wide x deep (default from "templates")
  "wall": "#f6efe2", "floor": "#b98a5e", "trim": "#c2562a",
  "sign": "LIFECUP · THE GOOD MILK",  on the far wall
  "staffRole": "Barista",
  "staff": [0, -4.8, 0],              x, z, facing in degrees (0 = toward the door)
  "people": [[-4, -1.3, 150], ...],   2 to 4 patrons
  "props": [ { "k": "counter", "x": 0, "z": -3.7, "w": 7, "c": "#c2562a" }, ... ]
}
```

Interiors: metres from the middle of the floor, x east, z south; the door is the middle of the south wall. Open ground: metres from the lot's entrance (`at` in sunnybay.json). A prop is `{ k, x, z }` plus `rot` (degrees), `n`/`dx`/`dz` (a row of them), `w`, `d`, `c` (colour) and a few of its own (`chairs`, `stools`, `text`, `glass`, `model`). The kinds are in `src/world/cityprops.js` (about 60: counter, desk, till, shelf, bookshelf, rack, round, longtable, pew, booth, pool, lane, treadmill, car, stall, cart, net...). Kit models are the ones already in the game (public/models/props, cars: CC0); nothing new is downloaded.

### Opening a wave 2 place later (data only)

1. `data/campusville/sunnybay.json`: move its entry from `wave2` to `lots` and give it what a lot has: `sign`, `icon`, `w`, `d`, `h`, `door`, `look`, `wall`, `roof` (or `at` and `area` for open ground).
2. `data/campusville/city_places.json`: add `template` and the dressing to its entry (it already has its `heading`).
3. Its ten rows are already in `city.json`. Run `npm run scores-sql` so its rows get score rules, and the owner re-runs the SCORE RULES block of `supabase/launch.sql`. Until then the place works and its rows simply do not score.

### Rooms (players)

A place has no Realtime room of its own: you stay in the **district's room** (`campus.town`, `campus.suburbs`...; cap 40, then `-2`). Inside a Room or Hall your position is sent in that interior's own spot far off the map (each place has its own), so players in the same place see each other and players on the street do not see you. The map's count for the district includes the players inside its places.

### Where the code is

| What | File |
|---|---|
| Rows, hours, needs, running a row, the money check | `src/city/places.js` (data: `city.json`, `city_places.json`) |
| city.md -> city.json | `scripts/city-build.mjs` (`npm run city-data`) |
| The inside of a Room or Hall | `src/world/cityplace.js` |
| Props | `src/world/cityprops.js` |
| Doors, the sheet, the result, in and out, staff and patrons | `src/world/city.js` (`openLot`, `openTodo`, `pickRow`, `goInside`, `leavePlace`, `seatFolk`) |
| Counting, the card, skipping to a slot | `src/main.js` (`cityRow`, `cityWait`) |
| Tests | `tests/e2e/city-places.spec.js` (P1-P7), `tests/e2e/city-places-quick.spec.js` (quick project), `tests/presence/places.spec.js` (two phones in Lifecup), `npm run check` |

## Changing a lot

- A lot that needs a second door or a bigger building: change its row in `sunnybay.json` (`x`, `z`, `w`, `d`, `h`, `door`, `look`, colours). Looks today: `block`, `shop`, `columns`, `mall`, `church`, `showroom`, `market`, `arcade`, and the open ones `beach`, `park`, `rank`, `petrol`, `stadium`, `yard` (those use `at` for the entrance and `area` for their ground).
- Content rule (CLAUDE.md): no nightclubs, bars, taverns or alcohol; the church is the only place of worship; no gambling, betting or crime activities for launch. `npm run check` looks for the words.

## Movement (owner, 11 Nov)
- Traffic (src/world/traffic.js): 11 cars and 4 kombis on the roads near the player (put back a block or two away once 150 m out of sight), left lanes, a curve through each junction with one vehicle in a junction at a time, slowing for junctions and zebra crossings, stopping for anybody on foot in the lane. Kombis drive stop to stop (the stops above) and wait 3.5 s. One instanced mesh per kind of vehicle.
- The taxi ride: a kombi pulls up at the stop, you get in, it pulls off with the camera following it, a cut, it pulls in at your stop and you step out. The fare and time rules above are unchanged.
- Street people: two of the eight cross at the zebra crossings near the player. Inside Rooms and Halls the patrons browse, queue and leave and come back.
