import * as THREE from 'three'

// A sign that reads the right way round from both sides: the front shows the text, and
// a second face on the back shows it again, unmirrored (a plain two-sided plane would
// show it back to front from behind).
export function signMesh(geometry, texture, extra = {}) {
  const front = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, ...extra }))
  const flipped = texture.clone()
  flipped.wrapS = THREE.RepeatWrapping
  flipped.repeat.x = -1
  flipped.offset.x = 1
  flipped.needsUpdate = true
  const back = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: flipped, side: THREE.BackSide, ...extra }))
  back.name = 'sign-back'
  back.raycast = () => {}
  front.add(back)
  return front
}
