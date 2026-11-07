# Flow 1: smoothness reports from real phones (owner, 7 Nov): report

Spec: docs/design/smoothness-reports.md (the owner's prompt, verbatim, first commit 2c14d7d). Pushed, not deployed.

**Run the smooth_reports block in the Supabase SQL editor before deploying.** It is the last block of supabase/schema.sql ("Flow 1: smoothness reports from real phones"). Until it runs the game is unaffected: the first post the table refuses switches reports off for that session, with one console.warn.

## Files on this machine (not committed)
`docs/sprints/smoothness/`: `smooth-390x844.png`, `smooth-1440x900.png` (#/smooth with injected rows), `smooth-stalls-390x844.png`, `smooth-stalls-1440x900.png` (a tapped place's last 20 stalls), `settings-switch.png`, `privacy.png`, `S2b-wall.png`.

## What's built
- **src/smooth.js**, one shared collector. `smooth.frame(now, scene, place)` once per frame after the frame is drawn: scene.js (campus), home.js (`home:<style id>`), morning.js, lecture.js. `place` may be a function; it's called at most twice a second.
  - Campus place = `common:<house id>` in a house's common room; `room` in a room built off the map for an activity (my addition: otherwise that time would be filed under `paths`); else the nearest building from layout (the places.csv ids) within 30 m; else `paths`.
  - Per scene|place bucket: a 101-bin histogram (2 ms bins to 200 ms, one overflow bin), seconds, half-second windows under 30 and under 20 fps (in seconds), long frames (>50 ms), worst frame, walks, stalls (at most 8 kept per bucket per report), taps and their tap-to-move times.
  - Not counted: gaps over 1000 ms, and the first 3 s after a scene shows (a scene change, or a return from a gap).
  - `load_ms` = `performance.now()` at the first frame the first 3D scene draws (timeOrigin to that frame); on the session's first row only.
- **Sending**: every 3 minutes while visible, and on `visibilitychange` hidden / `pagehide`. One row per bucket with 10 s or more, busiest first, at most 6 per flush and 40 per session. `fetch` with `keepalive` to `${SUPABASE_URL}/rest/v1/smooth_reports`, the anon key, `Prefer: return=minimal`, an array body. Never when: authEnabled is false, localhost, `?fast=1`, `navigator.webdriver`, the switch off. No retries; after one refusal (404 table missing, or the network) it stops for the session. `?smooth=test` puts rows in `window.__smoothReports` and exposes `window.mzansiSmoothFlush()` and `window.mzansiSmooth`; in test mode the minimum is 2 s (not 10 s) so tests don't wait.
- **Hooks**: player.js `createPlayer({ blocked, onWalk })` (walk start; walk end with how, metres left, x, z), used by scene.js and home.js; scene.js `tapped()` (a ground tap starts the tap clock) and `frameBody` (the first frame the player has moved ends it); walks.js start and stall.
- **Table** `public.smooth_reports` in supabase/schema.sql: every column in the spec, check constraints capping text lengths, numbers and `jsonb_array_length(stall_at) <= 8`; RLS: insert for anon and authenticated with check (true), select only `public.is_admin()`; the 30-day cleanup is commented out at the end of the block.
- **Settings and privacy**: Settings has "Send smoothness reports: On/Off" (default on, kept in `mzansiville.smooth`). data/campusville/meta.json has `smoothness: { settingLabel, settingHelp, privacyLine }`, all empty, for Cursor. Empty: the switch keeps the label from the spec, no help line, no extra Privacy line. Filled: the label, the help line under the switch and the Privacy line appear (checked once with temporary text, then put back).
- **#/smooth** (src/ui/smooth.js, src/engine/smooth-stats.js; linked from #/admin; admin only): 24 h / 7 days (default 7 days), at most 5,000 rows aggregated in the browser; Places table (place, players, minutes, typical, worst 10%, % under 20 fps, long frames per minute, stalls, tap-to-move median) with red and amber rows, worst first; Devices table by gpu (device as the fallback); the load line (median and slowest 10%, split by connection); tap a place for its last 20 stalls (kind, how, x, z, when, device). Cream theme; the tables scroll inside their own box at 390 px, the page never scrolls sideways.

## How NPC queue holds are told apart from real stalls
walks.js ends a walk `stalled` after 1.5 s of getting under 0.1 m closer. queue.js decides afterwards, in a promise callback, whether that stall is an intended hold (someone stands on their place, so the line keeps them where they are) and marks the person `userData.lineHeld`. That mark is set after the walk resolves, so walks.js looks one macrotask later (`setTimeout(0)`, after every promise callback has run) and records an `npc` stall only when `lineHeld` is not set.

## Where I read the spec loosely (so you can overrule)
- **`against` at 1 s.** scene.js gives a walk up after 0.5 s (or 6 frames) pressed, so `against` never reaches 1 s. I record the `against` stall at that give-up (how: "pressed 0.2 s, 6 frames"), and the same give-up ending the walk as `stalled` is not counted a second time as a `player` stall (S2b checks one, not two).
- **Half-second windows.** smooth.js counts its own 500 ms windows from the frame times rather than reading scene.js's counter, so the rule is the same in all four scenes.
- **`walks`** counts walks started by the player and by NPCs (walks.js), the same as `stalls`, so the ratio means something; it measures how busy a place is, not only the player.
- **Tap-to-move** runs from the game getting the tap to the first frame the player has moved; the finger's journey to the browser is not in it.
- **Fall-back label**: the switch's label falls back to the spec's "Send smoothness reports" while Cursor's `settingLabel` is empty.

## Per-frame cost (spec: under 0.05 ms)
S3, 600 counted frames on the dev build in Edge: **0.0005 to 0.0007 ms** per `smooth.frame` call (about 70 times under the limit); 0.0002 ms with long frames mixed in; 0.002 ms during the 3 s hitch window. Finding the place (`smoothPlace`, on the GPU run) takes **0.0014 ms** per call, twice a second, so under 0.0001 ms per frame at 60 fps.

## Tests
- `npx playwright test tests/smooth/smooth.spec.js --config playwright.edge.config.js --workers=1`: 9 of 9 pass (software GPU, about 5 fps: the reports show it honestly, "5 fps typical, 4 worst 10%").
  - S1: Quad to Cafeteria with `?smooth=test`: buckets `quad` and `cafeteria`, every column the right type and range, load_ms on the first row only, worst 10% no faster than typical, no student name or id in the rows; the switch off gives no rows; back on gives rows; no request to smooth_reports.
  - S1b: a normal run collects nothing, has no test hooks, no request.
  - S3: cost. S4 (390 and 1440): order, colours, players and medians, devices, load line, no sideways scroll, the stall list (20 of 24, newest first); S4b: not an admin sees nothing. S5: Settings and Privacy words, empty and filled.
- **S2 (GPU)**, run on this PC's real GPU, 60 and 52 fps: `npx playwright test tests/smooth/smooth-move.spec.js --config playwright.gpu.config.js --workers=1`: 2 of 2 pass.
  - S2a: a ground tap at the gate: one tap counted, tap-to-move 2 to 3 ms, the walk counted, no stall.
  - S2b: tap behind the stage: one `against` stall at (-3.2, -3.8), the player stopped at (-3.24, -3.8).
- K12 and K13 (tests/basics/stop.spec.js, GPU): pass, same numbers as before.
- `npm run check`: **53 checks pass, then the last one fails on purpose**: "meta.json smoothness words are all written (Cursor)". It is the last check so the other 52 run first. It passes (53 of 53) with the three strings filled in (tried with temporary text, put back).

## Not done / to know
- Not deployed. The table doesn't exist in Supabase yet (above). After it exists and the game is deployed, rows arrive from real phones, no sooner than 3 minutes into a visit (or when the tab is hidden), and only from visits with 10 s or more in a place.
- Real-phone numbers can't be tested here; the `gpu` text depends on the phone's browser giving WEBGL_debug_renderer_info (Safari often hides it), and `device` from the Android user agent is just "K" on newer Chrome (the gpu text then does the work, which is why the Devices table groups by gpu).
- Backlog: the 30-day cleanup isn't scheduled; the page's 5,000-row cap.
