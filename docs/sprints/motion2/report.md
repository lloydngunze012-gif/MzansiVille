# Motion round 2 report (1 Nov 2026)

Focus: motion and the camera framing of bodies. Everything else went to docs/backlog.md. Worked under the owner's time-box rule: 30 minutes an item, then log what was tried and move on.

## Videos (412x915, normal speed)

| | Journey | Video |
|---|---|---|
| M1 | Zig-zag across the Quad with sharp turns | [M1-zigzag.webm](M1-zigzag.webm) |
| M2 | Up the SMIG stairs, down the aisle steps; students leaving up the aisle | [M2-stairs.webm](M2-stairs.webm) |
| M3 | Res: into bed, sleep, start day 2, get up | [M3-bed.webm](M3-bed.webm) |
| M4 | Sit and stand: caf chair, library chair, bus stop bench | [caf](M4-caf-chair.webm), [library](M4-library-chair.webm), [bus bench](M4-bus-bench.webm) |
| M5 | Eye view: tap Mam' Gugu's tuck shop | [M5-eye-tuckshop.webm](M5-eye-tuckshop.webm) |
| M6 | Through the res door and the lecture hall door | [res](M6-res-door.webm), [lecture](M6-lecture-door.webm) |
| M7 | A chat, studying and eating, each in Top, Sims and Eye | [talk](M7-talk.webm), [study](M7-study.webm), [eat](M7-eat.webm) |
| (feet) | Everyone's feet at the Quad and the cafeteria | [M0-feet.webm](M0-feet.webm) |

Open the `.webm` files in a browser. Headless browsers render about 6 frames a second, so the videos look choppier than the game on a phone.

## Results

`npx playwright test tests/e2e/motion2.spec.js --config playwright.edge.config.js --workers=1`: 13 of 14 pass. The Quad bench fails (see "Still broken"). The caf chair failed once on timing in the full run (it waits up to 4 minutes for the queue now) and passes on its own.

| | Check (automatic) | Result |
|---|---|---|
| M1 | Crab angle: each step vs the way the body faces, every rendered frame | Pass. Player worst 10.7°, everyone worst 11.6°, 0 steps over 15°. |
| feet | Soles vs the ground or path under each shoe, everyone, Quad and caf | Pass. 435 samples, all within 2 cm. |
| M2 | Soles vs the step under them, up and down the SMIG aisle | Pass. 487 samples over all six step heights (0.19 m to 1.14 m), all within 2 cm. |
| M3 | Res bed: body vs mattress; feet during sit on the edge and get-up | Pass. On the mattress (0 cm); feet move 1.0 cm sitting down, 1.2 cm getting up. |
| M4 | Feet during sit-down and stand-up | Caf chair 2.0 cm / 2.0 cm, library 1.9 / 1.9, bus stop bench 1.2 / 1.2: pass. **Quad bench 11 / 13 cm: fail.** |
| M4 | Bus stop bench | Pass. Walks round the end of the shelter, never through the bench. |
| M5 | Eye view, tap the tuck shop | Pass. Walks to the back of the line, 0.15 m off a straight line; no slide after stopping; worst sideways step 4.8°. |
| M6 | Doors: open before the body reaches them; the body crosses through the gap | Pass. Res door crossed at the middle of the doorway, door fully open; lecture door the same. |
| M7 | Heads: box fully on screen and not under the HUD, not behind anything, camera not inside a head, your own head drawn | Pass in all 9 views (chat, study, eat × Top, Sims, Eye). |

## What was wrong, and the fix

