# Moving from Supabase to AWS: estimate (13 Nov)

**Question:** can everything move from Supabase to AWS, with automatic scaling and pay-after-use billing, before launch on Fri 20 Nov?

**Short answer:**
- **Everything moving is about 170 hours.** There are about 50 working hours between now and Wed 18 Nov. It does not fit.
- **Only live movement moving is about 55 hours, and it only just fits.** That counts the Talk bubbles, pokes and the chat's "new message" signal, which share the same connection. It leaves no slack, and the first real test would be launch day itself.
- **My recommendation: launch on Supabase Pro** with the busy line and rooms of 20 (both built), and move live movement to AWS in the week after launch, behind a switch (section 5).

Nothing in the game was changed for this document.

## How the figures are marked
- **Measured:** our own bot runs on the TEST Supabase project (docs/sprints/capacity/bots*.json), and the message rates the code really sends (src/presence.js `roomCost`).
- **Estimated:** everything about AWS. Nothing has run on AWS yet. Prices are list prices as I know them for eu-west-1 (Ireland), with Cape Town (af-south-1) assumed about 20% dearer. **Check them in the AWS Pricing Calculator before deciding.**

## 1. What runs on Supabase today, by feature
Size: 99 SQL functions and 51 tables in supabase/schema.sql, launch.sql and chat.sql (3,200 lines). 16 files on the phone call 64 server functions. Four kinds of Realtime channel.

| Feature | What it uses on Supabase | Where in the code |
|---|---|---|
| Accounts and sign-in | Supabase Auth: email magic link and Google sign-in; `profiles` (role admin for the owner). **Optional:** most players never sign in; they are known by the phone's id and secret | net.js, schema.sql |
| Saves | `profiles.state` (the save, when signed in); `player_cards`, `player_handles` | net.js, cards.js, handles.js |
| Chat | 20 tables and about 60 functions: threads, lines, DMs and chat requests, The Quad, reports, blocks; polled every 25 s (`chat_sync`); Realtime channels carry "something new" nudges, never text | threads.js, chat.sql |
| Groups, friends | inside chat.sql: groups, asks, bans, friends, suggestions, Find me | threads.js, findme.js |
| The Board, follows, interests, the Daily | inside chat.sql: posts, stamps, replies, follows | board.js, daily.js |
| Push | `chat_push_*` tables and functions; Vercel functions api/push.js and api/push-daily.js call Supabase with the service key | api/_push.js, notify.js |
| Scores and counting | `record_activity`, the weekly boards, badges, `activity_log` | scores.js, launch.sql |
| Errors, funnel, feedback, smoothness | inserts into `client_errors`, `feedback`, `smooth_reports` | errors.js, events.js, smooth.js |
| Busy line, owner reports | `cap_enter` (once a minute), `cap_status`, `owner_report`, `owner_moderate` | capacity.js, owner.js |
| Presence and live movement | Realtime broadcast and presence in rooms of 20, per district: positions, the Talk bubbles (`say`), pokes (wave, food), "joined" toasts | presence.js, others.js, chat.js |

## 2. What each would move to on AWS, the work, and the risk for launch
Hours are mine (Claude Code), including tests. They do not include your time to set up the AWS account, billing and the email-sending approval.

