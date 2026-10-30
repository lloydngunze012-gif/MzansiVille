import * as THREE from 'three'
import { skins } from '../avatar.js'

const CLOTH = {
  hoodie: 0x1f6b45,
  shirt: 0xf4efe6,
  jacket: 0x244e78,
  organt: 0xf0c400,
}

function colorOf(list, id, fallback) {
  return list.find((item) => item.id === id)?.fill || fallback
}

export function createAvatar(avatar = {}) {
  const skin = new THREE.Color(colorOf(skins, avatar.skin, '#d2956b'))
  const cloth = CLOTH[avatar.outfit] || CLOTH.hoodie
  const group = new THREE.Group()
  group.name = 'player'

  const bodyMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.8 })
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 })
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: 0.6 })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.62, 4, 8), bodyMat)
  body.position.y = 0.78
  body.castShadow = true
  group.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skinMat)
  head.position.y = 1.42
  head.castShadow = true
  group.add(head)

  const hair = hairMesh(avatar.hair || 'crop', hairMat)
  group.add(hair)

  if (avatar.outfit === 'organt') {
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.08, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: 0.5 }),
    )
    mark.position.set(0, 0.92, 0.27)
    group.add(mark)
  }

  group.userData.bob = body
  return group
}

function hairMesh(id, material) {
  const group = new THREE.Group()
  if (id === 'curls') {
    for (const [x, y, z, r] of [[-0.16, 1.52, 0, 0.1], [0.16, 1.52, 0, 0.1], [0, 1.62, -0.04, 0.12], [-0.08, 1.58, 0.08, 0.08], [0.08, 1.58, 0.08, 0.08]]) {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), material)
      curl.position.set(x, y, z)
      curl.castShadow = true
      group.add(curl)
    }
    return group
  }
  if (id === 'fade') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), material)
    cap.position.y = 1.46
    cap.castShadow = true
    group.add(cap)
    return group
  }
  if (id === 'braids') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), material)
    cap.position.y = 1.46
    group.add(cap)
    for (const x of [-0.1, 0.1]) {
      const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.42, 3, 6), material)
      braid.position.set(x, 1.12, 0.08)
      braid.castShadow = true
      group.add(braid)
    }
    return group
  }
  const crop = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), material)
  crop.position.y = 1.48
  crop.castShadow = true
  group.add(crop)
  return group
}

export function poseAvatar(group, walking, time) {
  const bob = walking ? Math.abs(Math.sin(time * 10)) * 0.06 : 0
  group.position.y = bob
  group.rotation.z = walking ? Math.sin(time * 10) * 0.04 : 0
}
