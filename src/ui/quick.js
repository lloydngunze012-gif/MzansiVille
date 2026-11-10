import { avatarSvg } from '../avatar.js'
import DATA from '../../data/campusville/quickstart.json'
import { tidyHandle } from '../handles.js'
import { countryPick } from './enrol.js'

// Quick start (owner, 9 Nov): a new player sees ONE screen. Eight ready-made students (four women, four men,
// skins deep, fair, brown, amber each), a name (the @handle is made from it), where they are from (South
// Africa is already picked) and a big Play button. Nothing else before play. The house, course and roommate
// get a default; the full look editor, vibe and card come later as "Finish your student card".
// main.js: qs-pick, qs-play. Data: data/campusville/quickstart.json.

export const STUDENTS = DATA.students
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function quickScreen(state) {
  const { draft, district } = state
  const picked = STUDENTS.findIndex((s) => s.id === draft.preset)
  const card = (s, i) => `<button class="qs-card" type="button" data-act="qs-pick" data-i="${i}" data-preset="${esc(s.id)}" aria-pressed="${picked === i}" aria-label="${esc(s.name)}">
      <span class="qs-pic" data-look="${i}">${avatarSvg(s.avatar, district.meta.dialCode, 84)}</span><b>${esc(s.name)}</b>
    </button>`
  const women = STUDENTS.filter((s) => s.avatar.gender === 'female')
  const men = STUDENTS.filter((s) => s.avatar.gender === 'male')
  const handle = tidyHandle(draft.handle)
  return `<main class="screen en qs" data-screen="create" data-step="quick">
    <header class="en-top"><a class="en-back" href="#/">‹ Back</a><span class="qs-brand">Soft Life</span><span class="en-skip" aria-hidden="true"></span></header>
    <div class="en-body qs-body">
      <h1 class="qs-h">Pick your student</h1>
      <div class="qs-grid" role="group" aria-label="Pick your student">
        ${women.map((s) => card(s, STUDENTS.indexOf(s))).join('')}
        ${men.map((s) => card(s, STUDENTS.indexOf(s))).join('')}
      </div>
      <label class="en-field qs-name"><span>Your name</span><input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="given-name" placeholder="Your name" enterkeyhint="go"></label>
      <p class="qs-handle" data-qs-handle>${handle ? `Your @handle: <b>@${esc(handle)}</b>` : ''}</p>
      ${countryPick(state, { province: false })}
      ${draft.error ? `<p class="en-err" role="alert">${esc(draft.error)}</p>` : ''}
      <p class="qs-fine">By tapping Play you agree to keep campus kind: <a href="#/rules">Community rules</a>.</p>
    </div>
    <footer class="en-foot"><button class="en-go" type="button" data-act="qs-play">Play ›</button></footer>
  </main>`
}
