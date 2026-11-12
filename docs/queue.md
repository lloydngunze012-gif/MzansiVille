# Queue

Jobs the owner has sent that are not started yet, word for word. When a job is done, take it out of this file.

Read CLAUDE.md, docs/team.md and docs/now.md first, as for any job. Same rules for every job (owner, 11 Nov): quick gate green, push and deploy, update now.md, say on the first line if chat.sql needs running.

Order (owner, 12 Nov, the latest word): **OPENING PAGE V2.2, then E (Notifications), D (Character in 3D), then Movement.** A fresh session takes them. Done already: Sims view, Sound, A (tester fixes 2, with the character button), B (Chat V2), C (Social C).

---

## OPENING PAGE V2.2 (Small). Next.

**Started, not finished: the work so far is on the branch `opening-v22-wip`** (pushed; not on main, not deployed). Start from it (`git merge --squash opening-v22-wip` on main), not from scratch. What is there: `scripts/opening-stills.mjs` rewritten (one shared `public/opening/bg.webp` from bg-source.png: the top 1500 rows, 828 px wide, blurred 2.4, saturation 0.88, 67 KB; each student cut out on a transparent background, rendered at 2x of 440 x 840 and scaled down, lit from the upper left, a soft contact shadow, a relaxed pose, about 30 KB each; new round portraits), the page (`src/ui/quick.js`, `quick.css`: `.qs-scene` shows bg.webp bottom-anchored, `.qs-fig` is the student at 53.2dvh so the body is about 45% of the screen, feet above a 36 px fade; "Pick your character" moved to the left; the portrait row snaps to its start) and `main.js` `keepQuickPickInView`. Looked at once at 360, 390 and 414 px for Emma only (it looked right). **Not done:** launch.spec O1, O2 and O5 still describe V2.1 and will fail (the picture budget there, 300 KB for all pictures, must change: the owner now allows about 50 KB a student); CREDITS.md; screenshots of every student at the three widths; the quick gate. `public/opening/bg-source.png` is NOT in that branch: it sits untracked in the working folder and still has to be committed (the job says so).

Correction from the owner (12 Nov): the chosen background is the picture he saved as "Sunny Coastal Campus Courtyard.png". The first bg-source.png was the rejected version and has been deleted; the Sunny file is now public/opening/bg-source.png, so the job's words below still name the right file.

```
=== OPENING PAGE V2.2 · Small ===
The owner made a background in ChatGPT: public/opening/bg-source.png
(his image, ok to use; note it in CREDITS.md and commit it). The page
still looks cheap; fix all of this:

1. Use bg-source.png as the background for every student. Crop it for
   360-414 px wide screens; WebP, kept sharp. It is 941 x 1672: don't
   upscale it beyond what a 414 px screen needs.
2. Blur the background slightly (about 2-3 px) and soften its saturation
   a touch, so the low-poly students sit in it rather than look pasted
   on.
3. Render each student on a transparent background over it, lit from the
   upper left to match, with a soft contact shadow on the lawn. A
   relaxed natural pose (weight on one leg, a slight turn, arms not
   hanging straight), not the stiff stand.
4. Smaller: the student fills about 45% of the screen height and stands
   fully on the open lawn in the middle. The fade into the cream panel
   never cuts through the body. The panel may cover the flowers at the
   bottom.
5. Sharper stills: render at 2x and let each be up to about 50 KB. Load
   the first student at once and the rest after.
6. The portrait row opens scrolled so the selected student (Emma) is
   fully visible, not cut off at the left edge.

Screenshots at 360, 390 and 414 px for the owner. Quick gate, push and
deploy. Update now.md.
```

---

## E. Notifications (Fable, high · Medium). After V2.2, before D.

```
NOTIFICATIONS (owner, 11 Nov). Bring players back when someone messages
them, and welcome newcomers from their own area.

1. Message notifications (web push), built on the existing
   manifest.webmanifest, sw.js and install.js.
   - Ask at a good moment, never on first load: the first time the
     player gets a reply or sends a DM, our own card first ("Get a ping
     when someone messages you? Yes / Not now"); only Yes opens the
     browser's own prompt.
   - Push when a DM or group message arrives and the player is not in
     the game. DMs: "[Name]: [first line]". Groups: "[Group] · N new
     messages". Tapping opens the game straight into that thread.
   - Never from a blocked player. Muted groups and The Quad never push.
     At most one push per thread per 10 minutes (later ones fold in).
     Quiet hours 23:00-07:00 SAST unless the player turns them off. A
     setting to hide message text on the lock screen. Turn it all off
     any time in the menu.
   - iPhone: push only works after Add to Home Screen. When an iPhone
     player says Yes, show the Add to Home Screen steps first.
   - Server: a table for subscriptions and a function that sends the
     pushes. Keys in environment variables, never in the repo. Give the
     owner step-by-step setup for anything he has to do in Supabase or
     Vercel.
2. Local welcome. Never ask for the phone's location.
   - For South Africa, an optional town or city under the province
     (main cities and towns), in regions.json for Cursor to read over.
   - When a new player finishes the quick start with an area picked,
     online players from the same area get a toast: "Emma from Durban
     just enrolled at UMzansi. Show her around. Say hi" (never past a
     block; at most one per 10 minutes per player; words in data/ for
     Cursor).
   - Players from that area who are not in the game get at most one
     push a day, as a summary: "3 new students from Durban joined today.
     Say hi." Only if they turned notifications on, with its own on/off.

Tests: server checks for blocks, mutes, the 10-minute limit and quiet
hours; a two-browser push test on Android Chrome; screenshots of the
permission card, the iPhone steps and a notification. Report plainly
what was and wasn't tried on a real iPhone.
```

---

## D. Character in 3D (Sonnet, medium · Small)

```
CHARACTER IN 3D (owner, 11 Nov). The character screen shows cartoon
faces; the owner wants the real 3D character, as on the opening page.
1. The character screen shows the player's own 3D character, turning
   slowly and updating as they change hair, skin and clothes. Keep it
   light: a small canvas, low pixel ratio, paused when not on screen.
   Measure it on a low-end phone profile.
2. Chat and card avatars use head shots taken from the 3D character
   (like the opening portraits) instead of cartoons.
Screenshots at 390 px.
```

---

## Movement (last)

A first draft of the traffic code exists, NOT wired into the game and never run: `src/world/traffic.js` (the road graph from sunnybay.json, lanes, junction turns, cars and kombis as instanced meshes, stopping for people, a kombi that pulls up for your ride, crossing lines for pedestrians). Treat it as notes, not as working code.

```
MOVEMENT (owner, 11 Nov). Start with git pull. SunnyBay must look
busy.
1. KOMBIS: minibus taxis drive the roads between stops. Taking a
   taxi: one pulls up, you board, it pulls off with the camera
   following for 3 to 5 seconds, then cut to it pulling in at your
   stop and you stepping out. The fare and time rules stay.
2. TRAFFIC: 8 to 15 cars at a time on the main roads and the ring,
   slowing at crossings. Cars slow and stop for the player and for
   pedestrians: nobody gets hit yet (the injury loop comes later).
3. PEOPLE: pedestrians crossing at crossings; patrons in places sit,
   browse, queue and leave on a loop instead of standing still.
4. Performance: instanced meshes; every district holds 30 fps at 4x
   throttle. Report the numbers.
5. Tests, quick project green, screenshots, push and deploy.
```
