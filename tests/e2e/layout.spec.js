// Item 4: phone layout. The creator shows the whole 3D student; the cover keeps heads in.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/layout'
test.use({ viewport: { width: 412, height: 915 } })

test('cover and creator on a phone', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/#/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/#/')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/1-cover.png` })
  await page.goto('/#/new')
  for (const [part, id] of [['gender', 'female'], ['outfit', 'organt'], ['hair', 'braids']]) await page.locator(`[data-part="${part}"][data-id="${id}"]`).tap()
  await expect(page.locator('.cc-stage')).toHaveClass(/cc-has3d/, { timeout: 20000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/2-creator.png` })
  await page.locator('[data-part="outfit"][data-id="dress"]').tap()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/3-creator-dress.png` })
})

// Item 5: the new characters, side by side (outfits, genders, sitting, walking).
test('character line-up', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?morning=0#/')
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
