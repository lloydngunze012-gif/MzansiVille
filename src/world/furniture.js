// Simple seats with known heights, so people sit on them (sitPose in avatar3d.js
// puts the hips at the avatar's origin: the seat surface, centre of the seat).
import * as THREE from 'three'

export const CHAIR_SEAT = 0.46

const wood = new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.8 })
const legs = new THREE.MeshStandardMaterial({ color: 0x3a3030, roughness: 0.6 })

function part(group, w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  group.add(m)
  return m
}

// A chair facing local +z (its back is at -z). Seat surface at CHAIR_SEAT.
export function makeChair() {
  const g = new THREE.Group()
  g.name = 'chair'
  part(g, 0.46, 0.05, 0.44, wood, 0, CHAIR_SEAT - 0.025, 0)
  part(g, 0.46, 0.42, 0.05, wood, 0, CHAIR_SEAT + 0.24, -0.2)
  for (const sx of [-0.2, 0.2]) for (const sz of [-0.19, 0.19]) part(g, 0.04, CHAIR_SEAT - 0.05, 0.04, legs, sx, (CHAIR_SEAT - 0.05) / 2, sz)
  return g
}
