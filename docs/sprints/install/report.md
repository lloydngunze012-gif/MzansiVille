# Game install fix (owner, 7 Nov): report

One piece: phones name the game right and offer to install it. Pushed, not deployed.

## Files on this machine (not committed)
`docs/sprints/install/`: `menu-360x800.png`, `menu-412x915.png` (the menu with Install Soft Life on top), `install-manual-360x800.png`, `install-manual-412x915.png` (the browser-menu steps), `install-ios-390x844.png` (Share > Add to Home Screen), `install-prompt-412x915.png` and `install-done-412x915.png` (Android: our button, then installed), `offline-390.png`, `lighthouse-pwa.report.html` (+ `.json`).

## What changed
1. `public/manifest.webmanifest`: name "Soft Life: University of Mzansi", short_name "Soft Life", id/start_url/scope "/", standalone, background and theme colour cream #f4efe4. `index.html` theme-color #f4efe4, apple-touch-icon, apple-mobile-web-app-title "Soft Life".
2. Icons from the website's Soft Life mark (`scripts/app-icons.mjs`): `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` (the disc inside the safe zone), `apple-touch-icon.png` (180). The favicon is the same mark (was the old "M").
3. `public/sw.js`, registered by `src/install.js` in the built game only (dev and the dev-server tests are unchanged; `?sw=1` turns it on in dev). Page loads go to the network first and are never cached; only `/offline.html` and one icon are cached, for when there's no signal. Game files (`/assets/`), models, audio and Supabase are never touched by it, so `src/stale.js`'s Updating... reload works as before. `vercel.json`: `sw.js` and the manifest are no-cache.
4. The menu's first line is "Install Soft Life" (yellow, 44 px), hidden once installed. It opens `#/install` (also `#install`, `src/ui/install.js`): on Android the button opens Chrome's install prompt; on iPhone the three Share > Add to Home Screen steps; in other browsers the browser-menu steps; opened from the home screen it says it's installed.

## Checks (`npx playwright test --config playwright.install.config.js`, Edge, 8 of 8 pass)
The test builds the game and serves it the way `vercel.json` does (a missing `/assets/` file is a 404, other paths get index.html).
- I1 manifest fields, icon sizes (192, 512, 512 maskable, 180), theme colour in the page.
- I2 Edge's own installability check (`Page.getInstallabilityErrors`): no errors; manifest parses with no errors; the worker controls the page; the page load goes through it, no `/assets/` file and no Supabase call does.
- I3 offline: the "You're offline" page with Try again.
- I4 at 360x800 and 412x915: the menu option shows, opens the install screen (browser-menu steps here), and is gone once installed.
- I4b iPhone (Safari user agent) via `#install`: the Share > Add to Home Screen steps; launched from the home screen: "Installed".
- I4c Android: when Chrome offers (a stand-in event; headless never offers), the screen shows the Install button, it opens the prompt, accepted -> installed.
- I5 a deploy: build A open in two tabs; build B built into its own folder and switched in one step, as Vercel does (A's files gone). A reload runs B (index-f-OAWYtU.js after index-DpTyChnT.js). The other tab, still on A, opens the creator: its two lazy files 404 (preview3d, thumbs3d), stale.js reloads, and the tab runs B.

## Lighthouse 11.7.1 (mobile, PWA category; Lighthouse 12 no longer has one)
PWA 100: installable manifest pass, maskable icon pass, themed address bar pass, splash screen pass, content width and viewport pass.

## Also run
- `npm run check`: 51 checks pass.
- `tests/e2e/menu.spec.js`: 2 of 3 pass; "chat Send stays on chat..." times out, and times out on main without this change too (backlog).

## Not done / to know
- Not deployed. The owner's step "deploy, then reload, and prove the new version loads" was played locally (I5) because this piece is push-don't-deploy; after the real deploy I'll repeat it on softlifeza.vercel.app (open, note the entry script, deploy again, reload).
- Phones that already have the old page open get the new manifest on their next load; an icon already on a home screen keeps its old name until it's removed and added again (the browser decides).

## Start screen links (owner, 7 Nov, follow-up; pushed, not deployed)
- A second line under Rules · Privacy · Terms, same font and style: **Install Soft Life** (opens #/install; hidden when installMode() is done, i.e. installed here or running as the installed app) and **Website** (data/site/website.json siteUrl, new tab). Five links don't fit one line at 390 px or in the 420 px column on a computer, so the break is deliberate (`.tc-break`), not a wrap that strands one word.
- I6 (390x844 and 1440x900): the five links, hrefs and new tab; same computed style as Rules; all on screen; Install opens the install screen; Website opens the site; installed -> four links; standalone -> no Install. Screenshots: `start-390x844-before.png`, `start-390x844-after.png`, `start-1440x900-before.png`, `start-1440x900-after.png`. Install suite 10/10.
- Existing start-screen tests: tests/e2e/enrol.spec.js and morning.spec.js, 8 pass, 1 skipped (already `test.skip`: no bus on day 1).
