// Test harness (not shipped): draws looks side by side on one canvas, standing, at a given
// angle, so a screenshot can be looked at. window.lineup({ looks: [avatar, ...], angle, size, pose }).
import * as THREE from 'three'
import { appearNow, createAvatar, poseAvatar } from '/src/world/avatar3d.js'

window.lineup = async ({ looks, angle = 0, w = 220, h = 420, pose = 'stand', t = 0.5, zoom = 1 }) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(w * looks.length, h)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  document.body.append(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#efe6d2')
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b4a6a, 2.2))
  const key = new THREE.DirectionalLight(0xfff2dc, 2)
  key.position.set(2, 4, 5)
  scene.add(key)
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 50)
  const avs = []
  for (const look of looks) {
    const av = createAvatar(look)
    await av.userData.ready
    av.userData.pose = pose
    av.rotation.y = angle
    poseAvatar(av, false, t)
    poseAvatar(av, false, t + 0.05)
    appearNow(av)
    scene.add(av)
    avs.push(av)
  }
  const cell = (i) => { renderer.setViewport(i * w, 0, w, h); renderer.setScissor(i * w, 0, w, h) }
  renderer.setScissorTest(true)
  cam.position.set(0, zoom > 1 ? 1.35 : 1.0, 5.6 / zoom)
  cam.lookAt(0, zoom > 1 ? 1.3 : 0.9, 0)
  avs.forEach((a, i) => { avs.forEach((b) => { b.visible = b === a }); cell(i); renderer.render(scene, cam) })
  return true
}
