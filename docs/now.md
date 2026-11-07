# Now

Short and always current. Whoever finishes a step updates this (docs/team.md).
Last updated: 7 Nov, Claude Code (the game install fix and the Organt photos, pushed, not deployed).

## Waiting for Lloyd
- **Game install fix** (7 Nov): pushed, not deployed. Manifest says Soft Life, cream colours, PNG + maskable icons, a service worker (page loads network-first, never cached), and "Install Soft Life" at the top of the game menu (#install opens it). Needs Lloyd's go to deploy, then a phone check: Chrome offers Install, the home-screen name is Soft Life. Report: docs/sprints/install/report.md.
- **The Soft Life website** (site/, 7 Nov): pushed, not deployed, the Organt photos in. Needs Lloyd to create its Vercel project (steps in site/README.md), then a go to deploy. Words in data/site/website.json are Cursor's. For brands stays hidden until there's an email in website.json. Report: docs/sprints/website/report.md.

## Waiting for Lloyd's phone verdict
- **Day 1 home: the breakfast chairs** (6c3bd77). The kitchen chairs load in both home styles, and you, your sibling and your parent each sit on one, facing the table. Before it: queue NPCs stop vibrating (3594dd8).
- Live: main at 05a14ce deployed to production on 6 Nov 19:52 (https://softlifeza.vercel.app), on Lloyd's go.

## Next three pieces (month1-focus.md; the order is its proposal, Lloyd decides)
1. **Flow: smoothness reports from real phones.** A small report every few minutes to Supabase (device, fps typical and worst 10%, long frames, load time, stuck or stalled walks and where), plus a page for Lloyd per place.
2. **Talk: friends and saved direct messages.** Add a friend, chat one-to-one between friends only, saved so it's still there tomorrow, with unread counts.
3. **Sound: the radio.** Stations synced to the server clock, a phone radio in the menu, world speakers that get louder as you walk closer. The music itself is Lloyd's outreach (3 stations, an hour each), listed by Cursor in data/campusville/music.json.

## Left uncommitted on the owner's PC
- Nothing. Ignored and staying local: `.claude/launch.json` (Claude's preview pane config), sprint screenshots (.png, .jpg, .jpeg), videos (.webm), test reports (.json), Lighthouse reports (.report.html) and the website's original photos (site/img-src/).

## Loose ends
- The first plan (STEP 0, items 1-9, the owner's "keep these" rules: roommate matches gender, feminine clothing, creator dance and music) now lives in docs/history.md, not CLAUDE.md.
- Backlog, newest: tests/e2e/menu.spec.js "chat Send" times out on main (before the install fix too); then the activities wiring list for the new common-room, caf and sports rows; Auntie Pinky hidden behind her queue; on day 1 the parent walks through the coffee table on the way to the car.
