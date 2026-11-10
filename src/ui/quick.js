import { avatarSvg } from '../avatar.js'
import DATA from '../../data/campusville/quickstart.json'
import { tidyHandle } from '../handles.js'
import { countryPick } from './enrol.js'

// Quick start (owner, 9 Nov): a new player sees ONE screen. Eight ready-made students (four women, four men,
// skins deep, fair, brown, amber each), a name (the @handle is made from it), where they are from (South
// Africa is already picked) and a big Play button. Nothing else before play. The house, course and roommate
// get a default; the full look editor, vibe and card come later as "Finish your student card".
// main.js: qs-pick, qs-play. Data: data/campusville/quickstart.json.
//
// THE PLAYER'S OWN NAME IS MANDATORY (owner, 10 Nov): the preset's name (Naledi, Thabo...) is only a label
// for that look, never a fake default dropped into the field for the player — the name field always starts
// empty (main.js quickPick never pre-fills it). An empty field shakes ('Type your name to play'; the gold
// Play button itself never greys out); a name that's too short, filtered or looks like an impersonation
// (handle_blocklist.json, src/handles.js nameBlocked) gets its own message instead, same as a handle. The
// same mandatory-name rule holds for the full enrol flow's Skip on the "who" step (main.js, act ===
// 'enrol-skip'): it fills in a house for you, never a name.
//
// OPENING PAGE (owner, 10 Nov): the hero is the picked student, large, over a golden-hour still of the real
// SunnyBay; the eight students are round portraits in a swipeable row below; a frosted panel holds the name,
// handle, country and Play. Every portrait and the hero are the real 3D models (src/ui/thumbs3d.js 'hero' and
// 'hair' kinds), hydrated after paint (main.js hydrateThumbs); this function only draws the instant flat-SVG
// placeholders so the screen is never empty while the renders are made.

export const STUDENTS = DATA.students
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Only bounce the hero when the pick actually changed (not on every repaint, e.g. typing or the country select).
let lastHero = null

export function quickScreen(state) {
  const { draft, district } = state
  const picked = STUDENTS.findIndex((s) => s.id === draft.preset)
  const hero = STUDENTS[picked] || STUDENTS[0]
  const bounce = lastHero !== null && lastHero !== picked
  lastHero = picked
  const chip = (s, i) => `<button class="qs-card" type="button" data-act="qs-pick" data-i="${i}" data-preset="${esc(s.id)}" aria-pressed="${picked === i}" aria-label="${esc(s.name)}">
      <span class="qs-pic" data-i="${i}">${avatarSvg(s.avatar, district.meta.dialCode, 64)}</span>
    </button>`
  const handle = tidyHandle(draft.handle)
  return `<main class="screen en qs qs2" data-screen="create" data-step="quick">
    <div class="qs-backdrop" aria-hidden="true"></div>
    <header class="qs-top"><span class="qs-logo">Soft Life</span></header>
    <div class="qs-hero">
      <div class="qs-heropic${bounce ? ' qs-bounce' : ''}" data-hero data-i="${picked}">${avatarSvg(hero.avatar, district.meta.dialCode, 200)}</div>
    </div>
    <div class="qs-row" role="group" aria-label="Pick your student">
      ${STUDENTS.map((s, i) => chip(s, i)).join('')}
    </div>
    <div class="qs-panel">
      <label class="en-field qs-name${draft.error === 'Type your name to play' ? ' qs-shake' : ''}"><span>Your name</span><input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="given-name" placeholder="Your name" enterkeyhint="go"></label>
      <p class="qs-handle" data-qs-handle>${handle ? `Your @handle: <b>@${esc(handle)}</b>` : ''}</p>
      ${countryPick(state, { province: false })}
      ${draft.error ? `<p class="en-err" role="alert">${esc(draft.error)}</p>` : ''}
      <button class="en-go qs-play" type="button" data-act="qs-play">Play ›</button>
      <p class="qs-fine">By tapping Play you agree to keep campus kind: <a href="#/rules">Community rules</a>.</p>
    </div>
  </main>`
}
