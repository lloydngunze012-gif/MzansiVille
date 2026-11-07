// Nobody goes through anything: after everyone has moved this frame, push each
// standing person out of the solid things (walls, tables, counters, benches, stalls)
// and out of each other. Seated and lying people, and anyone sitting down or
// standing up, stay put and count as obstacles. People who can't be moved (a vendor
// at her counter, someone in a queue) push others but are never pushed.
export const RADIUS = 0.25 // a body's half-width (from another body)
export const REACH = 0.38 // how far hands swing out from the middle (from furniture and walls)
export const STRIDE = 0.46 // how far the front foot lands ahead (from something straight ahead)
export const APART = 0.5 // the closest two standing people get (centre to centre)

const settled = (a) => {
  const d = a.userData
  return d.pose === 'sit' || d.pose === 'lie' || Boolean(d.sitMove)
}

// A box in its own frame: the axis-aligned boxes (minX..maxZ) are boxes with no turn;
// the colliders (colliders.js) are turned boxes (cx, cz, hx, hz, rot).
function frameOf(b) {
  if (b.rot === undefined) return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, hx: (b.maxX - b.minX) / 2, hz: (b.maxZ - b.minZ) / 2, cs: 1, sn: 0 }
  return { cx: b.cx, cz: b.cz, hx: b.hx, hz: b.hz, cs: Math.cos(b.rot), sn: Math.sin(b.rot) }
}
// How far inside a box (widened by r) a point is: 0 outside.
export function depthIn(x, z, b, r) {
  const f = frameOf(b)
  const dx = x - f.cx
  const dz = z - f.cz
  const u = dx * f.cs - dz * f.sn
  const v = dx * f.sn + dz * f.cs
  return Math.max(0, Math.min(f.hx + r - Math.abs(u), f.hz + r - Math.abs(v)))
}

// How far to move a point out of a list of boxes, widened by r: along the shortest way
// out of each box it is in (in the box's own turn).
export function pushOutOfBoxes(x, z, r, boxes, facing = null) {
  let px = x
  let pz = z
  // (a few rounds: out of one box can be into the next, a stage and its step)
  for (let round = 0; round < 6; round++) {
    let moved = false
    for (const b of boxes) {
      if (px <= b.minX - STRIDE || px >= b.maxX + STRIDE || pz <= b.minZ - STRIDE || pz >= b.maxZ + STRIDE) continue
      const f = frameOf(b)
      const dx = px - f.cx
      const dz = pz - f.cz
      const u = dx * f.cs - dz * f.sn
      const v = dx * f.sn + dz * f.cs
      // (something straight ahead is kept a stride away: the front foot and hand reach
      // further forward than the body does to the side)
      let rr = r
      if (facing !== null) {
        const qu = Math.max(-f.hx, Math.min(u, f.hx)) - u
        const qv = Math.max(-f.hz, Math.min(v, f.hz)) - v
        const wx = qu * f.cs + qv * f.sn
        const wz = -qu * f.sn + qv * f.cs
        const d = Math.hypot(wx, wz)
        // (more of a stride the more it's ahead: a corner half ahead while sliding round it)
        if (d > 1e-4) rr = r + (STRIDE - r) * Math.min(1, Math.max(0, ((wx * Math.sin(facing) + wz * Math.cos(facing)) / d - 0.2) / 0.5))
      }
      const ou = f.hx + rr - Math.abs(u)
      const ov = f.hz + rr - Math.abs(v)
      if (ou <= 0 || ov <= 0) continue
      let du = 0
      let dv = 0
      if (ou < ov) du = (u >= 0 ? 1 : -1) * ou
      else dv = (v >= 0 ? 1 : -1) * ov
      px += du * f.cs + dv * f.sn
      pz += -du * f.sn + dv * f.cs
      moved = true
    }
    if (!moved) break
  }
  return { x: px, z: pz }
}

