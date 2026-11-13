# Soft Life: the Caf world

Design spec from Claude (designer and QA lead), approved by Lloyd, 8 Nov 2026.
Source of truth for the Caf build jobs. Names must match docs/cast.md.

## Why the Caf is its own world

The Caf is the first place we build as a full world, and it becomes the pattern for the Sports Centre, the Lab and the LAN. Walking through its door should feel like entering a small game of its own: busy at lunch, quiet at night, full of people who remember you.

It has the four things every place needs:

- **Its own loop:** queue, order, find a seat, eat with someone; or work a shift behind the counter.
- **Its own regulars:** six named characters, a mixed cast, who are always there and get to know you.
- **Its own sounds:** trays, the coffee machine, a radio playing amapiano, chatter that grows at lunch.
- **Its own progress:** your regular level and your shift rank, which only grow here.

It builds on the counters Lloyd asked for on 8 November: Mama Liz's hot meals, Aunty Premi's Indian kitchen and Uncle Jaco's grill, plus a coffee kiosk. The props are already built: seven Polyfork models in one 52.8 KB kit (`public/models/caf/caf-kit.glb`).

## Layout

- **Back wall, left to right (the four counters, highlighted):**
  - Hot meals: Servery Counter, Mama Liz.
  - Indian kitchen: Servery Counter (second instance), Aunty Premi.
  - Grill: Cafe Counter, Uncle Jaco.
  - Coffee kiosk: Coffee Kiosk, Kyle.
- **Queue lane:** runs in front of all four counters.
- **Left side:** Window bar (Bar Stool), Lerato's corner.
- **Middle:** Long table (Folding Dining Table), the Table 4 crew.
- **Right:** Small tables (Cafe Table Set), classmates and friends.
- **Front middle:** Open seating, where background students eat and leave.
- **Doors:**
  - The main door is at the front centre, with the Regulars board beside it.
  - A side door on the right leads to the Patio (Cafe Parasol, evening string lights).

Each zone uses one prop from the kit, repeated as instances.

## Look

Warm and lived-in: honey wood, cream counters, plum and gold accents that match the new result card. It should feel like the nicest affordable place on campus, not a fancy restaurant.

**Palette table for `scripts/caf-assets.mjs`**

This replaces Code's first guess (the yellow-and-pink stool, the clay parasol). Hex values are starting points; match the game's existing tokens where they already exist.

| Surface | Colour | Hex |
| --- | --- | --- |
| Wood (tables, stools, counter fronts) | Honey wood | #b9824f |
| Dark wood (legs, trim) | Walnut | #6b4428 |
| Counter tops, trays | Cream | #f3e9d2 |
| Accent panels, menu boards | Plum | #2f1a5c |
| Trim, signs, kiosk stripe | Gold (match the result card) | #d9a632 |
| Metal (servery, coffee machine) | Warm steel | #a7a19a |
| Parasol canopy | Plum with a gold edge | #2f1a5c / #d9a632 |
| Seat cushions | Teal (the Money colour) | #2a8c8c |

**Lighting**

- Daytime: warm sunlight through the windows, one directional light plus soft ambient.
- Evening: the patio string lights come on and the inside lights turn warmer.
- Load-shedding: the lights dim to a single emergency strip and the menu shows "cold food only".

**Signs**

A plum menu board with gold lettering above each counter: HOT MEALS, INDIAN KITCHEN, GRILL, COFFEE. Prices are in game rand and change only with events.

## What you do there

Three things: eat, sit with someone, or work a shift. Each takes one day slot and ends on the colourful result card.

**1. Queue and order**

- Walk to a counter. If there's a queue, the person in front says a line ("Eish, they're out of wors again").
- Order from a short menu. Each dish shows its price and what it gives.

