# Soft Life website (owner, 7 Nov): report

One piece: a public website in `site/`, its own Vercel project, the game untouched. Pushed, not deployed.

## Files on this machine (not committed)
`docs/sprints/website/`: `360x800-first-screen.png`, `360x800-full.png`, `390x844-first-screen.png`, `390x844-full.png`, `768x1024-first-screen.png`, `768x1024-full.png`, `1440x900-first-screen.png`, `1440x900-full.png`, `lighthouse-mobile.report.html` (+ `.json`).

## What's built
- `site/`: a plain Vite static page, no framework and no JavaScript in the page. `site/build/page.mjs` renders it from the repo's data at build time: words from `data/site/website.json` (new, Cursor's from now on), houses from `data/campusville/houses.json`, the six day slots' times from `meta.json` `phases`, the Organt link from `shop.json` `url`. The QR code to the game is drawn at build time (`qrcode`, inline SVG).
- Sections in order: header, hero (poster, student card 26 + six blanks, Founders note), a day on campus (07:00 to 21:00), seven house pennants, Only Organt on campus, put it on your phone (Android, iPhone, QR), coming next (`next.show`), for brands (`brands.email`), footer (fictional note; Play, Rules, Privacy, Terms in the game).
- Hidden while empty: the Shop Organt button (`shop.json` url is empty today) and the For brands section (`brands.email` is empty today). Both are hidden in the screenshots for that reason.
- Pennant text: white or ink, whichever reads better on the house colour (Kingsway's orange takes ink). Lowest: Thekwini white on green, 5.4:1. The build warns if any house drops under 4.5:1.
- Images: `site/public/img/poster.webp` (1000 x 1333, 262 kB) and `poster-600.webp` (600 x 800, 127 kB), made from the game's `public/cover.jpg` by `npm run images`. Width and height set; `fetchpriority="high"` on the poster (first screen on a computer); everything else lazy.
- The Organt lookbook and tee photos aren't in the repo: the page draws stand-in tees (021 black, 10 green, Matcha Girly tan) until the photos go into `site/img-src/` (names in its README).
- Fonts self-hosted (Graduate 6 kB, Figtree variable 20 kB, OFL; credits in `docs/credits.md`), so no third party sees a visitor. No cookies, no trackers, no analytics, so no Privacy line was needed.
- Head: title, description, canonical, Open Graph and Twitter card with the game's `share.jpg` (copied at build time), favicon.svg, apple-touch-icon, sitemap.xml, robots.txt.

## Checks (`npx playwright test --config playwright.site.config.js`, Edge, 9 of 9 pass)
- W1 at 360x800, 390x844, 768x1024, 1440x900: no sideways scroll; every link and button at least 44 x 44 px; Tab shows the skip link, then a visible focus ring; screenshots.
- W2 images: WebP, at most 1000 px, width/height set, alt text, lazy below the first screen; the drawn stand-ins are labelled images.
- W3 weight at 390 px: 32.5 kB before images (HTML 6.6 kB gzipped with the CSS inlined, fonts 25.6 kB), 159 kB in all with the poster. A 3x phone takes the 1000 px poster instead: about 295 kB.
- W4 links: every in-page anchor lands on a section; the game, #/rules, #/privacy, #/terms answer 200 (and those three are screens the game draws on load); sitemap, robots, share.jpg, favicon and apple-touch-icon are served.
- W5 the page follows the data: pennants = houses.json in order, slot times = meta.json, Shop/brands/Coming next follow their switches; head tags complete; no cookies, no scripts; no player counts, no real university names.
- W6 reduced motion: smooth scrolling only when motion is allowed.

## Lighthouse (mobile, on the production build served locally)
| | Run 1 | Run 2 (final build) |
| --- | --- | --- |
| Performance | 99 | 96 |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 100 | 100 |
FCP 0.7 s, LCP 1.8 s (the poster), CLS 0, total 161 KiB. The page runs no JavaScript, so the blocking-time swing (90 ms vs 220 ms) is this PC, not the page.

## Not done / to know
- Not deployed, and the Vercel project doesn't exist yet (steps in `site/README.md`). `siteUrl` is set to https://softlifeza-site.vercel.app; if Vercel gives the project another address, change it in `website.json` (canonical, link previews, sitemap).
- Backlog: the game's manifest still installs as "MzansiVille"; the Organt photos.
