# Queue

Jobs the owner has sent that are not started yet, word for word. When a job is done, take it out of this file.

Read CLAUDE.md, docs/team.md and docs/now.md first, as for any job. Same rules for every job (owner, 11 Nov): quick gate green, push and deploy, update now.md, say on the first line if chat.sql needs running.

Order (owner, 11 Nov): Sims view (done), A, B, C, D, then Sound, then Movement. Sound was already built and in its quick gate when this order arrived, so it was pushed then (see docs/now.md); A (tester fixes 2) and B (Chat V2) are done too. What is left, in order: C, E, D, Movement (E, Notifications, was added later the same day: after C, before D).

---

## C. Social C: find me and suggested groups (Opus, high · Medium)

```
SOCIAL C: FIND ME AND SUGGESTED GROUPS (owner, 11 Nov).
1. Find me. On each visit, once, a small card: "Let friends find you
   today? Only your spot in the game, never your real location. Yes /
   Not now." Off unless they say yes; it lasts that day; they can turn
   it off in the menu. Only friends both ways see it, never past a
   block, decided on the server.
2. When a friend who shares arrives, their friends get a toast: "Emma is
   on campus. Go to her / Say hi" (at most once per friend per visit).
   The Friends tab shows "Go to" beside friends who share. Go to walks
   you there with the guided walk if you are in the same district and
   takes a taxi if not (fare as usual), stopping 2 m short.
3. Open groups. A group's creator can make it Open (with one of the 12
   interests as its tag) or keep it Private (as now). At most once a
   day, a player gets a nudge for an open group matching their
   interests: "[Group] ([N] members) is talking [interest]. Join / Not
   now." Not now means no suggestion of that group for 7 days. Never
   suggest a group with someone the player blocked or who blocked them.
4. Report a group's name or topic; three reports hide it from
   suggestions until an admin looks, as with Board posts.
SQL checks and a three-phone test for 1-3.
```

---

## E. Notifications (Fable, high · Medium). Comes after C and before D.

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
