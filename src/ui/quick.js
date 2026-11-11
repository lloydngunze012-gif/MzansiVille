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
// OPENING PAGE V2 (owner, 11 Nov): one scene per student. Each of the eight was photographed INSIDE the
// real campus (scripts/opening-stills.mjs, window.mzansiPortrait in scene.js): on the lawn by the Main Gate
// at golden hour, the gate and the sea out of focus behind, a warm key and rim light. The picked student's
// picture (public/opening/<id>.webp, under 60 KB) fills the top of the screen edge to edge, the real logo
// over it; the round portraits (cut from the same pictures) overlap its bottom edge; then the plum glass
// panel: name, country, Play. No live 3D on this page, and nothing waits for a picture: the scene has its
// own plum-to-gold dusk behind it (quick.css), which is what shows if a picture is slow or blocked.
// The selected picture loads first; main.js hydrateQuickThumbs fetches the other seven once it has landed.
// V2.1 (owner, 11 Nov): light and international. Cream page, white panel, ink text, yellow Play; the stills are
// bright late-morning daylight with the sea in view; Emma is first in the row and the one picked when the page
// opens; "Pick your character" with a soft arrow bobs over the portraits until the first tap on one.

export const STUDENTS = DATA.students
export const stillOf = (s) => `/opening/${s.id}.webp`
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// "Pick your character" shows until the first tap on a portrait (main.js calls notePick()): the label on screen
// fades and is taken away, and later repaints leave it out.
let hint = true
export function notePick() {
  if (!hint) return
  hint = false
  const el = document.querySelector('.qs-pick')
  if (!el) return
  el.classList.add('gone')
  setTimeout(() => el.remove(), 500)
}

// Only ease the new scene in when the pick actually changed (not on every repaint, e.g. typing or the country select).
let lastHero = null

export function quickScreen(state) {
  const { draft } = state
  const picked = Math.max(0, STUDENTS.findIndex((s) => s.id === draft.preset))
  const hero = STUDENTS[picked]
  const swap = lastHero !== null && lastHero !== picked
  lastHero = picked
  const chip = (s, i) => `<button class="qs-card" type="button" data-act="qs-pick" data-i="${i}" data-preset="${esc(s.id)}" aria-pressed="${picked === i}" aria-label="${esc(s.name)}">
      <img class="qs-pic" src="/opening/${esc(s.id)}-face.webp" alt="" width="64" height="64" decoding="async">
    </button>`
  const handle = tidyHandle(draft.handle)
  const pickHint = hint ? '<p class="qs-pick" data-qs-pick>Pick your character<i aria-hidden="true">↓</i></p>' : ''
  return `<main class="screen en qs qs2" data-screen="create" data-step="quick">
    <div class="qs-scene${swap ? ' qs-swap' : ''}" data-scene data-i="${picked}" data-still="${esc(stillOf(hero))}" style="--still: url('${esc(stillOf(hero))}')" aria-hidden="true"></div>
    <header class="qs-top"><img class="qs-logo" src="/opening/logo.webp" alt="Soft Life" width="242" height="220"><span class="qs-uni">University of Mzansi</span></header>
    <div class="qs-rowwrap">
      ${pickHint}
      <div class="qs-row" role="group" aria-label="Pick your character">
        ${STUDENTS.map((s, i) => chip(s, i)).join('')}
      </div>
    </div>
    <div class="qs-panel">
      <label class="en-field qs-name${draft.error === 'Type your name to play' ? ' qs-shake' : ''}"><span>Your name</span><input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="given-name" placeholder="Type your name" enterkeyhint="go"></label>
      <p class="qs-handle" data-qs-handle>${handle ? `Your @handle: <b>@${esc(handle)}</b>` : ''}</p>
      ${countryPick(state)}
      ${draft.error ? `<p class="en-err" role="alert">${esc(draft.error)}</p>` : ''}
      <button class="en-go qs-play" type="button" data-act="qs-play">Play ›</button>
      <p class="qs-fine">By tapping Play you agree to keep campus kind: <a href="#/rules">Community rules</a>.</p>
    </div>
  </main>`
}
