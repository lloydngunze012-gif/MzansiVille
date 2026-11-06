# Month 1: three things, done properly

**Owner's call (6 Nov):** we have enough places for a good first month. No new places. Month 1 makes what we have feel great, and it comes down to three things. If these three are right, people forgive the rest.

1. **Flow:** walking and every activity feel seamless, no lag, a clean view.
2. **Talk:** conversations keep going. It should feel like WhatsApp, with radio and the chance of new friends: a place to communicate and unwind.
3. **Sound:** music people actually want to leave on.

Month 2 is **Soft Life: Sandton Dreaming**, which opens the game to a wider audience. Nothing for it gets built in month 1.

Each pillar below has a **bar** (what "right" means, so we can measure it), **what's missing today**, the **work**, and **how we check it**.

---

## 1. Flow

### The bar
- **Smooth:** 30 fps or better on a cheap Android (a phone around R2,000), 20 fps as the hard floor. Measured on real players' phones, not just tests.
- **Instant:** the player starts moving within 0.1 s of a tap. Nobody stops short, gets stuck, vibrates, sits on air or walks through things.
- **Clean view:** while walking, the screen shows only the essentials (time, the goal line, the Stop button). The camera never ends up inside a wall, tree or person. Cards never cover the faces of the people you're talking to.
- **Every activity follows one shape:** tap a place → walk there → arrive → one card → the action plays → the result floats up → you're free again. No more than two taps after arriving, and never more than 3 s where nothing visibly happens.
- **Fast start:** playable within 8 s on 4G.

### What's missing today
We only know fps from tests on Lloyd's PC. We don't know how real phones do. Bugs like the missing breakfast chairs and the queue jitter were found by Lloyd playing, not by our checks.

### The work
1. **Smoothness reports from real phones.** The game quietly sends a small report every few minutes to Supabase: device, fps (typical and worst 10%), long frames, load time, and any stuck or stalled walk with where it happened. A simple page for Lloyd shows it per place.
2. **The flow audit.** QA plays every activity at every place against the bar above and logs each problem with a screenshot. Fixes go out in batches by place, worst place first.
3. **The walking view.** The HUD shrinks while you move and comes back when you stop. The camera has no-go zones (canopies, walls). One nudge at a time, never over faces.
4. **More and better activities in each place** (Cursor, `data/`). Every place gets enough to do, each written to the one-shape rule. Quality over count.

### How we check it
The fps dashboard by place and device. A flow test per place in Playwright (tap → arrive → act → free, with timings). Lloyd's phone run through every place once a week.

---

## 2. Talk

### The bar
- Messages **wait for you.** Come back tomorrow and your conversations are still there, with unread counts. That's the WhatsApp feeling.
- **Somewhere to belong from minute one:** your house chat exists the moment you enrol.
- **Anyone can start a group.** "Science Students Forum" for jokes and science talk should take 30 seconds to set up and feel like it belongs here.
- **Talk turns into meeting.** A group can meet at a spot on campus, and from a chat you can walk to a friend.
- **Safe enough to relax in:** filters, report and block, and group admins who can remove people.

### What's missing today
Chat is local only. Bubbles show within 15 m for 8 s, and the log keeps 60 lines in memory. Nothing is saved, so when you leave, the conversation is gone. There are no direct messages, no groups and no history. People can talk in the game, but they can't stay in touch through it.

### The work, in order
1. **Friends and direct messages.** Add a friend, chat one-to-one, and messages are saved, so they're there when you come back. DMs between friends only (both added each other) in month 1: strangers DMing strangers is the riskiest feature in any social app.
2. **House chats.** Every house has a group chat everyone in it joins automatically. Cursor writes a daily house question to get people talking ("Best kota in your hometown?").
3. **Clubs (groups anyone can start).** A name, a one-line about, and an emoji. Join with a tap. The creator is admin and can remove people. Each club can claim a meeting spot (a Quad bench, a caf table, a library table), where members see each other's tags light up. A club directory lets people browse and join.
4. **Small things that keep talk going:** emoji reactions, replying to a message, a "who's online" list with "walk to them", and an "N new messages" badge on return. Phone notifications (installing the game as an app) are a maybe for late month 1.

### Safety, built in rather than added later
The existing filter and report/block cover every new kind of chat. Rate limits per player and per group. Group admins can remove people, and Lloyd can remove a group or a player. Text only: no images and no voice notes in month 1. All of it goes through Supabase with row-level security, so a player can only read the chats they belong to.

### How we check it
Per day: the share of players who send at least one message, messages per active player, the share with at least one friend by day 3, the number of active clubs, and how many players come back to unread messages. The beta testers say whether it feels like a place to hang out.

### Limits to watch
The Supabase free plan caps live connections and monthly realtime messages. Saved chats should load once and then update live, not poll. The scaling plan's shards and the nearby-only updates still have to land before any public post. Group and DM chat run outside the shards, so friends in different shards can still talk.

---

## 3. Sound

### The bar
- Music people leave on. **No track repeats within an hour** on any station.
- **Shared:** everyone on a station hears the same song at the same moment, so "what's this song?" is something people can say in chat.
- **Credited:** a "Now playing" line shows the artist with a link. That's how we pay unsigned producers back.
- **Light on data and never cutting out:** low bitrate, cached, keeps playing across scene changes, a data-saver setting.
- Starts within 2 s of switching on.

### What's missing today
One ambient loop (`music_campus`) on repeat, which gets annoying within minutes. No stations and no radio.

### The work
This is the radio half of `stimulation-spec.md`, with two month-1 additions:
1. **The radio:** stations, a phone radio in the menu, and world speakers (caf, Quad, common rooms, taxi rank, the parked car) that get louder as you walk closer.
2. **Synced play:** each station's position comes from the server clock, so everyone hears the same moment. No streaming server needed.
3. **UMzansi FM:** the campus station, with the DJ voice for hunts, winners and house shout-outs.
4. **Talk meets music:** react 🔥 to the song in chat, and clubs and houses can set their spot's speaker to a station.

### The long pole: the music itself (Lloyd)
Nothing else in month 1 depends on finding people outside the team. Start now: contact unsigned South African amapiano, gqom, hip-hop and gospel producers for permission in writing, with credit and a link in return. Minimum to launch: **3 stations, each with at least an hour of music** (about 15–20 tracks). Cursor records every track, its artist, link and licence in `data/campusville/music.json`.

**Data:** at 64 kbps an hour of radio is about 29 MB, which students on prepaid data will notice. Default to 48 kbps, cache every track, and make data saver play only the world speakers you're near.

### How we check it
Average listening minutes per session, the share of players who switch stations, mutes (a high mute rate means the music is wrong), and song reactions in chat.

---

## Suggested order for the month

The owner decides; this is a proposal.

| Week | Flow | Talk | Sound |
|---|---|---|---|
| 1 | Smoothness reports, the flow audit, first fixes; Operation Beta with 5 testers | Friends and saved DMs | Lloyd: music outreach starts |
| 2 | Fixes by place; the walking view | House chats and daily questions | Radio with synced stations and world speakers |
| 3 | More activities per place (Cursor) | Clubs, meeting spots, the directory | UMzansi FM |
| 4 | Scaling (shards, nearby-only updates) before any public post | Reactions, replies, who's online | Talk meets music |

Nudges from `stimulation-spec.md` come in only where they serve flow (the "Take me there" arrow, one at a time).
