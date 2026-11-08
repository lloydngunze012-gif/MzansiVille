# Smoothness reports from real phones (owner, 7 Nov)

Piece: Flow 1 (docs/design/month1-focus.md, Flow > The work > 1). Push and deploy. The SPEC below is the owner's prompt, verbatim.

SPEC
Goal: Lloyd sees, per place and per device, how smooth the game really is on players' phones.

1. Collector: src/smooth.js
- One shared module. Each render loop calls smooth.frame(now, scene, place) once per frame:
  scene.js (campus), home.js, morning.js, lecture.js. scene = 'campus'|'home'|'morning'|'lecture'.
- place:
  - campus: the nearest id from data/campusville/places.csv within 30 m, else 'paths';
    in a common room (inHouse), `common:<house id>`.
  - other scenes: 'home:<style id>', 'morning', 'lecture'.
  - Compute the place at most twice a second, not every frame.
- Per bucket (scene|place), keep:
  - a frame-time histogram (typed array, 2 ms bins to 200 ms plus an overflow bin);
  - seconds played;
  - half-second windows below 30 and below 20 fps (reuse the 0.5 s count scene.js already does);
  - long frames (>50 ms) and the worst frame in ms;
  - walks started and stalled walks;
  - taps and their tap-to-move ms (tap on the ground -> first frame the player has moved).
- Stalls to record (each at most 8 per bucket per report, with x, z, kind, how):
  - the player's walk ending 'stalled' more than 1.5 m short of its target (kind 'player');
  - the existing `against` case once it passes 1 s (kind 'against');
  - NPC walks in walks.js ending 'stalled' (kind 'npc'). Exclude intended queue holds (lineHeld)
    and say how you told them apart.
- What's not counted:
  - frames over 1000 ms (tab hidden);
  - the first 3 s after a scene shows (loading hitch).
- Load time: load_ms = timeOrigin -> first rendered frame of the first 3D scene, sent on the
  session's first row only.
- Per-frame cost must stay under 0.05 ms on average. Measure it and put the number in the report.

2. Sending
- Flush every 3 minutes while visible, and on visibilitychange 'hidden' / pagehide.
- One row per bucket with at least 10 s played, at most 6 rows per flush and 40 per session.
- Send with fetch keepalive POST to `${SUPABASE_URL}/rest/v1/smooth_reports`, using the anon key
  from net.js config, so a closing tab still sends.
- Failures are silent: no retries, no console spam (one console.warn per session at most).
- If the table doesn't exist yet the game must be unaffected.
- Never send when:
  - authEnabled is false;
  - on localhost;
  - with ?fast=1 or navigator.webdriver;
  - the Settings switch is off.
- ?smooth=test puts rows in window.__smoothReports instead of sending, and exposes
  window.mzansiSmoothFlush().

3. Table (append to supabase/schema.sql, as one block Lloyd runs in the SQL editor)
- public.smooth_reports, columns:
  id, created_at, session (random per page load, NOT the player id), build, scene, place,
  seconds real, fps_typical int (1000/median frame ms), fps_low int (1000/90th-percentile frame ms,
  the "worst 10%"), secs_below_30 real, secs_below_20 real, long_frames int, worst_ms int,
  taps int, tap_ms int (median, null if no taps), walks int, stalls int,
  stall_at jsonb (array of at most 8), load_ms int, device text (short, from the UA),
  gpu text (WEBGL_debug_renderer_info if available), mem real (deviceMemory), cores int,
  screen text (w x h @ dpr), net text (effectiveType), installed boolean (standalone).
- RLS:
  - insert for anon and authenticated with check (true), plus check constraints capping text
    lengths and jsonb_array_length(stall_at) <= 8;
  - select only for public.is_admin().
- Include a commented-out 30-day cleanup statement, and add a backlog line to schedule it.

4. Settings and privacy
- Settings gets a switch, "Send smoothness reports", default on, stored locally.
- Read these keys from data/campusville/meta.json under "smoothness":
  settingLabel, settingHelp, privacyLine.
- The #/privacy screen shows privacyLine.
- Add the keys with empty strings for Cursor to fill (don't write the wording yourself).
- Add a sim check that fails while any of the three keys is empty or missing.

5. Lloyd's page: #/smooth (admin only, same sign-in as #/admin, linked from #/admin)
- Range buttons: 24 h / 7 days (default 7 days). Select at most 5,000 rows and aggregate client-side.
- Places table: place, players (distinct sessions), minutes, typical fps (median of fps_typical),
  worst-10% fps (median of fps_low), % of time below 20, long frames per minute, stalls,
  tap-to-move median.
  - Red row when worst-10% < 20 or > 5% of time is below 20; amber when typical < 30.
  - Sort worst first.
- Devices table: same columns, grouped by gpu (fall back to device).
- Load line: median and slowest-10% load_ms, split by net.
- Tap a place: its last 20 stalls (kind, how, x, z, when, device).
- Cream theme, readable at 390 px, no new dependencies.

6. Tests
- S1, any machine (?smooth=test): walk Quad -> Cafeteria, flush, check two buckets with
  correct place ids and every column the right type/range; the switch off gives no rows;
  normal test runs make no request to smooth_reports.
- S2, movement, GPU: walk into a wall -> one 'player' or 'against' stall at the right x, z;
  a ground tap records tap_ms. Gate with fpsGate from tests/fps.js.
- S3: the per-frame cost over 600 frames.
- S4: #/smooth with injected rows (window.__smoothRows) shows the order, colours and the stall list.
- Run npm run check, all checks; the meta.json check is expected to fail until Cursor fills it.
  Say so.
- Screenshots of #/smooth at 390x844 and 1440x900 in docs/sprints/smoothness/ (not committed).

7. Done
- Write docs/sprints/smoothness/report.md and update docs/now.md.
- Tell Lloyd plainly: "Run the smooth_reports block in the Supabase SQL editor before deploying."
- Give the GPU command for S2:
  npx playwright test <spec> --config playwright.gpu.config.js --workers=1
- Out-of-scope problems go to docs/backlog.md.
