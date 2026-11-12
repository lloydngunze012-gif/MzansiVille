// Head shots from the real 3D character (owner, 11 Nov, job D) for the round avatars in the chat, the Board, the
// player card and the Friends tab, instead of the flat cartoon drawing.
//   faceHtml(look, size): a round face. One of the eight quick-start students with the look unchanged: their
//   ready-made portrait (/opening/<id>-face.webp, no 3D needed). A head shot made before (on this phone): at once.
//   Otherwise the cartoon stands in for a moment and the head shot is drawn (thumbs3d.js, one at a time, only
//   while the face is still on screen; the 'face' kind: a square, tight on the head) and swapped in, everywhere that look is shown.
//   Faces are found on their own: a watcher on the page picks up every new [data-f3d], so no screen needs to call
//   anything after it paints.
import './ui/faces.css'
import { avatarSvg } from './avatar.js'
import STUDENTS_DATA from '../data/campusville/quickstart.json'

const STUDENTS = STUDENTS_DATA.students || STUDENTS_DATA
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const looks = new Map() // key -> look
const made = new Map() // key -> picture url
const keyOf = (look) => JSON.stringify(look || {})
const params = new URLSearchParams(location.search)
// (no WebGL, or the tests asked for the drawings: the cartoon stays)
const off = params.get('faces') === 'svg'
function hasGL() {
  try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
let gl = null

export function presetFace(look) {
  const l = look || {}
  const s = STUDENTS.find((x) => x.avatar && Object.keys(x.avatar).length === Object.keys(l).length && Object.keys(x.avatar).every((k) => x.avatar[k] === l[k]))
  return s ? `/opening/${s.id}-face.webp` : ''
}

export function faceHtml(look, size = 40) {
  const key = keyOf(look)
  const url = made.get(key) || presetFace(look)
  if (url) return `<span class="f3d" data-f3d="${esc(key)}" data-done="1" style="--f3d:${size}px"><img src="${esc(url)}" alt="" width="${size}" height="${size}"></span>`
  looks.set(key, look || {})
  return `<span class="f3d" data-f3d="${esc(key)}" style="--f3d:${size}px">${avatarSvg(look || {}, '031', size)}</span>`
}

let thumbs = null
const busy = new Set()
function fill(el) {
  const key = el.dataset.f3d
  if (made.has(key)) { put(key, made.get(key)); return }
  if (busy.has(key) || off || !looks.has(key)) return
  if (gl === null) gl = hasGL()
  if (!gl) return
  busy.add(key)
  thumbs ||= import('./ui/thumbs3d.js')
  thumbs.then(({ thumbFor, thumbNow }) => {
    const look = looks.get(key)
    const now = thumbNow(look, 'face')
    return now || thumbFor(look, 'face', () => Boolean(document.querySelector(`[data-f3d="${CSS.escape(key)}"]:not([data-done])`)))
  }).then((url) => { busy.delete(key); if (url) { made.set(key, url); put(key, url) } }).catch(() => busy.delete(key))
}
function put(key, url) {
  for (const el of document.querySelectorAll(`[data-f3d="${CSS.escape(key)}"]:not([data-done])`)) {
    const size = parseFloat(el.style.getPropertyValue('--f3d')) || 40
    el.innerHTML = `<img src="${esc(url)}" alt="" width="${size}" height="${size}">`
    el.dataset.done = '1'
  }
}
function scan(root = document) {
  for (const el of root.querySelectorAll?.('[data-f3d]:not([data-done])') || []) fill(el)
}
let queued = false
const watcher = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan() }) })
watcher.observe(document.documentElement, { childList: true, subtree: true })

// Tests (read only).
window.mzansiFaces = () => ({ made: made.size, waiting: document.querySelectorAll('[data-f3d]:not([data-done])').length, shown: document.querySelectorAll('[data-f3d][data-done] img').length })
