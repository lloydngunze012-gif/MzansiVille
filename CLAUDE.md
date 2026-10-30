# MzansiVille: plan and rules

You're the only developer on MzansiVille (GitHub: lloydngunze012-gif/MzansiVille), a 3D campus life-sim set at a South African university, benchmarked against Lagos Life and The Sims. Other agents are stopped.

First: save this whole message into CLAUDE.md at the repo root, so future sessions remember the plan and rules.

Rules: work on main. Commit and push after each item. After each push, reply with three lines: what changed, what to test on my phone, what's still broken.

STEP 0, set up and bring in finished work:
- checkpoint-b has nothing committed. Switch to main and pull the latest from GitHub.
- Merge origin/content-writer. On conflicts in day1_morning.json and day1_lecture.json, keep main's version. Make sure the game uses the new activities.csv (108 actions) so every place has things to do.
- From origin/world-designer, take ONLY public/audio/ (sounds + CREDITS.md) and docs/world-designer/. Do not take its src/ changes, places.csv, residences.csv or seed.sql.
- Merge origin/qa-reports (docs only). Read docs/benchmark.md; it's our target.
- Leave origin/backend unmerged.

THEN, in order:
1. Clock bug: the morning ends at e.g. 08:42 but campus loads at 09:00. Keep the time where the morning ended.
2. Remove the Zanele bestie card after the morning; the player already met her as their roommate.
3. Fix the dark label cut off on the left edge of the campus screen after arriving.
4. Real names: change "Business Hall" back to SMIG everywhere, including the route hint. Keep Westville, O/R/S Block, the Quad and NSFAS. No official university logos or crests anywhere, including the share card.
5. Sound: wire up public/audio. Footsteps while walking, kettle at the kettle, door when leaving, bus engine for the bus, crowd on campus, background music, and a mute toggle in the menu.
6. Replace the capsule avatar with a free rigged low-poly character (Quaternius or Kenney, CC0) with arms, legs, and walk, idle and sit animations. Recolour from the character creator, including the Organt tee.
7. Other students on campus: 10–15 people walking between buildings and sitting at the Quad, using the same character model.
8. Walking into SMIG starts a playable 9:00 lecture: walk in, find a seat, something happens, a choice, a result.
9. Bugs from QA (B02): sending a chat message lands on the rules page, and the sign-in link resets the player.

Golden rule: every tap must show movement or something happening, never just a progress bar and numbers.

Added by the owner during the build (keep these):
- Characters have a gender, picked in the creator. The day 1 roommate is the same gender: Zanele for female students, Sipho for male students.
- Include feminine clothing (Dress, Skirt & top, Shweshwe so far) and keep adding variety.
- In the character creator the student dances and South African house music plays. A mute button is fine, but music and dancing are the default.

Status: the first plan (Step 0 and items 1-9) is done and pushed (up to 86d3a1a).

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
