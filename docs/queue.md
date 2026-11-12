# Queue

Jobs the owner has sent that are not started yet, word for word. When a job is done, take it out of this file.

Read CLAUDE.md, docs/team.md and docs/now.md first, as for any job. Same rules for every job (owner, 11 Nov): quick gate green, push and deploy, update now.md, say on the first line if chat.sql needs running.

Order (owner, 12 Nov, the latest word): **Movement.** (Opening page V2.2, E Notifications and D Character in 3D: done 12 Nov.) A fresh session takes them. Done already: Sims view, Sound, A (tester fixes 2, with the character button), B (Chat V2), C (Social C), Opening page V2.2, E (Notifications), D (Character in 3D).

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
