# UMzansi Build Plan

One piece at a time. Each piece is a sprint, each sprint ends with the owner playing it on a phone, and the next piece does not start until the last one passed. Pieces are ordered by dependency: every one needs the one before it.

Read with `docs/design/retention-spec.md` and `docs/design/player-experience-spec.md`.

**Done means:** it works on the owner's phone, Claude Code reports the measured fps, and nothing earlier broke.

**Standing rules:** no feature outside the current piece; anything else goes to `docs/backlog.md`. No movement test claims a pass or fail below 20 fps.

---

## Piece 0 — The rename and the houses (half a day)

Everything already built keeps working; only names, grouping and spawn points change.

- Westville becomes the **University of Mzansi (UMzansi)**. Remove real campus names from the game, the README and the page title.
- The seven houses replace the current residences: **Thekwini** (green/gold), **Peak** (blue/white), **Oakwinds** (maroon), **Braam** (blue/gold), **Jakaranda** (purple), **Kingsway** (orange/black), **Mzansi House** (black/gold, the international house).
- Each house gets: a common room players spawn in, a colour used on its door, banner and the student card, and a house name on the profile.
- Existing places (Quad, cafeteria, library, lecture halls, sports centre, taxi rank) stay where they are. Only the res buildings are renamed and re-coloured.
- Houses live in one data file so a house can be added or recoloured without touching code.

**Phone test:** every house door opens into the right common room; the colours look right in sunlight and at night; no old campus name anywhere.

## Piece 1 — Enrolment and the student number (1 day)

- A 30-second enrolment: name, look, house, done.
- The server issues `26` + six digits in order (`26000001`...). A Supabase sequence inside a transaction. Never client-side, never reused.
- **Student card**: name, student number, house, Class of 2026, join date. Reachable from the menu in one tap.
- Numbers 26000001–26000500 carry a permanent **Founder** badge.
- The number shows on the profile and in the leaderboard.

**Phone test:** enrol a new account, get the next number, see the card; enrol a second account and confirm the number went up by one.

## Piece 2 — Real shared time (half a day)

- Game time is **South African time**, the same for everyone. No per-player clock.
- Four blocks: morning 05–11, afternoon 11–17, evening 17–21, night 21–05.
- Light, sky colour and ambient sound change with the block. The block name shows in the HUD.
- A few NPCs appear or disappear by block (the night security guard, the morning cleaner).

**Phone test:** the sky matches the real time of day in SA; two phones show the same block.

## Piece 3 — Talking (1 day)

Presence already works. This is what people do once they can see each other.

- **Wave, dance, react**: three always-visible buttons.
- **Quick chat**: eight tappable phrases plus free text.
- Chat is local: you hear people within about 15 m. A speech bubble above the speaker, and a small log.
- **Report and block**, from the first day, on any player, with a cooldown on new accounts.

**Phone test:** two phones, two players, a conversation; bubbles readable at arm's length; block works.

## Piece 4 — The daily loop (1 day)

- **Open and collect**: something is always waiting (yesterday's pay, a message, a hunt reward). One tap, visible reward.
- **Streak**: attendance days counted, shown on the student card.
- **One decaying thing**: pick exactly one (a plant, a debt, a tidiness meter). It drops when you skip a day and recovers in one session.
- The HUD's goal line is never blank: it always names the next thing to do.

**Phone test:** play, close, come back tomorrow: something is waiting, the streak went up, the goal line makes sense.

## Piece 5 — The hunts (2 days)

- Three a day: **07:30, 13:00, 20:00 SAST**. A countdown visible campus-wide for ten minutes before.
- Five minutes long. Clues in the HUD. The first valid claim wins.
- **Server-authoritative**: the browser claims a position and time, Supabase validates and awards. No win decided in the client.
- Rewards in layers: 1st a large rank boost and a public announcement; top 10 something real; everyone who took part a small reward and a hunt streak.
- Rotating win conditions (first to find / most clues / random draw among finders / house against house) and a weekly leaderboard that resets beside the all-time one.
- Must work with six players online; the hidden object's difficulty scales with the number online.

**Phone test:** a hunt with two phones; both see the countdown; the winner's name is announced to both; a faked claim is rejected.

## Piece 6 — Hosting a room (2 days)

- Any player's res room becomes enterable by up to **six** people: invite at the door, or from the in-game phone.
- One Supabase presence channel keyed to the host's room. Nobody outside sees in.
- Inside: seats that work, a speaker playing the host's track for everyone, a fridge the host stocks, a photo wall, the day's hunt results on the TV.
- **Three rules, built first:** the host can remove anyone instantly; any player leaves with one tap from any state; report and block work inside rooms.
- Hosting is counted on the profile (visits, sessions hosted).
- **Text chat only.** Voice notes are a separate, later sprint and need moderation tooling first.

**Phone test:** three phones in one room, all see each other sit and chat; host removes one; that player lands back outside, not stuck.

## Piece 7 — Two-person activities (1 day)

- Pool table, dance circle, two-person shift, study pair.
- The game pairs whoever is waiting; nobody has to ask a stranger.
- Each pays both players something, so there's a reason to do it with a stranger.

**Phone test:** two phones pair automatically within 20 seconds; both get paid.

---

## After these

Backlog, in rough order: voice notes with moderation, house-versus-house term scoring, graduation and Class of 2027, shops and outfits players can be seen in, Soft Life (Sandton) as the graduate city.

## What we never build

No NPC pathfinding, no crowd simulation, no player-to-player collision, no vehicles you drive, no physics, no voice chat without moderation. If a feature needs one of these, it becomes a card or it waits.
