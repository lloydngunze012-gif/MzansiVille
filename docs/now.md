# Now

Short and always current. Whoever finishes a step updates this (docs/team.md).
Last updated: 6 Nov, Claude Code (housekeeping, no code changes).

## Waiting for Lloyd's phone verdict
- **Day 1 home: the breakfast chairs** (6c3bd77). The kitchen chairs load in both home styles, and you, your sibling and your parent each sit on one, facing the table. Before it: queue NPCs stop vibrating (3594dd8).
- Pushed to main. Deploy waits for Lloyd's go.

## Next three pieces (month1-focus.md; the order is its proposal, Lloyd decides)
1. **Flow: smoothness reports from real phones.** A small report every few minutes to Supabase (device, fps typical and worst 10%, long frames, load time, stuck or stalled walks and where), plus a page for Lloyd per place.
2. **Talk: friends and saved direct messages.** Add a friend, chat one-to-one between friends only, saved so it's still there tomorrow, with unread counts.
3. **Sound: the radio.** Stations synced to the server clock, a phone radio in the menu, world speakers that get louder as you walk closer. The music itself is Lloyd's outreach (3 stations, an hour each), listed by Cursor in data/campusville/music.json.

## Left uncommitted on the owner's PC
- `.claude/launch.json`: the dev-server config for Claude's preview pane (local tool setting).
- `docs/design/cover-check/3-link-preview-standin.png`: a cover-check image, not in the housekeeping list.
- Ignored, staying local: sprint screenshots (.png, .jpg, .jpeg), videos (.webm) and test reports (.json), e.g. `docs/sprints/home/poster_tone_*.jpg`, `fps.json`, `docs/sprints/queue-jitter/*.json`.

## Loose ends
- `origin/fix/zanele-wave-day2` (Cursor, 6 Nov 12:26) is stale: main has had the day-2 lines since 89780d0, and `npm run check` passes (51). Not merged; safe to delete.
- Backlog: activities wiring list for the new common-room, caf and sports rows; Auntie Pinky hidden behind her queue.
