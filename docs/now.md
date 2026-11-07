# Now

Short and always current. Whoever finishes a step updates this (docs/team.md).
Last updated: 7 Nov, Claude Code (start screen: Install and Website links, pushed, not deployed).

## Waiting for Lloyd
- **Start screen: Install Soft Life and Website** (7 Nov): pushed, not deployed. A second line under Rules, Privacy, Terms: Install Soft Life (opens #/install, hidden once installed or in the installed app) and Website (siteUrl from data/site/website.json, new tab). Needs a go to deploy the game.
- **organt.shop says "Store unavailable"** (Shopify 402, checked 7 Nov 12:40 from a phone browser). The website's Shop Organt button is hidden by `organt.showShop: false` in data/site/website.json; set it to true and redeploy the website once the store is open. The game is live with the link, used only on the Organt rep job's referral card.

## Waiting for Lloyd's phone verdict
- **Live 7 Nov 12:35: the game** at https://softlifeza.vercel.app from 224d720 (the install fix d9d164a + the shop link). Check on the phone: Chrome offers Install (or menu > Install Soft Life), the home-screen name is Soft Life. On the live site Edge already offered to install, no installability errors.
- **Live 7 Nov 12:45: the website** at https://softlifeza-site.vercel.app (Vercel project softlifeza-site) from 549ccd3. Lighthouse mobile live 100/100/100/100. Deploy: from site/ `npm run build`, `npm run prebuilt`, `npx vercel deploy --prebuilt --prod` (site/README.md). Reports: docs/sprints/website/report.md, docs/sprints/install/report.md.
- **Day 1 home: the breakfast chairs** (6c3bd77). The kitchen chairs load in both home styles, and you, your sibling and your parent each sit on one, facing the table. Before it: queue NPCs stop vibrating (3594dd8).

## Next three pieces (month1-focus.md; the order is its proposal, Lloyd decides)
1. **Flow: smoothness reports from real phones.** A small report every few minutes to Supabase (device, fps typical and worst 10%, long frames, load time, stuck or stalled walks and where), plus a page for Lloyd per place.
2. **Talk: friends and saved direct messages.** Add a friend, chat one-to-one between friends only, saved so it's still there tomorrow, with unread counts.
3. **Sound: the radio.** Stations synced to the server clock, a phone radio in the menu, world speakers that get louder as you walk closer. The music itself is Lloyd's outreach (3 stations, an hour each), listed by Cursor in data/campusville/music.json.

## Left uncommitted on the owner's PC
- Nothing. Ignored and staying local: `.claude/launch.json` (Claude's preview pane config), sprint screenshots (.png, .jpg, .jpeg), videos (.webm), test reports (.json), Lighthouse reports (.report.html) and the website's original photos (site/img-src/).

## Loose ends
- The first plan (STEP 0, items 1-9, the owner's "keep these" rules: roommate matches gender, feminine clothing, creator dance and music) now lives in docs/history.md, not CLAUDE.md.
- Backlog, newest: tests/e2e/menu.spec.js "chat Send" times out on main (before the install fix too); then the activities wiring list for the new common-room, caf and sports rows; Auntie Pinky hidden behind her queue; on day 1 the parent walks through the coffee table on the way to the car.
