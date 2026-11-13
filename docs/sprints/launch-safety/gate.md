# The quick gate, trimmed (job H, 13 Nov)

**Before:** 125 tests, 3,264 test-seconds on 2 workers, about 28 minutes with `npm run check`.
**After:** 83 tests on 3 workers. The time is in docs/now.md (job H).

Every area still has at least one test at push time. The ones that moved still run in the full suite (`npm run test:e2e`, project `rest`, once a day and before a launch). The list lives in `playwright.edge.config.js` (`MOVED`).

| Moved | Why it can wait for the full suite | Stays in the quick gate |
|---|---|---|
| cards: every 1280 px case (C1-C8) | the same cards at 390 px stay; the width rule is one CSS rule | cards at 390 px |
| caf: shell at 1280, fixes at 360 and 390 | the same scene at 390 stays | Caf shell at 390 |
| caf: 30 fps at 4x CPU | timing-sensitive: it fails when browsers starve each other (it did twice this week) | living-fps in the timing project |
| actions: A3 study, A4 swap numbers, A5b Mam' Gugu, replies with an act | the same walk-together, queue and chat machinery as A2 and A5 | A1, A2, A5 |
| chat-quick Q2 (chat open while walking) | an older detail | Q1 |
| home: township | the same drop-off path as the suburban one | suburban |
| launch: L4, L4b (leaderboard), L5c (feedback) | stable, older | L1, L1b, L2, L3, L5a, L5b, L6, O1-O6 |
| loops: P1 (preorder), P2 (streak, badges) | older | P3 (invite: changed in this job) |
| movement: M3 (crossings), M4 (Lifecup patrons) | older | M1, M2 |
| notify: N2 (iPhone steps), N3 (town) | older | N1, N4 |
| npc-crowd N2 (tour card) | the same rule as N1 | N1 |
| play-quick: K2, K3, K4 | the same mini-game machinery as K1 | K1 |
| sims-first S2 | older | S1 |
| social-b B2 (interests, Daily) | older | B1 |
| social-c C2, C3, C4 | older | C1 |
| social-quick A1 (groups), A3 (wake-up) | older, slow (84 s) | A2, A4, A5 |
| tester-fixes1 A, B | older | C |
| tester-fixes2: F2 at 360 and 414, F3, F4 | the same check at 390 stays | F2 at 390, F5 |
| topbar: B3, B4, B7 at 360 and 414 | the same bar at 390 stays | B1, B2, B5, B6 |
| char3d D3 (4x CPU) | timing-sensitive | D1, D2 |
| chat-v2 V1 (palette sweep) | older | V2-V5 |
| lecture: benches, late front row | older | the lecture walk-in, the course's venue |
| city-meet M1 (map back arrow) | older | M2 |
