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

# CURRENT LIST (owner + player test, 31 Oct). Look-test each at 412x915, push after each, don't stop for review.
The rule: every tap must lead to a visible, sensible result, and every option must make sense for why it exists. If a tap does nothing, that's a bug.
1. COURSE DECIDES YOUR LECTURES. Each course has a home venue: Law -> Law; Accounting, Information Systems, Management, Marketing -> SMIG; Computer Science, Science -> Science; Engineering -> Engineering; Medicine, Nursing -> Health Sci. The day goal, the route, the "Lecture in 15 min" chip and the glowing marker point only to the player's venue. Each venue has its own lecture scene and lecturer. Other venues stay open as an optional "sit in".
2. MAP = GO THERE. Tapping a place on the map closes the map, returns to the 3D view, and the character automatically walks there. On arrival the place sheet opens. A Skip button can jump straight there (time passes).
3. CONVERSATIONS LEAD TO ACTIONS. Talking is a doorway to doing:
   - Auntie Pinky / Mam' Gugu: ordering in conversation ("Bunny chow please" -> "Quarter or half?") offers the real items with prices. Picking one pays from your money, she hands it over (visible), then: "Sit and eat?" -> walk to a table, sit, eat. Or "Take it to go."
   - Lecturer: "Can I ask about chapter one?" -> a short consultation that raises grades.
   - Students: replies can lead to "Sit with them", "Study together", "Swap numbers" (adds them to the phone).
   Every chat ends with either an action or a clear goodbye, never a dead end.
4. BODIES ON THE WORLD: feet on the ground (no sinking), hips on the seat (no sinking into cafeteria chairs or benches), no one frozen mid-stride: standing people play idle, walking people walk. In the meet-cute the two characters face each other while talking. Fix the wake-up so getting out of bed looks natural, not like a zombie.
5. QUEUES ARE LINES: one straight line facing the counter, evenly spaced. The front person is served and leaves, everyone shuffles forward, and the player joins at the back.
6. CREATOR ICONS: render the outfit, hair and body icons from the actual 3D models so they match the game, and frame them so no head is cut off.
7. UX AUDIT: play a full day as a new player on a phone. List every button and tap target, what it does, and whether the result makes sense. Fix every dead end. Include the list in your report.

# MAIN DIRECTION: docs/design/player-experience-spec.md
The player experience spec is the main direction for the game. Every scene follows its section 6: choices not chores, people not menus, show don't count, every day ends on a cliffhanger, every day changes the player, the ten-second test. Build order is its section 7.

# CURRENT LIST (owner, 31 Oct, after the Quaternius characters). Push after each item, no stops, look-test each at 412x915 from the player's camera.
1. CHARACTERS WEAR REAL CLOTHES. The new characters look like mannequins: the "hoodie" is just colour painted on a muscular body, and they're barefoot. Use character models with actual modelled clothing (hoodies, shirts, jackets, dresses, skirts, shweshwe, the Organt 031 tee), shoes, and real hairstyles, e.g. Quaternius modular character packs (CC0). Vary body shapes: not everyone gets the same athletic build. Compare with docs/benchmark/lagoslife/02 and 07. Also fix the T-pose when lying in bed.
2. SITTING: people sit ON benches and chairs, not inside them. Fix seat height and position for every sit animation (Quad benches, lecture seats, cafeteria tables, bed).
3. CREATOR ON PHONE: the 3D preview spans the full width at the top; the student card goes below it. No empty space.
4. NAME TAGS: smaller, and scaled down when close in Eye view. Never bigger than the person's head.
5. The floating yellow "!": explain it (tapping shows what it means) or remove it.
6. LECTURE MUST NEVER BE SKIPPED: Map > SMIG > "Attend lecture" just changes stats and jumps the clock. Any way of attending the day-1 lecture (walking in, the map, the place sheet) must open the 3D lecture scene. After it, remove "Your lecture is at SMIG".
7. TAPPING: ground taps walk; only a direct tap on a person starts a conversation. Add a test that walks from the gate to SMIG by tapping the path and enters the lecture.
8. CAMERA: conversations and morning shots frame people fully, head to feet. No giant blurry heads (the kettle shot), no cropped characters (the bed shot).
9. MORNING CHORES: replace "Head out", "Walk to the bus stop" and "Get on the bus" with one choice: Skip to campus / Walk to the bus. Make the bus stop the crush meet-cute (spec section 5, 4:30).
10. THEN FOLLOW THE SPEC, section 7, in order: a. goal ladder, b. creator part 2, c. crush arc days 1-5, d. identity paths and card title, e. day summary and cliffhanger text, f. 10 random daily moments, g. the other arcs, h. days 1-5 each with a goal, Friday test payoff.

Status: items 1-10 done and pushed (up to b373434). Where things live: src/engine/goals.js (day goals, right-now chip, year dream), src/story.js (creator part 2), src/crush.js + src/engine/crush-arc.js (crush), src/engine/identity.js (paths, titles), src/engine/dayend.js (summary, cliffhanger texts, run.inbox), src/engine/moments.js (10 random moments), src/engine/arcs.js (roommate, rival, money, lecturer, SRC, home beats), src/engine/friday.js (day themes, week goal, Friday test). Random moments and story beats are off under automation (navigator.webdriver) unless the URL has ?moments=1.

