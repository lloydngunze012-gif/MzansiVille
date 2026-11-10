// Sessions and funnel events (owner, 9 Nov).
//  session: a visit is a new session if the last one ended more than 30 minutes ago. sessionNo() is how many this
//           phone has had (the third one asks "How's it going?"); returning() is true from the second.
//  funnel:  link opened -> Play tapped -> in the game -> first activity -> card finished, one row each in
//           client_errors (kind 'funnel', message = the step) so we can see where people drop off.
//           A step is sent once per phone (link_opened once per session). At most 40 an hour (the table
//           enforces it too). Under automation nothing is sent unless ?funnel=1; window.__funnel keeps what was sent.
import { authEnabled } from './net.js'
import { logRow } from './errors.js'

const SESSION_KEY = 'mzansiville.sessions'
const FUNNEL_KEY = 'mzansiville.funnel'
const GAP = 30 * 60 * 1000
const q = () => new URLSearchParams(location.search)
const store = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }

let current = null
// Count this visit (called once, at load). Returns { n, first, returning }.
export function startSession(now = Date.now()) {
  if (current) return current
  const s = store(SESSION_KEY) || { n: 0, last: 0 }
  // A phone that already has a student from before this was counted has been here before: this visit is a later one.
  if (!s.n && store('mzansiville.v1')?.run?.character) {
    s.n = 1
    // (automation: a test that clears storage in the middle of a visit and then loads its student is still on its first
    // visit, not a returning player; without this the weekly leaderboard card opened over every such test. A test that
    // wants a returning player writes mzansiville.sessions itself: tests/e2e/launch.spec.js visit().)
    if (navigator.webdriver) s.last = now
  }
  const fresh = !s.n
  if (!s.n || now - (s.last || 0) > GAP) s.n = (s.n || 0) + 1
  s.last = now
  put(SESSION_KEY, s)
  current = { n: s.n, first: fresh, returning: s.n > 1 }
  window.addEventListener('pagehide', () => { const t = store(SESSION_KEY); if (t) { t.last = Date.now(); put(SESSION_KEY, t) } })
  return current
}
export const sessionNo = () => (current || startSession()).n
// A returning player: this is not their first session on this phone.
export const returning = () => (current || startSession()).returning

const sent = (window.__funnel = [])
const live = () => authEnabled && (!navigator.webdriver || q().get('funnel') === '1')

export function funnel(step, detail = {}) {
  try {
    const done = store(FUNNEL_KEY) || {}
    if (step === 'link_opened') {
      if (sessionStorage.getItem('mzansiville.linkopened')) return
      sessionStorage.setItem('mzansiville.linkopened', '1')
    } else if (done[step]) return
    else { done[step] = Date.now(); put(FUNNEL_KEY, done) }
    sent.push({ step, at: Date.now(), ...detail })
    if (!live()) return
    logRow({
      kind: 'funnel', message: step,
      screen: location.hash || location.pathname,
      device: `${navigator.userAgent.slice(0, 120)} | ${window.innerWidth}x${window.innerHeight}`,
      // eslint-disable-next-line no-undef
      build: typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev',
      detail: JSON.stringify({ session: sessionNo(), ...detail }).slice(0, 300),
    })
  } catch { /* never breaks the game */ }
}
