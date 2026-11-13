import base from './playwright.config.js'

// Two projects so the timing-sensitive tests never share the machine with another browser:
//   timing = tests/basics, tests/presence and queue-jitter (real GPU, fps gate, frame-exact checks): 1 worker
//   rest   = everything else: 2 workers
// `npm run test:e2e` runs timing first, then rest. Either alone: --project=timing / --project=rest.
const TIMING = [/[\\/]tests[\\/](basics|presence)[\\/].*\.spec\.js$/, /queue-jitter\.spec\.js$/]
const use = { ...base.use, channel: 'msedge' }

// quick = the pre-push set, under 10 minutes: floating cards, the Caf, the lecture, the home drop-off, the result
// card and the core action tests, and (9 Nov) the launch set: quick start, swap roommate, the card prompt, the leaderboard,
// feedback, health; and (10 Nov) one short SunnyBay test (city-quick), plus Meeting people's one-phone checks
// (city-meet: the map's back arrow, energy), and one short test of the places (city-places-quick: City job B). `npm run test:quick` (with npm run check). It repeats tests the other
// two run: pick it with --project=quick, never together with them.
const QUICK = [/e2e[\/](cards|caf|lecture|home|result-card|actions|launch|city-quick|city-meet|city-places-quick|topbar|tester-fixes1|chat-quick|social-quick|social-b-quick|loops-quick|sims-first|sound-quick|npc-crowd|tester-fixes2|chat-v2|social-c-quick|notify-quick|char3d-quick|movement-quick|firstplay-quick|play-quick|living-quick|life-quick|capacity-quick|boot-quick|owner-quick)\.spec\.js$/]

// Job H, item 4 (13 Nov): the quick gate had grown to 28 minutes. These moved to the full suite (`npm run test:e2e`,
// the 'rest' project, once a day): every area keeps at least one test at push time; what moved repeats a check at
// another width, is an older job's detail, or is timing-sensitive (the Caf's 30 fps belongs with the timing tests).
// The list with the reasons: docs/sprints/launch-safety/gate.md.
const MOVED = new RegExp([
  'at 1280 px ›', // cards: the same cards at 390 px stay
  'Caf shell at 1280px', 'Caf fixes at 360px', 'Caf fixes at 390px', 'Caf holds 30 fps',
  'A3: "Let.s study"', 'A4: "Swap numbers"', 'A5b: tap Mam', 'replies with an act',
  'Q2 the chat stays open',
  'day 1 home: township',
  'L4 the leaderboard', 'L4b the menu opens the board', 'L5c feedback',
  'P1 order tonight', 'P2 the streak',
  'M3 street people cross', 'M4 inside Lifecup',
  'N2 an iPhone in Safari', 'N3 the town on the opening page',
  'N2 the tour card open',
  'K2 the library focus', 'K3 the beach', 'K4 campus: the library study',
  'S2 SunnyBay: in through the gate road',
  'B2 interests \\(pick 3',
  'C2 a friend who shares', 'C3 open groups', 'C4 Go to a friend',
  'A1 friends and groups', 'A3 wake-up',
  'A\\. the Sims view tilts', 'B\\. a first meal at Lifecup',
  'F2 no fixed button overlaps another at (360|414) px', 'F3 the student card', 'F4 "\\+ Group"',
  'B3 two low stats pulse', 'B4 the time pill opens', 'B7 the bar at (360|414) px',
  'D3 a low-end phone profile',
  'V1 the palette rule holds',
  'the other students sit on the benches', 'lecture: late, so the front row',
  'M1 SunnyBay map: a back arrow',
].join('|'))

export default {
  ...base,
  use,
  projects: [
    { name: 'timing', testMatch: TIMING, use },
    { name: 'rest', testIgnore: TIMING, use },
    // (the real GPU: the software renderer draws 1-4 fps with two browsers, and the quick set must stay near 10 minutes)
    { name: 'quick', testMatch: QUICK, grepInvert: MOVED, use: { ...use, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } } },
  ],
}
