# Title screen on phones (owner, 8 Nov): report

One piece: the Soft Life title on a phone, in the browser and as the installed app. The computer layout is unchanged (pixel-identical at 1280x800, 1440x900 and 1920x1080, before vs after, reduced motion so the zoom doesn't differ).

## Files on this machine (not committed)
`docs/sprints/title/`:
- Before: `before-browser-390x844.png`, `before-browser-360x740.png`, `before-standalone-390x844.png`, `before-standalone-360x740.png`, `before-standalone-inset32-390x844.png`, `before-standalone-inset32-360x740.png` (with a 32 px status bar the page may draw under), `before-extra-1440x900.png`.
- After: the same six names with `after-`, plus `after-continue-390x844.png` (a saved student: Continue and Start over), `after-startover-390x844.png` (the Start over question), `after-extra-390x664.png` and `after-extra-360x600.png` (the real height of a phone browser with its address bar), `after-extra-412x867.png` (a tall phone as the installed app), `after-extra-768x1024.png`, `after-extra-1440x900.png`.
- From the install check (I7): `title-browser-*.png` and `title-standalone-*.png` at 390x844, 360x740 and 390x664.

"Standalone" is emulated: Edge's DevTools protocol ignores the display-mode media feature, so the page's own check (`matchMedia('(display-mode: standalone)')`) is answered "standalone" (as I6 already did), and `Emulation.setSafeAreaInsetsOverride` gives the 32 px status bar.

## What changed
1. **Plum fade** (`src/styles.css`, "Title on phones", in a media block that excludes the computer layout). The poster starts at the very top and fades into deep plum #1a0d33 with an eased mask from just under the logo (63% of the poster) to transparent, so there's no edge; the blurred copy of the poster behind it is gone (plain plum). On a tall screen the poster grows up to 110% (the sides trimmed, never the top) so the fade comes close to the tagline. The tagline and the Enrol / Continue button sit over the fade, pinned to the bottom (thumb reach), with a soft violet glow in the plum behind them; on a very tall screen the group rises up to 36 px. The button is slimmer (52 px, was 60) with the enrolment's gold (gradient, dark-gold step) and a soft gold glow. Rules, Privacy, Terms and Website are one row, 12 px and dimmer. "Install Soft Life" is a small pill with a phone-and-arrow icon on its own line above that row (44 px to tap); it still hides once installed (`installMode()` 'done': opened from the home screen, or installed from here). `src/ui/render.js` title(): the icon only; on the computer it's hidden and Install looks like the other links, as before.
2. **Bars and splash.** `public/manifest.webmanifest`: theme_color and background_color #1a0d33 (the splash is plum). `index.html` theme-color #1a0d33. `src/install.js` barColour(screen), called from `src/main.js` after every screen is drawn: #1a0d33 on the title, #140a24 on enrolment (its own night plum, so the bar meets its top), #1c0e34 on Settings and the error log (their dark plum), cream #f4efe4 everywhere else in the game (checked: the rules screen, day-1 morning).
3. **Poster under the status bar.** The poster is at top 0, so in the installed app there's no dark strip above it, and where the phone draws the page under the status bar (iPhone with a translucent bar, Android drawing edge to edge) it runs up behind it. `src/install.js` marks `<html data-display="standalone">` before the first screen is drawn; there the poster gets a soft dark-plum fade at the very top, 56 px + `env(safe-area-inset-top)`, so the clock and icons stay readable. On Android without edge-to-edge the plum status bar meets that fade, so there's no seam either. The bottom keeps `env(safe-area-inset-bottom)`.
4. **Slow zoom.** It was already there (24 s, 3%); on phones it's now 30 s and 4%, from the top edge (heads never cropped), CSS only, off under `prefers-reduced-motion` (checked).

## Checks
- `npx playwright test --config playwright.install.config.js` (Edge, builds the game and serves it like vercel.json): 17 of 17 pass (I1-I5, I6 x2, I7 x6, I7b).
  - I1 now expects the plum manifest colours and the plum title bar.
  - I6 on a phone: Install is a pill with its icon above Rules, Privacy, Terms, Website (one row); on the computer it looks like Rules, icon hidden.
  - I7 (new, 6 runs: 390x844, 360x740, 390x664, browser and installed): poster at top 0, 100-110% wide, the fade mask, the tagline below the logo and within 100 px of the poster's end, button 48-56 px tall, in the lower 40% of the screen and on screen with the links; installed: the top fade, no Install pill; browser: no top fade, the pill.
  - I7b: bars plum on the title, cream on the rules screen, plum again; the zoom is off under reduced motion and runs (tc-zoom, 30 s) otherwise.
- `npm run check`: 54 checks pass.

## Not covered / for Lloyd's phone
- Whether Android draws the installed app under the status bar depends on the Chrome version; either way it's covered (plum bar + top fade, or the poster behind the bar). Android may keep its own navigation bar colour; the manifest and theme-color are both plum.
- iPhone: the status bar of a home-screen app follows `apple-mobile-web-app-status-bar-style`, which isn't set (white bar). Setting it to black-translucent would let the poster run under the iPhone clock, but it applies to every screen, and the game's top HUD doesn't leave room for the status bar yet: a separate piece if wanted.
