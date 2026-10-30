# MzansiVille benchmark: Lagos Life and The Sims

Tested on 30 Oct 2026 (SAST). MzansiVille build `origin/main` @ `4900f62` ("Merge morning-slice"). Headless Edge, phone viewport 390x844, touch, DPR 3. Screenshots are in `docs/img/benchmark/`.

**How to read the scores:** 1 means missing, 5 means best in class. The MzansiVille scores come from playing the game and reading the code and data. The Sims scores come from EA and guide sources. The Lagos Life scores come from press and fan-guide sources, because I did not sign up and play it. lagoslife.app itself is thin: it is a login wall over a map, so it gave almost nothing to fetch. Scores marked *(inf)* are inferred.

**Clone warning:** "Naija Life: Lagos Simulator" on Google Play (GreatCallie) is **not** Lagos Life. Fan guides say the official game has no app. I didn't use claims that only that listing makes.

## Scorecard

| # | Category | Lagos Life | The Sims 4 | MzansiVille today | LL | Sims | MV |
|---|---|---|---|---|---|---|---|
| 1 | Things to do per place | 23 locations and 261 actions [B]. Places each have their own activities, such as the Library and CcHub for learning and parks for fun [G]. | Every object and every Sim has a pie menu of many actions, and hundreds of socials [P]. | 9 of 16 places have any action. 7 have none: 4 lecture venues, Main Gate, Other blocks, Off-campus. Only 3 places have 2 or more actions (O Block, Quad, SMIG). Per phase it's almost always 0 or 1, so most taps say "Nothing here". | 4 | 5 | **1** |
| 2 | Movement and animation | A 3D home where you tap a floor tile to move, and drag or rotate the camera. You walk or take a danfo, keke, okada or cab between places [G][B]. Animation quality is unknown *(inf)*. | Fully animated walk, idle, emotion-specific walks and object interactions [S]. | Tap the ground to walk in 3D. The avatar bobs and tilts (`poseAvatar`) but has no limbs or animation clips. The morning has scripted movement, like walking to the kettle and the bus driving in. | 3 *(inf)* | 5 | **2** |
| 3 | Character look | Avatar with hairstyles (braids, locs, low cut) and fabrics (Ankara, Adire, Aso-oke) [D]. | Detailed Create-a-Sim [S]. | A capsule mesh with a head and braids (`avatar3d.js`). The creator colours don't make it look like a person. | 3 | 5 | **1** |
| 4 | Sound and music | No reliable source found *(inf)*. | Full soundtrack, Simlish voices, object sounds and radio [general knowledge, inf]. | No audio files. `public/` has none and the page has 0 `<audio>` tags. The only sound is a generated oscillator "blip" on taps. | 2 *(inf)* | 5 *(inf)* | **1** |
| 5 | Other people visible | Real other players online, live chat, a Rich List, and NPC visits to build relationships [G][D][Gu]. | A world full of autonomous Sims [P]. | The 3D world has no NPCs (0 matches for npc or crowd in `src/world`). Zanele shows up in the morning and as a modal card. The 2D map has 6 decorative dots. Chat and leaderboard are text only, and they fail offline. | 4 | 5 | **1** |
| 6 | Money and progression | 25 careers with 5 levels each, promotion every 3 shifts, rent every Saturday, Nepo/LAPO start, and a governor race that changes prices [G][B][Gu]. | 13+ careers, skills, bills and the rewards store [P][C]. | Rand balance, 4 stats and 5 day slots. The only job (`job_shift`) is broken: CSV commas make it pay R0 (QA B01). It unlocks after day 3. There are no levels or skills. | 5 | 5 | **2** |
| 7 | Goals and direction | You choose a personality and goal at creation, plus rent pressure and career steps [G][B]. | Aspirations with milestones, plus up to 3 whims [E][P]. | The day 1 morning has a clear goal on screen ("Get to your 9:00 lecture on time", with a countdown). After that it's a phase bar, but the player isn't told what to aim for or where to go. | 3 | 5 | **3** |
| 8 | Navigation | City map with zoom, "Show places", and walk or ride to a place [G]. | Free camera, map view and lot travel [S]. | Top, Sims and Eye cameras, a minimap and a 2D map with "walk here". Problems: after the morning you spawn facing a wall, and there is no route to SMIG and no Home button. | 4 | 4 | **3** |
| 9 | Feedback when you tap | Tapping an item shows its time and cost before you confirm, and a status card logs activities [G]. Animation feedback is unknown *(inf)*. | Pie menu, then a queued action, an animation, needs bars and moodlet pop-ups [P][T]. | The morning shows good feedback: you walk, the kettle works, the bus arrives. Elsewhere taps give a result card with numbers or "Nothing here". The ⚙️ menu stays open and steals taps (QA B02). After arrival, the bestie modal covered every screen I opened next: map, world, and part of the leaderboard (`07_*.png`). | 3 *(inf)* | 5 | **2** |

