// Never break when full (owner, 13 Nov, job F, item 3). Before a phone joins the live rooms it asks to come in
// (supabase/launch.sql CAPACITY: cap_enter). Up to max_players are in at once; past that a new arrival sees
// "Campus is busy. You're in line: #N" and gets in as space frees (asked again every 10 s). Players already in keep
// playing: they ask again every minute so their place is kept, and give it back when the tab closes.
// If the function is not there yet (the SQL not run) or the network fails, the phone comes straight in: a missing
// server never locks anybody out. Automation asks nothing unless ?cap=1.
import { getClient } from './net.js'
import { myIdentity } from './presence.js'

const params = new URLSearchParams(location.search)
const OFF = typeof navigator !== 'undefined' && navigator.webdriver && params.get('cap') !== '1'
const WAIT_MS = (Number(params.get('capwait')) || 10) * 1000
const KEEP_MS = 60000
const state = { admitted: false, asking: false, position: 0, online: 0, max: 0, missing: false, tries: 0, last: null }
const queue = []
let overlay = null
let keepTimer = null

async function ask() {
  const client = await getClient()
  const me = myIdentity()
  if (!client || !me?.id || !me?.secret) return { admitted: true, why: 'offline' }
  try {
    const { data, error } = await client.rpc('cap_enter', { p_id: me.id, p_secret: me.secret })
    if (error) {
      if (/does not exist|not find the function|schema cache/i.test(error.message || '')) state.missing = true
      return { admitted: true, why: 'error' }
    }
    return data || { admitted: true }
  } catch { return { admitted: true, why: 'error' } }
}

function paintLine() {
  if (state.admitted) { overlay?.remove(); overlay = null; return }
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.className = 'cap-line'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', 'Campus is busy')
    document.body.append(overlay)
  }
  overlay.innerHTML = `<div class="cap-card"><p class="cap-kicker">Soft Life</p><h2>Campus is busy.</h2>
    <p class="cap-pos">You're in line: <b data-cap-pos>#${state.position}</b></p>
    <p class="cap-note">You'll come in by yourself as soon as there is room. Keep this page open.</p></div>`
}

async function step() {
  state.tries++
  const res = await ask()
  state.last = res
  state.position = res.position || 0
  state.online = res.online || 0
  state.max = res.max || 0
  if (res.admitted) {
    state.admitted = true
    paintLine()
    while (queue.length) queue.shift()()
    clearInterval(keepTimer)
    keepTimer = setInterval(ask, KEEP_MS)
    addEventListener('pagehide', leave)
    return
  }
  paintLine()
  setTimeout(step, WAIT_MS)
}
async function leave() {
  const client = await getClient()
  const me = myIdentity()
  if (client && me?.id) client.rpc('cap_leave', { p_id: me.id, p_secret: me.secret }).then(() => {}, () => {})
}

// Run fn once this phone is in (at once if it already is). The latest fn waiting wins (paint() calls it often).
export function whenAdmitted(fn) {
  if (OFF || state.admitted) { fn(); return }
  queue.length = 0
  queue.push(fn)
  if (state.asking) return
  state.asking = true
  step()
}
export const capacityState = () => ({ ...state, off: OFF })
window.mzansiCapacity = capacityState
