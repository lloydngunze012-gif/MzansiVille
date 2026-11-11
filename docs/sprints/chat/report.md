# Chat sprint (owner, 11 Nov): report

## Before tonight: run the SQL
**Lloyd: run the whole of `supabase/chat.sql` once in the Supabase SQL editor** (re-runnable). Until then the chat button opens a sheet that says "Chat opens soon"; nothing else in the game changes. `#/health` has a new line, "Chat SQL", that turns to Yes when it is in. Phones that are already open pick it up by themselves within about 25 seconds.

## What was built
1. **Chat tab.** A chat button in the top bar (beside the menu, with the unread count) and "Chat" in the menu. It opens the list: avatar, name, last message, time, unread badge, newest first. "Here now" on top is everyone your phone can see: one tap to message them. One tap opens a thread; the back arrow returns to the list.
2. **Thread view.** Your bubbles on the right, theirs on the left with name and avatar, the time on every bubble, one input with Send. It is a bottom sheet (62% of the screen, never more than 70%) and not a dialog, so you keep walking; the 3D picture moves up so you stand in the strip above the sheet (campus, Caf, SunnyBay). Messages are kept in Supabase: the last 200 per thread.
3. **Groups v1.** "The Quad" is made by the SQL and every player is a member from their first visit (a new member starts with nothing unread). Its pinned topic sits on top of the thread: "R15 for a taxi to town: fair or robbery?" (`data/campusville/topics.json`, first entry; `npm run check` fails if the SQL and the file disagree). Making a group has no screen yet; the server side is ready (`chat_group_create`, `chat_set_topic` for the creator) and tested.
4. **The ping.** A two-note ding (synthesised, no file; the Sound switch mutes it) and a banner at the top with the sender and the first words. Tapping it opens the thread. It is on the page itself, not in a scene, so it shows on campus, in the Caf, in SunnyBay and inside places. Never for the thread that is open.
5. **Limits and safety.** Checked by the server: one message per 2 seconds, 30 per 5 minutes, 300 characters. Every message goes through the existing filter on the phone (phone numbers, links and handles out with the reason; a slur is not sent) and the server's word filter. Long-press a message: Report (the server keeps a copy of the text) or Block. Block hides both players from each other in every thread, and closes their DM. Group names must pass the handle blocklist and the word filter (`src/engine/groupname.js`).
6. **DMs.** From "Here now", from a name in a group, or the new "Message" button on a player's mini card.

## How it is kept safe
No chat table can be read or written directly: row level security is on with no policy for players. Everything goes through functions that check the phone's secret (the same one the leaderboard uses), that you are a member of the thread, the limits and the blocks. Realtime carries no message text: the sender's phone broadcasts a small "something new" nudge and each member's phone fetches the new lines from the server. A fake nudge can only make a phone ask the server, which answers with the truth. A lost nudge is caught by a check every 25 seconds.

## Tests
- `npm run check`: 75 checks and 19 SQL checks. Eight are new and run `chat.sql` on real Postgres: The Quad and its topic, who-you-are, DMs with unread counts and order, members only, no direct table access, the 2 s and 30 per 5 min limits, 300 characters, a slur refused, the last 200 kept, blocks both ways, reports, groups and the creator's topic.
- `tests/presence/chat.spec.js` (three phones, real Supabase Realtime, real GPU): two phones DM with pings both ways; a third joins The Quad and all three see the same lines in the same order; a flood is refused politely and reaches nobody; a blocked player's messages vanish both ways while the third still sees everyone. Passed.
- `tests/e2e/chat-quick.spec.js` (in the quick project): Q1 the sheet, the pin, send, the refusal, the filter, walking with it open, the ping from the 25 s check, report and block; Q2 the chat stays open while walking from the Main Gate to Lifecup, still sends there, and the ping shows in SunnyBay. Passed.
- In both, the chat's server is `chat.sql` on a real Postgres inside the test (`tests/chat-server.js`), so nothing is written to the live project. **Not tested against the live Supabase**, because the SQL is not in it yet. The first real run is yours: see "On your phone" below.

## Screenshots at 390 px (on the PC, not committed): `docs/sprints/chat/`
`thread-list.png`, `dm.png`, `quad.png` (The Quad with its pinned topic), `ping-dm.png` and `ping-banner.png` (the banner), `quad-pinned-topic.png`, `walking-lifecup-chat-open.png`.

## Realtime message budget
Supabase counts every broadcast sent and every delivery. What a chat message costs:
- A DM: 2 messages (the nudge in, one delivery).
- A message in The Quad with N players online: about N messages (one in, N - 1 deliveries), plus N - 1 small database reads (not Realtime).

What we have (Supabase's published limits; presence.js already assumes the free plan):

| Plan | Messages a second | Connections at once | Messages a month |
| --- | --- | --- | --- |
| Free | 100 | 200 | 2 million |
| Pro | 500 | 500 | 5 million included |

Walking already uses up to 70 a second in a busy room (presence.js holds itself to that). That leaves about 30 a second for chat on the free plan.

- **Tonight (4 players):** a Quad message costs 4. Even with all four typing as fast as the limit allows (one every 2 s each) that is 8 a second. No risk.
- **Free plan, everyone in The Quad:** with N online each sending m messages a minute, the cost is N x N x m / 60 a second. At a lively 2 a minute each, about **30 players** can chat at once; at the hard limit of 6 a minute each, about **17**.
- **Pro plan:** about **110 players** at 2 a minute each, about **60** at 6 a minute each.
- The ceiling above all of this is connections: 200 players online at once on the free plan, 500 on Pro.
- The monthly total is used up mostly by walking, not chat: four testers walking for an hour is about 230,000 messages; their chat for the evening is under 5,000.

**For launch:** one Quad for everyone does not scale past the numbers above. The fix is one Quad per room of 40 (as the campus rooms already work), which keeps a message at 40 at most. Not built: say if you want it before Friday.

## Assumptions and things to know
- The old "Campus chat" (the lobby that needed a sign-in) is no longer in the menu; its page still exists at `#/chat`.
- The round "Talk" button on campus is unchanged: it is the nearby chat (speech bubbles within 15 m). Opening the Chat sheet closes it.
- With the sheet open it covers the minimap, the Talk button and the red Stop button; tap the ground above the sheet to walk, or close the sheet.
- In SunnyBay a place's "Things to do" list opens under the Chat sheet: close the chat to see it.
- A DM can only be started with a player who has opened the game since `chat.sql` was run (their phone registers on load).
- A new member of The Quad sees the last 200 messages when they open it, but none count as unread.
- Blocking someone tells their phone to refresh, so your messages leave their screen within a second or two; they are not told who blocked them.
- Changing the pinned topic: edit `topics.json` and the QUAD TOPIC line in `chat.sql`, then run the file again.

## Not done
- A screen to make a group, add members or leave one.
- The ping inside the Caf and inside a city place was not tested on its own (same code as campus and SunnyBay, which are tested).
- Typing indicators, read receipts, pictures, voice notes.
- The top bar at 360 px with the new button is covered by the existing top bar test (B7), not by a new one.

## On your phone tonight (after the SQL)
1. Open `#/health`: "Chat SQL: Yes".
2. Tap the chat button in the top bar: "The Quad" is there with the pinned topic. Say something.
3. A tester taps your face under "Here now" and messages you: you hear the ding and see the banner. Tap it.
4. Walk out of the gate to Lifecup with The Quad open.
5. Send two messages fast: the second is refused with "Slow down a little".
6. Long-press a tester's message: Report, then Block; their messages leave your screen.
