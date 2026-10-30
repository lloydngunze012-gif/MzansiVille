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
}

export function csvToWorld(x, y) {
  return {
    x: (x - CSV_ORIGIN) * CSV_SCALE,
    z: (y - CSV_ORIGIN) * CSV_SCALE,
  }
}

export function buildingLayout(district) {
  const buildings = district.places.map((place) => {
    const style = KIND[place.kind] || KIND.hub
    const { x, z } = csvToWorld(place.x, place.y)
    return {
      id: place.id,
      name: place.name,
      kind: place.kind,
      x,
      z,
      ...style,
      minX: x - style.w / 2,
      maxX: x + style.w / 2,
      minZ: z - style.d / 2,
      maxZ: z + style.d / 2,
    }
  })
  const obstacles = buildings.map((building) => ({
    minX: building.minX,
    maxX: building.maxX,
    minZ: building.minZ,
    maxZ: building.maxZ,
  }))
  const paths = (district.meta.paths || []).map((path) => path.map(([x, y]) => csvToWorld(x, y)))
  return { buildings, obstacles, paths }
}

export function doorPoint(building) {
  return { x: building.x, z: building.maxZ + 5 }
}