| Counter | Dish | Gives |
| --- | --- | --- |
| Hot meals (Mama Liz) | Roast chicken and veg | Fullness ++, Energy + |
| Hot meals (Mama Liz) | Mac and cheese | Fullness ++ |
| Hot meals (Mama Liz) | Pap, wors and gravy | Fullness ++, Energy + |
| Indian kitchen (Aunty Premi) | Chicken biryani | Fullness ++, Energy + |
| Indian kitchen (Aunty Premi) | Bunny chow | Fullness +++, Energy - (food coma) |
| Indian kitchen (Aunty Premi) | Samoosas | Fullness +, Social + if shared |
| Grill (Uncle Jaco) | Burger and chips | Fullness ++ |
| Grill (Uncle Jaco) | Boerewors roll | Fullness + |
| Grill (Uncle Jaco) | Kota | Fullness +++, Energy - (food coma) |
| Grill (Uncle Jaco) | Slap chips | Fullness +, Social + if shared |
| Coffee kiosk (Kyle) | Coffee | Energy ++ |
| Coffee kiosk (Kyle) | Muffin | Fullness + |
| Coffee kiosk (Kyle) | Vetkoek | Fullness + |

The menu is a mix, like the country and the players: home cooking, Indian food, the grill and café food. No counter is "the African one" or "the white one". Exact numbers and game-rand prices are set in `data/campusville/*.json` with the rest of the economy, not here.

**2. Find a seat**

- Pick a table. A regular or classmate at that table says hello and their friendship bar shows.
- Sitting with someone gives Social on top of the meal. Sitting alone with headphones gives a small Grades boost instead (you read while you eat).
- Eating with a named classmate ticks the daily want "Have lunch with a friend".

**3. Work a shift (from game day 3)**

A 60 to 90 second mini-game behind the servery:

- Orders pop up as food icons above students in the queue.
- Tap the matching tray item before the order's timer runs out. Right order: tip and a happy face. Wrong or late: a grumble, no tip.
- The lunch rush at 13:00 brings a faster, longer queue and bigger tips.
- Pay in game rand plus tips; costs Energy. Capped at 2 shifts per game week, in line with the daily earn caps.
- A good shift ends on a big-win result card with confetti.

**Weekly Caf events** (shown coming on the top bar)

- **Friday special:** one counter's special each week (burgers, biryani or kotas), a long queue, double tips on a shift.
- **Load-shedding:** cold food only, dim lights, everyone in a mood.
- **Exam week:** the Caf is quiet and full of people studying; sitting alone gives more Grades.

## The regulars

Six computer-played characters live in the Caf. They are always in the same spot at the same times, so the player learns where to find them. Each remembers you and has a friendship bar.

| Regular | Where | Who they are | What they give you |
| --- | --- | --- | --- |
| Mama Liz | Hot meals counter | Has run the Caf kitchen for 20 years; calls everyone "my dear" | An extra scoop when she likes you; your shift boss |
| Aunty Premi | Indian kitchen | Makes the best biryani on campus; feeds you up when you look tired | Free samoosas at a high bar; exam-week "brain food" |
| Uncle Jaco | Grill counter | Runs the grill; has opinions about everyone's rugby and soccer team | Friday specials and campus gossip |
| Kyle | Coffee kiosk | Barista and bedroom DJ, always has a new mix | Tells you about events on the Quad; free coffee on your birthday |
| Lerato | Corner window table | Third-year with headphones, always studying | Sitting with her gives Grades; she shares past test papers at a high bar |
| The Table 4 crew | Middle long table | A mixed, loud group of friends who roast each other | Big Social, but sitting with them during exam week costs Grades |

**Cast rule (the whole game, not just the Caf)**

Soft Life is an international game that starts in South Africa. Staff, regulars and background students are an even mix of Black, white, Indian and coloured South Africans, so nobody opens the game and feels it isn't for them. Names are English by default (agreed 8 November), with a mix of backgrounds. Food, music and places follow the same rule.

**How they talk**

