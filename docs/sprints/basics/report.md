# Basics checklist: report (1 Nov)

Build: mzansiville.vercel.app (commit e61a5c3). Tests: `tests/basics/` at 412x915 and normal speed, played only by real touch (taps and drags sent as phone touch events). `window.mzansi*` hooks are only used to read positions for measuring. Setup is not touch: a student is made in the creator, then the save is moved to 13:00 on day 1 and the game opens at a place (`?spawn=`).

## Results

| | Check | Result | Video |
|---|---|---|---|
| K1 | Thumbstick: circle, run, let go | **PASS** (walk 1.75 m/s, run 3.4 m/s with the run clip, 0 cm slide after letting go) | [K1-thumbstick.webm](K1-thumbstick.webm) |
| K2 | 5 taps in a row (mid-walk too), tap yourself | **PASS** (every tap changes course; tapping yourself stops you, 0 cm slide) | [K2-taps.webm](K2-taps.webm) |
| K3 | Tap the Quad from the cafeteria | **PASS** (jogs, stops facing the Quad: 0° off, body 0.2° from its facing, no shuffle) | [K3-arrive.webm](K3-arrive.webm) |
| K4 | Talk to 5 people | **FAIL**: one chat took 1.12 s to open (the others 0.84-1.0 s). Every reply led somewhere (an answer, sitting together, walking together); the stick worked after every goodbye | none |
| K5 | Cafeteria queue | **FAIL**: the queue part works (joined at the back behind 4, nobody cut in, one served at a time, served at 27.4 s: inside 30 s but tight). The sit-and-eat after buying didn't show the player seated in the run | none |
| K6 | Quad bench, sit and stand up | **FAIL**: test could not reach the bench action in the Quad sheet (the button needed scrolling; the test timed out). Not judged | none |
| K6b | Sleep in bed and get up | **PASS** (lies down, "Get up" shown while sleeping, gets up by themself in the morning) | [K6-sleep.webm](K6-sleep.webm) |
| K7 | Camera Top / Sims / Eye | **PASS** (123 samples while walking round the cafeteria: player never hidden, own head hidden in Eye) | [K7-camera.webm](K7-camera.webm) |
| K8 | 10 minutes of random play | **FAIL**: 63 taps, 82 stick pushes. No state ever stayed locked (worst 0 s, every non-free state had its way out). But 10 times, near the middle of the Quad, a stick push moved the player under 15 cm both ways while the game said "walking". Likely cause: the stick's step check refuses every step once you stand inside a prop's box. | none ([K8-end.png](K8-end.png)) |
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
- K8: the stick can stick near the middle of the Quad (see above). Next fix: let a step out of a box always through.
- K4: a chat can take just over 1 s to open.
- K5: sit-and-eat after a queue purchase isn't confirmed; serve time (27 s) is close to the 30 s limit.
- K6: the bench sit and stand wasn't checked (test problem reaching the button).
- After a sharp change of course you turn on the spot first, so the first second of a new walk covers little ground (0.4-0.7 m).
- scene.js is still ~2,200 lines; only the lock flags moved out.
- Old e2e tests still drive the game with hooks; only `tests/basics/` is touch-only.
