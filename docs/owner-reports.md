# Owner reports (#/owner)

Open https://softlifeza.vercel.app/#/owner on your phone, signed in with the owner's account (Settings). Anybody else sees "Owner only": the server checks (`public.is_admin()`), not the page. Pick **Today**, **7 days** or **30 days** at the top; every report follows it.

**Needs:** `supabase/launch.sql` and `supabase/chat.sql` run again (CAPACITY and OWNER REPORTS). Until then the reports say "Could not load this report", and the counts below start from the day they are run.

## What is recorded, and when
Once a minute, while a phone plays, the busy line's call (`cap_enter`) carries counts only:
- the day you played and your country;
- how long this session has lasted;
- which part of the game you were in (counted by hour, never your path or position);
- your in-game money;
- how many times the word filter stopped a message.

Nothing per frame, no message text, no real location. The privacy page says the same. Everything else in the reports comes from what the game already keeps: activities, feedback, errors, chat and reports.

## Each report, what it means, what to do when it looks wrong

**Live.** Players online now, each district's rooms, Realtime connections and messages a second against Supabase Pro's limits (500 connections, or 10,000 with the spend cap off; 2,500 messages a second), and the busy line (in, of max, waiting).
- **Messages a second near 2,000:** lower `max_players` (`update public.cap_config set value = 150 where key = 'max_players';`). New arrivals wait; nobody already in is thrown out.
- **Waiting above 0 for long:** you are at the cap. Raise it only if messages a second have room.
- **0 everywhere while people say they are playing:** check #/health ("Supabase reachable").

**Growth.** New players (first day in the game) today, this week and in the range. "Back the next day" (day 1 retention) and "back after 7 days" (day 7), of the players who started in the range and long enough ago. Where players are from.
- **Back the next day under 20%:** the first session is not landing. Play it as a new player (CLAUDE.md, PLAYER PASS) and read the feedback.
- **New today drops to 0:** the link or the quick start is broken. Check Errors and #/health.

**Time played.** Sessions, the average session in minutes, minutes per player a day, and sessions per player a day. A session ends after 3 minutes with no call.
- **Average session under 5 minutes:** players leave early. Look at Errors (crashes) and Hot areas (where they were).

**Hot areas.** Minutes by area (campus places, SunnyBay districts and places, the Caf), minutes by hour (SAST), and activities by place. A ranked list: counts only, nobody's path.
- **A place with no minutes:** players don't find it, or it doesn't open. Walk there yourself.

**Feedback.** In-game feedback, newest first: stars, words, where it was sent from, the phone.

**Support.**
- **Reported posts and groups,** with **Keep** (shown again, reports cleared) or **Hide** (a post is deleted; a group stays out of suggestions and its invite link stops working). A post with three reports is already hidden until you decide.
- **Blocks a day,** and **word-filter stops a day.**
- **Blocks or filter stops jump:** somebody is causing trouble. Check the reported posts, then the groups.

**Chat and pings.** Messages and messages by hour, how many were in The Quad, groups with messages in the range, pings (push notifications) sent, and how many players have pings on.
- **Pings sent 0 while players have pings on:** the push keys in Vercel are missing (#/health "Push keys").

**Errors.** Load errors (`boot`: the page could not start) and crashes from phones, newest first, by kind.
- **Many `boot` errors after a deploy:** use Instant Rollback in Vercel, then tell Claude Code.
- **One error repeating from one phone type:** pass the line to Claude Code as it is.

**Economy.** The spread of in-game money: the middle player, the poorest and richest 10%, the richest. Invite rewards claimed per inviter, and how many of those friends came back.
- **Richest far above everybody else:** look for a farmed reward.
- **One inviter with many claims and few who came back:** probably farming with fake accounts. The reward only pays when a friend comes back on a second day, so it costs them nothing yet. Watch it.
