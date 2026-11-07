// SPIKE (owner, 7 Nov): candidate character sets next to our current students, in the real Quad.
// 3b: Ara 3D Gen (ara3dgen.com; Mixamo-named rig, MakeHuman base) vs Universal Base Characters
// (Quaternius, the UAL rig) vs the game's current Quaternius-modular students.
//  - lineup: one of each at creator distance and at the game's own camera distance (screenshots);
//  - UAL clips on each: UBC plays them as they are (same rig); Ara gets them retargeted (our
//    world-space method: a 20-bone name map) and baked into a normal AnimationClip; plus the cheap
//    "rename the bones" way, measured against it;
//  - the fps test: the Quad as it is, plus 20 NPCs of one kind walking and idling (the player stands
//    in the scene as usual): median fps, worst 10%, draw calls, triangles, GPU texture memory.
// The model files stay where they are (Downloads, the unzipped pack): a throwaway local server hands
// them to the page; nothing is copied into the repo. Run (real GPU, frame limit off):
//   npx playwright test tests/spike/characters.spec.js --config playwright.spike.config.js --workers=1
// and on the software GPU as a slow-phone stand-in (a few fps):
//   npx playwright test tests/spike/characters.spec.js --config playwright.edge.config.js --workers=1
// Env: ARA_DIR (default ~/Downloads: Athletic_man.glb, Athletic_woman.glb), UBC_DIR (the pack's
// "Base Characters/Godot - UE" folder, with the two *_png.png normal maps copied under their gltf names).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { enrolUI } from '../enrol.js'

const OUT = process.env.SPIKE_OUT || 'docs/sprints/characters-ara'
const ARA_DIR = process.env.ARA_DIR || path.join(os.homedir(), 'Downloads')
const UBC_DIR = process.env.UBC_DIR || ''
const MODE = (process.env.SPIKE_MODE || (process.env.SPIKE_GPU ? 'gpu' : 'software'))
fs.mkdirSync(OUT, { recursive: true })
test.describe.configure({ timeout: 900000 })

let server
let port = 0
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const [, root, ...rest] = url.pathname.split('/')
    const dir = root === 'ara' ? ARA_DIR : root === 'ubc' ? UBC_DIR : ''
    const file = dir && path.join(dir, path.basename(rest.join('/')))
    const cors = { 'Access-Control-Allow-Origin': '*' }
    if (!file || !fs.existsSync(file) || !/\.(glb|gltf|bin|png|jpg)$/i.test(file)) { res.writeHead(404, cors); res.end(); return }
    res.writeHead(200, { ...cors, 'Content-Type': /\.glb$/i.test(file) ? 'model/gltf-binary' : /\.gltf$/i.test(file) ? 'model/gltf+json' : /\.png$/i.test(file) ? 'image/png' : 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})
test.afterAll(async () => { await new Promise((r) => server.close(r)) })

// A new student on day 1 at 13:00 in the Quad (no fps gate: this test reports fps instead of needing it).
async function student(page) {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&spawn=quad&spike=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.waitForTimeout(3000)
  const close = page.locator('.g-sheet [data-act="close-sheet"]')
  if (await close.count()) await close.first().tap().catch(() => {})
}

