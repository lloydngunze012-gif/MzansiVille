# Now

Short and always current. Whoever finishes a step updates this (docs/team.md).
Last updated: 7 Nov, Claude Code (characters spike 3b closed with the woman measured).

## Waiting for Lloyd
- **Characters spike 3b (Ara 3D Gen)** (7 Nov): done, both Ara people measured, report in docs/sprints/characters-ara/report.md. Verdict: it fights our flat low-poly world, costs about 1.7x our current students on this GPU and about 5x on a weak one, 132 MB of texture a person; not adopted. The first spike's (3a) fps test wasn't in the repo, so I wrote one; tell me if 3a's differs.
- **Delete the qa-live test row** (from S6): run `delete from public.smooth_reports where build = 'qa-live';` in the Supabase SQL editor (the anon key can't, and `.env` has no service-role key; add SUPABASE_SERVICE_ROLE_KEY there and S6 cleans up after itself).
- **organt.shop says "Store unavailable"** (Shopify 402, checked 7 Nov 12:40 from a phone browser). The website's Shop Organt button is hidden by `organt.showShop: false` in data/site/website.json; set it to true and redeploy the website once the store is open. The game is live with the link, used only on the Organt rep job's referral card.

## Waiting for Lloyd's phone verdict
- **Live 7 Nov: the game with the smoothness reports** at https://softlifeza.vercel.app from 1331c42 (entry index-DQDKfcxJ.js). Checked live in Edge at phone size: the new build loads after a reload, Settings shows "Send smoothness reports: On" with its help line, Privacy shows the "Smoothness reports help us..." line, and the check itself sent nothing to smooth_reports. Reports now flow from real phones (after 3 minutes, or when the tab is hidden, and only for 10 s or more in a place); Lloyd's page is #/smooth (sign in as admin, link on #/admin). The 30-day pg_cron cleanup runs daily. To look at: #/smooth after a few real sessions; the phone check of the install fix is still open (the next line).
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
