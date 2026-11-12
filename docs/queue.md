# Queue

Jobs the owner has sent that are not started yet, word for word. When a job is done, take it out of this file.

Read CLAUDE.md, docs/team.md and docs/now.md first, as for any job. Same rules for every job (owner, 11 and 12 Nov): quick gate green, push and deploy, update now.md, say on the first line if chat.sql needs running, and the PLAYER PASS (CLAUDE.md, top): play the changed areas as a new player at 390 px for 10 game minutes before pushing, with an "As a player" section in the report.

Order (owner, 12 Nov, the latest word): **I, K, J, L, F, H, G**. Everything playable by Fri 13 Nov; launch stays Fri 20 Nov. Cursor is writing the words for J, K and L in docs/world-designer/alive.md on its own branch: wire them in when it lands, with placeholders until then.

Done already: Sims view, Sound, A (tester fixes 2, with the character button), B (Chat V2), C (Social C), Opening page V2.2, E (Notifications), D (Character in 3D), Movement.

---

=== JOB I · Opus, High · FIRST-PLAY FIXES (owner's play test, 12 Nov) === (IN PROGRESS, 12 Nov, Claude Code)
Bugs
1. Tapping an NPC in SunnyBay made it vanish.
2. NPC feet sink into the ground; NPCs bunch up and stand silent at the
   bowling alley and the beach. Every NPC either does its place's thing
   or moves on.
3. You can walk through cars: player and cars collide. Cars still never
   hit you: they stop, hoot, and the driver shouts a short line (words in
   data/ for Cursor, nothing offensive).
4. The SunnyBay sign stands in the road and cars drive through it. Move
   it beside the road; no prop on any lane.
5. Keyboard movement drifts diagonally. Keys go straight in the pressed
   direction, relative to the camera (the mouse is fine as it is).
6. The bank must show the player's current money.
7. The Arcade card says "Shopping done". Each place's result card names
   the right kind of activity.
8. Two players arriving together landed on the same spot from identical
   cars, the same mum in the same clothes. Arrivals queue behind each
   other at the drop-off; drivers vary (mum, dad, aunt, uncle, gogo,
   older sibling) with varied outfits and cars.
9. Neither the owner's phone nor PC asked him to complete the student
   card. New players get the card flow; a returning player with an empty
   card gets one gentle "Finish your student card" prompt.
10. Launch reset: a script the owner runs before launch that clears test
    players, messages, groups and posts. The Quad shows only the last 24
    hours to anyone.
Social
11. Tapping a player opens their full card on the light blue chat
    background (not dark): face, name, @handle, house, course, year,
    followers count, friends count. Two buttons only: Chat and Follow.
    Remove Wave, Say hi and the envelope.
12. Chat is a request: "Thabo wants to chat. Accept / Decline". The DM
    opens only after Accept. Decline tells the asker only "can't right
    now"; they can't ask that player again for 7 days. Never past a
    block; a daily cap on requests. Friends both ways and existing chats
    skip the request.
13. "Online" / "last seen 2 h ago" in the chat header and on the card,
    for friends both ways only.
14. Handles: Soft Life handles only, no social media. Unique (case does
    not count), word-filtered, refuse staff-like names (admin, support,
    softlife, moderator), never made from the player's name.
Finding your way
15. A new map with campus and SunnyBay together: the road and taxis
    between them, every place named, "You are here", tap a place to go
    (walk or taxi). Clear at 390 px; SunnyBay's map gets names too.
16. The campus gate points to SunnyBay ("SunnyBay is 5 min by taxi. Take
    a taxi / Walk") instead of "nothing to do at the gate". Signposts to
    SunnyBay on campus.
17. Taxi ranks: a board with the next taxi and its time. Tapping the
    rank offers "Wait for the next taxi (2 min)". "Request a ride" in the
    menu and on the map: a taxi comes to you, a little dearer, after a
    short wait.
Player pass with two players. Screenshots at 390 px.

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

---

=== JOB F · Opus, High · CAPACITY FOR LAUNCH ===
Target (owner, 12 Nov): launch Fri 20 Nov ready for 100k players signing
up over the first weeks and several thousand playing at once. No move
away from Supabase before launch.
1. Measure with bots on a separate TEST Supabase project (never the live
   one): where the game breaks on Realtime connections, messages per
   second, presence, database calls and the push function. Report the
   ceiling in players-at-once for Supabase Pro and for Pro with the spend
   cap off (10,000 connections, 2,500 messages/s), and what we'd need
   beyond that.
2. Cut the cost per player: positions and presence only as often as
   needed and only to players who can see each other; batch database
   writes; nothing per frame. Report messages per second per player
   before and after.
3. Never break when full: near a limit, new arrivals see "Campus is busy.
   You're in line: #N" and get in as space frees; players already in keep
   playing; chat slows down before it fails.
4. Download size: MB for a first visit and for a return visit; long cache
   headers on models, audio and stills; trim anything oversized.
5. #/health shows connections and messages per second against the plan's
   limit.
Report: the ceiling with numbers, exactly what the owner must buy or
switch on in Supabase and Vercel (with rough monthly cost), and a
launch-day checklist.

---

=== JOB H · Opus, Medium · LAUNCH SAFETY ===
1. Players can delete their own Board posts and replies.
2. Invite a friend pays only when the friend comes back on a second day.
3. A blank page can never happen: any load error shows "Something went
   wrong. Tap to reload" and is logged (G shows it). Test with a forced
   error and with an older version's save.
4. Trim the quick gate back towards 10 minutes without losing what it
   proves; list what moved to the full suite.

---

=== JOB G · Opus, Medium · OWNER REPORTS ===
An owner page at #/owner that only the owner's account can open (checked
on the server), readable on a phone, each report with a time range:
1. Live: players online now by room and district; Realtime use against
   the limit.
2. Growth: sign-ups today and this week; how many come back the next day
   and after 7 days; where players are from.
3. Time played: average session, minutes per player per day, sessions
   per day.
4. Hot areas: visits and minutes per place and district by hour, as a
   ranked list (counts only, nobody's path).
5. Feedback: in-game feedback, newest first.
6. Support: reported posts and groups with Keep / Hide buttons (the
   review screen for hidden posts), blocks per day, word-filter hits.
7. Chat and pings: messages per hour, active groups, The Quad, pings
   sent, how many players turned pings on.
8. Errors: load errors and crashes from phones, newest first.
9. Economy: money spread; invite rewards claimed per player (to spot
   farming).
Record only what these need, in batches, never per frame, and add what
is recorded to the privacy page. Write docs/owner-reports.md: what each
number means and what to do when it looks wrong.
