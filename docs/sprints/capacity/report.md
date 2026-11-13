# Job F: capacity for launch (13 Nov)

## Measured: bots on the TEST project (never the live one)
`scripts/load-bots.mjs` ran on the test project `dkuiqbgx…` (the live one is `ouzczzrj…`). Each bot is one phone: its own connection, a presence room, positions at the game's own rates, half of them moving, 20 s at each step. Raw numbers: `docs/sprints/capacity/bots*.json`.

| Room size | Bots | Joined | Messages a second delivered (of expected) | Lag p50 / p95 |
|---|---|---|---|---|
| 40 | 20 | 20 | 221 of 222 | 192 / 197 ms |
| 40 | 50 | 50 | 805 of 800 | 193 / 327 ms |
| 40 | 60 | 51 (9 closed by the server) | breaking | |
| 40 | 100 | 28 (72 closed) | 671 of 1,707 | |
| 20 | 60 | 60 | 663 of 665 | 191 / 197 ms |
| 20 | 100 | 100 | 1,104 of 1,108 | 191 / 197 ms |
| 20 | 160 | 8 (152 closed) | collapsed | |
| 10 | 150 | 150 | 862 of 863 | 191 / 195 ms |
| 10 | 200 | 22 (178 closed) | collapsed | |

**What it shows:**
1. **A room of 40 breaks on its own.** One channel carrying about 600 messages a second made the server close members' channels while the project as a whole had room. **The room cap is now 20** (measured clean).
2. **Past the project's limit, Supabase doesn't slow down; it closes nearly everybody's channel at once.** On the test project that happened between about 1,100 and 1,800 messages a second, and at about 200 connections. **The busy line must hold the game under that limit.** It does once `max_players` is set (default now 200).
3. **Lag is about 0.2 s** at every size, while under the limit.

**The test project's plan** (probably Free) is smaller than Pro. Scaling by the owner's Pro figures (2,500 messages a second, 500 connections; 10,000 with the spend cap off):
- **Supabase Pro, rooms of 20:** about 11 messages a second per player, so about **200 players at once**. Set `max_players` to 200.
- **Pro with the spend cap off:** still about 200, since messages a second bind, not connections, unless Supabase raises the per-second limit. With rooms of 10 (about 5.7 a player), about 400.
- **Several thousand at once** needs both of these:
  1. **Positions only to people who can see you** (spatial channels, about 2 a player).
  2. **Supabase raising the per-second limit.** Ask support; it is a ticket on Pro, or included on the Team plan.
- **Not measured:** the database under bots (the busy line and chat need `supabase/schema.sql`, `launch.sql` and `chat.sql` run on the test project first; the owner's step). The database calls are about one a minute per player, far from any limit.

Estimated per room (`roomCost(n)`, half moving), before and after this job:

| Room size | Room, before | Room, after | Per player, after |
|---|---|---|---|
| 10 | 57 | 52 | 5.2 |
| 20 | 222 | 209 | 10.5 |
| 40 | 910 | 624 | 15.6 |

## What changed (item 2: cost per player)
- **Heartbeat while standing still:** every 2 s, stretching to 3.5 s as the room fills. A frozen phone still vanishes within 10 s.
- **Name, look and card in the message:** every 30 s, plus on a hello (was every 5 s). Same message count, much less data.
- **Moving updates:** full rate only while another player is within 50 m. Otherwise they ride on the heartbeat.
- **Counters:** `window.mzansiPresence().traffic` shows sent and received a second; `roomCost(n)` gives the estimate used by #/health.
- **Owner's choices (one constant each):**
  - The 10 s rule for a frozen phone. Relaxing it to about 60 s lets Supabase Presence notice the drop, so standing still costs nothing. That cuts about 40% at 40 a room.
  - The room cap: now 20 (was 40), measured. Rooms of 10 halve the cost per player again, with fewer people in view.

## Item 3: never break when full
- **The busy line** (`supabase/launch.sql` CAPACITY: `cap_enter`, `cap_leave`, `cap_status`; `src/capacity.js`):
  - Up to `max_players` (3,000, in `cap_config`) are in at once.
  - New arrivals see "Campus is busy. You're in line: #N", are not in the live rooms while they wait, and come in by themselves, oldest first.
  - Players already in keep playing. They check in every minute, and their place frees after 150 s unseen or when the tab closes.
  - Without the SQL, everybody comes straight in.
  - **Set max_players from the ceiling above.** It starts at 200, e.g. `update public.cap_config set value = 200 where key = 'max_players';`.
- **Chat slows before it fails** (`src/threads.js`): after a server error, a send retries after 1.5, 3 and 6 s, and the list syncs a third less often for 2 minutes. The player sees "Chat is busy right now" instead of a hard failure.

## Item 4: download size
- **Before Play (the opening page):** 5.9 MB, now 2.5 MB.
- **First visit to the campus:** about 20 MB, now 9.6 MB.
  - Students' parts: 6.5 MB, now 1.1 MB.
  - Animation library: 7.6 MB, now 2.3 MB.
  - City buildings, cars, props and suburb kit: 4.5 MB, now 0.7 MB.
  - All Draco (`scripts/compress-people.mjs`); one shared loader (`src/world/gltf.js`).
  - These are uncompressed byte counts from the local preview; Vercel's gzip makes the code smaller still.
- **Return visit:** the code (`/assets/`) was already cached for a year. Models, audio, stills, icons, fonts and the Draco decoder are now cached for 7 days and refreshed in the background (`vercel.json`). A return visit downloads about the page itself plus anything changed.
- **Not deployed any more:** the 2.9 MB source picture of the opening page (now in `assets-src/`).
- **Biggest left:** the animation library (2.3 MB, of which the game uses a few dozen clips). Cutting it to just those clips is a further 1-2 MB.

## Item 5: #/health
- **Realtime (Supabase Pro):** connections against 500 (10,000 with the spend cap off), and messages a second (estimated from each room's size) against 2,500.
- **Capacity line:** in, of max, and waiting (once the CAPACITY block is run).

## What the owner must buy or switch on
1. **Supabase Pro** ($25 a month), with the **spend cap off** (connections over 500 are billed instead of refused).
2. **Run `supabase/launch.sql` again** (the CAPACITY block), then set `max_players` to the ceiling for your plan.
3. **For more than a few hundred at once:** ask Supabase support to raise Realtime messages a second, and plan the spatial channels (a job of its own, about a day).

**Rough monthly cost.** Check the Supabase pricing page before buying; these are the published Pro rates as I know them: 5 million messages included, then about $2.50 a million, and about $10 per 1,000 peak connections over 500.
- An average of 50 players online all month at 10 messages a second each is about 1.3 billion messages: about $3,200 a month for Realtime alone.
- With rooms of 20 (now) and the relaxed heartbeat it is about a third of that.
- With the spatial channels, about a tenth.
- **This is the number to watch.** Supabase's usage page shows it daily.

## Launch-day checklist
- [ ] Spend cap off on Pro; billing alerts at $100 and $500.
- [ ] `supabase/launch.sql` run (CAPACITY); `max_players` set.
- [ ] `supabase/chat.sql` run (jobs I and earlier).
- [ ] #/health: every row Yes; Realtime and capacity rows show numbers.
- [ ] Supabase usage page open: Realtime messages and peak connections.
- [ ] If messages a second pass 2,000: lower `max_players` (new arrivals wait in line; nobody already in is thrown out).
- [ ] Instant Rollback in Vercel ready if a deploy misbehaves.