| Feature | Moves to (AWS) | Hours | Launch risk |
|---|---|---|---|
| Accounts and sign-in | Cognito (email code and Google), the owner in an admin group; existing signed-in players sign in again by email | 14 | **High.** Sending email from AWS (SES) needs AWS to approve production access, usually about a day; the Google redirect setup; existing players re-linking |
| Saves | Aurora Serverless v2 (Postgres, scales by load, billed per use) with schema.sql as it is | 6 | Medium |
| The server-function layer (replaces Supabase's automatic API) | One Lambda behind API Gateway that runs only the 64 allowed functions, keeping the replies the phone expects (including "function missing", which the phone uses to switch features off) | 16 | **High.** Every feature goes through it |
| Chat, groups, friends, Board | The same SQL on Aurora (it already runs on plain Postgres: the 44 sql-checks prove it); the phone calls the new layer | 6 | Medium |
| Chat "new message" nudges | The new WebSocket service (below) | 4 | Medium |
| Push | api/_push.js pointed at Aurora instead of Supabase's REST | 4 | Medium |
| Scores, errors, feedback, smoothness | The new layer (inserts become functions) | 6 | Low |
| Busy line, owner reports | Aurora; the owner check reads the Cognito group instead of `profiles.role` | 5 | Medium |
| **Presence, live movement, Talk bubbles, pokes** | **Our own WebSocket service:** Node on ECS Fargate behind a load balancer with TLS, scaling with the number of connections. Rooms, presence, join and leave, and positions only to players near enough to see you (cells of about 60 m). The phone keeps presence.js's interface behind a switch, so it can fall back to Supabase | 30 | High, but contained by the switch |
| Infrastructure | Infrastructure as code, staging and live, secrets, deploys, alarms, a cost alarm | 12 | Medium |
| Moving the data | Copy Supabase to Aurora, check row counts, switch Vercel's settings, a freeze of about an hour | 6 | **High:** one chance, close to launch |
| Tests | tests/chat-server.js and every stand-in that matches `/rest/v1/rpc/*` move to the new addresses; the bots run on AWS; the full suite once | 10 | Medium |
| **Everything** | | **129, plus 30% for the unknown = about 170** | |

## 3. Two plans
Working days left: Sat 14, Sun 15, Mon 16, Tue 17, Wed 18. At about 10 hours a day that is **about 50 hours**. Thursday 19 Nov stays for your phone test and fixes.

### (a) Everything moves: about 170 hours. Does not fit.
| Day | Work |
|---|---|
| Sat 14 | AWS account, infrastructure, Aurora, the server-function layer begins |
| Sun 15 | The layer finished; saves, scores, errors moved |
| Mon 16 | Chat, groups, Board and push moved; the owner check |
| Tue 17 | Cognito sign-in; the WebSocket service begins |
| Wed 18 | WebSocket finished, data copied, tests |
| … | **About 120 hours still missing:** 12 more days at this pace. A realistic finish is about Wed 2 Dec. |

### (b) Only live movement and nearby chat move; Supabase Pro keeps the rest: about 55 hours. Fits only just.
Moves: presence and positions, the Talk bubbles, pokes, "joined" toasts, the room counts on the map and #/health, and the chat "new message" nudges. The nudges matter: otherwise every player still holds a Supabase connection, and Supabase's connection limit stays the wall.

| Day | Work (hours) |
|---|---|
| Sat 14 | The WebSocket service: rooms, presence, broadcast, cells; it runs locally against the existing two-phone tests (10) |
| Sun 15 | The phone's switch in presence.js and threads.js, with Supabase as the fallback; the two-phone presence tests pass on both (10) |
| Mon 16 | AWS: Fargate, load balancer with TLS, scaling, alarms, cost alarm; staging live (10) |
| Tue 17 | Bots on AWS (load-bots.mjs gets a WebSocket mode) up to 5,000; fix what breaks (10) |
| Wed 18 | Live behind the switch at 10% of players, then 100%; the quick gate, the full suite's presence tests, the player pass with two phones (10) |
| Thu 19 | Your phone test. If anything is off, the switch goes back to Supabase |

What (b) does **not** fix: the chat list is still polled from Supabase every 25 s (`chat_sync`). At 25,000 players at once that is about 1,000 calls a second to Supabase's database. That needs Supabase's larger compute add-ons, or the chat sync cut to "only on a nudge" (about 6 hours more; it would come out of the Wed slack).

## 4. Monthly AWS cost at 5,000, 25,000 and 100,000 players at once
Every figure below is **estimated**, assuming that many players **all month, around the clock**: the upper bound. A real month with that many at the evening peak and fewer the rest of the day is about **a third** of these figures (estimated).

The traffic each player costs comes from the game's own rates:
- **Measured** (code and bots), positions to the whole room as today: about 10.5 messages a second received in rooms of 20, about 1.2 KB a second.
- **Estimated**, with cells (positions only to the players near you): about 2.5 messages a second, about 0.35 KB a second. That is about 0.9 GB a player a month.

### Plan (b): live movement on AWS (with cells)
| Item | 5,000 | 25,000 | 100,000 |
|---|---|---|---|
| Fargate tasks (about 3,000 players a task, plus spares) | 3 tasks, about $130 | 11, about $475 | 38, about $1,650 |
| Load balancer (hours plus data processed) | about $40 | about $160 | about $570 |
| Data out to phones (Cape Town about $0.15 a GB) | 4.6 TB, about $690 | 23 TB, about $3,200 | 92 TB, about $11,000 |
| Logs, alarms, small cache | about $30 | about $80 | about $250 |
| **AWS total (estimated)** | **about $900** | **about $3,900** | **about $13,500** |
| Supabase Pro for the rest (with the compute the chat polling needs) | about $25 + $110 | about $25 + $950 | about $25 + $3,700 |
| **Plan (b) total (estimated)** | **about $1,000** | **about $4,900** | **about $17,200** |

Without cells (the whole room gets every position, as today), the data-out line is about 3.3 times higher. Cells are worth their hours.

### Plan (a): everything on AWS
| Item | 5,000 | 25,000 | 100,000 |
|---|---|---|---|
| Live movement (as plan b) | about $900 | about $3,900 | about $13,500 |
| API Gateway + Lambda (chat sync every 25 s, the busy line, everything else: about 70 calls a second per 1,000 players) | about $1,200 | about $6,000 | about $24,000 |
| Aurora Serverless v2 (scales with load) | about $350 | about $1,700 | about $6,500 |
| Cognito (signed-in players only), SES, backups | about $50 | about $150 | about $500 |
| **Plan (a) total (estimated)** | **about $2,500** | **about $11,750** | **about $44,500** |

Plan (a) costs more than plan (b) because the polling, as written, is paid per call on AWS; on Supabase it is one database you rent. Moving the chat to "sync only on a nudge" cuts the API line by about 80% (estimated) in either plan.

### For comparison, measured on Supabase today
The TEST project (Free plan) carried about 1,100 messages a second, then closed nearly every channel at once. Scaled to Pro (2,500 messages a second, your figure), that is about 200 players at once with rooms of 20. Supabase's per-second limit, not money, is what stops us. That is the real reason to move live movement.

## 5. Recommendation and what to cut
**Launch on Supabase Pro on Fri 20 Nov, with what is built:**
- the busy line, with `max_players` at about 200;
- rooms of 20;
- the lighter presence traffic.

New arrivals past 200 see "Campus is busy. You're in line" instead of a broken game. Ask Supabase support to raise the Realtime messages-a-second limit for the project; that costs nothing to ask.

**Then plan (b), the week after launch** (Mon 23 to Fri 27 Nov):
- built behind the switch;
- tested with bots on AWS to 5,000 before any player touches it;
- `max_players` raised step by step as #/owner's Live numbers stay healthy.

That is the same 55 hours without betting launch day on it. Add the chat "sync on a nudge" change (6 hours) in the same week.

**If (b) must happen before launch, cut to fit:**
1. **No cells:** whole-room broadcast as today, about 8 hours saved. The data out costs about 3.3 times more until they are added.
2. **No automatic scaling:** a fixed 3 tasks (about 9,000 players), about 3 hours saved. A cost alarm instead.
3. **Eu-west-1 (Ireland) instead of Cape Town:** skips any service gaps in af-south-1. About 160 ms for South African phones instead of about 20; that is fine for positions every half second.
4. **The map's room counts and #/health's Realtime row** keep reading Supabase for a week.
5. **Bots only to 2,000 on Tuesday,** not 5,000.

Even cut, Wednesday has no slack. The switch back to Supabase is the safety net, which is why it is the first thing built.

**Plan (a) should not be attempted before launch.** Re-plan it for December if Supabase's database (not Realtime) becomes the limit after launch, which #/owner will show.
