import base from './playwright.config.js'

// Two projects so the timing-sensitive tests never share the machine with another browser:
//   timing = tests/basics, tests/presence and queue-jitter (real GPU, fps gate, frame-exact checks): 1 worker
//   rest   = everything else: 2 workers
// `npm run test:e2e` runs timing first, then rest. Either alone: --project=timing / --project=rest.
const TIMING = [/[\\/]tests[\\/](basics|presence)[\\/].*\.spec\.js$/, /queue-jitter\.spec\.js$/]
const use = { ...base.use, channel: 'msedge' }

export default {
  ...base,
  use,
  projects: [
    { name: 'timing', testMatch: TIMING, use },
    { name: 'rest', testIgnore: TIMING, use },
  ],
}
