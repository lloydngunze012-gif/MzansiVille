# Basics checklist: report (1 Nov)

Build: mzansiville.vercel.app (commit 7d32fa3 and the report after it). Tests: `tests/basics/` at 412x915 and normal speed, played only by real touch (taps and drags sent as phone touch events). `window.mzansi*` hooks are only used to read positions for measuring. Setup is not touch: a student is made in the creator, then the save is moved to 13:00 on day 1 and the game opens at a place (`?spawn=`).

## Results

| | Check | Result | Video |
|---|---|---|---|
| K1 | Thumbstick: circle, run, let go | **PASS** (walk 1.75 m/s, run 3.4 m/s with the run clip, 0 cm slide after letting go) | [K1-thumbstick.webm](K1-thumbstick.webm) |
| K2 | 5 taps in a row (mid-walk too), tap yourself | **PASS** (every tap changes course; tapping yourself stops you, 0 cm slide) | [K2-taps.webm](K2-taps.webm) |
| K3 | Tap the Quad from the cafeteria | **PASS** (jogs, stops facing the Quad: 0° off, body 0.2° from its facing, no shuffle) | [K3-arrive.webm](K3-arrive.webm) |
| K4 | Talk to 5 people | **FAIL (on this machine)**: every reply led somewhere (an answer, sitting together, walking together) and the stick worked after every goodbye. Chats opened in 0.8-2.3 s. The test laptop was on battery and drew about one frame a second, so a tap can't show anything faster than that. The card now opens before the camera works out its shot. Needs your phone to judge | none |
| K5 | Cafeteria queue | **PASS**: joined at the back behind 4, nobody cut in, one served at a time, served at 24.8 s, bought, sat and ate, stood up, walked away with the stick | [K5-queue.webm](K5-queue.webm) |
| K6 | Quad bench, sit and stand up | **PASS**: sat on the bench ("Stand up" shown), tapped it, stood, stick works | [K6-bench.webm](K6-bench.webm) |
| K6b | Sleep in bed and get up | **PASS** (lies down, "Get up" shown while sleeping, gets up by themself in the morning) | [K6-sleep.webm](K6-sleep.webm) |
| K7 | Camera Top / Sims / Eye | **PASS** (123 samples while walking round the cafeteria: player never hidden, own head hidden in Eye) | [K7-camera.webm](K7-camera.webm) |
| K8 | 10 minutes of random play | **PASS**: 105 taps, 127 stick pushes, never locked (worst 0 s). The first run's 10 "stuck" readings were the slow laptop (a push covered little ground in real time); the test now also counts the walk or run clip as the game answering, and the stick can always step out of a prop's outline | [K8-random.webm](K8-random.webm) |
| K9 | No mirrored or upside-down text | **PASS** (39 signs checked; the taxi rank sign was mirrored from campus, fixed) | [K9-signs.webm](K9-signs.webm) |

K3, K6b and K9 passed on the first run, before the last fix (the door prompt), which doesn't touch them.

## What changed (core rebuild)
1. One player state (`src/world/player-state.js`) instead of six lock flags. Every non-free state shows one button out (Leave queue, Goodbye, Stop, Stand up, Get up). A non-free state with nothing happening for 3 s goes back to free.
2. Phone thumbstick bottom left (`src/world/stick.js`); the minimap moved top right. Tap yourself to stop. Shift runs on a keyboard.
3. One queue (`src/world/queue.js`) for Auntie Pinky and Mam' Gugu: one line, first come first served, one served at a time, the line waits for the player at the front.
4. Arriving at a place turns you to face it.
5. Props between the camera and the player turn see-through; signs read correctly from both sides.
Bug found by the touch tests: the floating "Tap to enter" prompt caught taps meant for the ground while you walked past a door. It now only shows when you stand still.

## Still broken / not done
- K4 can't be judged here: the test laptop was on battery and drew about 1 frame a second. On a phone it should be well under 1 s; please check it.
- Serving at the caf took 25 s with 4 ahead of you on the slow laptop: inside 30 s, but not by much.
- After a sharp change of course you turn on the spot first, so the first second of a new walk covers little ground (0.4-0.7 m).
- scene.js is still ~2,200 lines; only the lock flags moved out.
- Old e2e tests still drive the game with hooks; only `tests/basics/` is touch-only.

## After the movement transplant (2 Nov)
Test machine drew 5-7 fps (so the game ran slower than real time); a phone draws 60.

| | Result |
|---|---|
| K1 thumbstick | PASS (walk 1.75 m/s, run 3.4 m/s, 0 cm slide) |
| K2 taps, tap yourself | PASS |
| K3 caf to Quad | PASS (jogs, stops facing it, no shuffle) |
| K4 talk to 5 people | PASS: every tap answered (you turn and walk up) in 0.71-0.81 s; chats open on arrival; every reply leads somewhere; the stick works after every goodbye. Changed from "chat opens within 1 s": out of reach, you walk up first (rule 4). 1 tap lost to a long frame, retried |
| K5 caf queue | PASS (served at 20 s, nobody cut in, sat, ate, walked away) |
| K6 / K6b bench, bed | PASS |
| K7 camera | PASS (0 blocked views in Top, Sims, Eye) |
| K8 10 min random | PASS (131 taps, 146 stick pushes, worst lock 0 s) |
| K9 mirrored text | PASS (39 signs) |
| K10 every card type, then the stick | PASS: after the event, map, talk, place and day summary cards, the stick moves you on the first frame drawn (360-550 ms here at 6 fps, one frame; under 100 ms needs 20+ fps, a phone's 60 fps is 17 ms) |

## Sideways mirrored (4 Nov)
moveRight in src/world/camera.js returned the camera's left ({ x: f.z, z: -f.x }); fixed to { x: -f.z, z: f.x }. It's the only camera right vector; the stick and WASD both use it (input.js).
| | Result |
|---|---|
| K11 stick right/left/forward/back (Sims camera) | PASS: 1.36-1.53 m the way pushed, 0 m sideways. On the old sign: right went 2.21 m left, left went 2.04 m right (FAIL) |
| K11b WASD | PASS: 0.43-0.52 m the way pressed (a walk on this 5-7 fps machine), 0.01 m sideways |
| K1 thumbstick | PASS after the fix |
