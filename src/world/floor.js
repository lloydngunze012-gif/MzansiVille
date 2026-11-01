// Walkable surfaces that stand above the ground (paths, plazas, decks, steps), so
// people's soles rest on whatever is under them. at(x, z) is the height of the
// highest surface there (0 on the bare ground). Shapes go into a coarse grid.
const CELL = 4

export function createFloor() {
  const cells = new Map()
  const key = (c, r) => `${c},${r}`
  function add(shape, minX, maxX, minZ, maxZ) {
    for (let c = Math.floor(minX / CELL); c <= Math.floor(maxX / CELL); c++) {
      for (let r = Math.floor(minZ / CELL); r <= Math.floor(maxZ / CELL); r++) {
        const k = key(c, r)
        if (!cells.has(k)) cells.set(k, [])
        cells.get(k).push(shape)
      }
    }
  }
  return {
    // A box seen from above: centre, half length (along yaw) and half width, top height.
    box(cx, cz, halfL, halfW, yaw, top) {
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      const reach = Math.hypot(halfL, halfW)
      add({ test: (x, z) => { const dx = x - cx; const dz = z - cz; return Math.abs(dx * c - dz * s) <= halfL && Math.abs(dx * s + dz * c) <= halfW }, top }, cx - reach, cx + reach, cz - reach, cz + reach)
    },
    disc(cx, cz, r, top, inner = 0) {
      add({ test: (x, z) => { const d = Math.hypot(x - cx, z - cz); return d <= r && d >= inner }, top }, cx - r, cx + r, cz - r, cz + r)
    },
    at(x, z) {
      let top = 0
      for (const shape of cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) if (shape.top > top && shape.test(x, z)) top = shape.top
      return top
    },
  }
}
