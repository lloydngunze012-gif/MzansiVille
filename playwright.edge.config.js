import base from './playwright.config.js'

// Two projects so the timing-sensitive tests never share the machine with another browser:
//   timing = tests/basics, tests/presence and queue-jitter (real GPU, fps gate, frame-exact checks): 1 worker
//   rest   = everything else: 2 workers
// `npm run test:e2e` runs timing first, then rest. Either alone: --project=timing / --project=rest.
const TIMING = [/[\\/]tests[\\/](basics|presence)[\\/].*\.spec\.js$/, /queue-jitter\.spec\.js$/]
const use = { ...base.use, channel: 'msedge' }

// quick = the pre-push set, under 10 minutes: floating cards, the Caf, the lecture, the home drop-off, the result
// card and the core action tests, and (9 Nov) the launch set: quick start, swap roommate, the card prompt, the leaderboard,
// feedback, health; and (10 Nov) one short SunnyBay test (city-quick). `npm run test:quick` (with npm run check). It repeats tests the other two run:
// pick it with --project=quick, never together with them.
const QUICK = [/e2e[\/](cards|caf|lecture|home|result-card|actions|launch|city-quick)\.spec\.js$/]

export default {
  ...base,
  use,
  projects: [
    { name: 'timing', testMatch: TIMING, use },
    { name: 'rest', testIgnore: TIMING, use },
    // (the real GPU: the software renderer draws 1-4 fps with two browsers, and the quick set must stay under 10 minutes)
    { name: 'quick', testMatch: QUICK, use: { ...use, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } } },
  ],
}
