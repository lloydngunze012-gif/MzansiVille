# Queue

Jobs the owner has sent that are not started yet, word for word. When a job is done, take it out of this file.

Read CLAUDE.md, docs/team.md and docs/now.md first, as for any job. Same rules for every job (owner, 11 Nov): quick gate green, push and deploy, update now.md, say on the first line if chat.sql needs running.

Order (owner, 12 Nov, the latest word): after the current job, **I, K, J, L, H, G**. Everything playable by Fri 13 Nov; launch stays Fri 20 Nov. The player pass rule applies to every job. Cursor is writing the words for J, K and L in docs/world-designer/alive.md on its own branch: wire them in when it lands, with placeholders until then.

Not in this file yet: the text of jobs I, H and G and of the player pass rule (sent to another session, not yet written down in the repo). Whoever has them adds them here word for word; until then ask the owner. Done already: Sims view, Sound, A (tester fixes 2, with the character button), B (Chat V2), C (Social C), Opening page V2.2, E (Notifications), D (Character in 3D), Movement.

---

=== JOB K · Opus, High · ACTIVITIES YOU PLAY ===
Activities are only a card with numbers today. Make them things you do.
1. Bowling: walk to a lane, aim by dragging, release; the ball rolls,
   pins fall with sound, a score shows; NPCs bowl on other lanes; staff
   at the shoe counter.
2. Caf meal: join the queue, order from Mama Liz's menu, carry the tray,
   sit at a table and eat; friends at the same table share it.
3. Arcade racing cabinet: a 20-second steer-by-tap race.
4. Beach: a kick-about with NPCs (tap to kick), and a swim.
5. Library study: a short focus moment (tap on the beat) that sets the
   Grades gain.
6. Gym: a short rep moment that sets the Energy cost and the gain.
Every other activity: your student visibly does it (sits, eats, browses,
dances at church choir, works out) for a few seconds before the card.
Each has its own fitting sound; no generic beeps.

---

=== JOB J · Opus, High · A LIVING WORLD ===
1. Staff in every place, behind a counter doing their job and greeting
   you; patrons doing the place's thing (eating at tables, bowling,
   browsing), never bunched up.
2. The Caf busy at meal times: a queue, full tables, low chatter.
3. Campus outside: students walking between buildings, sitting on the
   lawns, groups chatting, a football kick-about, benches and paths.
4. SunnyBay full: many more people on pavements and going in and out of
   shops. Set a target per district within the frame-rate budget.
5. The beach: families on towels, kids running, building sandcastles and
   playing ball, swimmers, a lifeguard; kids' laughter in the mix; waves
   that roll gently onto the sand, foam moving in and out slowly.
6. Windows on every building (lit at night) and glass on every vehicle.
7. Billboards: building sides and roadside boards as ad slots, content
   from data/billboards.json (image + words) so the owner can swap them
   without code. Start with the game's own features, plus empty brand
   slots.
8. At least 30 fps on a low-end phone profile in every district: use
   instancing and level of detail. Report fps per district.

---

=== JOB L · Opus, Medium · CONSEQUENCES, MUSIC, A REASON TO COME ===
1. Energy drains faster: a busy game day takes you from 100 to about 20.
   Numbers in data/.
2. Below 20 Energy: you walk slower and some activities refuse ("Too
   tired"). At 0: a card with three ways out: Go home and sleep; Order
   delivery (SunnyBay Eats: pick from the Caf menu, food price plus a
   delivery fee, a rider on a scooter arrives in a few game minutes);
   Ask a friend (a request to a friend online: "Lloyd is starving. Bring
   food?"; if they accept and bring it, both gain Social). At 0
   Fullness, Energy drains twice as fast.
3. Music zones, one track at a time with cross-fades, never two at once:
   the Caf light background music; the Quad soft radio; bowling and the
   arcade upbeat but quieter; the beach no music (waves and kids);
   streets none (traffic); home the player's choice. Crowds murmur, never
   scream; volume caps in data/sound.json.
4. A reason to come and leave fulfilled:
   - Each visit opens with "Today on campus": three things to do (meet
     someone new, try an activity, join a conversation: the 0/3 pill),
     the hot topic of the day, and one suggested group or person.
   - During play: at least one prompt every 5 minutes (reply to the hot
     topic, a group to join, someone new nearby, an activity starting),
     never more than one on screen, never spammy.
   - On leaving, or after 20 minutes: "Today you..." (people met,
     activities, money and grades, streak) and what's on tomorrow.