// ---- the page side ---------------------------------------------------------------------------------
async function setup(page, urls) {
  return page.evaluate(async (cfg) => {
    const T = await window.mzansiThree()
    const { THREE, GLTFLoader, SkeletonUtils, scene, camera, renderer, player, createAvatar, poseAvatar, lookForPerson, measureBody } = T
    const loader = new GLTFLoader()
    const S = (window.__spike = { T, loaded: {}, actors: [], clock: 0, mixers: [], notes: {}, frameTimes: [], infos: [], loopOn: false })
    const holder = new THREE.Group()
    holder.name = 'spike'
    scene.add(holder)
    S.holder = holder
    const result = { loaded: {}, ual: {} }

    // -- loading --
    const load = async (key, url) => {
      const t0 = performance.now()
      const g = await loader.loadAsync(url)
      g.scene.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; if (n.isSkinnedMesh) n.frustumCulled = false } })
      S.loaded[key] = g
      const box = new THREE.Box3().setFromObject(g.scene)
      let tris = 0
      let prims = 0
      const parts = []
      const textures = new Set()
      g.scene.traverse((n) => {
        if (!n.isMesh) return
        prims += 1
        const t = (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3
        parts.push([n.material.name || n.name, Math.round(t), n.geometry.attributes.position.count])
        tris += t
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) if (n.material[k]) textures.add(n.material[k])
      })
      let gpuMB = 0
      for (const tex of textures) { const im = tex.image; if (im?.width) gpuMB += (im.width * im.height * 4 * 1.333) / 1048576 }
      result.loaded[key] = { loadMs: Math.round(performance.now() - t0), height: +(box.max.y - box.min.y).toFixed(3), tris: Math.round(tris), meshes: prims, textures: textures.size, gpuTextureMB: +gpuMB.toFixed(1), parts }
      return g
    }
    for (const [key, url] of Object.entries(cfg.urls)) {
      try { await load(key, url) } catch (e) { result.loaded[key] = { error: String(e).slice(0, 120) } }
    }

    // -- UAL (the game's own clip library) --
    const ual = await loader.loadAsync('/models/ual/UAL1_Standard.glb')
    ual.scene.updateMatrixWorld(true)
    const ualBones = {}
    ual.scene.traverse((n) => { if (n.isBone) ualBones[n.name] = n })
    const MAP = {
      pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
      clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
      clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
      thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot',
    }
    const src = { root: ual.scene, bones: ualBones, mixer: new THREE.AnimationMixer(ual.scene), clips: Object.fromEntries(ual.animations.map((c) => [c.name, c])), rest: {} }
    for (const name of Object.keys(MAP)) src.rest[name] = { q: ualBones[name].getWorldQuaternion(new THREE.Quaternion()), p: ualBones[name].getWorldPosition(new THREE.Vector3()) }
    // (rest positions of every UAL bone, for the rest-pose fix below)
    src.restPos = {}
    for (const [n, b] of Object.entries(ualBones)) src.restPos[n] = b.getWorldPosition(new THREE.Vector3())
    src.hipHeight = src.rest.pelvis.p.y
    S.ual = src
    result.ual = { clips: Object.keys(src.clips).length, names: Object.keys(src.clips).filter((n) => /Idle|Walk|Jog|Sit/.test(n)).slice(0, 12), hipHeight: +src.hipHeight.toFixed(3) }

    // -- the Ara rig: Mixamo names, no prefix --
    // Which bone each one points at (UAL child, target child): the bone's direction at rest, to line the
    // target's rest pose (Ara is in an A-pose, UAL's arms are not) up with the source's before the clip's
    // turns are applied. Without it every arm and leg is off by the difference between the two rest poses.
    const CHILD = {
      pelvis: ['spine_01', 'Spine'], spine_01: ['spine_02', 'Spine1'], spine_02: ['spine_03', 'Spine2'], spine_03: ['neck_01', 'Neck'], neck_01: ['Head', 'Head'],
      clavicle_l: ['upperarm_l', 'LeftArm'], upperarm_l: ['lowerarm_l', 'LeftForeArm'], lowerarm_l: ['hand_l', 'LeftHand'], hand_l: ['middle_01_l', 'LeftHandMiddle1'],
      clavicle_r: ['upperarm_r', 'RightArm'], upperarm_r: ['lowerarm_r', 'RightForeArm'], lowerarm_r: ['hand_r', 'RightHand'], hand_r: ['middle_01_r', 'RightHandMiddle1'],
      thigh_l: ['calf_l', 'LeftLeg'], calf_l: ['foot_l', 'LeftFoot'], foot_l: ['ball_l', 'LeftToeBase'],
      thigh_r: ['calf_r', 'RightLeg'], calf_r: ['foot_r', 'RightFoot'], foot_r: ['ball_r', 'RightToeBase'],
    }
    const rigOf = (root) => {
      let skin = null
      root.traverse((n) => { if (!skin && n.isSkinnedMesh) skin = n })
      const byName = {}
      skin.skeleton.bones.forEach((b, i) => { byName[b.name] = { bone: b, i } })
      const rest = {}
      for (const to of Object.values(MAP)) {
        const e = byName[to]
        if (!e) continue
        const q = new THREE.Quaternion()
        const p = new THREE.Vector3()
        skin.skeleton.boneInverses[e.i].clone().invert().decompose(p, q, new THREE.Vector3())
        rest[to] = { q, p }
      }
      // every bone's bind position, then the fix for each mapped bone (target rest direction -> source rest direction)
      const pos = {}
      skin.skeleton.bones.forEach((b, i) => { const p = new THREE.Vector3(); skin.skeleton.boneInverses[i].clone().invert().decompose(p, new THREE.Quaternion(), new THREE.Vector3()); pos[b.name] = p })
      const srcRootInv = src.root.getWorldQuaternion(new THREE.Quaternion()).invert()
      const fix = {}
      const fixDeg = {}
      for (const [from, to] of Object.entries(MAP)) {
        const c = CHILD[from]
        if (!c || !pos[to] || !pos[c[1]] || !src.restPos[c[0]]) { fix[to] = new THREE.Quaternion(); continue }
        const dirT = pos[c[1]].clone().sub(pos[to]).normalize()
        const dirS = src.restPos[c[0]].clone().sub(src.restPos[from]).applyQuaternion(srcRootInv).normalize()
        fix[to] = new THREE.Quaternion().setFromUnitVectors(dirT, dirS)
        fixDeg[to] = +(2 * Math.acos(Math.min(1, Math.abs(fix[to].w))) * 180 / Math.PI).toFixed(1)
      }
      return { skin, byName, rest, fix, fixDeg, missing: Object.values(MAP).filter((n) => !byName[n]) }
    }
    const poseFromUal = (rig, root, clipName, t) => {
      const clip = src.clips[clipName]
      const action = src.mixer.clipAction(clip)
      if (!action.isRunning()) { src.mixer.stopAllAction(); action.play() }
      action.time = Math.min(t, clip.duration)
      src.mixer.update(0)
      src.root.updateMatrixWorld(true)
      root.updateMatrixWorld(true)
      const modelQ = root.getWorldQuaternion(new THREE.Quaternion())
      const srcRootInv = src.root.getWorldQuaternion(new THREE.Quaternion()).invert()
      const out = {}
      for (const [from, to] of Object.entries(MAP)) {
        const s = src.bones[from]
        const e = rig.byName[to]
        const r = rig.rest[to]
        if (!s || !e || !r) continue
        const delta = srcRootInv.clone().multiply(s.getWorldQuaternion(new THREE.Quaternion())).multiply(src.rest[from].q.clone().invert().multiply(srcRootInv.clone().invert()))
        const want = modelQ.clone().multiply(delta).multiply(rig.fix[to] || new THREE.Quaternion()).multiply(r.q)
        e.bone.quaternion.copy(e.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want))
        e.bone.updateMatrixWorld(true)
        out[to] = e.bone.quaternion.clone()
      }
      const p = src.bones.pelvis.getWorldPosition(new THREE.Vector3()).sub(src.rest.pelvis.p).applyQuaternion(srcRootInv)
      return { quats: out, hipsDelta: p }
    }
    // The cheap way: just rename the UAL tracks to the Ara bone names (no retargeting).
    const renamedClip = (clipName) => {
      const clip = src.clips[clipName]
      const inv = Object.fromEntries(Object.entries(MAP))
      const tracks = []
      for (const tr of clip.tracks) {
        const [bone, prop] = tr.name.split('.')
        if (!inv[bone] || prop !== 'quaternion') continue
        tracks.push(new THREE.QuaternionKeyframeTrack(`${inv[bone]}.quaternion`, tr.times, tr.values))
      }
      return new THREE.AnimationClip(`${clipName}_renamed`, clip.duration, tracks)
    }
    // Bake: sample the retargeted pose at 30 fps into an ordinary clip for this skeleton.
    const bake = (root, rig, clipName, fps = 30) => {
      const clip = src.clips[clipName]
      const frames = Math.max(2, Math.round(clip.duration * fps))
      const times = []
      const q = Object.fromEntries(Object.values(MAP).filter((n) => rig.byName[n]).map((n) => [n, []]))
      const hips = rig.byName.Hips.bone
      const hipRest = hips.position.clone()
      const k = (rig.rest.Hips.p.y || 0.95) / src.hipHeight
      const hipTrack = []
      for (let i = 0; i < frames; i++) {
        const t = (i / frames) * clip.duration
        times.push(t)
        const { quats, hipsDelta } = poseFromUal(rig, root, clipName, t)
        for (const [n, quat] of Object.entries(quats)) q[n].push(quat.x, quat.y, quat.z, quat.w)
        hipTrack.push(...hipRest.clone().add(hipsDelta.multiplyScalar(k)).toArray())
      }
      const tracks = Object.entries(q).map(([n, v]) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, v))
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipTrack))
      return new THREE.AnimationClip(`${clipName}_baked`, clip.duration, tracks)
    }
    S.rigOf = rigOf
    S.bake = bake
    S.poseFromUal = poseFromUal
    S.renamedClip = renamedClip
    S.MAP = MAP

    // -- actors --
    S.baked = {}
    const bakedFor = (key, name) => {
      const id = `${key}:${name}`
      if (S.baked[id]) return S.baked[id]
      const root = S.loaded[key].scene
      const rig = rigOf(root)
      const t0 = performance.now()
      const clip = bake(root, rig, name)
      S.notes[`bake:${id}`] = { ms: Math.round(performance.now() - t0), tracks: clip.tracks.length, frames: clip.tracks[0].times.length, missingBones: rig.missing }
      S.baked[id] = clip
      return clip
    }
    S.bakedFor = bakedFor
    // kind: 'current' | 'ubc_male' | 'ubc_female' | 'ara_man' | 'ara_woman'
    S.make = (kind, i = 0) => {
      const a = { kind, anchor: new THREE.Vector3(), r: 0, speed: 0, phase: Math.random() * 6.28, walk: i % 3 !== 2, i }
      if (kind === 'current') {
        const look = i % 2 ? { gender: 'female', skin: 'deep', outfit: 'dress', topColor: '#f0c400' } : { gender: 'male', skin: 'deep', outfit: 'hoodie', topColor: '#1d7fb8' }
        a.obj = createAvatar(look)
        a.update = (dt, walking) => poseAvatar(a.obj, walking, S.clock)
      } else {
        const key = kind
        a.obj = SkeletonUtils.clone(S.loaded[key].scene)
        a.mixer = new THREE.AnimationMixer(a.obj)
        const clips = (name) => (kind.startsWith('ara') ? bakedFor(key, name) : src.clips[name])
        a.walkAction = a.mixer.clipAction(clips('Walk_Loop'))
        a.idleAction = a.mixer.clipAction(clips('Idle_Loop'))
        a.walkAction.time = Math.random() * 1.0
        a.idleAction.time = Math.random() * 2.0
        a.walkAction.play()
        a.idleAction.play()
        a.update = (dt, walking) => {
          a.walkAction.setEffectiveWeight(walking ? 1 : 0)
          a.idleAction.setEffectiveWeight(walking ? 0 : 1)
          a.mixer.update(dt)
        }
      }
      holder.add(a.obj)
      S.actors.push(a)
      return a
    }
    // (the game's own avatars make fresh textures and materials each time: let them go, or each round of
    // the test inherits the last one's GPU memory and runs slower; clones of a loaded GLB share theirs)
    S.clear = () => {
      for (const a of S.actors) {
        holder.remove(a.obj)
        a.mixer?.stopAllAction()
        if (a.kind === 'current') {
          a.obj.traverse((n) => {
            for (const mat of [].concat(n.material || [])) {
              for (const k in mat) if (mat[k]?.isTexture) mat[k].dispose()
              mat.dispose()
            }
          })
        }
      }
      S.actors = []
    }
    S.loop = () => {
      if (S.loopOn) return
      S.loopOn = true
      let last = performance.now()
      const tick = (now) => {
        if (!S.loopOn) return
        requestAnimationFrame(tick)
        const dt = Math.min(0.05, (now - last) / 1000)
        S.frameTimes.push(now - last)
        last = now
        S.clock += dt
        for (const a of S.actors) {
          const walking = a.walk && !a.still
          if (a.r > 0 && walking) {
            const ang = a.phase + (S.clock * a.speed) / a.r
            a.obj.position.set(a.anchor.x + Math.cos(ang) * a.r, a.anchor.y, a.anchor.z + Math.sin(ang) * a.r)
            a.obj.rotation.y = Math.atan2(-Math.sin(ang), Math.cos(ang)) * 1 + 0
          }
          a.update(dt, walking)
        }
        const info = renderer.info
        S.infos.push([info.render.calls, info.render.triangles])
      }
      requestAnimationFrame(tick)
    }
    S.stop = () => { S.loopOn = false }
    S.measure = (seconds) => new Promise((resolve) => {
      S.frameTimes = []
      S.infos = []
      setTimeout(() => {
        const ft = [...S.frameTimes].filter((v) => v < 1000).sort((a, b) => a - b)
        const med = ft[ft.length >> 1]
        const p90 = ft[Math.min(ft.length - 1, Math.ceil(ft.length * 0.9) - 1)]
        const calls = S.infos.reduce((a, c) => a + c[0], 0) / Math.max(1, S.infos.length)
        const tris = S.infos.reduce((a, c) => a + c[1], 0) / Math.max(1, S.infos.length)
        resolve({ frames: ft.length, medianMs: +med.toFixed(2), p90Ms: +p90.toFixed(2), fpsTypical: Math.round(1000 / med), fpsWorst10: Math.round(1000 / p90), drawCalls: Math.round(calls), triangles: Math.round(tris), mem: renderer.info.memory })
      }, seconds * 1000)
    })
    S.centre = () => ({ x: player.position.x, z: player.position.z })
    // For the stills: the game's own people (the crowd, the player) out of the picture.
    S.hidden = []
    S.hideOthers = (hide) => {
      if (hide) {
        scene.traverse((n) => { if (n.userData?.look && n.visible && !holder.children.includes(n) && !n.parent?.userData?.look) { S.hidden.push(n); n.visible = false } })
      } else { for (const n of S.hidden) n.visible = true; S.hidden = [] }
      return S.hidden.length
    }
    // An open patch of the Quad, away from the player and the stage: a row of four (1.35 m apart) with room
    // for the creator camera (2.7 m back) and the game's own (about 11 m back).
    S.findSite = () => {
      const c = S.centre()
      const open = (x, z) => window.mzansiOpen(x, z)
      let best = null
      for (let r = 5; r <= 22 && !best; r += 1.5) {
        for (let a = 0; a < 24 && !best; a++) {
          const x = c.x + Math.cos((a / 24) * Math.PI * 2) * r
          const z = c.z + Math.sin((a / 24) * Math.PI * 2) * r
          const row = [-2.1, -0.7, 0.7, 2.1].every((dx) => open(x + dx, z) && open(x + dx, z + 1.2))
          const cam = open(x, z + 2.7) && open(x, z + 5.2)
          const sims = [[-7, 3], [-3, 5], [3, 5], [7, 3]].every(([dx, dz]) => open(x + dx * 0.25, z + dz * 0.5 + 3))
          if (row && cam && sims) best = { x, z, r }
        }
      }
      return best || { x: c.x, z: c.z + 8, r: 0, fallback: true }
    }
    result.player = { x: player.position.x, z: player.position.z }
    return result
  }, { urls })
}

