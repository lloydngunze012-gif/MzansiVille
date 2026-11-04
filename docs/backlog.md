# Backlog

Problems noticed outside the current sprint's focus. One line each; fixed in a later sprint.

- Looks: the student card (profile) screen has the game HUD floating over its top (A4-2.png).
- Looks: with five action buttons the talk card covers most of the screen on a phone; make the actions a compact chip row.
- Looks: the eat-together camera at the terrace table crops the friend at the top (A2-3.png).
- Camera: walking from the Quad to the caf, the follow camera can end up inside a tree canopy (docs/sprints/motion/M5-1-beside.png).
- Looks: dresses and skirts poke out in spikes at the thighs when sitting (the skirt is skinned to the thigh bones).

Fixed in the Motion sprint (docs/sprints/motion/report.md): the blocky stand-in while a model loads, a friend trailing a step behind, a student jumping back to their old spot after an activity.

## Motion round 2: time-boxed, not finished
- Sit/stand with clips (30 min, 1 Nov): Quaternius Universal Animation Library Standard (CC0, public/models/ual) retargets onto our rig (world-space bone turns from the bind pose; hips scaled to our height) and looks natural (hands on the lap). Wired as Sitting_Enter / Sitting_Idle_Loop / Sitting_Exit, seat placed under the clip's hips, foot lock for seat height; try it with ?sitclips=1. Not passing yet: the clip steps back ~44 cm while sitting (feet must move < 3 cm) and seated feet float ~9 cm on the caf chair. Next: start from the clip's end stance (stand where its feet end), lock both ankles to that stance through the clip, and fit y1 with the foot lock applied. The free pack has no lie-down, get-up or shower clips. Until then the planted-feet hand-made sit is on (feet move 1.4 cm).

- Talk (1 Nov): tapping a Quad student can open the chat while you're still ~5 m away (the walk up stops short), so the two talk across a gap. The shot now fits both heads above the card, but you should walk up to them first.

- Quad bench sit (1 Nov, time-boxed): on the low Quad bench (seat 0.45 m on the 6 cm plaza) one foot can't reach where it should rest when seated, so it slides ~11 cm while sitting down (caf chair, library chair, bus bench and res bed all stay under 2 cm). Next: pick the standing spot so both seated ankles are within reach (use the nearer of the two), or lower the hips less on low seats.

- Quad bench sit (1 Nov, round 3): on the low "Sit with them" bench, standing in front of it to sit, the shins press ~3.5 cm into the seat's front edge (seated is clean). Tried: standing 6 cm further out (broke the planted feet elsewhere), keeping the hips above the seat while lowering (threw the body up on high seats). Next: a per-seat stand distance from the seat's own depth.
- Stairs (1 Nov): walking up onto the first SMIG step, a toe can catch the riser for a single frame (up to 17 cm in one sample out of ~300); other runs measure 0-3 samples just over 2 cm. Next: lift the swing foot over a riser ahead instead of the whole body.

## World & looks (high priority)
- World: the player's room is a box in an empty void; build the res around it (corridor, window views, the building outside).
- World: the bus stop is empty; give it a shelter, a timetable, people waiting, and a road with taxis.
- Looks: the old screen flashes briefly before a new one loads.

## Actions follow-up
- Actions: in free walking you can reach the counter without queueing. Skipping the queue should cost Social, and people complain.

## Growth & reminders
- Growth: a sound when you gain points; the number flies into the scoreboard.
- Growth: stats coloured red/amber/green, with all green as the goal.
- Growth: stats slip gently if you don't play (a day away -> amber, two -> red).
- Growth: when a stat is low, suggest what to do ("Your Social is low. Try the open mic (+8) or talk to someone (+5)") with tap-to-go.
- Growth: all green should take about 45-60 min of play across a day, in short sessions.

## People (later)
- People: conversation actions should unlock with closeness. Strangers get directions / walk with me; acquaintances get eat / study together; friends get everything.

## Movement transplant (2 Nov): logged, not fixed
- Collisions are plain axis-aligned boxes now (src/world/player.js): a bench or table at an angle blocks its whole square, so the player stops or slides a little further from it than before. The oriented-box pass in bodies.js still keeps bodies out of the real shapes.
- A scripted walk (onto a seat, a queue spot) goes through props (solid: false) and ends within 5 cm of its mark instead of being pulled onto it.
- Standing up by pushing the stick while seated or in bed snaps to standing (no stand-up animation); the Stand up button still plays it.
- The player no longer turns on the spot before a sharp turn (Motion round 2, M1): player.js moves at once and the body turns at dt*12, so for a fraction of a second on a sharp turn the player walks a little sideways. NPCs still turn first. Motion round 2's crab check (< 15 degrees) will fail for the player on sharp turns.
- On a slow machine (5-7 fps) a long frame can still swallow a tap now and then (K4 counted 1 in 5 chats); a phone at 60 fps shouldn't.
- Creator (4 Nov): braids, the women's fade and the women's hoodie are made in code (avatar3d.js hairCap, addBraids, addHoodie), since no CC0 models fit the rig. The braids are rigid (they move with the head, not on their own) and the women's hoodie is the tee with sleeves, a hood and a pocket added; real modelled ones would look better.
