# Queue

Jobs the owner has sent that are not started yet, word for word. When a job is done, take it out of this file.

Read CLAUDE.md, docs/team.md and docs/now.md first, as for any job. Same rules for every job (owner, 11 and 12 Nov): quick gate green, push and deploy, update now.md, say on the first line if chat.sql needs running, and the PLAYER PASS (CLAUDE.md, top): play the changed areas as a new player at 390 px for 10 game minutes before pushing, with an "As a player" section in the report.

Order (owner, 12 Nov, the latest word): **I, K, J, L, F, H, G**; I, K, J and L are done (13 Nov), so next is **F**. Everything playable by Fri 13 Nov; launch stays Fri 20 Nov. Cursor is writing the words for J, K and L in docs/world-designer/alive.md on its own branch: wire them in when it lands, with placeholders until then.

Done already: L (consequences, music, a reason to come), I (first-play fixes), K (activities you play), J (a living world; the campus frame rate on a slow phone still open), Sims view, Sound, A (tester fixes 2, with the character button), B (Chat V2), C (Social C), Opening page V2.2, E (Notifications), D (Character in 3D), Movement.

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
