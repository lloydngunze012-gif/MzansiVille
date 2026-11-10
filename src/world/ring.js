// Meeting people (owner, 10 Nov), item 3: never inside each other. Every arrival point
// (spawn, a door, a taxi stop, a map pin, "walk to player") becomes a ring of spots
// like the Caf queue (src/world/queue.js), so two players who arrive at the same place
// a moment apart don't stand on top of each other. taken(x, z) -> true if that exact
// spot is already someone's (round to the nearest half metre so near-misses still
// count as the same spot).
const RINGS = [0, 0.9, 1.5, 2.2, 3, 3.9, 4.8]
const PER_RING = [1, 6, 9, 12, 14, 16, 18]

// cx, cz: the arrival point. free(x, z): is this spot clear of buildings and other
// solids (the scene's own blockedAt)? taken: positions already claimed here this
// moment (other real players arriving at the same instant), each { x, z }.
export function ringSpot(cx, cz, free, taken = []) {
  const clash = (x, z) => taken.some((t) => Math.hypot(t.x - x, t.z - z) < 0.75)
  for (let r = 0; r < RINGS.length; r++) {
    const radius = RINGS[r]
    const n = PER_RING[r]
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r % 2 ? Math.PI / n : 0)
      const x = cx + Math.cos(a) * radius
      const z = cz + Math.sin(a) * radius
      if ((!free || free(x, z)) && !clash(x, z)) return { x, z }
    }
  }
  return { x: cx, z: cz }
}
