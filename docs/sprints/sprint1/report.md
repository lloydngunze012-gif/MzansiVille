# Sprint 1 report (31 Oct 2026)

Phone size 412x915, played by taps, screenshots at **normal speed** (no `?fast=1`).
Journeys: `tests/e2e/journeys.spec.js`, run with
`npx playwright test tests/e2e/journeys.spec.js --config playwright.edge.config.js --workers=1`.
All seven journeys pass.

## What was finished

1. **Queue then order.** Auntie Pinky and Mam' Gugu only serve the queue. Tapping either of them from outside the line shows "Back of the line, baby!", and you walk to the back. The line is served one person at a time and moves up, and at the front her order card opens by itself. The "Food queue" and "Mam' Gugu's stall" spots and "Stand in the breakfast queue" all use this same flow.
2. **Sit and eat, visibly.** You walk to the free chair at a cafeteria terrace table, approaching from behind the chair. You sit with hips on the seat and feet on the floor, and the food is set on a plate on the table. You eat, then stand and step away. At the Quad you eat on a free bench. "Take it to go" walks off eating. Activity cameras never end up inside a building.
3. **Verbs.**
   - **Study:** sit at a library desk with a book.
   - **Work:** the shift hands flyers to passing students, one by one.
   - **Hang out:** "Sit with them" finds open ground with a clear view and both of you sit on a bench and chat. "Study together" and "Swap numbers" (adds them to the phone) also work.
   - **Sleep:** you go to bed and the screen dims to night. The next morning starts in bed: sit up on the edge, stretch, stand, head out, and only then today's goals.
   - **Lecturers:** "Can I ask about chapter one?" gives a consultation worth +3 Grades.
4. **Lecture seats.** Every student in the hall sits on a bench behind the desks. A look-test checks the hall from the side and the front, and checks each student's height and pose.
5. **Walk time.** No walk across campus is planned to take more than about 12 s. Long trips turn into a jog and go back to a walk on arrival. "Skip there" is always on screen during a trip.

## Journeys

| Journey | Screens | Result |
|---|---|---|
| J1 Law student: gate, route to Law, walk in, Law lecture | J1-1 to J1-4 | Pass. The chip says "Lecture at Law", the route leads to Law, and the lecture has Prof Naidoo and the "Welcome to Law · Introduction to Law" board. |
| J2 Map, tap Cafeteria | J2-1 to J2-3 | Pass. The map closes, you walk there, and the sheet opens on arrival. |
| J3 Auntie Pinky: queue, order, pay, sit and eat, stand | J3-1 to J3-4 | Pass. "4 people ahead", the line moves, the menu opens at the front, a quarter bunny chow costs R35, you sit at a terrace table with the plate in front of you, eat, then stand. |
| J4 Quad: talk to a student, Sit with them | J4-1 to J4-3 | Pass. You chat with Sizwe, then both sit on a bench and talk. |
| J5 Library: study at a desk | J5-1 to J5-3 | Pass. You walk in and sit at a desk with a book. |
| J6 Night in res: bed, sleep, wake next morning | J6-1 to J6-4 | Pass. Lying in bed, the day summary with a text, then day 2 starts in bed, sitting up on the edge. |
| J7 Job shift | J7-1 to J7-3 | Pass. You hand flyers to passing students, and +R120 lands after the shift. |

## Checked and fixed during the look-test

- J3: the camera was inside the cafeteria building while you ate. It now rejects spots inside buildings.
- J3: the walk to the free chair crossed the table. You now approach from behind the chair.
- J4: the camera was blocked by a post, then the friend was hidden behind the notice board. The scene now picks a bench spot with a clear view.
- J4: the talk shot showed only sky and ground. The camera now tries spots further round and closer in, and its fallback is never inside a building.
- J6: the new day's goals card covered the wake-up scene. Goals now come after you get up.
- J6: the wake-up speech bubble was hidden under the HUD chips. Bubbles now sit below them.
- J7: the shift scene was filmed from far away. It now frames the hand-outs.

## Tests at the end of the sprint

- 49 sim checks pass.
- Full e2e suite with `?fast=1` (everything except the journeys and the long UX audit): 62 passed and 4 failed on the first run. Two failures were timing checks that fast mode outruns. The other two were tests written for behaviour this sprint changed on purpose: tapping the cafeteria's Food queue spot, or Mam' Gugu, now sends you to the queue instead of walking or chatting. All four were updated and pass.
- Journeys J1–J7 at normal speed: 7 passed.

## Still open

- In the headless test browser, the walk to the cafeteria took 27–41 s of real time. That browser renders slowly, and the game caps each frame's time step. On a phone at 30–60 fps the walk runs at its planned speed of 12 s or less. Worth a check on a real phone.
- The other lecture halls share SMIG's layout; only the colours, board and stage prop change.
- Moments, story beats and the Friday test are still cards, not 3D scenes.
