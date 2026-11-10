# City job B: the places open (10 to 11 Nov)

How the places work, the templates, the data format and how to open a wave 2 place: `docs/world-designer/sunnybay.md`, "Places". The rows themselves: `docs/world-designer/city.md` (the source) -> `data/campusville/city.json`. Screenshots (390 x 844, on the PC, not committed) are in this folder; the names are at the end.

## What was built

1. **Things to do, everywhere.** All 18 doors (or lots) open. Arriving at a place opens a bottom sheet with that place's ten rows: name, minutes, cost (or what a gig pays), the stat changes, and tags (Quick, Gig, Show-off, friends). A row that cannot be picked is grey with the reason (closed now, not enough money, needs the licence, needs a car, lesson order, one gig a day, already yours, no time left). Picking a row shows a 1.5 s "doing" pill, then the existing result card with the row's own result line; time passes and the stats change. The sheet is at most 60% of the screen. A place outside its hours shows a card that says when it opens; if that is later the same day, "Skip to Social 13:00" takes you there.
2. **The licence and the car.** Driving school: yard lesson, then road lesson, then the test, which gives the licence. Dealership: the first car (R4,500) or the used runabout (R12,000) needs the licence; the car is then parked outside the dealership. The petrol station's three car rows need a car. From then on the map's Drive works (R8, instant), as built in job A.
3. **Gigs and show-offs.** A gig pays into Money, costs Energy, and only one paid city gig can be worked per game day, at any place. A show-off (the dearest row of each place) is bought once, saved, and the latest three show on the buyer's full player card.
4. **Templates.** Room (Bank, Clinic, Barber and salon, Lifecup cafe, Lounge, Car dealership) and Hall (Mall, SunnyBay Public Library, Gym, Church, Greenway SunnyBay, Arcade and bowling) are interiors you walk into, with Leave, a door mat and the map as ways back out to the same door. Open ground (Beach, Park, Taxi rank, Petrol station, Stadium, Driving school) is the lot itself. Every place is dressed from `data/campusville/city_places.json`: wall, floor and trim colours, a sign, 4 to 8 props, a counter or focus point, one staff member and 2 to 4 patrons (skins from skinmix.js). No new downloads: props are plain shapes plus kit models already in the game (0 KB added to public/).
5. **Players inside.** Players in the same place see each other; the mini card and Wave work there; the Race to the pier is not offered indoors, and an invite that arrives while you are indoors is declined. "Better with friends here" counts any other player in the place.
6. **Scores.** The 180 wave 1 rows go through `leaderboard.json`'s defaults: 103 of them score (26 Academics, 61 Social, 16 Sport), each with a daily limit (4, 3, 3). The other 77 are too small to score (a snack, +1 Social). Overrides: the gym is a sport place, eight sporty rows elsewhere count as Sport, and the gym's banana and desk shift do not score.

## What was cut or left simple

