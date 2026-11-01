// Nobody goes through anything: after everyone has moved this frame, push each
// standing person out of the solid things (walls, tables, counters, benches, stalls)
// and out of each other. Seated and lying people, and anyone sitting down or
// standing up, stay put and count as obstacles. People who can't be moved (a vendor
// at her counter, someone in a queue) push others but are never pushed.
export const RADIUS = 0.25 // a body's half-width (from another body)
export const REACH = 0.34 // how far hands swing out from the middle (from furniture and walls)
export const STRIDE = 0.46 // how far the front foot lands ahead (from something straight ahead)
export const APART = 0.5 // the closest two standing people get (centre to centre)

const settled = (a) => {
  const d = a.userData
  return d.pose === 'sit' || d.pose === 'lie' || Boolean(d.sitMove)
}

// How far to move a point out of a list of boxes (minX..maxZ), widened by r: along the
// shortest way out of each box it is in.
export function pushOutOfBoxes(x, z, r, boxes, facing = null) {
  let px = x
  let pz = z
  for (let round = 0; round < 3; round++) {
    let moved = false
    for (const b of boxes) {
      // (something straight ahead is kept a stride away: the front foot and hand reach
      // further forward than the body does to the side)
      let rr = r
      if (facing !== null) {
        const cx = Math.max(b.minX, Math.min(px, b.maxX)) - px
        const cz = Math.max(b.minZ, Math.min(pz, b.maxZ)) - pz
        const d = Math.hypot(cx, cz)
        if (d > 1e-4 && (cx * Math.sin(facing) + cz * Math.cos(facing)) / d > 0.6) rr = STRIDE
      }
      if (px <= b.minX - rr || px >= b.maxX + rr || pz <= b.minZ - rr || pz >= b.maxZ + rr) continue
      const out = [[b.minX - rr - px, 0], [b.maxX + rr - px, 0], [0, b.minZ - rr - pz], [0, b.maxZ + rr - pz]]
      out.sort((m, n) => Math.abs(m[0] + m[1]) - Math.abs(n[0] + n[1]))
      px += out[0][0]
      pz += out[0][1]
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
    // (a push is not a step: the walk and the turn-first rule don't count it)
    a.userData.lastPos?.set(a.userData.lastPos.x + dx, a.userData.lastPos.y, a.userData.lastPos.z + dz)
    if (a.userData.standAt) { a.userData.standAt.x += dx; a.userData.standAt.z += dz }
  }
  const free = (b) => !b.fixed && !settled(b.avatar)
  // People out of each other (two rounds), then everyone out of the furniture.
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const A = live[i]
        const B = live[j]
        if (settled(A.avatar) && settled(B.avatar)) continue
        const pa = A.avatar.position
        const pb = B.avatar.position
        const dx = pb.x - pa.x
        const dz = pb.z - pa.z
        const d = Math.hypot(dx, dz)
        // (seated people are on their seat: a standing person keeps a body's width from them)
        const need = settled(A.avatar) || settled(B.avatar) ? RADIUS * 1.6 : APART
        if (d >= need) continue
        const ux = d > 1e-4 ? dx / d : 1
        const uz = d > 1e-4 ? dz / d : 0
        const fa = free(A)
        const fb = free(B)
        if (!fa && !fb) continue
        const gap = need - d
        const sa = fa && fb ? gap / 2 : fa ? gap : 0
        const sb = gap - sa
        if (fa) move(A, pa.x - ux * sa, pa.z - uz * sa)
        if (fb) move(B, pb.x + ux * sb, pb.z + uz * sb)
      }
    }
  }
  for (const b of live) {
    const a = b.avatar
    if (b.fixed || settled(a)) continue
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
  for (const b of live) {
    if (b.fixed || settled(b.avatar) || b.avatar.userData.noCollide) continue
    const boxes = boxesNear(b.avatar.position.x, b.avatar.position.z) || []
    for (const x of boxes) {
      const { x: px, z: pz } = b.avatar.position
      const depth = Math.min(px - (x.minX - REACH), x.maxX + REACH - px, pz - (x.minZ - REACH), x.maxZ + REACH - pz)
      if (depth > deepest) { deepest = depth; who = b.avatar.userData.personId || (b.avatar.userData.isPlayer ? 'player' : 'extra') }
    }
  }
  return { closest: +closest.toFixed(3), pair, deepest: +deepest.toFixed(3), who }
}
