# MzansiVille

A mobile-first life sim in the browser. A district is a folder of data. The character keeps their stats and identity when a later district opens. CampusVille (`/data/campusville`) is the only district in this build. It is Durban, dialling code 031.

Play starts as a guest. Progress sits in `localStorage` under `mzansiville.v1`. On day 3 the game asks you to save with Google or an email magic link and merges that guest into the account.

## Play

Stats start at R1 500, energy 100, grades 50, social 30, hunger 70. A day has six phases (wake, transit, lecture, social, leisure, night) and five action slots. Sleep ends the day. Skipping sleep costs 30 energy the next morning. Sleeping with hunger under 20 sets the next morning's energy to 75 and shows "You slept hungry".

Three game days fit in one real day. After that the screen says "Energy refills at 06:00" until the next 06:00 local time.

## Stack

Vite and vanilla JavaScript. No other UI framework. Supabase is used for auth, the profile row, realtime lobby chat, leaderboards, reports, and event-text edits. The day simulation runs on the phone. Deploy with Vercel. The production JS bundle stays under 400 KB uncompressed.

## Local

```bash
npm install
npm run dev
```

Open http://localhost:5173. Guest play works with the Supabase variables empty.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite on port 5173 |
| `npm run build` | Production bundle in `dist/` |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run check` | Day-loop checks in Node |
| `npm run seed` | Rebuild `supabase/seed.sql` from the district files |
| `npm run shots` | Playwright screenshots of every screen at 390×844 |

## Supabase

1. Create a project.
2. Authentication → Providers: turn on Email (magic link) and Google. Add `http://localhost:5173` and the Vercel origin as redirect URLs.
3. SQL editor: run `supabase/schema.sql`, then `supabase/seed.sql`.
4. Copy the project URL and the anon key into `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Restart `npm run dev` after changing `.env`.

To open `/admin`, sign in once so a profile row exists, then in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = 'YOUR_USER_UUID';
```

Admin can read open reports, suspend a user, and edit event title, body, and choice labels. Stat effects stay in the district files.

Chat is one campus lobby. There are no DMs. A profanity filter runs in the client and again in Postgres. Sends are limited to one every 3 seconds and 30 in 10 minutes.

Leaderboards (Richest, Dean's List, Most Balanced) are overall and by residence. They refresh every 30 seconds. Numbers are the client's 7-day rolling average.

## Deploy

```bash
npx vercel login
npx vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project before the production build. `vercel.json` rewrites every path to `index.html`, so `/admin` loads the app.

`npx vercel deploy --temporary --yes` publishes an anonymous preview. That URL expires in about 60 minutes. A login is what makes a URL last.

## A district folder

`src/districts/registry.js` is the only place that names CampusVille. Adding a district means a new folder plus one entry in that registry. `switchDistrict` keeps the person and changes `character.districtId`.

```
data/<id>/
  meta.json        name, city, dialCode, grid, phases, day rules
  places.csv       id, name, kind, x, y on a 1000×1000 grid
  activities.csv   id, phase, place_id, name, stat deltas, time_slots, risk_or_twist
  residences.csv   name, type, distance
  events.json      daily events; Sunday uses derby_day
  hours.json       opening hours
  courses.json
  besties.json     names and the six scripted days
  twists.json
  jobs.json
  shop.json        real-shop URL and referral code shape
```

Dial codes reserved for later districts: 011 Johannesburg, 021 Cape Town, 012 Pretoria, 051 Bloemfontein. The Organt tee draws the current district's code.

After editing CampusVille data, run `npm run seed` and re-apply `supabase/seed.sql` if the hosted tables should match.

## Screenshots

`tests/screenshots.spec.js` opens `/?shot=<screen>` at 390×844 and writes `screenshots/<screen>.png`. Shot mode does not touch the guest save. Install the browser once:

```bash
npx playwright install chromium
npm run shots
```

## Still placeholders

- `data/campusville/events.json` — NSFAS delayed, load shedding, and a lecturer surprise test, plus Derby Day. Replace this file when the real events land. `npm run seed` afterwards.
- `data/campusville/besties.json` — stand-in names. The bestie is someone from the player's residence and is not the player's own name.
- `data/campusville/shop.json` — `url` is empty and the code is `ORG-` plus 4 characters until the shop format arrives. The job still shows "This links to a real shop" before any link opens.
- Tutor pay in `jobs.json` is a stand-in. The Organt rep shift is R150 and social +4, from day 7.
- Privacy, terms, and community rules pages say the full text is still to come.
