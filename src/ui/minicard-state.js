// Meeting people (owner, 10 Nov), item 1: the mini player card never blocks movement,
// and walking away closes it. main.js owns the card itself; the 3D scenes (scene.js,
// city.js) only know where the player stood when it opened, so they can tell main.js
// to close it once the player has gone a few metres (a tap elsewhere to walk, or the
// stick). Kept tiny and scene-agnostic on purpose: it has no idea what a "card" is.
const AWAY = 4.5 // metres

let openId = ''
let openAt = null // { x, z } where the player stood when it opened

export function noteOpen(id, x, z) {
  openId = id
  openAt = { x, z }
}
export function noteClosed(id) {
  if (!id || id === openId) { openId = ''; openAt = null }
}
// Call every frame from the active scene with the player's position. Fires
// 'mzansi-player-card-close' once, the moment the player has walked away.
export function checkAway(x, z) {
  if (!openAt) return
  if (Math.hypot(x - openAt.x, z - openAt.z) < AWAY) return
  const id = openId
  openId = ''
  openAt = null
  window.dispatchEvent(new CustomEvent('mzansi-player-card-close', { detail: { id } }))
}
