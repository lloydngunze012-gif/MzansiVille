**`supabase/chat.sql` needs running once more** (re-runnable): this job and Social B both changed it after your last run. `#/health` shows "Social SQL: Yes" when it has taken.

# Social A follow-ups (owner, 11 Nov)

## What changed
1. **Nobody lands in a group they did not agree to.** Adding someone who is not a friend both ways sends them a card: "[Name] wants to add you to [Group]. Join / No thanks." Friends both ways still go straight in. A WhatsApp link the person taps themselves counts as agreeing. An ask counts against the 40 invites a day, lasts 24 hours, and is never sent if either player has blocked the other (the asker's phone gets exactly the same reply as for an ask that was sent, so a block is not given away). The asker first sees "Asked. They get a card to join.", then later a toast: "[Name] was added to [Group]." or "[Name] can't right now." Nothing more: no reason, and no difference between No thanks and 24 hours going by.
2. **Online dots only for friends both ways.** For a one-way friend the server's reply has no `online` field at all (not just hidden on the phone); the Friends tab shows the name with no dot and "On your list". The same rule now applies to the member list of a group: you see who is online only for yourself and friends both ways.
3. **The creator can rename the group and remove a member.** Rename uses the same filter as a new group (the phone's name check, then the server's word filter). Remove is two taps; the removed player's phone drops the group at once, and the group's link answers "You can't join this group." A member can still ask them back, and if they tap Join they are in again.
4. **`#/health` has a "Social SQL" row.** Yes only when Social A, Social B and these follow-ups are all in; otherwise it names what is missing.

## Decisions made, yours to change
- The asker sees "Asked" straight away. The brief said the asker sees "added" or "can't right now", nothing more; "Asked" is there so the tap is not silent, and it says nothing about the other player.
- An ask that is blocked still counts as one of the 40 invites, so a block cannot be found out by watching the count.
- Being asked back after a removal is allowed (only the link is closed). Say if a removed player should be shut out for good.

## Realtime budget, now the Quad is one per room of 40
Supabase counts every broadcast sent and every delivery. Limits used here: free plan 100 messages a second and 200 connections; Pro 500 a second and 500 connections.

What a message costs:
- A Quad message in a room with n players: n messages (n is 40 at most now; before, n was everyone online).
- A group message: the number of members online, 40 at most. A DM: 2.
- An ask, an answer, a removal: 2 each. A join toast: once per player, ever, to the room they arrive in (40 at most).
- Walking is separate and bigger: up to about 70 a second in a full room (presence.js holds a room to that).

Chat in one full room of 40, each player sending m messages a minute, costs 40 x 40 x m / 60 a second:

| Pace | One full room, chat | With that room's walking |
| --- | --- | --- |
| Lively (2 a minute each) | 53 a second | about 123 a second |
| Flat out (6 a minute each, the server's limit) | 160 a second | about 230 a second |

What that means:

| Plan | Lively | Flat out |
| --- | --- | --- |
| Free (100 a second) | about 30 players in one room, as before | about 17 players in one room, as before |
| Pro (500 a second) | 4 full rooms: about 160 players | 2 full rooms: about 80 players |

- **Free plan: no change in the number, because the limit was already one room's worth.** A second busy room does not fit on the free plan whatever the chat does: two full rooms walking is about 140 a second on its own.
- **Pro: the cost now grows with the number of players, not with its square.** Each extra full room adds the same 123 (lively) or 230 (flat out). With one Quad for everyone, 160 players chatting at a lively pace would have cost about 850 a second in chat alone.
- The earlier report's Pro figures (110 lively, 60 flat out) set walking aside as one room's 70; with walking counted for every room, as here, they would have been lower.
- These are worst cases: every player in the Quad of a full room, all typing at that pace at once. The connection limits (200 free, 500 Pro) sit above all of it.
- Not measured, calculated: nobody has yet put 40 phones in a room.

## Tests
- `scripts/sql-check.mjs`: 29 SQL checks on real Postgres (2 new: asks with Join, No thanks, 24 hours, blocks either way, the invite count, the link; remove, rename, who is online in a group). Two older Social A checks were updated to the new rules.
- `tests/e2e/social-quick.spec.js`: A1 (a one-way friend has no dot and no "online" from the server; friends both ways do; rename refuses a reserved name), A5 (the Social SQL row).
- `tests/presence/social.spec.js` (three phones, real Realtime, real GPU): the ask card and Join; No thanks and "can't right now"; the link as agreeing; rename seen by the others; a non-creator has no rename or Remove; remove, and the link refused.
- Screenshots at 390 px (on the PC, not committed): docs/sprints/social-a/ask-card-390.png, group-creator-page-390.png, health-social-390.png.

## Not done
- No screen that lists your sent asks while they wait.
- No way for the creator to hand the group to someone else without leaving.
