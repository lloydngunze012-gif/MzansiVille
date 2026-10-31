// Item 4: phone layout. The creator shows the whole 3D student; the cover keeps heads in.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/layout'
test.use({ viewport: { width: 412, height: 915 } })

test('cover and creator on a phone', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1#/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1#/')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/1-cover.png` })
  await page.goto('/?fast=1#/new')
  for (const [part, id] of [['gender', 'female'], ['outfit', 'organt'], ['hair', 'braids']]) await page.locator(`[data-part="${part}"][data-id="${id}"]`).tap()
  await expect(page.locator('.cc-stage')).toHaveClass(/cc-has3d/, { timeout: 20000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/2-creator.png` })
  await page.locator('[data-part="outfit"][data-id="dress"]').tap()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/3-creator-dress.png` })
  // The outfit, hair and body icons are pictures of the 3D models (not drawings).
  await expect(page.locator('.cc-chip[data-part="outfit"][data-thumb="3d"]').first()).toBeVisible({ timeout: 40000 })
  await expect.poll(async () => page.locator('.cc-chip[data-thumb="3d"]').count(), { timeout: 60000 }).toBeGreaterThanOrEqual(8)
  await page.locator('[data-part="hair"]').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/4-creator-icons.png` })
  await page.locator('[data-part="outfit"]').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/5-creator-outfit-icons.png` })
})

// Item 5: the new characters, side by side (outfits, genders, sitting, walking).
test('character line-up', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/')
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const A = await import('/src/world/avatar3d.js')
    document.body.innerHTML = ''
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setPixelRatio(2)
    r.setSize(412, 700)
    r.domElement.id = 'lineup'
    document.body.appendChild(r.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x88aa88)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2.2))
    const d = new THREE.DirectionalLight(0xffffff, 2)
    d.position.set(3, 5, 6)
    scene.add(d)
    const cam = new THREE.PerspectiveCamera(35, 412 / 700, 0.1, 100)
    cam.position.set(0, 2.6, 10.5)
    cam.lookAt(0, 0.7, 1)
    const looks = [
      { gender: 'female', skin: 'deep', hair: 'braids', outfit: 'organt' },
      { gender: 'female', skin: 'amber', hair: 'curls', outfit: 'dress' },
      { gender: 'female', skin: 'sand', hair: 'fade', outfit: 'skirt' },
      { gender: 'male', skin: 'ebony', hair: 'fade', outfit: 'hoodie' },
      { gender: 'male', skin: 'brown', hair: 'crop', outfit: 'jacket' },
      { gender: 'female', skin: 'brown', hair: 'braids', outfit: 'shweshwe' },
    ]
    const avs = looks.map((l, i) => { const a = A.createAvatar(l); a.position.set((i % 3 - 1) * 1.5, 0, i < 3 ? 0 : 2.6); a.rotation.y = 0.3; scene.add(a); return a })
    avs[4].userData.pose = 'sit'
    avs[4].position.y = 0.46
    avs[4].rotation.y = Math.PI / 2
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.46, 0.5), new THREE.MeshStandardMaterial({ color: 0x9a6a40 }))
    seat.position.set(0, 0.23, 2.6)
    scene.add(seat)
    await new Promise((res) => setTimeout(res, 3500))
    let t = 0
    for (let k = 0; k < 30; k++) { t += 0.033; avs.forEach((a, i) => A.poseAvatar(a, i === 3, t)) }
    r.render(scene, cam)
  })
  await page.locator('#lineup').screenshot({ path: `${OUT}/4-lineup.png` })
})

// Sitting and lying, from the side: on the seat, not in it.
test('poses: sit on a bench, a chair, the ground; lie on a bed', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/')
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const A = await import('/src/world/avatar3d.js')
    document.body.innerHTML = ''
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setPixelRatio(2)
    r.setSize(412, 500)
    r.domElement.id = 'poses'
    document.body.appendChild(r.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x88aa88)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2.2))
    const d = new THREE.DirectionalLight(0xffffff, 2)
    d.position.set(5, 6, 3)
    scene.add(d)
    const cam = new THREE.PerspectiveCamera(35, 412 / 500, 0.1, 100)
    cam.position.set(0.5, 1.6, 9)
    cam.lookAt(0, 0.6, 1)
    const box = (w, h, dd, x, y, z, c = 0x9a6a40) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), new THREE.MeshStandardMaterial({ color: c })); m.position.set(x, y, z); scene.add(m) }
    // Side view: a bench (0.5 m), a chair (0.46 m), the ground, a bed (0.6 m).
    box(0.5, 0.5, 0.5, -3, 0.25, 0)
    box(0.5, 0.46, 0.5, -1.2, 0.23, 0)
    box(2, 0.6, 1, 2.6, 0.3, 0, 0x7b3fe4)
    const looks = [{ gender: 'male', outfit: 'jacket', skin: 'brown' }, { gender: 'female', outfit: 'dress', skin: 'deep' }, { gender: 'female', outfit: 'shirt', skin: 'amber' }, { gender: 'male', outfit: 'hoodie', skin: 'ebony' }]
    const avs = looks.map((l) => A.createAvatar(l))
    const place = [[-3, 0.5, 'sit'], [-1.2, 0.46, 'sit'], [0.6, 0.02, 'sit'], [2.6, 0.62, 'sit']]
    avs.forEach((a, i) => {
      const [x, y, pose] = place[i]
      a.position.set(x, y, 0)
      a.userData.pose = pose
      if (pose === 'lie') { a.rotation.set(-Math.PI / 2, 0, Math.PI / 2, 'YXZ'); a.rotation.y = Math.PI / 2 } else a.rotation.y = Math.PI / 2
      scene.add(a)
    })
    cam.fov = 50
    cam.updateProjectionMatrix()
    cam.position.set(0, 1.4, 11)
    cam.lookAt(0, 0.6, 0)
    await new Promise((res) => setTimeout(res, 3000))
    let t = 0
    for (let k = 0; k < 30; k++) { t += 0.033; avs.forEach((a) => A.poseAvatar(a, false, t)) }
    r.render(scene, cam)
  })
  await page.locator('#poses').screenshot({ path: `${OUT}/5-poses.png` })
})


test('sit at any facing', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/')
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const A = await import('/src/world/avatar3d.js')
    document.body.innerHTML = ''
    const r = new THREE.WebGLRenderer({ antialias: true })
    r.setSize(412, 300)
    r.domElement.id = 'face'
    document.body.appendChild(r.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x88aa88)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2.5))
    const cam = new THREE.PerspectiveCamera(45, 412 / 300, 0.1, 100)
    cam.position.set(0, 3, 8)
    cam.lookAt(0, 0.5, 0)
    const avs = [0, 1, 2, 3, 4].map((i) => {
      const a = A.createAvatar({ model: 'female-b', skin: 'deep', outfit: 'hoodie', topColor: '#d9534f', hairColor: '#f0c400' })
      a.position.set((i - 2) * 1.6, 0.5, 0)
      a.rotation.y = i * 1.3
      a.userData.pose = 'sit'
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x9a6a40 }))
      seat.position.set((i - 2) * 1.6, 0.25, 0)
      scene.add(seat, a)
      return a
    })
    await new Promise((res) => setTimeout(res, 3500))
    let t = 0
    for (let k = 0; k < 20; k++) { t += 0.033; avs.forEach((a) => A.poseAvatar(a, false, t)) }
    r.render(scene, cam)
  })
  await page.locator('#face').screenshot({ path: `${OUT}/6-facing.png` })
})