- Short lines in English with South African flavour, 3 to 5 per character per situation, random with no repeat in a row (the same rule as the result card lines).
- Lines change with the friendship bar: a stranger gets "Next!", a regular gets "The usual, my dear?"
- They react to what happened: a failed test, load-shedding, a new outfit.

Background students fill the other tables so the Caf never feels empty, but only the regulars talk. Background students follow the cast rule too.

## What grows

Two ladders only grow in the Caf. Both are shown on a small Caf card when you walk in, so the player sees progress every visit.

**Regular level** (from eating and sitting there)

| Level | Name | Perk |
| --- | --- | --- |
| 1 | New face | None |
| 2 | Seen you before | Mama Liz says your name |
| 3 | Regular | "The usual": your last order in one tap |
| 4 | Family | An extra scoop: more Fullness for the same price |
| 5 | Legend | Your name on the Regulars board by the door |

**Shift rank** (from shifts)

| Rank | Unlocks | Pay |
| --- | --- | --- |
| Trainee | Hot meals servery | Base |
| Server | The grill, the Indian kitchen and Friday shifts | Base + 25% |
| Barista | The coffee kiosk, with Kyle | Base + 50% |
| Shift lead | Picks your own shift times | Base + 75% |

Friendship bars with the regulars also grow here, and they carry over to the rest of the game.

The player can also spend points on Caf extras later (a custom mug on the Regulars board, a seat cushion in their colour), in line with the points plan: they look good, they don't help you win.

## Sounds and music

The Caf should sound busy before you see it: the sound starts as the door opens.

- **Room tone:** chatter and cutlery that grows with the number of people inside; loudest at the 13:00 lunch rush, almost silent at night.
- **Counters:** tray clatter at the servery, a sizzle at the grill, the coffee machine's hiss at the kiosk. Each plays when you walk close to it.
- **Radio:** low amapiano from a radio on the counter. Lloyd picks the track from the synthesised ones on `#/sounds`.
- **Shift mini-game:** a soft bell for each new order, a cha-ching for a tip, a short grumble for a wrong order.
- **Load-shedding:** the radio cuts out and a generator hum starts outside.

All sounds follow the existing audio rules: they stop at once when the game is hidden or frozen.

## Phone performance

The Caf must run at 30 fps or better on a cheap Android, and load in under 1 second after the first visit.

- **Its own scene:** the Caf loads only when you walk through its door, with the curtain transition. The campus map unloads behind it and comes back on exit.
- **One kit file:** all seven props come from the 52.8 KB kit. Tables, stools and chairs repeat as instances, so 20 tables cost about the same as one.
- **Draw calls:** under 60 for the whole room.
- **People:** at most 20 on screen: the 6 regulars plus up to 14 background students. Background students use the cheapest character setup and simple loops (eat, chat, leave).
- **Light:** one directional light plus ambient. No real-time shadows; soft blob shadows under people and furniture.
- **Size check:** the Caf adds no more than 400 KB to the download, Draco decoder included.

If the phone is slow (from the smooth reports we already collect), the Caf drops to 8 background students and turns off the patio string lights.

## Build jobs

Five Claude Code jobs, one per fresh context, each ending with a push and a production deploy. Lloyd checks each on his phone before the next starts.

| # | Job | Done when | Model |
| --- | --- | --- | --- |
| 1 | Recolour the kit with the palette above; build the Caf scene shell with the layout, door transition and lighting | Screenshots of every zone, including the cafe counter; 30 fps on a cheap Android | Sonnet 5.5, High |
| 2 | Queue, menu and seating: order, pay, eat, sit with someone, result cards | A full lunch slot plays from door to result card | Sonnet 5.5, Medium |
| 3 | The six regulars: spots, schedules, lines, friendship bars, regular level and the Caf card | Each regular is where expected and changes lines with the bar | Sonnet 5.5, Medium |
| 4 | Shift mini-game and shift rank | A 60 to 90 second shift plays, pays and ranks up; capped at 2 a week | Sonnet 5.5, High |
| 5 | Sounds and weekly events (Friday special, load-shedding, exam week) | Each event shows on the top bar and changes the Caf | Sonnet 5.5, Medium |