| Problem | Fix |
|---|---|
| Sideways moonwalking: the body turned smoothly but moved straight away. In Eye view you always faced the camera and walked sideways to a tapped place. | A walker's body turns towards where they're going (fast on sharp turns), and they only move along the way they face: turning more than ~57° turns on the spot first. Eye view looks where you walk. |
| Sinking feet: campus paths (7 cm), the Quad plaza (6 cm) and the caf deck (8 cm) were higher than the ground everyone stood on. | A floor map (src/world/floor.js) holds every raised surface; each shoe stands on whatever is under it, toe caps and heels included. |
| Stairs: the lecture aisle was a ramp through the tiers. | Real steps: six 19 cm steps up from the door, two per tier down to the front. Feet land on each one. |
| Transitions: people appeared on seats, the shower spun you round. | Sit-down: walk to the spot in front of the seat, turn round, lower with both ankles held (leg IK) and a lean forward. Stand-up is the reverse. Into bed: sit on the edge, then lie back. Shower: a short fade with the sound of water. |
| Clip-based sitting (owner's suggestion) | Quaternius Universal Animation Library (CC0) is in public/models/ual and retargets onto our rig; Sitting_Enter / Idle / Exit look natural. It doesn't pass the planted-feet check yet (the clip steps back ~44 cm), so it's on trial behind `?sitclips=1`. No lie-down, get-up or shower clips in the free pack. |
| Arriving: the crowd shoved you after you stopped (the slide). Tapping the tuck shop walked you to the ground behind it. | Standing still, nobody pushes you. Tapping a stall or the caf counter joins that vendor's queue. |
| Doors: the res door swung in through you; the lecture door stood alone and nobody walked through it. | The res door swings out and opens as you walk up. The hall has a back wall with a doorway, you start outside, and the door swings in ahead of you. |
| Headless student: Eye view hid your own head even in close shots. The chat shot put people behind the card. | Your head is hidden only for the first-person camera. The chat shot pulls back until both people, head to feet, fit above the card. |

## Screenshots

M1 ![](M1-1.png) M2 ![](M2-1-stairs-up.png) ![](M2-3-leaving.png) M3 ![](M3-1-sitting-on-bed.png) ![](M3-2-lying.png) ![](M3-3-getting-up.png)
M4 ![](M4-caf-lowering.png) ![](M4-library-lowering.png) ![](M4-bus-bench-lowering.png) ![](M4-quad-bench-lowering.png)
M5 ![](M5-1-eye-view.png) ![](M5-3-arrived.png) M6 ![](M6-1-res-door.png) ![](M6-2-lecture-door.png)
M7 ![](M7-talk-top.png) ![](M7-talk-sims.png) ![](M7-talk-eye.png) ![](M7-study-eye.png) ![](M7-eat-eye.png)

## Still broken

- Quad bench: one foot slides ~11 cm sitting down (the low bench puts the seated foot out of reach). Logged in docs/backlog.md with the next step.
- Clip-based sitting is on trial only (`?sitclips=1`); lie-down, get-up and shower have no clips in the free pack.
- A chat can open while you're still ~5 m from the person (the walk stops short); the shot frames both, but you should walk up first. Logged.
- The full test suite (all specs) wasn't re-run this sprint; only the motion round 2 checks and the morning tests that touch the door, bench and shower.


## Round 3 (owner, 1 Nov): sitting the right way, nobody through anything

The owner played it: "I either sit facing the wrong direction and my body is literally inside the chair. Also, don't allow anyone to go through a physical object, even a person."

| Problem found | Fix |
|---|---|
| In Eye view the game turned your body to the camera's facing every frame, even seated: you swivelled on the chair and your back went through the backrest. | Seated, lying, busy or in a chat, looking round no longer turns the body. Seated facing vs the chair: 0 degrees. |
| The caf terrace tables were placed by a model corner, about 1 m off their chairs: you sat at the table's end, half under it. | Tables are centred; the terrace chairs sit 0.68 m clear of the table's sides. |
| Room chairs (library, res desk, kitchen, classroom) were 0.1-0.35 m from their desks: standing in front of one to sit, you were in the desk. | Pulled out to 0.6 m. |
| Scene seats didn't match what you sit on (the bench 2 cm in, the fountain seat in mid-air beside the rim, the steps 4 cm above). | Each sits on the top of its seat, walked up to and sat on like any other. |
| After paying Auntie Pinky the walk to a table was dropped and the last step cut straight through the serving counter. | Scene walks wait for the payment, end on progress (not a clock), and only the final short step goes in among the furniture. |
| Seated hands hung straight down into a wide bench. | Seated hands rest on the lap (the Quaternius sitting clip's arms, retargeted). |
| People walked through each other, the counter, a trashcan, a queue. | One collision pass every frame (src/world/bodies.js): every standing person is pushed out of walls, counters, tables, benches, stalls and every placed model, and kept 0.5 m from everyone; seated people are obstacles; things straight ahead are kept a stride away (the front foot and hand). Queue people rejoining walk round the line. |

Checks (412x915, normal speed, `tests/e2e/motion2.spec.js`, one worker):

| | Result |
|---|---|
| S1 caf chair, Eye view | Pass: facing the chair 0 degrees; never more than 0.9 cm into anything. |
| S2 library chair, Eye view | Pass: facing 0 degrees; 2.4 cm at most. |
| S3 Quad bench, Eye view | Fail: the shins press 3.5 cm into the bench's front edge standing to sit (seated clean). Logged. |
| C1 crowded Quad 30 s, the stick into a person and into the stall | Pass: nobody closer than 0.5 m (0.525 with you pushing into them), nobody inside anything. |
| C2 the caf queue 25 s, the stick into the counter | Pass: closest 0.45 m, nobody inside anything. |
| Planted sit/stand (caf, library, bus bench, res bed) | Pass: feet move 1-2 cm. |
| M1 zig-zag, M5 tuck shop, M6 doors, M7 heads, feet on paths | Pass. |
| M2 stairs | One frame of a toe catching the first riser in one run (0-3 samples just over 2 cm in others). Logged. |
