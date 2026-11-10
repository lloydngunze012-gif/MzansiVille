# Launch safety, quick start and leaderboard (owner, 9 Nov; built 10 Nov)

Testers Wed 11 Nov, launch Fri 13 Nov. `docs/world-designer/city.md` and `data/campusville/city.json` were not touched.

## Before the testers: run supabase/launch.sql
One file, run once in the Supabase SQL editor (the owner does that; re-runnable). Until then the game plays on: points are counted on the phone and queued, the leaderboard says "opens soon", Feedback goes into `client_errors` (kind `feedback`), and error/funnel rows go in without the new `player` column. `#/health` shows which of the new tables exist (today, live: Supabase reachable yes; Leaderboard SQL no; Feedback SQL no).

## What was built
| Part | Where |
|---|---|
| A1 One screen: eight students, name (handle made from it), country, Play | `src/ui/quick.js`, `data/campusville/quickstart.json`, main.js `quickPlay` |
| A2 Roommate default; introduces themselves at the drop-off; small "Swap roommate" opens four cards | `src/world/dropoff.js`, `src/launch.js` openSwap, main.js (pick kept in `run.pendingRoommate`, applied when the drop-off is done) |
| A3 "Finish your student card, and get R200": after the first paid gig or meal, or when another player taps you; only when calm; once a day; until done; R200 once + badge "Card made" | `src/launch.js` (calm, showCardPrompt), main.js `openCardEditor`, `enrol-enter` |
| A4 Old saves skip all of it | no `run.quick` on an old save |
| B Three boards, top 10 + "You: #N", Monday 00:00 SAST reset, top 3 keep a badge, scores only from activities with daily limits checked by an RPC, card for returning players + menu | `data/campusville/leaderboard.json`, `src/engine/scores.js`, `src/scores.js`, `src/launch.js` openBoard, `supabase/launch.sql` |
| C Every finished activity counted in the save and in Supabase | `run.counts`, `run.finished`, `run.outbox` -> `record_activity` -> `activity_log` |
| D1 Rooms of at most 40, the extra player gets a new room | `src/presence.js` (campus, campus-2, ...) |
| D2 Errors to Supabase, at most 20 per player per hour | `src/errors.js` (phone cap) + trigger in `launch.sql` |
| D3 Funnel events in the same table | `src/events.js`: link_opened, play_tapped, first_activity, card_started, card_finished, feedback_sent |
| D4 #/health | `src/health.js`, `src/ui/health.js` |
| D5 Feedback button in the menu, "How's it going?" on the third session | `src/launch.js` openFeedback, table `feedback` |

## Decisions the owner may want to change
- **No tick box.** The rules screen's "I agree to keep campus kind" tick is replaced by the line under Play, "By tapping Play you agree to keep campus kind: Community rules". That is what makes it one screen. Say if the tick box must come back.
- **House and course are random** at quick start (both can be changed later in the full editor). The roommate is the cast job's default.
- **Badges start with week 1 = Monday 16 Nov** (`firstBadgeWeek` in leaderboard.json). The testers' week and the launch weekend count on the board but give no badge.
- **The leaderboard card for a returning player** is once a day, at a calm moment; the menu entry "Weekly leaderboard" is there for everyone from the start (only the automatic card waits for the second session). The old trophy page is now "All-time boards" in the menu.
- Scores: 60 rules built from activities.csv (points 6-20, daily limits 1-4; chats 2 points up to 10 a day). Cursor can tune `leaderboard.json`, then `npm run scores-sql` and re-run the SQL file.

## Tests
- `npm run check` (now 62 sim checks + the generated-SQL check + 11 SQL checks on real Postgres through PGlite, a new dev dependency): the daily limit (12 points, 3 a day, then 0), the next SAST day fresh, a retried event not counted twice, no rule = logged but never scores, a wrong secret refused, no direct table writes, the board top 10 with names cleaned, top-3 badges only from the first badge week, 20 errors and 40 funnel rows per player per hour, feedback write-only.
- `tests/e2e/launch.spec.js` (in the quick project): L1 link to the home scene in about 6 s (asserted under 30 s), eight students, one screen; L1b short name stays, returning player never sees the quick start; L2 swap roommate at the door; L3 the card prompt after a real Caf meal, never while a result card is up, "Later" then not again today, asked again tomorrow, R200 once, never again; L4 leaderboard for a returning player and not a new one, three tabs, top 10, "You: #12", the badge arrives, finished activities are sent; L4b board before the SQL is in; L5a errors capped at 20 and each with player/build/device, funnel rows; L5b #/health; L5c feedback from the menu and on the third session only.
- `tests/presence/rooms.spec.js`: cap of two, real Supabase Realtime: the third player lands in `<room>-2` and sees nobody from room 1; a fourth joins them; when a player leaves, the next one fills room 1 again.
- `tests/e2e/cards.spec.js` C8: the four pop-ups at 390 and 1280 px (`.sl-pop` is in the card list).

## Not tested, honestly
- The leaderboard against the live Supabase (the SQL is not run yet): only mocked responses in the browser and the real SQL on Postgres (PGlite).
- A 41-player room (tested with a cap of 2 on real Realtime).
- "Another player taps you" over two phones (the poke is sent on opening a card; the prompt logic is tested through the same entry point the poke uses).
- The quick-start cards show the drawn students, not 3D thumbnails.

## Screenshots at 390 px (on the PC, not committed): docs/sprints/launch/
quick-start-390, roommate-intro-390, roommate-swap-390, card-prompt-390, leaderboard-390, leaderboard-soon-390, feedback-390, feedback-session3-390, health-390.
