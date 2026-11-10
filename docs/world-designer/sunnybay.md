# SunnyBay: the map

City job A (owner, 10 Nov). The University of Mzansi sits in the middle of SunnyBay, a fictional coastal city. This file is the map: the districts, where every lot is, the travel rules and the structure. City job B and the designer read it before filling the places. The Things to do lists are in `docs/world-designer/city.md`.

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

Each has a lot, a sign and a door (or a gate, for the open ones) with "Opening soon". `door` is where a player stands when they have arrived; job B opens the place from there.

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

A fenced, empty plot (22 x 16 m) with a board: "COMING SOON" and the place's name. On the map they are small grey dots.

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
  - **Job B grants the licence and the car** (driving school's test, the dealership). Nothing in job A does. Set `run.licence = true` and `run.car = { id: '...' }`; everything else follows.
- **Getting in and out.** Walk out of the Main Gate (a tap on the road at or past the gate): a short curtain, then you stand outside the gate facing the "Welcome to SunnyBay" sign. Walk in through the gate to go back. A save left in the city (`run.cityAt = { x, z }`) loads straight back there.
- **The map** (`src/world/map.js`, `createCityMap`): titled "SunnyBay"; district outlines and names, a pin per place and one for the campus, yellow squares for taxi stops, grey dots for wave 2, where you are, how many players are in each district. A tap on a pin shows the ways there with the price and the time. On campus the campus map is the close-up and has a "SunnyBay" button; the menu has "SunnyBay map".

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

## For job B

- A place opens from `openLot(id)` in `src/world/city.js`: today it shows the "Opening soon" card. Replace that with the place's Things to do.
- Give the licence and the car by setting `run.licence` and `run.car` (above).
- A lot that needs a second door or a bigger building: change its row in `sunnybay.json` (`x`, `z`, `w`, `d`, `h`, `door`, `look`, colours). Looks today: `block`, `shop`, `columns`, `mall`, `church`, `showroom`, `market`, `arcade`, and the open ones `beach`, `park`, `rank`, `petrol`, `stadium`, `yard` (those use `at` for the entrance and `area` for their ground).
- Content rule (CLAUDE.md): no nightclubs, bars, taverns or alcohol; the church is the only place of worship; no gambling, betting or crime activities for launch. `npm run check` looks for the words.
