// Campus layout in meters. 1000 csv units is 200 m. No Three.js in this file.

export const CSV_SCALE = 0.2
export const CSV_ORIGIN = 500
export const WORLD_MIN = -110
export const WORLD_MAX = 110
export const CELL = 1

const KIND = {
  hub: { w: 6, d: 6, h: 3.2, color: 0xf0c400, roof: 0xd7a800 },
  food: { w: 7, d: 5, h: 4, color: 0xe07a3d, roof: 0xc45c22 },
  transit: { w: 12, d: 5, h: 3.4, color: 0x8aa0b4, roof: 0x60788e },
  venue: { w: 14, d: 10, h: 6, color: 0x3f8f62, roof: 0x2c6a48 },
  study: { w: 12, d: 9, h: 5.4, color: 0x6d8cae, roof: 0x4d6c8c },
  lecture: { w: 11, d: 8, h: 5, color: 0xd07a52, roof: 0xa85c38 },
  residence: { w: 9, d: 11, h: 8, color: 0xc4a484, roof: 0x8d6b4a },
  // Greenway Grocer: white walls, a green roof (its own colours, no real chain's)
  shop: { w: 11, d: 7, h: 4.2, color: 0xf6f7f3, roof: 0x2f8f5b },
}

// Places with their own shape. open: no walls (the Quad is a plaza; its footprint
// is the stage, dz metres north of the centre).
const PLACE = {
  quad: { w: 5, d: 3, h: 0.6, dz: -6.5, open: true },
  cafeteria: { w: 10, d: 6, h: 4.5 },
  off_campus: { w: 8, d: 7, h: 6 },
  bus_stop: { w: 5, d: 2.4, h: 2.6 },
}

export function csvToWorld(x, y) {
  return {
    x: (x - CSV_ORIGIN) * CSV_SCALE,
    z: (y - CSV_ORIGIN) * CSV_SCALE,
  }
}

// Which way each building's front (door, sign, banners) faces: local +Z turned by
// `facing` (0 = +Z, PI/2 = +X, PI = -Z, -PI/2 = -X). A building keeps the classic +Z
// front when its door spot (DOOR_DIST past the front wall) is inside the fence and clear
// of every other building; otherwise it turns to the side whose door spot is valid and
// nearest a campus path (Mzansi House backs onto the boundary fence, so it faces in).
export const DOOR_DIST = 5
export const DOOR_MAX_R = 98 // the fence is at 103; a door spot stays well inside it
const FACINGS = [0, Math.PI, Math.PI / 2, -Math.PI / 2]
const GATE_ROAD = { x: 0, z: 88 } // kept clear when a building has to turn from +Z

export function frontOf(facing) {
  return { x: Math.round(Math.sin(facing)), z: Math.round(Math.cos(facing)) }
}

function halfExtents(style, facing) {
  const sideways = Math.abs(Math.sin(facing)) > 0.5
  return sideways ? { hx: style.d / 2, hz: style.w / 2 } : { hx: style.w / 2, hz: style.d / 2 }
}

function doorFor(x, z, style, facing) {
  const f = frontOf(facing)
  const { hx, hz } = halfExtents(style, facing)
  return { x: x + f.x * (hx + DOOR_DIST), z: z + f.z * (hz + DOOR_DIST) }
}

function distToPaths(p, paths) {
  let best = Infinity
  for (const path of paths) {
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1]
      const b = path[i]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)))
    }
  }
  return best
}

export function buildingLayout(district) {
  const paths = (district.meta.paths || []).map((path) => path.map(([x, y]) => csvToWorld(x, y)))
  const raw = district.places.map((place) => {
    const style = { ...(KIND[place.kind] || KIND.hub), ...(PLACE[place.id] || {}) }
    const { x: cx, z: cz } = csvToWorld(place.x, place.y)
    return { place, style, cx, cz, x: cx, z: cz + (style.dz || 0) }
  })
  const boxOf = (r, facing = 0) => {
    const { hx, hz } = halfExtents(r.style, facing)
    return { minX: r.x - hx, maxX: r.x + hx, minZ: r.z - hz, maxZ: r.z + hz }
  }
  const inBox = (p, b, pad) => p.x > b.minX - pad && p.x < b.maxX + pad && p.z > b.minZ - pad && p.z < b.maxZ + pad
  const usable = (r, facing, strict) => {
    const p = doorFor(r.x, r.z, r.style, facing)
    if (Math.hypot(p.x, p.z) > DOOR_MAX_R) return false
    if (raw.some((o) => o !== r && inBox(p, boxOf(o), 1.5))) return false
    if (strict && Math.hypot(p.x - GATE_ROAD.x, p.z - GATE_ROAD.z) < 12) return false
    return true
  }
  const buildings = raw.map((r) => {
    let facing = 0
    if (!usable(r, 0, false)) {
      const options = FACINGS.slice(1).filter((f) => usable(r, f, true))
      options.sort((a, b) => distToPaths(doorFor(r.x, r.z, r.style, a), paths) - distToPaths(doorFor(r.x, r.z, r.style, b), paths))
      facing = options[0] ?? 0
    }
    const box = boxOf(r, facing)
    return {
      id: r.place.id,
      name: r.place.name,
      kind: r.place.kind,
      house: (district.houses || []).find((h) => h.place === r.place.id) || null,
      cx: r.cx,
      cz: r.cz,
      x: r.x,
      z: r.z,
      ...r.style,
      facing,
      ...box,
    }
  })
  const obstacles = buildings.map((building) => ({
    minX: building.minX,
    maxX: building.maxX,
    minZ: building.minZ,
    maxZ: building.maxZ,
  }))
  return { buildings, obstacles, paths }
}

// A spot out in front of the building's door side, `dist` metres past the wall.
export function frontPoint(building, dist = DOOR_DIST) {
  const f = frontOf(building.facing || 0)
  const { hx, hz } = halfExtents(building, building.facing || 0)
  return { x: building.x + f.x * (hx + dist), z: building.z + f.z * (hz + dist) }
}

export function doorPoint(building) {
  return frontPoint(building, DOOR_DIST)
}