**Lloyd's phone check after each job**

- [ ] Job 1: does it feel like a different world when you walk in? Are the colours right?
- [ ] Job 2: is lunch quick and fun, under a minute?
- [ ] Job 3: do the regulars feel like real people?
- [ ] Job 4: is the shift fun enough to play twice?
- [ ] Job 5: does the Caf sound alive?

**Open questions for Lloyd**

- Should one of your brands (Woza, Lifecup, Greenway) appear in the Caf, for example Woza card payments at the till?
- Does Mama Gugu at the Quad stall keep her name? (Decided in the docs/cast.md review.)

## Build log

**Job 1, the scene shell (8 Nov, done).** `src/world/caf.js` is the Caf as its own scene: the campus Caf door (a tap on the building, the door prompt, E; the map's "go there" still opens the place sheet until job 2) plays the plum curtain, hides the campus and builds the room; the exit door or the Leave button brings you back to the campus Caf door. The kit is recoloured with the palette above (scripts/caf-assets.mjs, per-prop colour map). Layout as specified: four counters on the back wall (Servery x2 = Hot meals and Indian kitchen, Cafe Counter = Grill, Coffee Kiosk), a plum queue lane, window bar with 5 stools on the left, two long tables in the middle, small tables on the right, open seating at the front, main door front centre with an empty Regulars board beside it, side door right to the patio (two parasols, string lights). Plum menu boards with gold lettering. Lighting: day, evening (string lights on), load-shedding (emergency strip, "COLD FOOD ONLY"): `?caflight=day|evening|load`, `?cafdebug=1` shows a light switch and draw-call count, `run.loadShedding` will drive it in job 5. Instanced props (tables, stools, parasols), architecture merged per material. No people, menus or ordering yet. Numbers: 50 draw calls at 390 px (53 at 1280 px) including the player, ~22k triangles, no real-time shadows; the Caf adds 52.8 KB of kit plus caf.js (the Draco decoder is already shipped); about 30 fps (27-42, median 33) at 4x CPU throttle on a desktop GPU, 390 px. Test: tests/e2e/caf.spec.js.

**Outside the Caf (10 Nov, City job A).** The room no longer floats in plum: the campus lawn runs to the horizon all round it, with a paved apron and the path from the main door, under a sky that follows the light state (day blue, evening orange, load-shedding night). Three merged boxes, no extra draw calls beyond their materials.

**Job 1 fixes (8 Nov, after Lloyd's phone check).** Camera: sims frames the floor (never past the walls, picture pushed below the top bar), top fits the whole hall squared to the screen. The game's top bar stays visible in the Caf; Leave the Caf and Top/Sims/Eye sit under it, and no sign is under them in the default view. Queue lane: lighter cream floor with gold edge lines and gold rope posts on both sides (front side roped, counter side open). Each counter and sign photographed at 390 px. The outdoor queue's Leave button and speech line now stack (cards.css). The outdoor queue goes in job 2.

## People (owner, 12 Nov, job J): built
- The staff: Mama Liz (hot meals), Aunty Premi (Indian kitchen), Uncle Jaco (grill) and Kyle (coffee), each behind their own counter, working and turning to greet you at their counter (src/world/cafpeople.js).
- At meal times (06:30-09:00, 12:00-14:00, 17:30-19:30) ten students, otherwise four: a queue up the lane to Mama Liz's mat, served with a tray, off to a free seat (the window bar's stools, two at each small table, four at each long table), eating, out of the door and back at the end of the queue. The crowd sound follows how full it is.
- On a slow phone (4x slower processor) the full Caf at lunch draws at 31.6 fps.
