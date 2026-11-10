import * as THREE from 'three'

// Piece 3, the conversation camera. Two people talking within 4 m of each other get a
// two-shot: about 2.5 m back and 1.7 m up, angled across the pair (over the near one's
// shoulder), both heads in the strip of screen between the HUD and the chat card. The
// same in Top, Sims and Eye view. Never inside a body, a building, a sign or a roof, never
// looking through any of them: it tries both sides and a few angles, nearest first, pulls
// back (and up a little) only as far as both heads need, and takes the first spot with
// both heads in plain view; with none, no two-shot (the caller keeps its own view). The
// scene eases into it (and back out of it) over SHOT_EASE seconds.

export const SHOT_RANGE = 4 // metres: closer than this, a conversation gets the two-shot
export const SHOT_EASE = 0.4 // seconds, in and out
const HEIGHT = 1.7 // metres above the ground
// (pulled back and up only when something is in the way: past signs, awnings and roofs)
const LIFT = [0, 0.7, 1.5] // metres above HEIGHT, tried only once no distance works lower
const BACK = [2.5, 2.8, 3.2, 3.7, 4.3, 5, 6, 7] // metres from the pair, about 2.5 first
const ANGLES = [20, 14, 27, 35, 45, 58, 72, 90] // degrees off the line through them, both sides
const HEAD = { side: 0.14, down: 0.14, up: 0.18 } // a head's box round its centre (m)

const corner = new THREE.Vector3()

// Where someone's head is (its centre): the rig's Head bone, or from the pose while the
// model loads.
export function headOf(avatar) {
  const head = avatar?.userData?.rigged ? avatar.getObjectByName('Head') : null
  if (head) {
    avatar.updateWorldMatrix(true, true)
    return head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0))
  }
  const pose = avatar?.userData?.pose
  const y = pose === 'sit' ? 1.2 : pose === 'lie' ? 0.7 : 1.62
  return new THREE.Vector3(avatar.position.x, (avatar.position.y || 0) + y, avatar.position.z)
}

// A head's box on screen through this camera: { minX, maxX, minY, maxY } in NDC, or
// null if any of it is behind the camera.
function boxOnScreen(probe, h) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const dx of [-HEAD.side, HEAD.side]) for (const dy of [-HEAD.down, HEAD.up]) for (const dz of [-HEAD.side, HEAD.side]) {
    const q = corner.set(h.x + dx, h.y + dy, h.z + dz).project(probe)
    if (q.z > 1 || q.z < -1) return null
    box.minX = Math.min(box.minX, q.x)
    box.maxX = Math.max(box.maxX, q.x)
    box.minY = Math.min(box.minY, q.y)
    box.maxY = Math.max(box.maxY, q.y)
  }
  return box
}

// Both heads inside the screen's sides and the band (top: under the HUD; bottom: above
// the card), and not one in front of the other.
function fits(probe, a, b, band) {
  const boxes = [boxOnScreen(probe, a), boxOnScreen(probe, b)]
  if (boxes.some((s) => !s || s.minX < -0.92 || s.maxX > 0.92 || s.maxY > band.top || s.minY < band.bottom)) return false
  const [p, q] = boxes
  const overlapX = Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX)
  const overlapY = Math.min(p.maxY, q.maxY) - Math.max(p.minY, q.minY)
  // (a sliver of overlap is fine: a shoulder past an ear)
  return overlapX < 0.08 || overlapY < 0.02
}

// Aim from pos at the pair: across, the middle of the two heads; up and down, the heads
// at the middle of the band.
function aim(pos, a, b, halfH, bandMid) {
  const ya = Math.atan2(a.x - pos.x, a.z - pos.z)
  const yb = Math.atan2(b.x - pos.x, b.z - pos.z)
  const yaw = ya + Math.atan2(Math.sin(yb - ya), Math.cos(yb - ya)) / 2
  const ea = Math.atan2(a.y - pos.y, Math.hypot(a.x - pos.x, a.z - pos.z))
  const eb = Math.atan2(b.y - pos.y, Math.hypot(b.x - pos.x, b.z - pos.z))
  const pitch = (ea + eb) / 2 - Math.atan(bandMid * halfH)
  return new THREE.Vector3(
    pos.x + Math.sin(yaw) * Math.cos(pitch) * 10,
    pos.y + Math.sin(pitch) * 10,
    pos.z + Math.cos(yaw) * Math.cos(pitch) * 10,
  )
}

// The two-shot of a (the player, the near one) and b (who they talk to): heads as
// Vector3s (headOf). band: NDC y range for the heads ({ top, bottom }); free(pos): the
// camera may stand there (no building, prop or body); clear(pos, head): nothing solid
// between the camera and that head; ground: the floor height under them; facing: the
// player's heading, for two people on the same spot; faces: the way b faces (their
// face should show: over your shoulder when they face you, over theirs when they don't).
// Returns { pos, look, ease: true }, or null when no spot works (the caller keeps its
// own shot).
export function twoShot({ camera, a, b, band = { top: 0.7, bottom: 0 }, free = () => true, clear = () => true, ground = 0, facing = 0, faces = null }) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  let ux = b.x - a.x
  let uz = b.z - a.z
  const d = Math.hypot(ux, uz)
  if (d < 0.3) { ux = Math.sin(facing); uz = Math.cos(facing) } else { ux /= d; uz /= d }
  const mx = (a.x + b.x) / 2
  const mz = (a.z + b.z) / 2
  const bandMid = (band.top + band.bottom) / 2
  const probe = camera.clone()
  // Can the camera see their face from here (in front of them, not behind)?
  const seesFace = (pos) => faces === null || (Math.sin(faces) * (pos.x - b.x) + Math.cos(faces) * (pos.z - b.z)) > 0
  let backOfHead = null
  // (every distance at eye height first: pulled back before it is lifted)
  for (const lift of LIFT) {
    for (const back of BACK) {
      // (over your shoulder first; over theirs when they face away from you)
      for (const end of [1, -1]) {
        for (const deg of ANGLES) {
          for (const side of [1, -1]) {
            const ang = THREE.MathUtils.degToRad(deg) * side
            // From the middle of them, back past one of them, turned off their line.
            const bx = -end * (ux * Math.cos(ang) - uz * Math.sin(ang))
            const bz = -end * (ux * Math.sin(ang) + uz * Math.cos(ang))
            const pos = new THREE.Vector3(mx + bx * back, ground + HEIGHT + lift, mz + bz * back)
            if (!free(pos)) continue
            const look = aim(pos, a, b, halfH, bandMid)
            probe.position.copy(pos)
            probe.lookAt(look)
            probe.updateMatrixWorld()
            if (!fits(probe, a, b, band)) continue
            if (!clear(pos, a) || !clear(pos, b)) continue
            if (!seesFace(pos)) { backOfHead = backOfHead || { pos, look, back, lift }; continue }
            return { pos, look, ease: true, back, lift, angle: deg * side * end }
          }
        }
      }
    }
  }
  // (nowhere their face shows: the back of their head beats no shot. Nowhere both heads
  // are in plain view: no two-shot at all, the camera keeps its own view, never one
  // that stands inside a sign or a roof or looks through it)
  return backOfHead ? { ...backOfHead, ease: true } : null
}
