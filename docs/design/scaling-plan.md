# Scaling Plan: Ready for Lagos Life's Volume

**The benchmark.** Lagos Life reported a peak of more than 109,000 players online at once within days of launch (self-reported, unaudited). Its developer patched the backend live during the surge. We want the shape of the answer in place before launch, so a viral moment is a good day, not a fire.

**Where we are today.** One Realtime channel (`presence:campus`) for every player. Position updates slow as the room fills, to a floor of one per 1.5 seconds, inside a budget of 70 messages a second. On the Supabase free plan (100 messages a second, 200 concurrent connections) that holds about **11 moving players**; at 13 players start disconnecting. Fine for a 5-person beta, nowhere near launch.

**The principle.** Nobody, anywhere, puts 100,000 people in one room. Big online games run many copies of the world with a few dozen people each, and connect them with a shared layer (leaderboards, announcements, counts) that everyone sees. Players feel part of something huge while only ever walking among 30.

---

## Layer 1 — Shards (rooms of about 30)

- The campus runs as many copies: `UMzansi 1`, `UMzansi 2`, ... each its own Realtime channel.
- A server function assigns each arriving player to a shard: the one with **friends or housemates** already in it if possible, otherwise the fullest shard below 30, otherwise a new one.
- Shards below 5 players for more than 10 minutes are merged, so nobody is stranded in an empty campus.
- The shard number is visible in Settings, and a player can **join a friend** anywhere, which moves them to that friend's shard if there's room.
- Hosted rooms (Piece 6) are their own small channels and don't count against a shard.

## Layer 2 — Only send to people nearby

- Within a shard, a player receives frequent position updates only for people within about 40 m; people further away update every few seconds, and people out of sight not at all.
- Standing still sends nothing beyond a keep-alive.
- Chat bubbles already go only to people within 15 m; keep it that way.

## Layer 3 — The shared global layer

Things everyone sees, regardless of shard, served from the database, not broadcast per movement:
- Total students on campus (all shards), refreshed every 30 seconds.
- Leaderboards: overall, weekly, by house.
- Hunt start, winner announcement, and UMzansi FM shout-outs, pushed once to every shard.
- Enrolment count and the latest student numbers.

## Layer 4 — Capacity and cost

| Stage | Expected peak online | Plan |
|---|---|---|
| Beta | 5–20 | Free plan, one shard |
| Soft launch (WhatsApp groups) | 50–500 | Supabase Pro, $25/month: 500 concurrent clients, 500 messages a second; shards on |
| Viral | 5,000+ | Pro with usage-based Realtime, or a dedicated realtime service for positions only, keeping Supabase for accounts and data |

Decide the upgrade at a concrete trigger: **when peak online passes 50 two days in a row, move to Pro.** Not before.

## Layer 5 — Find the ceiling ourselves

Before any public link:
- A **load test** script spins up simulated players (headless, no rendering) that join, walk random routes, chat and leave, against a staging Supabase project.
- Run it at 30, 100, 300 and 1,000 simulated players. Record messages per second, disconnects, shard counts and join time.
- The game must degrade politely: if the backend refuses a connection, the player plays solo with "Campus is busy, joining you shortly" and retries in the background. Never a crash, never a frozen screen.

## Layer 6 — Static hosting

- The game's files move to Cloudflare Pages for the live launch (free, global CDN, no bandwidth bill); Vercel stays for previews.
- All large files (models, music, the poster) are cached aggressively with long cache headers and versioned filenames.
- The stale-file reload (already specified) means a mid-session deploy never strands a player.

---

## Order
1. Shards, with friends placed together.
2. Nearby-only updates.
3. The global layer.
4. The load test, run to 1,000.
5. Cloudflare Pages for the live site.
6. Pro, at the trigger.

All of this before the first public post. None of it before the beta.