- **A row is a card, not a scene.** No walking to a seat, eating, queueing or working animation: a short "doing" pill, a gesture, then the result card.
- **Staff and patrons stand still** (idle animation). They have a role, not a name, and no conversation. A tap on the staff opens the list.
- **One car model** for both cars (the game's hatchback).
- **No interior sound** of its own; the room's light does not follow the clock.
- **Chat indoors** was not tested on its own (the mini card and Wave were, with two phones). It is the same chat as on the street.
- **The "finish your student card" prompt** after a first paid gig or meal was not tested from a city row.
- **Wave 2 rows do not score** until their place opens (then: `npm run scores-sql` and the SQL block again).
- **tests/e2e/cards.spec.js** lists `.city-todo` and `.city-doing` in its card list but does not open them itself; their own check is P9 in city-places.spec.js (390 and 1280 px).

## Conflicts with the repo, and what I assumed

- **Slots.** The brief says a non-quick row uses whole slots "from their minutes and meta.slotMinutes". meta.slotMinutes differs by part of the day (wake 20, transit 40, lecture 60, social 40, leisure 70, night 30), so I divide the row's minutes by the current part's slot minutes, round, and keep it between 1 and 3. The same row therefore costs more slots in Social than in Lecture or Free (a 60 minute lesson: 2 slots in Social, 1 in Lecture). Say if you want one fixed table instead.
- **Repeats.** The brief lists no "once a day" rule for ordinary rows, so they can be repeated while there is time and money. Gigs: one a day. Show-offs, the licence and each car: once.
- **Morning.** city.md has five day slots, the game has six phases. Morning = wake and transit, Free = leisure.
- **Getting on with the day in town.** The campus's "Skip to..." bar is hidden in SunnyBay, so a closed door offers "Skip to Social 13:00" when the place opens later that day (the same engine step as the campus button, including the missed-lecture rule).
- **Data files.** `data/` is Cursor's. This job added `city.json` (generated, do not edit), `city_places.json` (templates and dressing) and edited `leaderboard.json` (sport places and ids, two overrides) because the job asked for them.
- **"Opening soon"** is gone from the 18 doors; wave 2 boards still say "Coming soon".

## Balance (prices unchanged)

From the city only (campus jobs keep their own rules and can be worked the same day):

| | |
|---|---|
| Most a player can earn in one game day | **R240** (Steward the stands, Stadium: one paid city gig a day) |
| Most in one game week (7 days) | **R1,680** |
| Paid gigs open at launch | 22 (R130 to R240) |
| Licence | R850 (yard R180 + road R220 + test R450); the three rows fit in one day (3 slots in Lecture or Free, 5 in Social) |
| First car | R4,500 |
| Game days to the licence, from R2,100 | **0**: it is affordable on day 1 |
| Game days to the licence and the first car, best gig every day, nothing else spent | **14** (R2,100 + 14 x R240 = R5,460 against R5,350) |
| The same with city.md's light living (R60 a day) | **19** (city.md says end of week 3: it agrees) |
| Used runabout (R12,000) after the licence, best gig, nothing else spent | 45 game days (60 with light living) |

Flags (nothing changed):

1. **Start money.** city.md assumes R2,100. The game gives R1,500 plus the parent's pocket money at the drop-off: R600 for a suburban home (R2,100) but R400 for a township home (R1,900), and R200 once for finishing the student card. A township student is R200 behind the check: 15 days to the car instead of 14.
2. **Free energy.** Some free quick rows give Energy: Sit in a back pew +8, Ask about sleep +6 (Clinic), Stay for the sunset singing +6, Take a hot towel +8 (R25). A quick row is a third of a slot and rows can be repeated, so one slot at the Church can give +24 Energy for nothing (sleep gives 60). If that is too generous, the fix is a once-a-day rule on those rows or smaller numbers in city.md.
3. **The best gig takes most of a day.** Steward the stands is 180 minutes: 3 of the day's 5 slots and 26 Energy, and the Stadium is closed in the Lecture slot. Working it every day leaves 2 slots for the lecture and everything else, so R1,680 a week is a ceiling very few players will reach.
4. **Getting there costs money.** A taxi is R15 to R25 each way, so a R130 shift can net about R90. city.md's light living counts one R20 taxi a day.
5. **Same price, different goals.** The Mall's show-off (Buy the window outfit) costs R4,500, the same as the first car.
6. **Morning is expensive in slots.** In the wake part of Morning a slot is 20 minutes, so most non-quick rows cost the maximum of 3 slots there (see "Slots" above).

## Performance

Real GPU (this PC), 390 x 844, walking across the room, CPU throttled 4x (tests/e2e/city-places.spec.js P8, `fps-4x.json` in this folder). The target was 30 fps.

| Place | Template | fps at 4x | Draw calls | Triangles (all) | Triangles (the room itself) | People |
|---|---|---|---|---|---|---|
| Bank | Room | 54 | 64 | 22,592 | 1,120 | 5 |
| Clinic | Room | 57 | 64 | 22,768 | 1,042 | 5 |
| Barber and salon | Room | 57 | 83 | 30,366 | 1,458 | 5 |
| Lifecup cafe | Room | 56 | 64 | 23,834 | 2,108 | 5 |
| Lounge | Room | 56 | 38 | 16,694 | 2,514 | 5 |
| Car dealership | Room | 56 | 47 | 21,394 | 7,148 | 5 |
| Mall | Hall | 41 | 74 | 31,388 | 3,282 | 6 |
| SunnyBay Public Library | Hall | 57 | 74 | 34,450 | 6,344 | 6 |
| Gym | Hall | 57 | 84 | 27,834 | 1,742 | 6 |
| Church | Hall | 57 | 59 | 27,704 | 1,142 | 6 |
| Greenway SunnyBay | Hall | 56 | 90 | 33,314 | 4,042 | 6 |
| Arcade and bowling | Hall | 56 | 90 | 31,450 | 2,178 | 6 |

- **Room:** 38 to 83 draw calls, 17k to 30k triangles. **Hall:** 59 to 90 draw calls, 28k to 34k triangles. **Open ground:** no draw calls added (the props are merged into the city's own meshes); 4 more people within 70 m of the entrance.
- The room itself is always **2 draw calls** (one mesh for the shell and every prop, one for the sign and labels) and 1k to 7k triangles. Everything else is people: you, one staff member and 2 to 4 patrons, about 10 to 17 draw calls each. That is where the cost is if a phone struggles.
- While you are inside, the whole city is not drawn.
- The Mall's 41 was the first room measured in the run; every later sample was 50 or more. This is a desktop GPU: the owner's phone is the real check.

## How places map to rooms (players)

A place has no Realtime room of its own. You stay in the **district's room** (`campus.town`, `campus.suburbs`, `campus.beachfront`, `campus.industrial`; 40 players each, then `-2`, `-3`). Inside a Room or Hall your position is sent in that interior's own spot, far off the map (each place has its own), so:

- players in the same place see each other and can tap each other;
- players on the street do not see you, and you do not see them;
- the map's count for a district includes the players inside its places.

Open-ground places are part of the street, so nothing changes there.

## Tests

- `npm run check`: 74 checks (7 new: the 18 places and their 10 rows; dressing from data; hours, money, slots, the clock and friends; the licence and the car; gigs and show-offs; the money check; the score rules) plus "city.json matches city.md" first, and the SQL block current (163 rules).
- `tests/e2e/city-places.spec.js` (real GPU):
  - P1 all 18 places open a list of exactly 10 rows; staff and patrons; the way back out.
  - P2 a meal at the Mall: money drops, fullness rises, the result line shows.
  - P3 a second gig on the same game day is refused with the reason.
  - P4 yard lesson, road lesson, test, the first car, and a drive to the Beach.
  - P5 without the licence the car rows are greyed.
  - P6 a show-off is bought once and listed on the full player card.
  - P7 a place outside its hours says when it opens; "Skip to" works.
  - P8 every interior at 4x CPU throttle.
  - P9 the sheet, the closed card and the result at 390 and 1280 px.
- `tests/presence/places.spec.js`: two phones in Lifecup see each other; the mini card and Wave work, no Race; a friends row pays +11 Social with the other in the place and a +12 row pays +6 once alone.
- `tests/e2e/city-places-quick.spec.js` is in the quick project (about 15 s).
- Updated for open doors: `tests/e2e/city-quick.spec.js`, `tests/e2e/city.spec.js` (Y2, Y4, Y8).

## Screenshots (docs/sprints/places/, 390 px)

- A Room: `room-lifecup-390.png` (also `room-bank`, `room-clinic`, `room-barber`, `room-lounge`, `room-dealership`)
- A Hall: `hall-mall-390.png` (also `hall-city_library`, `hall-gym`, `hall-church`, `hall-greenway_city`, `hall-arcade`)
- An open-ground place: `open-taxi_rank-390.png` (also `open-beach`, `open-park`, `open-petrol`, `open-stadium`, `open-driving_school`)
- The Things to do sheet: `things-to-do-390.png`
- A greyed row: `greyed-row-390.png` (one gig a day), `greyed-car-rows-390.png` (no licence)
- The licence result: `licence-result-390.png`
- The car parked after buying: `car-parked-390.png`
- Also: `result-meal-390.png`, `closed-door-390.png`, `card-show-offs-390.png`, `two-in-lifecup-390.png`, `alone-half-social-390.png`, `p9-390-*.png`, `p9-1280-*.png`
