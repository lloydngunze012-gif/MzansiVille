# Now

Short and always current. Whoever finishes a step updates this (docs/team.md).
Last updated: 7 Nov, Claude Code (Flow 1: SQL run, S6 live send passed; game not deployed).

## Waiting for Lloyd
- **Flow 1 S6 passed** (7 Nov): the table exists and a real send got a 201. One `qa-live` row is still in it: run `delete from public.smooth_reports where build = 'qa-live';` in the SQL editor. Then deploy the game when you say.
- **Flow 1, smoothness reports** (7 Nov, with the QA fixes: boot and load clocks, retry, names, phone layout): built and pushed, not deployed. **Before deploying, run the "Flow 1: smoothness reports" block at the end of supabase/schema.sql in the Supabase SQL editor** (re-runnable; it also schedules the 30-day cleanup with pg_cron: if the editor refuses `create extension pg_cron`, switch pg_cron on in the dashboard under Database > Extensions, then run the block again). Optional after it: `SMOOTH_S6=1 npx playwright test tests/smooth/smooth-move.spec.js -g S6 --config playwright.gpu.config.js --workers=1` proves a real send, then `delete from public.smooth_reports where build = 'qa-live';`. Then deploy the game; Lloyd's page is #/smooth (sign in as admin, link on #/admin). Report: docs/sprints/smoothness/report.md.
- **Smoothness wording** (7 Nov): the three strings in `data/campusville/meta.json` under "smoothness" are written (Settings switch, the line under it, and the Privacy page). Pushed, not deployed.
- **organt.shop says "Store unavailable"** (Shopify 402, checked 7 Nov 12:40 from a phone browser). The website's Shop Organt button is hidden by `organt.showShop: false` in data/site/website.json; set it to true and redeploy the website once the store is open. The game is live with the link, used only on the Organt rep job's referral card.

## Waiting for Lloyd's phone verdict
- Lloyd's phone verdict 7 Nov: the day 1 breakfast chairs are fine (done). The install fix is still waiting for his phone check (the first line below).
- **Live 7 Nov: the game** at https://softlifeza.vercel.app from ff06c10 (the install fix, the shop link, and the start screen's Install Soft Life + Website links). Check on the phone: Chrome offers Install (or menu > Install Soft Life), the home-screen name is Soft Life. On the live site Edge already offered to install, no installability errors.
- **Live 7 Nov 12:45: the website** at https://softlifeza-site.vercel.app (Vercel project softlifeza-site) from 549ccd3. Lighthouse mobile live 100/100/100/100. Deploy: from site/ `npm run build`, `npm run prebuilt`, `npx vercel deploy --prebuilt --prod` (site/README.md). Reports: docs/sprints/website/report.md, docs/sprints/install/report.md.

## Next three pieces (month1-focus.md; the order is its proposal, Lloyd decides)
1. **Flow: smoothness reports from real phones (built 7 Nov, waiting for the table and a deploy; spec docs/design/smoothness-reports.md).** A small report every few minutes to Supabase (device, fps typical and worst 10%, long frames, load time, stuck or stalled walks and where), plus a page for Lloyd per place.
2. **Talk: friends and saved direct messages.** Add a friend, chat one-to-one between friends only, saved so it's still there tomorrow, with unread counts.
3. **Sound: the radio.** Stations synced to the server clock, a phone radio in the menu, world speakers that get louder as you walk closer. The music itself is Lloyd's outreach (3 stations, an hour each), listed by Cursor in data/campusville/music.json.

## Left uncommitted on the owner's PC
- Nothing. Ignored and staying local: `.claude/launch.json` (Claude's preview pane config), sprint screenshots (.png, .jpg, .jpeg), videos (.webm), test reports (.json), Lighthouse reports (.report.html) and the website's original photos (site/img-src/).

## Loose ends
- The first plan (STEP 0, items 1-9, the owner's "keep these" rules: roommate matches gender, feminine clothing, creator dance and music) now lives in docs/history.md, not CLAUDE.md.
- Backlog, newest: tests/e2e/menu.spec.js "chat Send" times out on main (before the install fix too); then the activities wiring list for the new common-room, caf and sports rows; Auntie Pinky hidden behind her queue; on day 1 the parent walks through the coffee table on the way to the car.