test('3b look and rig: Ara 3D Gen next to a current student and Universal Base Characters', async ({ page }) => {
  test.skip(!fs.existsSync(path.join(ARA_DIR, 'Athletic_man.glb')), 'Athletic_man.glb is not in ARA_DIR')
  test.skip(!UBC_DIR || !fs.existsSync(path.join(UBC_DIR, 'Superhero_Male_FullBody.gltf')), 'set UBC_DIR to the pack\'s Godot - UE folder')
  const base = `http://127.0.0.1:${port}`
  const urls = { ubc_male: `${base}/ubc/Superhero_Male_FullBody.gltf`, ubc_female: `${base}/ubc/Superhero_Female_FullBody.gltf`, ara_man: `${base}/ara/Athletic_man.glb` }
  // (a GLB starts with "glTF"; a woman's file that is really a saved web page is skipped, and said so)
  const womanFile = path.join(ARA_DIR, 'Athletic_woman.glb')
  const womanOk = fs.existsSync(womanFile) && fs.readFileSync(womanFile).subarray(0, 4).toString('latin1') === 'glTF'
  if (womanOk) urls.ara_woman = `${base}/ara/Athletic_woman.glb`
  else console.log(`WOMAN: ${womanFile} is ${fs.existsSync(womanFile) ? `${fs.statSync(womanFile).size} bytes and not a GLB` : 'missing'}: skipped`)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await student(page)
  const loaded = await setup(page, urls)
  console.log('LOADED', JSON.stringify(loaded, null, 1))
  const report = { mode: MODE, loaded, notes: {}, bone: {}, fps: {}, fpsRounds: {}, shots: [], womanFile: womanOk ? 'used' : 'not a GLB: skipped' }

  // ---- the rig: can the UAL clips play on the Ara skeleton? ----
  const rigInfo = await page.evaluate(() => {
    const S = window.__spike
    const rig = S.rigOf(S.loaded.ara_man.scene)
    const ubc = S.rigOf(S.loaded.ubc_male.scene)
    // the cheap way vs the retargeted way, at the middle of the walk: how far apart are the two poses?
    const out = { araMissing: rig.missing, mapped: Object.keys(S.MAP).length }
    const root = S.loaded.ara_man.scene
    const T = S.T.THREE
    const clip = S.ual.clips.Walk_Loop
    const retargeted = S.poseFromUal(rig, root, 'Walk_Loop', clip.duration * 0.3).quats
    const worldOf = (name) => rig.byName[name].bone.getWorldQuaternion(new T.Quaternion())
    // retargeted world rotations
    const wantWorld = {}
    for (const n of Object.keys(retargeted)) wantWorld[n] = worldOf(n)
    // rename-only: local = UAL local, applied straight
    const mixer = new T.AnimationMixer(root)
    const renamed = S.renamedClip('Walk_Loop')
    const a = mixer.clipAction(renamed)
    a.play()
    a.time = clip.duration * 0.3
    mixer.update(0)
    root.updateMatrixWorld(true)
    const errs = {}
    for (const n of Object.keys(retargeted)) errs[n] = +((wantWorld[n].angleTo(worldOf(n)) * 180) / Math.PI).toFixed(1)
    mixer.stopAllAction()
    const vals = Object.values(errs)
    out.renameOnly = { meanDeg: +(vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1), maxDeg: Math.max(...vals), worst: Object.entries(errs).sort((p, q) => q[1] - p[1]).slice(0, 5) }
    out.armature = (() => { let n = null; root.traverse((o) => { if (!n && o.name === 'Armature') n = o }); return n && { scale: n.scale.toArray().map((v) => +v.toFixed(3)), rot: n.rotation.toArray().slice(0, 3).map((v) => +v.toFixed(3)) } })()
    out.sameRigAsUal = ['pelvis', 'spine_01', 'Head', 'hand_l', 'foot_r'].every((n) => ubc.byName[n])
    out.restFixDeg = rig.fixDeg
    return out
  })
  console.log('RIG', JSON.stringify(rigInfo))
  report.rig = rigInfo

  // ---- screenshots: a lineup in the Quad, at creator distance and at the game's own distance ----
  await page.setViewportSize({ width: 1200, height: 680 })
  await page.waitForTimeout(1500)
  const clean = await page.addStyleTag({ content: '#app{visibility:hidden!important} #world > *:not(canvas){display:none!important}' })
  report.hiddenOthers = await page.evaluate(() => window.__spike.hideOthers(true))
  const lineup = await page.evaluate(async () => {
    const S = window.__spike
    const T = S.T.THREE
    S.clear()
    const c = S.findSite()
    S.site = c
    const kinds = ['current', 'ubc_male', 'ara_man', ...(S.loaded.ara_woman ? ['ara_woman'] : ['ubc_female'])]
    const spots = []
    kinds.forEach((kind, i) => {
      const a = S.make(kind, 0)
      a.still = true
      a.walk = false
      a.obj.position.set(c.x + (i - (kinds.length - 1) / 2) * 1.35, 0, c.z)
      a.obj.rotation.y = 0
      spots.push({ kind, x: a.obj.position.x, z: a.obj.position.z })
    })
    S.loop()
    // heights as shown
    const heights = {}
    for (const a of S.actors) { const b = new T.Box3().setFromObject(a.obj); heights[a.kind] = +(b.max.y - b.min.y).toFixed(2) }
    return { c, kinds, spots, heights, site: c }
  })
  report.lineup = lineup
  await page.waitForTimeout(2500) // (current avatars fetch their models)
  const shoot = async (name, pos, look) => {
    await page.evaluate(([p, l]) => window.mzansiCam(p, l), [pos, look])
    await page.waitForTimeout(1200)
    await page.locator('#world canvas').first().screenshot({ path: `${OUT}/${MODE}-${name}.png` })
    report.shots.push(`${MODE}-${name}.png`)
  }
  const mid = lineup.spots.reduce((a, s) => a + s.x, 0) / lineup.spots.length
  const cz = lineup.c.z
  // creator distance: the way the creator shows one person (about 2.6 m back, chest height), then all four close
  for (const s of lineup.spots) await shoot(`creator-${s.kind}`, [s.x + 0.6, 1.25, cz + 2.7], [s.x, 1.0, cz])
  await shoot('creator-all', [mid, 1.4, cz + 5.2], [mid, 0.95, cz])
  // the game's own distance (Sims camera: high and about twelve metres out)
  await shoot('crowd-distance-sims', [mid, 9, cz + 11], [mid, 0.8, cz])
  await shoot('crowd-distance-top', [mid, 17, cz + 6], [mid, 0.5, cz])
  // faces up close (does the realistic face fit the world?)
  for (const s of lineup.spots) await shoot(`face-${s.kind}`, [s.x + 0.35, 1.7, cz + 1.1], [s.x, 1.62, cz])
  // the cheap "rename the bones" walk against the retargeted one, on the Ara man
  await page.evaluate(() => {
    const S = window.__spike
    S.clear()
    const c = S.site
    const T = S.T.THREE
    const a = S.make('ara_man', 0)
    a.still = true
    a.obj.position.set(c.x - 0.7, 0, c.z)
    // second Ara man with the renamed UAL walk, frozen at the same moment as the baked one
    const b = S.make('ara_man', 1)
    b.obj.position.set(c.x + 0.7, 0, c.z)
    b.still = true
    b.mixer.stopAllAction()
    const clip = S.renamedClip('Walk_Loop')
    const act = b.mixer.clipAction(clip)
    act.play()
    for (const o of [a, b]) { o.mixer.update(0) }
    const t = S.ual.clips.Walk_Loop.duration * 0.3
    a.mixer.stopAllAction()
    const baked = a.mixer.clipAction(S.bakedFor('ara_man', 'Walk_Loop'))
    baked.play()
    baked.time = t
    act.time = t
    a.update = () => { baked.time = t; a.mixer.update(0) }
    b.update = () => { act.time = t; b.mixer.update(0) }
    S.walkCompare = true
  })
  await page.waitForTimeout(600)
  {
    const cz2 = lineup.c.z
    const cx = lineup.c.x
    await page.evaluate(([p, l]) => window.mzansiCam(p, l), [[cx, 1.2, cz2 + 4.2], [cx, 0.95, cz2]])
    await page.waitForTimeout(1200)
    await page.locator('#world canvas').first().screenshot({ path: `${OUT}/${MODE}-ara-walk-baked-vs-renamed.png` })
    report.shots.push(`${MODE}-ara-walk-baked-vs-renamed.png`)
  }
  // back to the game as it is, on a phone-sized screen
  await page.evaluate(() => { window.__spike.clear(); window.__spike.hideOthers(false); window.mzansiCam(null) })
  await clean.evaluate((el) => el.remove())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1500)

  report.notes = await page.evaluate(() => window.__spike.notes)
  report.errors = errors
  fs.writeFileSync(`${OUT}/${MODE}-look-results.json`, JSON.stringify(report, null, 1))
  expect(report.shots.length).toBeGreaterThan(8)
})

