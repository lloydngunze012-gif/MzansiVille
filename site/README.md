# Soft Life website

The public page for Soft Life: what it is in ten seconds, Play free, put it on your phone, and the Organt shop. One static page built with Vite, no framework, and no JavaScript in the page itself. The game stays at https://softlifeza.vercel.app; nothing here touches `src/`.

## Where things come from

| What | File | Who edits it |
| --- | --- | --- |
| All the words, links, image names, the site's and the game's address | `data/site/website.json` | Cursor |
| The seven houses (name, vibe, blurb, colours) | `data/campusville/houses.json` | Cursor (the game reads it too) |
| The day's six slots and their start times | `data/campusville/meta.json` `phases` | Cursor (the game reads it too) |
| The Organt shop link (the Shop button stays hidden while it's empty) | `data/campusville/shop.json` `url` | Lloyd / Cursor |
| The page itself, the styles | `site/build/page.mjs`, `site/src/site.css` | Claude Code |
| Images (WebP, at most 1000 px) | `site/public/img/`, made by `npm run images` from `site/img-src/` | Claude Code |

Switches in `website.json`: `brands.email` empty hides the For brands section; `next.show: false` hides Coming next. `{game}` in a line becomes the game's address.

The build warns (`[site] ...`) if a house's pennant text would be under 4.5:1 contrast or a day slot has no words.

## Run it

From `site/`:

```bash
npm install
```

```bash
npm run dev
```

The page is at http://localhost:5180 and reloads when any of the data files change. `npm run build` writes `site/dist/` (with `sitemap.xml`, `robots.txt` and the game's `share.jpg`); `npm run preview` serves the build at http://127.0.0.1:4180.

Checks, from the repo root (builds the site, then checks every width, tap target, image, link and the page weight, and saves screenshots to `docs/sprints/website/`):

```bash
npx playwright test --config playwright.site.config.js
```

## Images

Drop the original photo into `site/img-src/` named after its image in `website.json` (for example `organt-lookbook.jpg`), then from `site/`:

```bash
npm run images
```

Commit the new files in `site/public/img/`. Until an Organt photo is there, the page draws a stand-in tee. The poster is made from the game's own `public/cover.jpg`.

## Deploying (its own Vercel project)

The site is its own Vercel project, linked from this folder (`site/.vercel/`, not committed), separate from the game's project at the repo root. It's built on this machine and the finished files are uploaded, because the build reads `data/` and the game's `share.jpg` from outside `site/`. In the project's Vercel settings, leave **Root Directory empty**: the link from `site/` already makes `site/` the root, and setting it to `site` would make Vercel look for `site/site`.

Deploy only on Lloyd's go. From `site/`:

```bash
npx vercel pull --yes --environment=production
```

```bash
npx vercel build --prod
```

```bash
npx vercel deploy --prebuilt --prod
```

If the site's address isn't `https://softlifeza-site.vercel.app`, change `siteUrl` in `data/site/website.json` first (the canonical link, link previews and the sitemap use it).

No cookies and no trackers. If analytics are ever added, cookie-free only (Vercel Web Analytics), with a line in the game's Privacy screen.