---

# CURRENT LIST (owner, 31 Oct): do NOT stop for review. Push after each item.
Every item must pass a look-test on a phone-sized screen (412x915): screenshot it from the player's camera and check it's clearly visible.

1. TALK TO ANYONE (now, first)
Tap any person (students, vendors, lecturers, SRC campaigners, roommate) and a conversation opens: their name, a short line, 2-3 replies. Replies change Social and closeness. People remember you; the second chat differs. Write at least 10 student characters with names and personalities, plus Mam' Gugu, the cafeteria auntie and the lecturer.

2. EVERY ACTIVITY IS VISIBLE, EVERYWHERE
- Build reusable scenes (queue and buy, sit and eat, sit and read, study at a desk, watch, chat, exercise, work a shift, sleep) and map ALL 108 actions in activities.csv to one. No action may play as a blank progress bar.
- During an activity, move the camera close (over-the-shoulder) so the player clearly sees it: the queue, the vendor, the vendor handing over the food, the character eating.
- The result text must match what happened (vetkoek, not kota).

3. MORNING CHOICES
Every morning offers real breakfast choices: noodles in res, the tuck shop on the way, the cafeteria on campus, or skip and walk hungry. Each has a different cost, time and effect.

4. PHONE LAYOUT AND QUALITY
- Character creator on phone: the 3D preview shows the full character, head to feet, never cropped. Rework the layout for portrait phones.
- Cover image: no heads cut off at the top on phones (adjust object-position, or show the full image).
- The Organt outfit must show the '031 ORGANT' print on the 3D tee, like the cover.

5. CHARACTERS THAT MATCH THE COVER
Replace the chibi Kenney minis with normal-proportion low-poly characters, like Lagos Life's (docs/benchmark/lagoslife/02 and 07). Use Quaternius's free CC0 character packs (rigged, with walk, idle, sit and talk animations). Keep all creator options: gender, skin, body, hair, outfits including Dress, Shweshwe and the Organt 031 tee.

Report at the end with phone screenshots for each item.

---

# TOP PRIORITY (owner review after the Quad and cafeteria): above Part 3

NEW RULE: TEST WHAT IT LOOKS LIKE, NOT JUST WHETHER IT WORKS
After every change, play it in the browser from the player's view, take screenshots, and LOOK at them before pushing. Check each one for:
- anyone walking through tables, chairs, doors, walls or other people
- the camera inside an object or a person
- labels or building names showing through buildings
- anything cut off at the screen edge
- an action that's just a progress bar instead of something happening
Fix what you find. In your report, list what you checked and what you fixed.

1. TALK TO ANYONE
Every person in the game is tappable: students, vendors, lecturers, SRC campaigners, the roommate. Tapping opens a conversation with their name and a few lines, and 2-3 replies to choose from. Choices affect Social and how well you know them. People remember you: the second conversation is different from the first.

2. ACTIVITIES ARE ACTIONS YOU SEE
Every activity shows the character doing it:
- Buying food: walk to the queue, stand in line behind other students, move forward, reach the front, the vendor hands you the food, you walk away eating.
- "Sit and read": walk to the grass, a bench or a library table, sit down, open a book.
- Same idea for every activity: eating sits at a table, the busker plays while you watch, the open mic has someone performing.
The progress bar can stay as a small timer, but the character must be doing the thing.

3. REALISM AND LOOK
- Collisions: nobody walks through tables, chairs or walls. In the lecture hall, walk around the desks. At the residence, the door opens before the character walks through.
- Campus surroundings: no ocean around the campus. Replace it with roads, grass, trees, a perimeter fence, parking lots, a taxi rank and the town edge, like a real SA campus.
- Every building looks different: shape, colour, height, signage, entrance. Use Kenney/Quaternius building kits so the library, SMIG, the residences, the cafeteria and the sports centre are recognisable at a glance.
- Labels: building names must never show through buildings. Only show labels for nearby buildings or your destination, and hide labels that are behind something.

4. QUAD AND CAFETERIA (compare against docs/benchmark/lagoslife/02 and 05)
- When arriving at or opening a place, show a wide 3/4-angle establishing shot so the whole place reads at a glance.
- Night needs real contrast: darker ground and sky, bright pools of light under lamps and string lights, glowing windows, a spotlight on the stage.
- People doing things: a performer at the open mic, a queue at Mam' Gugu's stall with her serving, students on benches, SRC campaigners at their tables in ANC-, EFF- and DA-aligned colours, a queue at the cafeteria counter with the auntie serving.
- Pull the cafeteria eye-view camera back so the menu board is fully visible.

ORDER: 3 (collisions, labels, surroundings) first, because they make everything look broken. Then 2 at the Quad and cafeteria, then 1, then the rest of 4. Push after each, and stop for my review after item 2 at the Quad.

STATUS: item 3 done (a83cd63). Item 2 done at the Quad (all 12 Quad actions play as scenes, src/world/activities.js). Waiting for the owner's review; next is item 2 at the cafeteria, then item 1.

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

STATUS (plan 2)
- Part 1: done and confirmed by the owner.
- Parts 2 + 5 together, place by place: the Quad and the cafeteria are dressed (night lighting, signage, props, new place sheet). Waiting for the owner's review before the other places.
- After the places: Part 3, starting with decision prompts.
