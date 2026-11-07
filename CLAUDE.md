# MzansiVille: plan and rules

This file is for Claude Code, the engineer. Cursor reads it too: Cursor is the content designer and owns data/ only. Read docs/team.md and docs/now.md first. Update docs/now.md before you finish.

# GAME INSTALL FIX (owner, 7 Nov). One piece. Push, don't deploy.
Phones name the game "Soft Life" and offer to install it. Manifest (public/manifest.webmanifest): Soft Life: University of Mzansi / Soft Life, scope and start "/", standalone, cream #f4efe4 (index.html theme-color too). Icons: public/icons/ (192, 512, maskable 512, apple-touch 180) from scripts/app-icons.mjs, the website's mark; favicon the same mark.
Where it lives: public/sw.js (network-first page loads, never cached; caches only offline.html + one icon; never touches /assets/, models, audio or Supabase, so stale.js's Updating... reload is unchanged), src/install.js (registerWorker in the built game only, ?sw=1 in dev; beforeinstallprompt kept for our button; installMode prompt/ios/manual/done; appinstalled -> localStorage mzansiville.installed), src/ui/install.js (#/install, also #install), game.js gearMenu (Install Soft Life on top, hidden when done), main.js (install-go, redraw on change). vercel.json: sw.js and the manifest no-cache. vite.config.js BUILD_TAG (optional) tells two builds apart.
Tests: tests/install/install.check.js via playwright.install.config.js (builds, serves like vercel.json, I1-I5 incl. Edge installability and an atomic deploy). Report: docs/sprints/install/report.md. Status (7 Nov): done and pushed, not deployed; 8/8; Lighthouse 11 PWA 100.

---

# SOFT LIFE WEBSITE (owner, 7 Nov). One piece. Push, don't deploy.
A public page in site/ (its own Vercel project; the game and src/ untouched): explains Soft Life in 10 s, Play free / put it on your phone in one tap, the Organt shop. Design: Graduate headings, Figtree body, cream #F4EFE4, ink #1C1915, yellow #F0C400, house colours.
Where it lives: site/build/page.mjs (Vite plugin: renders index.html from data/site/website.json (words, Cursor's), data/campusville/houses.json (pennants; white or ink text, whichever is >= 4.5:1), meta.json phases (slot times), shop.json url (Shop button hidden while empty); QR to the game drawn at build time (qrcode); emits sitemap.xml, robots.txt, share.jpg copied from the game's public/), site/src/site.css (inlined), site/public/ (fonts self-hosted, img/ WebP, favicon, apple-touch-icon), site/scripts/images.mjs (npm run images: the poster from public/cover.jpg + anything in site/img-src/ -> WebP <= 1000 px and a -600 copy), site/README.md (data map, run, deploy). No JavaScript in the page, no cookies, no analytics. brands.email empty hides For brands; next.show false hides Coming next; a missing Organt photo draws a stand-in tee.
Deploy (only on the owner's go): linked from site/ (site/.vercel, ignored), built locally because the build reads ../data: from site/ `npm run build`, `npm run prebuilt` (writes .vercel/output; `vercel build` fails on Windows with EPERM), `npx vercel deploy --prebuilt --prod`. Root Directory in Vercel stays empty. siteUrl in website.json must match the project's address.
Tests: tests/site/site.check.js via playwright.site.config.js (Edge; W1-W6: widths 360/390/768/1440, 44 px targets, focus, images, weight, links, data, reduced motion). Report: docs/sprints/website/report.md.
Status (7 Nov): done and pushed, not deployed; 9/9 checks; Lighthouse mobile 96-99 / 100 / 100 / 100. The Organt photos are in (site/public/img/organt-*). Waiting for the owner's Vercel project.

---

# DAY 1: LEAVING HOME (owner, 6 Nov). Push after each numbered part. Don't deploy until the owner says so. Time-box 4 hours.
1. Fix the stuck fade first: leaving the house on day 1 stuck on "Out the door · UMzansi" (fadeOut with no fadeIn without a caf breakfast, covering the Continue card). Every fadeOut has a matching fadeIn on every path; a test plays day 1 to the end with and without caf breakfast.
2. The home scene replaces the day-1 opening. About 60 s, playable, not a cutscene: wake in your bedroom at your family home; through the window a real street (neighbouring houses, a fence or wall, a tree, a parked car, a neighbour watering a garden, a dog in the yard that follows you). Downstairs a parent and a sibling, a proper home breakfast, one short exchange (the parent says something warm and a little embarrassing; the sibling asks if they can have your room). Your bags by the door.
3. Two home styles from the player's "From" answer: a suburban house with a garden, and a township street house, each with its own street dressing. Styles in a data file so more can be added. The family's look matches the player's chosen look.
4. The neighbourhood never looks empty: at least six surrounding houses, fences, trees, street lamps and a few people. Nothing like a box floating in a void from any of the three cameras.
5. Assets from free CC0 packs, not hand-built boxes: Kenney City Kit (Suburban) glTF (houses, fences, driveways, trees); Quaternius Ultimate Textured Building Pack recoloured to South African palettes for the township. Only CC0; record every pack, source URL and licence in docs/credits.md. glTF, Draco-compressed, everything this scene adds under 2 MB, loaded only for day 1.
6. The drop-off: your parent drives you on a fixed scripted path (never player-driven) through a few streets, a fade, and pulls up at UMzansi's Main Gate. A short goodbye, a hug, the parent hands you money ("for food, not for parties"), the car drives off. You walk through the gate with your suitcase and are guided to your house door, where the normal game begins.
7. The noodles, kettle and shower move to your first morning in res (day 2); from day 2 you wake in your house. A bus stop near the gate with "Bus to town" as the way off campus, ready for Greenway Grocer.
Report: screenshots of both home styles from all three cameras by day, the drop-off at the gate, the size added, and fps before and after.
Status (6 Nov): all 7 parts done and pushed; deployed to production on the owner's go (6 Nov 19:52, main at 05a14ce, with the breakfast chairs and the queue fix). Report: docs/sprints/home/report.md (screenshots, size ~1.15 MB, fps).
Where it lives: src/world/home.js (the home scene: kit loader with Draco, recolouring, the house from furniture-kit walls/floors/stairs, the street, family/neighbours/walkers, the dog, the step machine goTo, the window shot, the drive; reuses camera.js, player.js, input.js); data/campusville/homes.json (styles, From -> style, lines, replies, pocket money); public/models/home/*.glb + public/draco/ built by scripts/home-assets.mjs (credits: docs/credits.md); src/world/dropoff.js (the Main Gate: car path, goodbye card, hug, money, suitcase, roommate at the door; scene.js respawn/paused/updateGuide hooks, main.js mzansi-dropoff-done starts the day); main.js morningWanted (day 1 home, day 2 res morning via run.resMorningDone), endMorning (day 1 -> run.dropOff, run.at gate); ui/game.js morningScreen day-1 branch (view buttons) and the suitcase CTA; the bus stop: places.csv bus_stop, layout PLACE size, buildings.js buildSpecial shelter, activities.csv bus_town, scenes.js busRide side east, main.js go-place greenway after the ride. Tests: tests/e2e/home.spec.js, morning.spec.js (day 2), day1-extra.spec.js (bus, fps).

---

# RETENTION SPEC, ITEM 1: PRESENCE (owner, 4 Nov). Time-box 2 hours, push, redeploy, report, then STOP and wait for the phone verdict.
New spec: docs/design/retention-spec.md, read with the player experience spec. It renames the campus to the University of Mzansi (UMzansi) and sets the build order (section 8).
Item 1 only: other real players visible on the same campus; position and pose broadcast through Supabase a few times a second and interpolated; names and student numbers above their heads; players pass through each other (no collision); nobody ever spawns alone; an "X students on campus" count. Supabase Realtime, not polling. A player closing the tab disappears within 10 seconds. Test with two browsers side by side at phone size and record a video of both. Nothing from items 2 to 7 yet.
Where it lives: src/presence.js (the Realtime channel presence:<room>: broadcast pos 4/s moving, a 2 s heartbeat still, hello/bye, presence leave, 7 s silence = gone; the count; interpolation 350 ms behind), src/world/others.js (the other players' bodies and name + number tags, kept out of collisions and tap picking), crowd.js setFill (Quad students x14-x19 while fewer than 3 real players are online), scene.js crowdSpawn (spawn beside the busiest group of real players, else the Quad; off the bus still the gate), the HUD count in src/ui/game.js. ?room=<name> picks a channel (tests use their own; automation never joins the live campus). Test: tests/presence/presence.spec.js (two phones in one page, video in docs/sprints/presence/).
Student numbers are a stand-in (26 + six random digits per phone, localStorage mzansiville.presence) until item 3 (enrolment) issues real ones from a Supabase sequence.
Status (4 Nov): done and pushed; all 8 presence checks pass (docs/sprints/presence/report.md). Waiting for the owner's phone verdict; nothing from items 2-7.

---

# GREENWAY GROCER (owner, 6 Nov): the off-campus bus stop is now Greenway Grocer (place id greenway, by the gate), an invented green-and-white supermarket. Data: data/campusville/greenway.json (3 shelves, 12 items and prices, portions per pack, recipes for common-room cooking, phone actions, starter fridge). Logic: src/engine/grocer.js (stock, shortfall, useFor, buyItem, mealCost), wired in sim.js (actionState: out of an ingredient or airtime -> reason + greenway; applyAction uses them up; buy()). UI: game.js shopHtml (the shop card), fridgeHtml (your fridge on your house card), "Take me to Greenway" on a short card (main.js go-greenway, buy). World: buildings.js dressGrocer (fascia, awning, windows with shelves, till, green door), rooms.js common-room fridge, layout.js KIND.shop. Home cooking costs nothing at the stove (paid at the shop): a supper ~R24 for +45 Fullness in 2 slots vs the caf R35 for +40 in 1. Tests: sim-check (4 Greenway checks), tests/e2e/greenway.spec.js.

# PIECE 3: TALKING TO EACH OTHER (owner, 5 Nov). Two parts, in order, push and redeploy after each. Time-box 3 hours, report with fps, then STOP.
Part 1, the conversation camera. When the player is within 4 m of another player or an NPC and either taps them or opens a chat, the camera moves to a two-shot: both heads in frame, about 2.5 m back and 1.7 m high, angled across the pair, never inside a body or clipping a wall. It eases in over 0.4 s and returns to the previous view when the conversation ends. This applies in all three camera modes. Fix the current Eye view behaviour where the camera sits at the player's own eye height and frames a torso.
Part 2, player chat. Tapping another player opens their card with Wave, Say hi, Add friend, Report. "Say hi" opens a text box. Messages appear as speech bubbles above the speaker's head, readable at phone size, visible to anyone within 15 m, fading after 8 seconds, and in a small scrollable log. Eight tappable quick phrases plus free text, 120 characters. Filter slurs and strip phone numbers, URLs and social handles. Block hides a player's bubbles and card; report logs to Supabase with the message.
No voice notes.
Part 1 where it lives: src/world/twoshot.js (twoShot: 2.5 m back first, 1.7 m up, angles 14-90 deg off the pair's line, over your shoulder or theirs so their face shows; both head boxes inside the band between the HUD/Goodbye button and the card; free = no building, collider or body; clear = no wall between camera and heads; headOf). scene.js: conversationShot (NPC talk in startTalk's face()), convo/startConvo/aimConvo/endConvo (a real player tapped within 4 m, or the nearest person when the chat opens; re-aimed every 0.5 s if anyone moved; dropped past 5 m), aimCamera (a two-shot, ease: true, eases in over 0.4 s of wall-clock time and back out to the follow view; activity shots chase as before), events mzansi-convo-end / mzansi-chat-open, test hook window.mzansiShot. main.js closePlayerCard(keep) ends the conversation. others.js: tags shrink up close (s >= 0.4), avatarOf. Tests: tests/basics/twoshot.spec.js T1 (NPC, Top/Sims/Eye), tests/presence/talk.spec.js T2 (two phones, Eye view).
Part 2 where it lives: src/chat.js (say: cleanChat, 1.2 s gap and 12 a minute, sendSay; onSay keeps a line only within 15 m of your player and not from a blocked player, filtered again; the log, saidBy for reports; QUICK = the eight phrases), presence.js 'say' broadcast (sendSay/onSay, whereAmI, isHidden), engine/filter.js cleanChat (120 chars; numbers, links, WhatsApp, handles out with reasons; a slur blocks it), src/world/bubbles.js (HTML bubbles over heads, 15 px, within 15 m, 8 s with a 0.6 s fade, one per speaker; just over the head when over the tag is off screen), src/ui/chat.js (the Talk button in #world above Stop, unread dot; the panel on document.body above the game's bottom bar: log, quick phrases, text box, rides up over the phone keyboard; a name in the log opens that player's card with that line), main.js (Say hi opens the chat and keeps the two-shot; Block; Report sends the line or their last few with it; blockPlayer -> mzansi-block), cards.js reportPlayer(id, reason, card, message): report_player with p_message, else the old 4-arg one, else client_errors (kind player_report). Supabase: the "Piece 3" block at the end of supabase/schema.sql (player_reports.message, report_player with p_message) must be run once; until then reports land in client_errors. Test: tests/presence/talk.spec.js T3.

---

# PIECE 1a: THE PLAYER CARD (owner, 4 Nov). Time-box 2 hours, push, redeploy, report with fps, then STOP. (Added to docs/design/build-plan.md before Piece 1.)
Every player has a card, one phone screen, nothing scrolling: portrait in current outfit, name, @handle, student number (placeholder until Piece 1), house name in house colours, Class of 2026, a one-line bio (80 characters, the player's own words), three tags from lists (course, vibe, looking for), year of study, days on campus, badges. Never show age. Tapping another player on campus slides their card up with Wave, Say hi, Add friend, Report; one tap to close; the card loads from Supabase and caches. The bio is filtered on save and on display: slurs blocked; phone numbers, URLs, WhatsApp links and social handles stripped automatically, saying why. The profile page is stripped down: campus notices and NSFAS-type events move to a Notices sheet in the menu; stats go behind a small Stats toggle on your own card; the card opens by default.
Where it lives: src/cards.js (cardOf from the save, VIBES/LOOKING lists, saveMyCard -> Supabase rpc save_player_card, loadCard: cache -> presence -> player_cards, reportPlayer), src/ui/card.js playerCardHtml (one card for yours and theirs), render.js profile() (your card, Edit, Stats panel) and notices(), main.js (Edit/Save handlers, the slide-up sheet, Wave/Say hi/Add friend/Report, pokes), engine/filter.js cleanBio (numbers, links, WhatsApp, handles out with reasons; slurs block), presence.js (card secret, house + compact card in the broadcast, sendPoke/onPoke, hidePlayer), scene.js pick (a tap on a player opens their card; standing still, a player on your own spot wins the tap). Supabase: the "Piece 1a" block at the end of supabase/schema.sql (player_cards, player_card_keys, save_player_card, player_reports, report_player) must be run once in the SQL editor; until then cards still travel with presence. Tests: tests/basics/card.spec.js C1, tests/presence/cards.spec.js C2.

# DOMAIN (owner, 4 Nov): the game is at https://softlifeza.vercel.app (softlife.vercel.app was taken). mzansiville.vercel.app is kept on the Vercel project as a 308 redirect to it (project domain setting), so old links work. The URL lives in index.html (og:url, og:image, twitter:image) and src/config.js PUBLIC_URL (share cards and share links). Deploy as before: `npx vercel deploy --prod --yes`.

# REPO SIZE (owner, 4 Nov): test videos and screenshots (docs/sprints/**/*.webm, *.png) are never committed: they stay on this machine and reports name them by file. History was rewritten without them (git-filter-repo). dist/ is ignored.

# BUILD PLAN (owner, 4 Nov): docs/design/build-plan.md, read with the retention spec. One piece per sprint, in order; stop after each piece for the owner's phone verdict. Done = works on the owner's phone, measured fps reported, nothing earlier broke. No feature outside the current piece (anything else to docs/backlog.md); no movement pass/fail below 20 fps.

# PIECE 0: THE RENAME AND THE HOUSES (owner, 4 Nov). Time-box 4 hours, push, redeploy, report with the measured fps, then STOP and wait. Don't start Piece 1.
Rename Westville to the University of Mzansi (UMzansi) everywhere, including the page title and README; remove real campus names. Replace the residences with the seven houses and their colours: Thekwini (green/gold), Peak (blue/white), Oakwinds (maroon), Braam (blue/gold), Jakaranda (purple), Kingsway (orange/black), Mzansi House (black/gold, the international house). Each house: a common room players spawn in, its colour on the door, banner and student card, the house name on the profile. Keep every other place exactly where it is. Houses in one data file, so adding or recolouring one touches no code. Phone test: every house door opens into the right common room; colours right in sunlight and at night; no old campus name anywhere.
Where it lives: data/campusville/houses.json (the only definition of a house: name, colours, building id + position + kit model, old residence names it takes over); engine/model.js builds the houses' places and houseOf() (an old residence name moves into its house; main.js migrates saves); buildings.js houseLook/houseBanner (tint, sign, banners), campus.js (door colour); rooms.js buildRoom('common', { house }); scene.js enterHouse/leaveHouse (walkable common room: floor taps, boxPath routes, the exit door, Head out / Things to do bar, you spawn in your own; an activity started there steps out and comes back); sim.js: activities with place "house" (house_tea, house_chat, house_tv, house_late) are in every house; render.js houseVars (card stripe, profile chip). Places kept their ids: Thekwini res_o, Peak res_r, Oakwinds res_s, Braam res_other, Jakaranda res_j (new), Kingsway res_k (new), Mzansi House off_campus (by the gate). residences.csv is gone. Tests: tests/basics/houses.spec.js H1 (start in your house; all seven doors; Head out; door prompt back in), H2 (day/night shots).

# GESTURES BY DISTANCE (owner, 4 Nov evening, after the presence phone test; replaces the finger rules in TAP-TO-MOVE below)
"I wanted to look left, it just started moving left" / "I turned to someone and got stuck". Stop tuning thresholds: one frame on a 5 fps test machine is longer than the gesture.
- A finger that moves more than 24 px before lifting is a swipe: it turns the view (Eye view: the student turns with it), never walks. Under 16 px and under 420 ms is a tap: walk there / talk / go in / stop on yourself. A long press that never moves does nothing. No hold-to-walk, no slide-to-steer. HOLD_MS stays 200 ms (input.js) and is left alone; nothing reads it now.
- People are obstacles on the walk grid: while a route is found the cells they stand in are closed (scene.js peopleInTheWay), so routes go round them, not through.
- Every movement test measures fps first (tests/fps.js fpsGate) and is skipped as INCONCLUSIVE below 20 fps; the fps is printed at the top. Basics tests run on the real GPU (touch.js PHONE launchOptions). K15 (walking at someone in the way) is parked in docs/backlog.md; K14 (tests/basics/look.spec.js) covers the gestures.
- The menu and Settings show the phone's frame rate (now, 10 s average, slowest) so the owner can report the real number.
- Sitting and getting up, quicker (owner, 4 Nov: "too slow"): avatar3d.js SIT_MOVE turn 5 rad/s (+0.12 s), lower 0.6 s, rise 0.55 s (were 3 rad/s +0.2, 1 s, 1 s); the step up to the seat 1.4 m/s (was 0.9); bed in/out 0.8 s each (was 1.1) with a 0.15 s pause on the edge. K16 (tests/basics/sit-timing.spec.js) times it: sit-down 2.27 -> 1.42 s, stand-up 1.03 -> 0.56 s. playwright.gpu.config.js runs any test on the real GPU.
- A walk held up for good (pressed against a bench or a counter for 0.5 s) ends as 'stalled', not cancelled (player.js giveUp, used by scene.js), so a walk to someone or somewhere still opens the chat or the place where you stopped. K17 (tests/basics/held-up.spec.js): tap x12 behind a Quad bench, the chat opens.

# TAP-TO-MOVE (owner, 4 Nov): src/world/player.js is the owner's new version (don't rewrite it): walk 2.3, jog 4.0, ramp up 9 / brake 14, turning costs speed, stop() always works. Phones: tap (finger down) the ground to walk there, tap again for a new target, held and slid it steers; tap a person or place to walk there and open on arrival; tap yourself to stop. A red round Stop button bottom right shows while you move (scene.js stopButton): it calls interrupt() and stop(), from any state (scene walks and queue walks end too). No thumbstick; the minimap is back bottom left (above the camera buttons). Walking at something without going anywhere gives up after 0.5 s or 6 frames (scene.js, against). Clip rates follow the real speed (walk cap 3x, run 4.5x; the run clip from 2.9 m/s, RUN_FROM in avatar3d.js). Tests: K1 (taps), K12 (Stop), K13 (tap behind the stage) in tests/basics/stop.spec.js; WASD K11b.

# CURRENT SPRINT: MOVEMENT TRANSPLANT (owner, 2 Nov). Time-box 2 hours. Push after each rule. Report lines removed from scene.js and K-results, then STOP and wait.
Read docs/reference/softlife/{player,input,camera,engine}.js: a 650-line movement core from a prototype that feels clean on a phone. Make MzansiVille's movement work the same way. Nothing new; this is removal and simplification. Rules, in priority order:
1. Exactly one pause condition. Player movement pauses only while a card or sheet is open (talk, place card, event, map, summary). Delete pad.lock, the ps.open gate on input.stick(), and every other lock on movement. Actions, scripted moves, snaps, tours and pending actions never block the stick or ground taps; stick input cancels them instead.
2. Player.update has two inputs: stick, then tap target, else idle. Stick wins and clears the target. Target speed min(WALK, max(1.2, d*4)), arrive at d < 0.2, heading lerps toward travel direction at dt*12. If a frame moves the player under 0.5 mm toward a target, drop the target (never walks in place).
3. Collision: per-axis slide (try X, then Z) against the existing colliders as plain axis-aligned boxes. Sliding along walls beats millimetre precision; log any regression in backlog, don't fix now.
4. Tap: pointer up within 16 px and 420 ms of pointer down, nothing else. Marker or person out of range: walk there and remember it; open on arrival. Tap self: stop. Remove camera drag on touch; keep pinch zoom.
5. Actions (act-bar): don't pause movement. Walking away cancels the action.
6. Structure: player movement in src/world/player.js (under 250 lines), pointer and keys in src/world/input.js (under 120). scene.js only wires them.
7. tests/basics K1-K8 must still pass touch-only. Add K10: open and close every card type, then confirm the stick moves the player within 100 ms.
Status (2 Nov): done and pushed; K1-K10 all pass (docs/sprints/basics/report.md, last section). Waiting for the owner.
Where it lives: src/world/player.js (createPlayer: stick, route target, per-axis slide, pace), src/world/input.js (bindInput: taps, pinch, keys, stick read); in scene.js paused() (the one pause: a visible [role="dialog"] or the map), interrupt() (the stick or a tap cancels actions, scripts, seats, walks), tapped() (picking), walkTo() (grid route ending exactly at the spot), blockedAt() (AABB colliders). K10: tests/basics/cards.spec.js.

---

# CORE REBUILD + BASICS (owner, 1 Nov). FEATURE FREEZE. Crowds is paused.
Owner's verdict: we are going in circles. Code review findings:
1. No thumbstick on phones: the stick is keyboard-only (interact.js). Phone players can only tap.
2. Controls are locked by six separate flags in scene.js (map open, actionLeft, acting, talk, pendingAction, the tour). If any one sticks, ground taps are silently ignored while the HTML gold markers still work. That is the "can only walk by tapping the yellow circle" bug and the frozen grey-bar bug.
3. Tests don't play like a player: movement is driven by window.mzansiSteer, mzansi-walk-to and other hooks (43 window.mzansi* hooks). No test does a real touch tap or drag, so tests pass while the phone fails.
4. scene.js is 2,100 lines with 61 top-level variables; fixes in one place break another (the queue now serves the player and an NPC at the same time).

FEATURE FREEZE until the basics checklist below passes on the owner's phone. No new content, places or systems.

CORE REBUILD (push after each step):
1. ONE PLAYER STATE: replace the six lock flags with one state machine in its own module (src/world/player-state.js): free, walking, running, queueing, talking, doing, seated, sleeping. Every state has one exit back to free. In any non-free state the screen shows how to leave it (Leave queue, Goodbye, Stand up). Watchdog: if the player is in a non-free state with nothing happening for 3 s, return to free.
2. PHONE CONTROLS: a thumbstick bottom-left on touch devices (move the minimap top-right, under the goal chip). Push a little = walk, push fully = run, let go = stop. Tap the ground anywhere = walk there; tap again = change course; touching the stick or tapping yourself = stop instantly. Keyboard: WASD, Shift to run.
3. ONE QUEUE SYSTEM for every counter (Cafeteria/Auntie Pinky, Mam' Gugu, any future counter): one ordered line, one person served at a time, first come first served, nobody cuts in. The player joins at the back and is served within 30 s.
4. ARRIVING: walk to a place and stop facing it. No slant, no shuffle.
5. TESTS THAT PLAY LIKE A PERSON: new tests in tests/basics/ use only real touch input (touchscreen taps and drags on the canvas and buttons). window.mzansi* hooks may be used only to READ positions for measuring, never to move anyone or trigger anything.

BASICS CHECKLIST (touch-only tests, normal speed, a video each in docs/sprints/basics/):
K1. Thumbstick: walk a circle around the Quad, run across it, let go: you stop on the spot.
K2. Tap 5 ground spots in a row, including mid-walk: you change course each time. Tap yourself: you stop.
K3. Tap the Quad from the cafeteria: you jog there and stop facing it, no slant.
K4. Talk to 5 different people: the chat opens within 1 s, every reply leads somewhere, and after goodbye the stick works immediately.
K5. Cafeteria with 4 NPCs queueing: join the back, one person served at a time, you're served within 30 s, buy, sit, eat, stand up and walk away.
K6. Sit on a Quad bench and stand up; sleep in your bed and get up.
K7. Camera in Top, Sims and Eye: nothing (signs, menu boards, walls, trees) blocks the view of the player; heads in frame.
K8. 10 minutes of random real taps and stick moves across campus: the controls never lock for more than 3 s.
K9. No mirrored or upside-down text anywhere (the taxi rank numbers are currently inverted).

Deploy to mzansiville.vercel.app, then STOP and report with the K1-K9 videos at the top. The owner tests the same nine on his phone. Nothing new is built until all nine pass for him.

---

# ONE FOCUS PER SPRINT (owner's standing rule, from the Actions sprint on)
Each sprint has one focus. Any problem noticed outside the focus (bodies, feet, sitting posture, crowds, looks...) goes into docs/backlog.md as a one-line description. Do NOT fix it during the sprint.

# CURRENT SPRINT: ACTIONS (owner, 31 Oct). Only actions. Finish, push, then STOP and report. Don't start the next focus.
Every promise and every button must lead to something happening. Judge only THAT it happens, not how good the body looks while doing it.
1. Every conversation reply leads to an action or clearly ends the chat:
   - "Walk away" ends the chat and the player walks a few steps away.
   - "Let's go get something to eat" -> both walk to the cafeteria, queue, buy, sit at the same table and eat.
   - "Let's study", "Sit with them", "Walk with me", "Swap numbers": the NPC comes with you and you do it together, or the number appears in your phone.
   - Go through every reply in people.json and every lecture/morning choice. Each one leads to a visible action, a result, or a clear goodbye. List them all in the report with what each one does.
2. Queue then order: tapping Auntie Pinky or Mam' Gugu walks you to the back of the line; the line moves; at the front her order card opens. Tapping her from outside the line: "Back of the line, baby!" and you join it.
3. Every button and tap target leads to a sensible result. Re-run the UX audit and fix any dead end.
FINISH LINE (412x915, taps only): A1 "Walk away" ends the chat and the player moves off. A2 Talk to a student -> "Let's get something to eat" -> both walk to the cafeteria, queue, buy, sit together and eat. A3 Talk to a student -> "Let's study" -> both go to the library and study. A4 "Swap numbers" -> the contact appears in your phone. A5 Tap Auntie Pinky -> back of the line -> front -> order -> pay -> sit and eat. A6 The full list of conversation replies and what each does. A7 UX audit: zero dead ends.
Save normal-speed screenshots for A1-A5 in docs/sprints/actions/ plus report.md, and push.
Status: the Actions sprint is DONE and pushed. Report: docs/sprints/actions/report.md (A6 list: replies.md, A7 audit: ux-audit.md). Wait for the owner's next focus; don't start one. Someone coming along with you: startCompanion in src/world/scene.js; reply acts in people.json (act field) and crush-arc.js.

# CURRENT SPRINT: MOTION (owner, 31 Oct). Only motion. Finish, push, then STOP and report. Out-of-focus problems go to docs/backlog.md.
GOAL: every body moves, stands, sits and lies like a real person, the player and all NPCs, in every scene.
1. FEET on top of the ground, never in it; walk/run animation speed matches movement speed (no sliding); smooth turns, no snapping.
2. SHOES on every outfit, player and NPCs.
3. SITTING: hips on the seat, feet on the floor, back to the backrest; never inside a chair, bench or table (Quad benches, caf chairs, terrace tables, lecture benches, library, res desk chairs).
4. LYING on top of the mattress; natural into and out of bed (no zombie arms, no T-pose).
5. COLLISIONS: nobody walks through walls, doors, beds, tables, chairs, counters or other people.
6. NOBODY FROZEN: standing plays idle, walking walks.
7. From the backlog: a friend walks beside you; walks back after an activity; never show the blocky stand-in while a model loads.
TESTS: automatic checks (foot vs ground, hip vs seat, body vs mattress, no overlaps) + normal-speed Playwright videos per journey.
FINISH LINE (412x915, normal speed): M1 Quad walk 20 s; M2 sit on Quad bench, caf chair, lecture bench, library chair; M3 bed, sleep, get up; M4 walk into wall, bed, table; M5 eat together (beside you, sits, walks back); M6 every outfit has shoes; M7 crowded Quad 30 s. Save screenshots + videos in docs/sprints/motion/ with report.md, push, STOP.
Status: the Motion sprint is DONE and pushed (M1-M7 all pass). Report: docs/sprints/motion/report.md. Wait for the owner's next focus; don't start one. Where motion lives: src/world/avatar3d.js (gait calibration and clip rate, carryFeet, live sole points, fitSeat, liePose/layDown, slump, mzansiBodies test hook), companion/returners/hitsSolid in src/world/scene.js, room furniture blocks in src/world/rooms.js, boxPath in src/world/nav.js. Motion tests: tests/e2e/motion.spec.js with --workers=1.

# MOTION, ROUND 2 (owner, 1 Nov): done (docs/sprints/motion2/report.md). Motion and camera framing of bodies only. Everything else goes to docs/backlog.md.
The owner played it: motion does NOT pass yet.
1. SIDEWAYS MOONWALKING: the body never moves more than ~15 degrees from where it faces. On sharp turns, slow down or turn on the spot first. Player, NPCs and friends.
2. FEET: every person's soles on the ground at all times, including NPCs far from the camera.
3. STAIRS: walking up and down the lecture venue steps, feet land on each step. No sinking into steps.
4. TRANSITIONS: sitting down, standing up, getting into and out of bed, and showering use real animations with feet planted. Sitting is unhurried: approach, turn, lower onto the seat. No floating, no spinning in the shower (shower animation, or a short fade with the sound of water).
5. ARRIVING: walking to a tapped place, especially in Eye view, goes straight there and stops cleanly. No drifting, no sliding away on arrival.
6. TAP PRECISION: tapping a place takes you exactly to it: Mam' Gugu's tuck shop -> the back of her queue; the Quad -> the Quad. Only taps clearly beside a place go elsewhere.
7. COLLISIONS: outdoor furniture and doors too. The bus stop bench is a seat (walk up, sit or stand beside it), doors open before you pass, nobody clips through frames.
8. HEADS IN FRAME: whenever the camera frames people (talking, sitting, studying, eating, the lecture), all heads fully visible in every view, especially Eye. The camera is never inside a head, a tree or a wall. Fix the bench shot where a seated student looks headless.
AUTOMATIC CHECKS every frame: crab angle < 15 deg while walking; soles within 2 cm of ground or step for everyone visible; sit/stand/bed/shower transitions: feet move < 3 cm, no unanimated rise or spin; arrival within 0.5 m of the tapped target, no sliding after stopping; head box fully inside the view in every framing shot, in Top, Sims and Eye.
FINISH LINE (412x915, normal speed, a video for each, all videos at the top of report.md): M1 zig-zag across the Quad with sharp turns, no sideways sliding. M2 up and down the SMIG steps, feet on each step. M3 into bed, sleep, get up, shower: natural and planted. M4 sit and stand at a caf chair, library chair, Quad bench and the bus stop bench: unhurried. M5 Eye view, tap Mam' Gugu's tuck shop: straight to the back of the queue, stop cleanly. M6 through the res door and a lecture venue door: the door opens, no clipping. M7 a conversation, studying and eating, each in Top, Sims and Eye: all heads visible.
Save everything in docs/sprints/motion2/, push, then STOP and report.
Owner's rules added mid-sprint: time-box 30 min per item (log what was tried in docs/backlog.md, move on); push after every item; one line after each item (done / next); sitting, standing, bed and shower should use real CC0 clips (Quaternius UAL) with the seat placed under the clip's hips and only small foot-locking on top.
Status: Motion round 2 is DONE and pushed. Report: docs/sprints/motion2/report.md (13 of 14 checks pass; the Quad bench foot slides ~11 cm, logged). Wait for the owner's next focus. Where it lives: turn-first walking in poseAvatar (avatar3d.js); floor map src/world/floor.js (campus paths/plaza/deck, lecture steps); planted sit/stand (startSitMove, sitMotion, sitBetween, legTo) and the UAL clip trial (clipSit*, ?sitclips=1) in avatar3d.js; per-frame recorder window.mzansiRecord; heads check window.mzansiHeads; tests tests/e2e/motion2.spec.js (--workers=1).

# MOTION CLOSE-OUT (owner, 1 Nov, after the reliability item). Fix these before Motion is locked:
1. TOO SLOW: a brisk walk (about 1.6-1.8 m/s) with the walk animation sped up to match; a jog (jog animation) for trips longer than ~15 m. Feet must still not slide. Keep Skip for long trips.
2. EVERYTHING SOLID: the player and NPCs still walk through benches, tables and other solid objects. Every solid object gets a collider: all benches, tables and chairs (caf, terrace, library, Quad), stalls, counters, the stage, speakers, bins, trees, lamp posts, signs, walls and the bus shelter. Walk around them, never through. A test walks the player into every object type and checks no overlap.
3. LEFT LEG TWISTS: the player's left leg keeps twisting (likely the foot-planting correction fighting the animation). Find it, fix it, and add a check that knee and foot angles stay natural (no twist beyond normal range) while walking, standing, sitting and getting up.
4. LEFTOVERS: the Quad bench foot slide (11 cm); NPCs kneeling on Quad benches; the old blocky character flashing on the creator before the real model loads (show a loading shimmer instead).
Video for each fix at normal speed in docs/sprints/motion2/closeout/, push, then STOP and report. Don't start the next focus.
Status (1 Nov, end of session): items 1-4 done and pushed. Checks: tests/e2e/closeout.spec.js (K1-K5, one worker), videos and screenshots in docs/sprints/motion2/closeout/.
- 1 Walking pace: DONE. A 1.75 m/s walk up to 15 m, a jog (run clip, slower) from 3.4 up to 4.5 m/s past 15 m, place actions too (paceFor in src/world/scene.js); Skip kept. K1: walk stride matches the ground (median 0.99), jog median 1.0. Left: nothing (the walk-to-jog blend is briefly off, worst 0.44, for a moment).
- 2 Everything solid: DONE on campus, in activities and in rooms. Colliders are built from every mesh's own shape between shins and head (src/world/colliders.js): benches, tables, chairs, stalls, counters, stage and step, speakers, mic stand, bins, plants, tree trunks, lamp posts, sign posts, SRC tables, walls, plus an activity's props and a room's furniture. The collision pass (src/world/bodies.js) pushes every standing person out of them and keeps people 0.5 m apart. K2: the stick into every kind, 0.9 cm at most; C1/C2: crowds and queues, nobody under 0.5 m, nobody inside anything. Left: the morning scene (res room, bus shelter) and the lecture hall have no collision pass; they're scripted paths, checked by M4b (never through the bus bench) and M6 (doors).
- 3 Left-leg twist: DONE. The rig's knee/foot IK targets aren't run by three.js; the left knee was ~50 degrees out and the foot ~64. aimKnees/aimFeet in src/world/avatar3d.js aim every knee ahead and keep feet within a 15-degree toe-out, for everyone. K3: knees within 6.3 degrees, feet within 15, walking, standing, sitting down, seated, getting up. Left: nothing.
- 4 Leftovers: Quad bench foot slide 3.1 cm (accepted by the owner; was 11-13 cm: the model's rest pose is mid-stride, feet now plant side by side). NPCs kneeling on benches: was the left-leg twist, fixed (K4). Creator: a loading shimmer, never the flat drawing (K5).
- Not run: the full test suite (only closeout, motion2 and the reliability tests). motion2 M2 stairs can catch one frame of a toe on the first step (backlog).

# RELIABILITY (owner, 1 Nov): the game must never get stuck on an empty field.
1. Find the cause (hot reload during play? the player off the campus? the campus failing to build?). 2. Self-recovery: a watchdog checks every few seconds that the campus is built and the player is on the map; lost -> respawn at the nearest place; the scene failed -> "Something went wrong. Tap to reload" (save kept). 3. Error reporting with screen, step and device to a log the owner can read (Sentry free tier or a Supabase table). 4. A stable play link: deploy the latest tested build to Vercel as a preview; the owner tests there, not on localhost.
Status (1 Nov):
- 1 Cause: DONE. An activity that hit an error inside a room (rooms are built off the map) left the player where the room had been once it was cleared: an empty green field, a blank minimap. A hot reload during play reloads the page and the campus comes back (tested), so it was not the cause on its own. Checks: tests/e2e/reliability.spec.js R1-R4, screenshots in docs/sprints/reliability/.
- 2 Self-recovery: DONE. After any activity you're put back at the place if you're off the map (backOnCampus); the watchdog (every 3 s) checks the campus is built, the player is on the map and the frame loop is alive, respawns a lost player at the nearest place, and otherwise shows the reload card (the save is kept). A frame that keeps failing shows the card too.
- 3 Error log: DONE (the client_errors table now exists in the new Supabase project). src/errors.js records every error (kind, message, stack, screen, step, device, build) on the phone (Settings > Error log, #/errors, with Copy) and sends it to the Supabase table client_errors. That table does not exist yet: run the client_errors block at the end of supabase/schema.sql once in the Supabase SQL editor. Only admins can read it.
- 4 Stable play link: DONE. https://mzansiville.vercel.app (Vercel project mzansiville, account lloydngunze012-7451, Supabase keys set as Vercel env vars for production and preview). Not linked to GitHub yet (Vercel's GitHub app has no access to the repo), so deploy by hand after a tested push: `npx vercel deploy --prod --yes`. Supabase project (Frankfurt) is set up: schema.sql + seed.sql run, owner is admin; keys in .env (never committed).

# START HERE (handoff for a new session, 31 Oct 2026)
State: Sprint 1 is DONE and pushed (up to 3d7a85b). Report and screenshots: docs/sprints/sprint1/report.md. Do NOT start Sprint 2 until the owner sends it; wait for the owner's next message.
Every list below is finished (newest first): Sprint 1 completion, speed rules, owner + player test (items 1-7), the Quaternius list (items 1-10, spec section 7 a-h), and the earlier plans. Only the "ON HOLD" item (off-campus residence names) and the "Still open" notes in the sprint report remain.

How to work (owner's standing rules): work on main; commit and push after each fix; after each push reply with three lines (what changed / what to test on my phone / what's still broken); look-test at 412x915 from the player's camera and fix what you see; tests use ?fast=1 (src/speed.js); run only the tests that touch a change, the full suite once at the end of a sprint (npx playwright test --config playwright.edge.config.js --workers=2; 3D tests time out at 4 workers); re-run only the UX-audit screens you fixed (AUDIT="Screen,Screen"); journeys at normal speed: tests/e2e/journeys.spec.js; sim checks: npm run check.

Where things live:
- Course venues and lecturers: src/venues.js. Lecture scene: src/world/lecture.js. Morning (alarm, breakfast, bus-stop meet-cute): src/world/morning.js.
- Campus world, camera, talk shots, walking, map go-there and Skip: src/world/scene.js. In-world map: src/world/map.js. Places, queues, terrace tables: src/world/dress.js. Crowd: src/world/crowd.js.
- Activity scenes (queueOrder, orderEat, sitTogether, consult, study, sleep, wakeUp...): src/world/scenes.js; Quad scripts (flyers job shift): src/world/activities.js. Characters: src/world/avatar3d.js, src/world/cast.js. Creator 3D icons: src/ui/thumbs3d.js.
- Talk actions (order menus, consult, sit, study, swap numbers): src/engine/talkactions.js, src/menus.js; talk UI in src/ui/game.js; handlers in src/main.js.
- Story systems: src/engine/goals.js (day goals, right-now chip, dream), src/story.js (creator part 2), src/crush.js + src/engine/crush-arc.js, src/engine/identity.js, src/engine/dayend.js (summary, cliffhanger texts), src/engine/moments.js (10 random moments), src/engine/arcs.js (roommate, rival, money, lecturer, SRC, home), src/engine/friday.js (week, Friday test).
- UX audit: tests/e2e/ux-audit.spec.js, docs/qa/ux-audit-2026-10-31.md.

# SPRINT 1 COMPLETION (owner, after the player test). Finish these, then STOP (no Sprint 2).
Confirmed working by the owner: course venues, map walking, the Law lecture, Pinky's order flow, creator icons, bus-stop facing.
1. QUEUE THEN ORDER: no ordering from Auntie Pinky or Mam' Gugu without queueing. Tapping her (or "Food queue") walks you to the back of the line; the line moves; at the front her order card opens automatically. Tapping her from outside the line: "Back of the line, baby!" and you join it. Merge "Stand in the breakfast queue" into this flow.
2. SIT AND EAT, VISIBLY: after "Sit and eat", walk to a free table, sit (hips on the seat, feet on the floor), the food appears on the table, eat for a few seconds, then stand. "Take it to go": walk off eating.
3. REMAINING VERBS, each visible and working: STUDY (library desk or grass, book open), WORK (the shift shows the job), HANG OUT (Sit with them: both sit and chat; Study together; Swap numbers -> phone), SLEEP (lie in bed at night, wake next morning naturally), lecturer consultation (+Grades).
4. LECTURE SEATS: other students in the lecture hall sit in the benches, not standing between them.
5. WALK TIME: if a walk across campus takes more than 15 s on a phone, speed up the walk or make "Skip there" the default for long trips.
FINISH LINE (412x915, taps only, NORMAL speed screenshots): J1 Law student gate -> Law lecture. J2 Map -> Cafeteria, sheet on arrival. J3 Tap Pinky -> back of the line -> line moves -> front -> bunny chow -> pay -> Sit and eat -> table -> eat -> stand. J4 Quad: talk to a student -> Sit with them -> both on a bench chatting. J5 Library: study at a desk. J6 Night in res: bed, sleep, wake next morning. J7 Job shift visibly worked.
Save 3-4 normal-speed screenshots per journey in docs/sprints/sprint1/ (J1-1.png...) plus report.md, push, then STOP and report.

# SPEED RULES (owner, from now on)
1. Tests run with ?fast=1: animations, walks and timers run 10x faster (src/speed.js). Use it for all e2e tests and audits.
2. After each fix, run only the tests that touch what changed. Run the full suite once, at the end of the sprint.
3. Don't re-run the full UX audit after every fix; re-run only the screens you fixed (AUDIT="Screen,Screen").
4. Commit and push after each fix, not in big batches, so the owner can test in parallel.

# CURRENT LIST (owner + player test, 31 Oct). Look-test each at 412x915, push after each, don't stop for review.
The rule: every tap must lead to a visible, sensible result, and every option must make sense for why it exists. If a tap does nothing, that's a bug.
1. COURSE DECIDES YOUR LECTURES. Each course has a home venue: Law -> Law; Accounting, Information Systems, Management, Marketing -> SMIG; Computer Science, Science -> Science; Engineering -> Engineering; Medicine, Nursing -> Health Sci. The day goal, the route, the "Lecture in 15 min" chip and the glowing marker point only to the player's venue. Each venue has its own lecture scene and lecturer. Other venues stay open as an optional "sit in".
2. MAP = GO THERE. Tapping a place on the map closes the map, returns to the 3D view, and the character automatically walks there. On arrival the place sheet opens. A Skip button can jump straight there (time passes).
3. CONVERSATIONS LEAD TO ACTIONS. Talking is a doorway to doing:
   - Auntie Pinky / Mam' Gugu: ordering in conversation ("Bunny chow please" -> "Quarter or half?") offers the real items with prices. Picking one pays from your money, she hands it over (visible), then: "Sit and eat?" -> walk to a table, sit, eat. Or "Take it to go."
   - Lecturer: "Can I ask about chapter one?" -> a short consultation that raises grades.
   - Students: replies can lead to "Sit with them", "Study together", "Swap numbers" (adds them to the phone).
   Every chat ends with either an action or a clear goodbye, never a dead end.
4. BODIES ON THE WORLD: feet on the ground (no sinking), hips on the seat (no sinking into cafeteria chairs or benches), no one frozen mid-stride: standing people play idle, walking people walk. In the meet-cute the two characters face each other while talking. Fix the wake-up so getting out of bed looks natural, not like a zombie.
5. QUEUES ARE LINES: one straight line facing the counter, evenly spaced. The front person is served and leaves, everyone shuffles forward, and the player joins at the back.
6. CREATOR ICONS: render the outfit, hair and body icons from the actual 3D models so they match the game, and frame them so no head is cut off.
7. UX AUDIT: play a full day as a new player on a phone. List every button and tap target, what it does, and whether the result makes sense. Fix every dead end. Include the list in your report.

# MAIN DIRECTION: docs/design/player-experience-spec.md
The player experience spec is the main direction for the game. Every scene follows its section 6: choices not chores, people not menus, show don't count, every day ends on a cliffhanger, every day changes the player, the ten-second test. Build order is its section 7.

# CURRENT LIST (owner, 31 Oct, after the Quaternius characters). Push after each item, no stops, look-test each at 412x915 from the player's camera.
1. CHARACTERS WEAR REAL CLOTHES. The new characters look like mannequins: the "hoodie" is just colour painted on a muscular body, and they're barefoot. Use character models with actual modelled clothing (hoodies, shirts, jackets, dresses, skirts, shweshwe, the Organt 031 tee), shoes, and real hairstyles, e.g. Quaternius modular character packs (CC0). Vary body shapes: not everyone gets the same athletic build. Compare with docs/benchmark/lagoslife/02 and 07. Also fix the T-pose when lying in bed.
2. SITTING: people sit ON benches and chairs, not inside them. Fix seat height and position for every sit animation (Quad benches, lecture seats, cafeteria tables, bed).
3. CREATOR ON PHONE: the 3D preview spans the full width at the top; the student card goes below it. No empty space.
4. NAME TAGS: smaller, and scaled down when close in Eye view. Never bigger than the person's head.
5. The floating yellow "!": explain it (tapping shows what it means) or remove it.
6. LECTURE MUST NEVER BE SKIPPED: Map > SMIG > "Attend lecture" just changes stats and jumps the clock. Any way of attending the day-1 lecture (walking in, the map, the place sheet) must open the 3D lecture scene. After it, remove "Your lecture is at SMIG".
7. TAPPING: ground taps walk; only a direct tap on a person starts a conversation. Add a test that walks from the gate to SMIG by tapping the path and enters the lecture.
8. CAMERA: conversations and morning shots frame people fully, head to feet. No giant blurry heads (the kettle shot), no cropped characters (the bed shot).
9. MORNING CHORES: replace "Head out", "Walk to the bus stop" and "Get on the bus" with one choice: Skip to campus / Walk to the bus. Make the bus stop the crush meet-cute (spec section 5, 4:30).
10. THEN FOLLOW THE SPEC, section 7, in order: a. goal ladder, b. creator part 2, c. crush arc days 1-5, d. identity paths and card title, e. day summary and cliffhanger text, f. 10 random daily moments, g. the other arcs, h. days 1-5 each with a goal, Friday test payoff.

Status: items 1-10 done and pushed (up to b373434). Where things live: src/engine/goals.js (day goals, right-now chip, year dream), src/story.js (creator part 2), src/crush.js + src/engine/crush-arc.js (crush), src/engine/identity.js (paths, titles), src/engine/dayend.js (summary, cliffhanger texts, run.inbox), src/engine/moments.js (10 random moments), src/engine/arcs.js (roommate, rival, money, lecturer, SRC, home beats), src/engine/friday.js (day themes, week goal, Friday test). Random moments and story beats are off under automation (navigator.webdriver) unless the URL has ?moments=1.

---

# CURRENT LIST (owner, 31 Oct): do NOT stop for review. Push after each item.
Every item must pass a look-test on a phone-sized screen (412x915): screenshot it from the player's camera and check it's clearly visible.

1. TALK TO ANYONE (now, first)
Tap any person (students, vendors, lecturers, SRC campaigners, roommate) and a conversation opens: their name, a short line, 2-3 replies. Replies change Social and closeness. People remember you; the second chat differs. Write at least 10 student characters with names and personalities, plus Mam' Gugu, the cafeteria auntie and the lecturer.

2. EVERY ACTIVITY IS VISIBLE, EVERYWHERE
- Build reusable scenes (queue and buy, sit and eat, sit and read, study at a desk, watch, chat, exercise, work a shift, sleep) and map ALL 108 actions in activities.csv to one. No action may play as a blank progress bar.
- During an activity, move the camera close (over-the-shoulder) so the player clearly sees it: the queue, the vendor, the vendor handing over the food, the character eating.
- The result text must match what happened (vetkoek, not kota).

3. MORNING CHOICES
Every morning offers real breakfast choices: noodles in res, the tuck shop on the way, the cafeteria on campus, or skip and walk hungry. Each has a different cost, time and effect.

4. PHONE LAYOUT AND QUALITY
- Character creator on phone: the 3D preview shows the full character, head to feet, never cropped. Rework the layout for portrait phones.
- Cover image: no heads cut off at the top on phones (adjust object-position, or show the full image).
- The Organt outfit must show the '031 ORGANT' print on the 3D tee, like the cover.

5. CHARACTERS THAT MATCH THE COVER
Replace the chibi Kenney minis with normal-proportion low-poly characters, like Lagos Life's (docs/benchmark/lagoslife/02 and 07). Use Quaternius's free CC0 character packs (rigged, with walk, idle, sit and talk animations). Keep all creator options: gender, skin, body, hair, outfits including Dress, Shweshwe and the Organt 031 tee.

Report at the end with phone screenshots for each item.

---

# TOP PRIORITY (owner review after the Quad and cafeteria): above Part 3

NEW RULE: TEST WHAT IT LOOKS LIKE, NOT JUST WHETHER IT WORKS
After every change, play it in the browser from the player's view, take screenshots, and LOOK at them before pushing. Check each one for:
- anyone walking through tables, chairs, doors, walls or other people
- the camera inside an object or a person
- labels or building names showing through buildings
- anything cut off at the screen edge
- an action that's just a progress bar instead of something happening
Fix what you find. In your report, list what you checked and what you fixed.

1. TALK TO ANYONE
Every person in the game is tappable: students, vendors, lecturers, SRC campaigners, the roommate. Tapping opens a conversation with their name and a few lines, and 2-3 replies to choose from. Choices affect Social and how well you know them. People remember you: the second conversation is different from the first.

2. ACTIVITIES ARE ACTIONS YOU SEE
Every activity shows the character doing it:
- Buying food: walk to the queue, stand in line behind other students, move forward, reach the front, the vendor hands you the food, you walk away eating.
- "Sit and read": walk to the grass, a bench or a library table, sit down, open a book.
- Same idea for every activity: eating sits at a table, the busker plays while you watch, the open mic has someone performing.
The progress bar can stay as a small timer, but the character must be doing the thing.

3. REALISM AND LOOK
- Collisions: nobody walks through tables, chairs or walls. In the lecture hall, walk around the desks. At the residence, the door opens before the character walks through.
- Campus surroundings: no ocean around the campus. Replace it with roads, grass, trees, a perimeter fence, parking lots, a taxi rank and the town edge, like a real SA campus.
- Every building looks different: shape, colour, height, signage, entrance. Use Kenney/Quaternius building kits so the library, SMIG, the residences, the cafeteria and the sports centre are recognisable at a glance.
- Labels: building names must never show through buildings. Only show labels for nearby buildings or your destination, and hide labels that are behind something.

4. QUAD AND CAFETERIA (compare against docs/benchmark/lagoslife/02 and 05)
- When arriving at or opening a place, show a wide 3/4-angle establishing shot so the whole place reads at a glance.
- Night needs real contrast: darker ground and sky, bright pools of light under lamps and string lights, glowing windows, a spotlight on the stage.
- People doing things: a performer at the open mic, a queue at Mam' Gugu's stall with her serving, students on benches, SRC campaigners at their tables in ANC-, EFF- and DA-aligned colours, a queue at the cafeteria counter with the auntie serving.
- Pull the cafeteria eye-view camera back so the menu board is fully visible.

ORDER: 3 (collisions, labels, surroundings) first, because they make everything look broken. Then 2 at the Quad and cafeteria, then 1, then the rest of 4. Push after each, and stop for my review after item 2 at the Quad.

STATUS: item 3 done (a83cd63). Item 2 done at the Quad (all 12 Quad actions play as scenes, src/world/activities.js). Waiting for the owner's review; next is item 2 at the cafeteria, then item 1.

---

# Plan 2 (current): owner feedback and next plan

Save all of this to CLAUDE.md, then work through it in order. Push after each item, with the usual three lines: what changed, what to test on my phone, what's still broken.

LAUNCH TARGET
Day 1 fully playable, then a 5-day week where each day has a goal, real choices, and reasons to come back tomorrow. Everything below serves that.

GOLDEN RULES
- Every tap shows movement or something happening, never just a progress bar and numbers.
- Never force a path: every scene offers another way through.
- Every prompt leads to a choice, never just information.

PART 1: BUGS
1. The character in the world doesn't match the creator (wrong skin, outfit and gender). Trace whether creator choices are saved to run.character.avatar and used in the morning, campus and lecture. Note the rebuild key in src/world/scene.js (~line 478) ignores gender and body. Test: create a female in a dress with dark skin; she must look identical in every scene.
2. Students walk into and stand inside the player. Add avoidance and personal space for everyone.
3. Speech bubbles close too fast. Every line stays until the player taps, with a small "tap to continue" hint.
4. Breakfast isn't forced: when the noodles are gone, add a third option, "Walk to the bus hungry".
5. Eye view: the camera is inside the player's head. Move it forward and hide the player's own head and hair.
6. Lecture hall: brighter, with camera angles on the lecturer and board, not chair backs. Dark only during load shedding.
7. B01: the job pays R0.
8. Sipho needs his own morning lines, not Zanele's with words swapped.
9. Arms stick out while lying in bed in the morning.

PART 2: DESIGN, EVERY PLACE UNIQUE
Use free CC0 asset packs (Kenney, Quaternius) for buildings and props. Each place gets a signature look:
- Cafeteria: tables, serving counter, a queue, a menu board.
- Quad: grass, benches, trees, vendor stalls, music, students hanging out.
- Library, sports centre, lecture venues, residences: each recognisable at a glance.
SRC campaigners at the Quad in ANC-, EFF- and DA-aligned party colours, no official logos. All represented equally, each with funny but fair lines, none made the villain.

PART 3: RETENTION
1. Conversations: tap any student to talk. Short dialogues with choices that affect Social and friendships.
2. Voice notes: WhatsApp-style voice notes from the roommate and classmates. Use text-to-speech for now, built so real recordings can replace each one later.
3. Decision prompts. Each one has a deadline (tonight, tomorrow, Friday), 2-3 options where none is free, and a consequence that shows up later, not instantly. Save choices so later events can reference them ("You skipped Zanele's birthday..."). Write 10 for the first week, for example:
   - "Grades slipping, test on Friday": study at the library tonight or go to the res party.
   - "Roommate's birthday tomorrow, R80 left": buy a gift, make a card, or forget.
   - "NSFAS is late and rent is due": borrow from a friend, extra shifts, or call home.
   - "SRC wants your vote": hear the candidates at the Quad, vote, or skip.
   - "Two lectures from the Dean's List": skip the soccer match or risk it.
4. Progress prompts both ways: warnings ("Your grades are low, you're close to not qualifying for exams", "Rent is due in 2 days", "You're running on empty") and wins ("One step closer to the Dean's List", "On track for cum laude"). Show progress bars toward the Dean's List and cum laude on the student card.

ON HOLD
Off-campus residence names: wait for my decision, don't change them.

PART 5: FEEL LIKE A LIVING PLACE (from the Lagos Life benchmark)
Order: do Part 5 right after the Part 1 bugs, before Parts 2 and 3. Multiplayer waits until we have reviewed the backend.
Reference: docs/benchmark/lagoslife/ (7 screenshots + README). Learn from them; do not copy their art, names or layouts.
1. Atmosphere: a day/night cycle tied to the game clock; night lighting (lit windows, string lights, lamp posts); occasional rain; glowing signs.
2. Every place gets a story: the Quad with an open-mic stage, benches under the trees and a vendor stall; the cafeteria with a queue and menu board; a res party or campus tavern with music and lights. Add signage, posters and SA details (a taxi with a slogan sticker, NSFAS posters, SRC banners).
3. A bottom sheet for each place: name, a live flavour line, "Spots here - tap to walk there", and paid actions showing cost and effects.
4. HUD: day/time, mood, money with a top-up button, needs bars, an active-task chip, an event countdown ("Open mic in 2d 4h"), a streak counter.
5. Travel: Skip, plus a mini-game option during the bus ride.

What the screenshots teach (notes, not a spec):
- The scene carries the mood: night, warm point lights, string lights and lit windows do more than any UI.
- Places are full: named characters with floating name tags, a stage, a stall, props you can read from above.
- The place sheet is compact and sits over the scene, not instead of it: name + one live flavour line ("Cool breeze under the trees"), spots as chips with counts, then people here.
- Paid actions are small cards: icon, timer, price, then effect chips (+Fun +Social); the money in the HUD visibly drops.
- The HUD is one slim top pill (day, time, mood, money and +), with stacked chips on the left (current task, event countdown, streak, needs bars) and a "clean screen" toggle.
- Travel is a scene, not a loading bar: rain, traffic, a slogan bumper sticker, a Horn button, Skip, and a mini-game.

STATUS (plan 2)
- Part 1: done and confirmed by the owner.
- Parts 2 + 5 together, place by place: the Quad and the cafeteria are dressed (night lighting, signage, props, new place sheet). Waiting for the owner's review before the other places.
- After the places: Part 3, starting with decision prompts.