// bodies: [{ avatar, fixed }]; boxesNear(x, z) gives the solid boxes around a point
// (or null where there are none to test, like a scripted scene with its own paths).
export function resolveBodies(bodies, boxesNear) {
  const live = bodies.filter((b) => b.avatar?.visible && !b.avatar.userData.disposed)
  const move = (b, x, z) => {
    const a = b.avatar
    const dx = x - a.position.x
    const dz = z - a.position.z
    if (!dx && !dz) return
    a.position.x = x
    a.position.z = z
    // (the push counts in the speed: someone walking into a wall is held still, and the
    // walk turns to standing, so the legs don't stride into it)
    if (a.userData.standAt) { a.userData.standAt.x += dx; a.userData.standAt.z += dz }
  }
  const free = (b) => !b.fixed && !settled(b.avatar)
  // People out of each other (two rounds), then everyone out of the furniture, then
  // once more out of each other where that doesn't push anyone into the furniture
  // (someone held between a counter and a person).
  const peoplePass = (careful) => {
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) apart(live[i], live[j], careful)
    }
  }
  const clear = (x, z, a) => { const boxes = boxesNear(x, z) || []; return !boxes.some((bx) => depthIn(x, z, bx, a.userData.noCollide ? 0 : RADIUS) > 0.001) }
  const apart = (A, B, careful) => {
    if (settled(A.avatar) && settled(B.avatar)) return
    const pa = A.avatar.position
    const pb = B.avatar.position
    const dx = pb.x - pa.x
    const dz = pb.z - pa.z
    const d = Math.hypot(dx, dz)
    const need = settled(A.avatar) || settled(B.avatar) ? RADIUS * 1.6 : APART
    if (d >= need) return
    const ux = d > 1e-4 ? dx / d : 1
    const uz = d > 1e-4 ? dz / d : 0
    const fa = free(A)
    const fb = free(B)
    if (!fa && !fb) return
    const gap = need - d
    const sa = fa && fb ? gap / 2 : fa ? gap : 0
    const sb = gap - sa
    const na = { x: pa.x - ux * sa, z: pa.z - uz * sa }
    const nb = { x: pb.x + ux * sb, z: pb.z + uz * sb }
    if (careful && ((fa && !clear(na.x, na.z, A.avatar)) || (fb && !clear(nb.x, nb.z, B.avatar)))) return
    if (fa) move(A, na.x, na.z)
    if (fb) move(B, nb.x, nb.z)
  }
  for (let round = 0; round < 2; round++) peoplePass(false)
  for (const b of live) {
    const a = b.avatar
    if (b.fixed || settled(a)) continue
    // Standing on something (the open-mic stage): not inside it, so not pushed out of it.
    if (a.position.y > 0.25 && !a.userData.isPlayer) continue
    const boxes = boxesNear(a.position.x, a.position.z)
    if (!boxes?.length) continue
    // Someone stepping in to a seat ('in') or just up from one ('out') is among the
    // furniture on purpose: left be until they've sat down, or walked clear after
    // getting up. (A step-in that never ends in a seat lapses after 10 seconds.)
    const nc = a.userData.noCollide
    if (nc === 'in' && performance.now() - (a.userData.noCollideAt || 0) > 10000) a.userData.noCollide = 'out'
    if (a.userData.noCollide) {
      const p = pushOutOfBoxes(a.position.x, a.position.z, REACH, boxes)
      if (a.userData.noCollide === 'out' && p.x === a.position.x && p.z === a.position.z) a.userData.noCollide = false
      continue
    }
    const p = pushOutOfBoxes(a.position.x, a.position.z, REACH, boxes, a.userData.yaw ?? a.rotation.y)
    move(b, p.x, p.z)
  }
  peoplePass(true)
}

// Tests: the closest any two standing people are, and the deepest anyone stands inside a box.
export function bodyReport(bodies, boxesNear) {
  const live = bodies.filter((b) => b.avatar?.visible && !b.avatar.userData.disposed)
  let closest = Infinity
  let pair = null
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (settled(live[i].avatar) || settled(live[j].avatar)) continue
      const d = Math.hypot(live[i].avatar.position.x - live[j].avatar.position.x, live[i].avatar.position.z - live[j].avatar.position.z)
      if (d < closest) { closest = d; pair = [live[i].avatar.userData.personId || 'player', live[j].avatar.userData.personId || 'player'] }
    }
  }
  let deepest = 0
  let who = null
  let what = null
  for (const b of live) {
    if (b.fixed || settled(b.avatar) || b.avatar.userData.noCollide) continue
    const boxes = boxesNear(b.avatar.position.x, b.avatar.position.z) || []
    for (const x of boxes) {
      // (how far the body's middle is inside the box widened by a body's half-width: a
      // body actually in the thing, not just its hands near it)
      const depth = depthIn(b.avatar.position.x, b.avatar.position.z, x, RADIUS)
      if (depth > deepest) { deepest = depth; who = b.avatar.userData.personId || (b.avatar.userData.isPlayer ? 'player' : 'extra'); what = x.kind || 'box' }
    }
  }
  return { closest: +closest.toFixed(3), pair, deepest: +deepest.toFixed(3), who, what }
}