## Totals (out of 45)

| Game | Total | Basis |
|---|---|---|
| The Sims 4 | **44** | Sources, with sound inferred |
| Lagos Life | **31** | Sources, with movement, sound and feedback inferred |
| MzansiVille | **16** | Played and code checked at `4900f62` |

## Five biggest gaps, ranked

| # | Gap | Why it matters | Fix size | Owner |
|---|---|---|---|---|
| 1 | Places are empty: 7 of 16 have no actions and most have 1 or fewer per phase | Most taps end in "Nothing here", so there's no reason to explore | M (data plus lines, with little code) | World Designer (design) + Content Writer (lines) |
| 2 | Nobody else is on campus | A campus with no students feels dead, and both rivals are social at their core | M to L (crowd NPCs that wander and sit) | Game Dev |
| 3 | Capsule avatar with no animation | The first thing a player sees on a phone. It doesn't look like a game character | M (Quaternius/Kenney rigged CC0 model plus a mixer) | Game Dev |
| 4 | Silence | No ambience or music, so even good scenes feel flat | S (CC0 files plus a small audio manager) | World Designer (files) → Game Dev (hook-up) |
| 5 | No progression after day 1: the job is broken, and there are no careers, levels or goals beyond the morning | Lagos Life keeps players with careers, rent and promotions. We give no reason to come back for day 2 | M (fix the `job_shift` CSV, add a day goal per phase, and a simple job ladder) | Game Dev + Content Writer |

Also blocking play right now (bugs, not design): the stuck ⚙️ menu (B02), the bestie modal covering screens after the morning, and the spawn at the residence door facing away from campus.

## Sources

- [G] Lagos Life beginner's guide (fan site): https://lagoslifeapp.app/how-to-play
- [B] Bijetic, *Lagos Life review*: https://www.bijetic.com/lagos-life-review/
- [Gu] Guardian Nigeria, *Inside Lagos Life*: https://guardian.ng/technology/inside-lagos-life-the-browser-game-building-a-virtual-nigerian-economy/
- [D] DailyLOD review (may mix in the clone): https://www.dailylod.com/lagos-life-app-review-2026-gameplay-registration-real-reality-check-67
- Lagos Life Terms and independent guide: https://lagoslife.app/terms · https://lagoslifegames.com/
- [P] Prima, The Sims 4 guide: https://primagames.com/eguides/the-sims-4-eguide/living-the-sim-life/introduction
- [E] EA, Whims, Aspirations and Goals: https://www.ea.com/games/the-sims/the-sims-4/news/whims-aspirations-goals
- [S] The Sims 4 Player's Guide (EA, via SimsVIP): https://simsvip.com/wp-content/uploads/2014/08/TheSims4_PlayersGuide_ENGLISH.pdf
- [T] Sims4News, pie menu and autonomy notes: https://ts4news.com/post/92541779757/gameplay-trailer-clarification-autonomy-was/
- [C] Carl's Sims 4 careers: https://www.carls-sims-4-guide.com/careers/
- MzansiVille: `data/campusville/*.csv`, `src/world/avatar3d.js`, `src/main.js` (blip), `docs/qa/QA-REPORT-2026-10-30.md`

Not covered: real Supabase sign-in, days 2 and later, a real phone (I used emulation), and video clips. I found no gameplay transcripts I could fetch.
