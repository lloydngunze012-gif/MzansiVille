import { CELL, WORLD_MAX, WORLD_MIN } from './layout.js'

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

export function cellOf(x, z) {
  return {
    c: Math.floor((x - WORLD_MIN) / CELL),
    r: Math.floor((z - WORLD_MIN) / CELL),
  }
}

export function cellCenter(c, r) {
  return {
    c,
    r,
    x: WORLD_MIN + (c + 0.5) * CELL,
    z: WORLD_MIN + (r + 0.5) * CELL,
  }
}

function inside(grid, c, r) {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows
}

export function walkable(grid, c, r) {
  if (!inside(grid, c, r)) return false
  return grid.blocked[r * grid.cols + c] === 0
}

export function buildGrid(obstacles) {
  const cols = Math.round((WORLD_MAX - WORLD_MIN) / CELL)
  const rows = cols
  const blocked = new Uint8Array(cols * rows)
  const pad = 0.4
  for (const box of obstacles) {
    const c0 = Math.floor((box.minX - pad - WORLD_MIN) / CELL)
    const c1 = Math.floor((box.maxX + pad - WORLD_MIN) / CELL)
    const r0 = Math.floor((box.minZ - pad - WORLD_MIN) / CELL)
    const r1 = Math.floor((box.maxZ + pad - WORLD_MIN) / CELL)
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (!inside({ cols, rows, blocked }, c, r)) continue
        blocked[r * cols + c] = 1
      }
    }
  }
  return { blocked, cols, rows }
}

export function nearestOpen(grid, point) {
  const seed = cellOf(point.x, point.z)
  if (walkable(grid, seed.c, seed.r)) return seed
  for (let radius = 1; radius <= 40; radius += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue
        const c = seed.c + dc
        const r = seed.r + dr
        if (walkable(grid, c, r)) return { c, r }
      }
    }
  }
  return seed
}

function heuristic(c, r, goalC, goalR) {
  return Math.hypot(goalC - c, goalR - r)
}

export function findPath(grid, start, goal) {
  if (!walkable(grid, start.c, start.r) || !walkable(grid, goal.c, goal.r)) return []
  const cols = grid.cols
  const size = grid.blocked.length
  const key = (c, r) => r * cols + c
  const startKey = key(start.c, start.r)
  const goalKey = key(goal.c, goal.r)
  if (startKey === goalKey) return [cellCenter(start.c, start.r)]
  const gScore = new Float32Array(size).fill(Infinity)
  const fScore = new Float32Array(size).fill(Infinity)
  const came = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)
  const open = [startKey]
  gScore[startKey] = 0
  fScore[startKey] = heuristic(start.c, start.r, goal.c, goal.r)
  while (open.length) {
    let best = 0
    for (let i = 1; i < open.length; i += 1) {
      if (fScore[open[i]] < fScore[open[best]]) best = i
    }
    const current = open.splice(best, 1)[0]
    if (current === goalKey) return smoothPath(grid, reconstruct(came, current, cols))
    closed[current] = 1
    const c = current % cols
    const r = (current - c) / cols
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc
      const nr = r + dr
      if (!walkable(grid, nc, nr)) continue
      if (dc && dr && (!walkable(grid, c + dc, r) || !walkable(grid, c, r + dr))) continue
      const next = key(nc, nr)
      if (closed[next]) continue
      const score = gScore[current] + cost
      if (score >= gScore[next]) continue
      came[next] = current
      gScore[next] = score
      fScore[next] = score + heuristic(nc, nr, goal.c, goal.r)
      if (!open.includes(next)) open.push(next)
    }
  }
  return []
}

function reconstruct(came, current, cols) {
  const out = []
  let cursor = current
  while (cursor >= 0) {
    const c = cursor % cols
    const r = (cursor - c) / cols
    out.push(cellCenter(c, r))
    cursor = came[cursor]
  }
  out.reverse()
  return out
}

export function segmentClear(grid, from, to, radius = 0.4) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const dist = Math.hypot(dx, dz)
  const steps = Math.max(1, Math.ceil(dist / 0.35))
  const len = dist || 1
  const offsets = [
    [0, 0],
    [(-dz / len) * radius, (dx / len) * radius],
    [(dz / len) * radius, (-dx / len) * radius],
  ]
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps
    for (const [ox, oz] of offsets) {
      const cell = cellOf(from.x + dx * t + ox, from.z + dz * t + oz)
      if (!walkable(grid, cell.c, cell.r)) return false
    }
  }
  return true
}

function smoothPath(grid, points) {
  if (points.length < 3) return points
  const out = [points[0]]
  let anchor = 0
  while (anchor < points.length - 1) {
    let next = points.length - 1
    while (next > anchor + 1 && !segmentClear(grid, points[anchor], points[next])) next -= 1
    out.push(points[next])
    anchor = next
  }
  return out
}

export function pointBlocked(grid, x, z) {
  const cell = cellOf(x, z)
  return !walkable(grid, cell.c, cell.r)
}

export function followStep(grid, position, route, step) {
  if (!route.length) return { position, route, done: true, blocked: false }
  const next = route[0]
  const dx = next.x - position.x
  const dz = next.z - position.z
  const dist = Math.hypot(dx, dz)
  if (dist <= step) {
    const landed = pointBlocked(grid, next.x, next.z) ? position : { x: next.x, z: next.z }
    const rest = route.slice(1)
    return { position: landed, route: rest, done: rest.length === 0, blocked: false }
  }
  const nx = position.x + (dx / dist) * step
  const nz = position.z + (dz / dist) * step
  if (!pointBlocked(grid, nx, nz)) {
    return { position: { x: nx, z: nz }, route, done: false, blocked: false }
  }
  let slid = position
  if (!pointBlocked(grid, nx, position.z)) slid = { x: nx, z: position.z }
  else if (!pointBlocked(grid, position.x, nz)) slid = { x: position.x, z: nz }
  const after = Math.hypot(next.x - slid.x, next.z - slid.z)
  return { position: slid, route, done: false, blocked: after > dist - 0.001 }
}