// The fps test, each condition on a fresh page (leftover GPU memory and the game's own drift made
// back-to-back runs on one page slower and slower, whatever was in them): the Quad as it is, plus
// 20 NPCs of one kind walking small loops and idling (one in three stands), the player in the scene.
// Three rounds in different orders; the median of the rounds is the number.
test('3b fps: 1 player + 20 NPCs, per kind (fresh page each)', async ({ context }) => {
  test.skip(!fs.existsSync(path.join(ARA_DIR, 'Athletic_man.glb')), 'Athletic_man.glb is not in ARA_DIR')
  test.skip(!UBC_DIR || !fs.existsSync(path.join(UBC_DIR, 'Superhero_Male_FullBody.gltf')), 'set UBC_DIR to the pack\'s Godot - UE folder')
  const base = `http://127.0.0.1:${port}`
  const urls = { ubc_male: `${base}/ubc/Superhero_Male_FullBody.gltf`, ara_man: `${base}/ara/Athletic_man.glb` }
  const kinds = [['none', 0], ['current', 20], ['ubc_male', 20], ['ara_man', 20]]
  const rounds = MODE === 'gpu' ? 3 : 2
  const secs = MODE === 'gpu' ? 10 : 20
  const orders = [kinds, [...kinds].reverse(), [kinds[2], kinds[0], kinds[3], kinds[1]]]
  const rs = {}
  for (let round = 0; round < rounds; round++) {
    for (const [kind, n] of orders[round]) {
      const page = await context.newPage()
      await student(page)
      const loaded = await setup(page, urls)
      const site = await page.evaluate(() => { const S = window.__spike; S.site = S.findSite(); return S.site })
      await page.evaluate(([k, count]) => {
        const S = window.__spike
        const c = { x: S.site.x, z: S.site.z + 4 }
        for (let i = 0; i < count; i++) {
          const a = S.make(k, i)
          // a ring of anchors 3-9 m from the camera target, each walking a small loop (or standing)
          const ang = (i / count) * Math.PI * 2 + (i % 2) * 0.35
          const rad = 4 + (i % 4) * 2.2
          a.anchor.set(c.x + Math.cos(ang) * rad * 0.8, 0, c.z - 4 + Math.sin(ang) * rad * 0.8)
          a.r = 1.2 + (i % 3) * 0.5
          a.speed = 1.3
          a.obj.position.copy(a.anchor)
        }
        S.loop()
      }, [kind, n])
      await page.evaluate(([p, l]) => window.mzansiCam(p, l), [[site.x, 10, site.z + 11], [site.x, 0.6, site.z]])
      await page.waitForTimeout(kind === 'none' ? 2000 : 5000) // (models load, textures upload, mixers settle)
      const r = await page.evaluate((sec) => window.__spike.measure(sec), secs)
      ;(rs[kind] ||= []).push(r)
      console.log('FPS', `round ${round + 1}`, kind, JSON.stringify({ typical: r.fpsTypical, worst10: r.fpsWorst10, ms: r.medianMs, calls: r.drawCalls, tris: r.triangles }))
      if (round === 0) await page.locator('#world canvas').first().screenshot({ path: `${OUT}/${MODE}-crowd20-${kind}.png` })
      void loaded
      await page.close()
    }
  }
  const med = (list) => [...list].sort((a, b) => a - b)[list.length >> 1]
  const out = {}
  for (const [kind] of kinds) {
    const list = rs[kind]
    out[kind] = { fpsTypical: med(list.map((r) => r.fpsTypical)), fpsWorst10: med(list.map((r) => r.fpsWorst10)), medianMs: med(list.map((r) => r.medianMs)), drawCalls: med(list.map((r) => r.drawCalls)), triangles: med(list.map((r) => r.triangles)), rounds: list.map((r) => `${r.fpsTypical}/${r.fpsWorst10}`) }
    console.log('FPS median', kind, JSON.stringify(out[kind]))
  }
  fs.writeFileSync(`${OUT}/${MODE}-fps-results.json`, JSON.stringify({ mode: MODE, secs, rounds, orders: orders.map((o) => o.map((k) => k[0])), out, raw: rs }, null, 1))
  expect(out.ara_man.fpsTypical).toBeGreaterThan(0)
})
