# Presence (retention spec, item 1) — report, 4 Nov

**Video of both phones side by side:** [presence-two-phones.webm](presence-two-phones.webm) (two 412x915 phones in one recording, normal speed, real Supabase Realtime on a test room).

Screenshots: [P1-both.png](P1-both.png) (each sees the other, count 2), [P3-walked.png](P3-walked.png) (after B's walk), [P4-through.png](P4-through.png) (A walked onto B: same spot, no push), [L1-closed.png](L1-closed.png) (B closed the tab: gone, count 1).

## Results (tests/presence/presence.spec.js, touch only, all 8 pass)

| Check | Result |
|---|---|
| S1 alone: spawn on the Quad, filled | A, the only player, spawned on the Quad with the filler students; HUD "1 on campus" |
| P1 each sees the other | seen within 0.9–5 s of B's campus loading (B's first frames are the slow part); A sees "Kabelo 26 198 256", B sees "Thandeka 26 629 946" |
| S2 B spawns beside A | B spawned 1.8 m from A (the busiest real-player spot), not on top of them |
| P2 students-on-campus count | both HUDs "2 on campus" |
| P3 movement follows, interpolated | B walked and jogged 26.9 m by taps; A's copy of B ends 0 cm from B; biggest step between 0.2 s samples 0.82 m (jog 4 m/s = 0.8: no jumps); A's copy plays the walk clip |
| P4 players pass through each other | A walked onto B and stopped 17 cm from B's middle (NPCs keep 50 cm+) |
| L1 closing the tab | B vanished from A after 0.5 s; count back to 1 |
| L2 a frozen phone, no goodbye | B vanished from A 6.8 s after B's page froze (socket left open, no goodbye) |

## How it works

- **src/presence.js**: one Supabase Realtime channel (`presence:campus`). Broadcast, not polling, not database writes.
  - `pos` messages: position, heading, pose (stand/walk/run/sit/dance), seat height, and where you are (`campus` or `away` in the morning, a lecture, a room off the map, another screen). 4 a second while moving, a heartbeat every 2 s while still. Name, student number and look ride along every 5 s and right after a newcomer's `hello`.
  - Leaving: a `bye` on closing the tab or switching apps, Realtime presence `leave` when the connection drops, and anyone silent for 7 s is dropped. Worst case is about 7 s, inside the 10 s rule.
  - Interpolation: each player is drawn 350 ms behind their own clock (clock offsets are estimated per player), between the two updates either side. A set-off after standing still starts at once instead of being smeared over the quiet spell. A jump over 8 m (a respawn) snaps.
  - Budget: Supabase's free plan carries 100 messages a second for the whole project, and each delivery counts. Updates slow down as the campus fills: 4 a second up to 4 players, about 2 at 6, about 1 at 9.
- **src/world/others.js**: the other players use the same character model and their own creator look. Tags show the name and student number with a green "online" dot, readable on a phone (the tag grows with distance past 9 m and shows up to 45 m). They are left out of the collision pass, the crowd's personal space and tap picking, so players pass through each other, and a tap on one walks you to that spot.
- **Nobody spawns alone** (scene.js `crowdSpawn`): you spawn beside the busiest group of real players. With nobody else on, you spawn on the Quad. If presence connects after you spawn and you haven't moved, you're moved over (within 15 s). Arriving off the bus still lands at the gate (the day's story). While fewer than 3 real players are online, 6 extra students stand chatting in pairs on the Quad (crowd.js `setFill`, people x14–x19, who can be talked to; 8 new names in people.json).
- **HUD**: "N on campus" pill with a green dot next to the clock, live (src/ui/game.js, game.css).
- `?room=<name>` picks the channel. Tests use their own, and automated tests without one never join, so nobody on the live campus sees test players.

## Not done / known limits

- **Student numbers are a stand-in**: 26 + six random digits per phone (localStorage `mzansiville.presence`), until item 3 (enrolment) issues real ones from a Supabase sequence.
- **The UMzansi rename** (spec section 0) is not done. It wasn't in item 1.
- **Scale**: the free plan holds roughly 12–15 players moving at once. Beyond that we need Supabase Pro (500 msg/s) and per-area channels.
- Tags use depth testing like the NPC tags, so a string-light wire can cross a tag.
- The test drives both phones on the real GPU (`--use-angle=d3d11`). On the software GPU two scenes run in slow motion.
- Not tested on a real phone yet: that's the owner's verdict.
