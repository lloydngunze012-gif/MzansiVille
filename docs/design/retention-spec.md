# University of Mzansi: Enrolment, Presence and the Daily Loop

A companion to the Player Experience Spec. That one answers "who am I becoming?". This one answers the harder question: **"why am I here right now, and why will I come back at 20:00?"**

The one-line test for every item below: *would a student with no friends in the game still feel something in their first 90 seconds?*

---

## 0. What we are actually building

CampusVille is **the University of Mzansi (UMzansi)**, a fictional South African university that anyone in the world can enrol in. It is unmistakably South African: amapiano in the Quad, taxis at the gate, a tuck shop, load-shedding jokes, "sharp" and "eish". Students from anywhere are welcome, and the flavour is the draw, not an obstacle.

UMzansi is where the life starts. Soft Life (Sandton, Cape Town, Durban) is where graduates go.

**The metrics that matter**, in order:
1. Players online at the same time (concurrency).
2. Seconds from a new player's spawn to their first conversation.
3. Day-1 and Day-7 return rate.
4. Session length is a *result*, not a target.

---

## 1. Enrolment and the student number

Identity before gameplay. A student number is permanent, public and free to build.

- Format: `26` + six digits, issued in strict enrolment order: `26000001`, `26000002`, ...
- Issued once, by the server, at enrolment. Never reused, never changed.
- Shown on the student card, the profile, the leaderboard and above the head on request.
- **Class of 2026** is a permanent cohort. Everyone enrolled in 2026 graduates together.
- **Founders:** student numbers 26000001 to 26000500 carry a Founder badge that can never be earned again.
- Enrolment is an event: it opens at an announced time, and the first thousand numbers go fast. This is the launch hook.

Rules:
- Numbers come from a Supabase sequence, inside a transaction. No client-side numbering.
- The enrolment screen is 30 seconds long at most: name, look, residence, done. Every extra field loses players.

## 2. Presence: other people, visible

Nothing else in this document matters until this works.

- Every player's position, heading and pose is broadcast a few times a second and interpolated between updates. Players pass through each other; no collision between people.
- A name and student number float above each player, readable at phone size.
- **Nobody ever spawns alone.** New and returning players spawn at the busiest populated spot. If fewer than three real players are online, the Quad is filled with NPC students so the world is never empty.
- A simple "X students on campus" count is always visible. It is social proof and it tells people when to come back.

## 3. Low-risk social actions

Talking to strangers is frightening. Waving is not.

- Three always-visible buttons: **wave**, **dance**, **react**.
- Quick chat: eight tappable phrases ("Sharp!", "Where's the hunt?", "Join me", "Class of 2026?") plus free text.
- Chat is local: you hear people near you. No global shouting.
- **Two-person activities** that pair strangers automatically: the pool table, a dance circle, a two-person shift at the car wash, a study pair in the library. The game makes the introduction; the player never has to ask.
- Report and block from the first day, with a cooldown on new accounts. A social game without moderation tools becomes unplayable within a month.

## 4. Real shared time

Game time runs on **South African time**, the same clock for everyone, so "20:00" means one thing to the whole campus.

- Morning (05:00–11:00), afternoon (11:00–17:00), evening (17:00–21:00), night (21:00–05:00).
- Light, sky, sounds and which NPCs are around change with the block.
- Some activities only exist in one block: roll call in the morning, the open mic at night.

## 5. The daily loop

**The ten-minute session**, designed to end well:
1. Open. Something is waiting: yesterday's pay, a message, a seat a friend saved.
2. Collect it. One tap, visible reward.
3. One activity (a shift, a lecture, a hustle).
4. One conversation, nudged by the game if the player is alone.
5. Set tomorrow up: choose what you are doing next, which creates the reason to return.
6. Close.

**Pressure to return**, no more than two of these at once:
- A streak that counts attendance days, with a visible flame on the student card.
- One thing that decays when ignored: a plant, a debt, a roommate's patience.
- Something a friend left for you.

Never punish a player so hard for a missed day that returning feels pointless.

## 6. The hunts

Three times a day, at **07:30, 13:00 and 20:00 SAST**, a five-minute campus-wide hunt. A countdown is visible everywhere for the ten minutes before it starts.

**Shape:** an object or location is hidden somewhere on campus; clues appear in the HUD; everyone runs. The first valid claim wins.

**Rewards in layers, so showing up is never a waste:**
- 1st: a large leaderboard boost in one area, a public announcement, a badge for the week.
- Top 10: a meaningful reward.
- Everyone who takes part: a small reward and a hunt-attendance streak.

**Variety, so the same five players don't win forever.** Rotate the win condition: first to find; most clues found; a random draw among everyone who found it; residence against residence. Run a weekly leaderboard that resets alongside the all-time one, so a newcomer can top something in their first week.

**Server-authoritative, from day one.** The browser claims "I am at this spot at this time"; Supabase checks the position and the clock and awards the first valid claim. No win is ever decided in the client. Retrofitting this after the first cheating scandal costs the community.

**Must work with six players online.** Launch week will have six. Scale the hidden object's difficulty to the number online.

**Public glory:** when a hunt is won, everyone online sees the winner's name and student number.

## 7. What we do not build

No NPC pathfinding, no crowd simulation, no player-to-player collision, no vehicles you drive, no physics, no voice chat. If a feature needs one of these, it becomes a card or it waits.

## 8. Build order

1. Presence: other players visible and moving, names above heads, never spawn alone.
2. Wave, dance, react, quick chat.
3. Enrolment, student numbers, the student card.
4. Shared SA time and the four blocks.
5. The daily open-and-collect, plus one decaying thing.
6. Hunts, server-side, with layered rewards.
7. Two-person activities.

Nothing in 4 to 7 starts until 1 and 2 are good on a real phone.
