import * as THREE from 'three'

const KEY = 'mzansiville.camera'
const MODES = ['top', 'sims', 'eye']
// Sims tilt in degrees: 18 comes down almost level; 60 is the top. The camera height is 1.2 m + sin(pitch) x distance, so it never goes below eye height or under the ground.
const MIN_PITCH = 18

function loadMode() {
  try {
    const saved = localStorage.getItem(KEY)
    if (MODES.includes(saved)) return saved
  } catch { /* private mode */ }
  return 'sims'
}

function smooth(t) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function createCameraRig() {
  const rig = {
    mode: loadMode(),
    yaw: 0.85,
    facing: Math.atan2(-Math.sin(0.85), -Math.cos(0.85)),
    pitch: 52 * Math.PI / 180,
    eyePitch: 0.05,
    distance: { top: 64, sims: 22, eye: 3.2 },
  }
  const follow = new THREE.Vector3()
  const fromPos = new THREE.Vector3()
  const fromLook = new THREE.Vector3()
  const displayPos = new THREE.Vector3()
  const displayLook = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()
  let blend = 1
  let seeded = false

  function lookDir() {
    if (rig.mode === 'eye') return { x: Math.sin(rig.facing), z: Math.cos(rig.facing) }
    return { x: -Math.sin(rig.yaw), z: -Math.cos(rig.yaw) }
  }

  function pose(target) {
    const origin = target instanceof THREE.Vector3 ? target : new THREE.Vector3(target.x, target.y || 0, target.z)
    if (rig.mode === 'top') {
      const pitch = 84 * Math.PI / 180
      const dist = rig.distance.top
      const horiz = Math.cos(pitch) * dist
      return {
        pos: new THREE.Vector3(
          follow.x + Math.sin(rig.yaw) * horiz,
          dist * Math.sin(pitch),
          follow.z + Math.cos(rig.yaw) * horiz,
        ),
        look: new THREE.Vector3(follow.x, 0, follow.z),
      }
    }
    if (rig.mode === 'eye') {
      // First person: just in front of the face (the scene hides the player's head).
      const fx = Math.sin(rig.facing)
      const fz = Math.cos(rig.facing)
      return {
        pos: new THREE.Vector3(origin.x + fx * 0.32, 1.42, origin.z + fz * 0.32),
        look: new THREE.Vector3(origin.x + fx * 6, 1.3 + rig.eyePitch, origin.z + fz * 6),
      }
    }
    const horiz = Math.cos(rig.pitch) * rig.distance.sims
    return {
      pos: new THREE.Vector3(
        origin.x + Math.sin(rig.yaw) * horiz,
        1.2 + Math.sin(rig.pitch) * rig.distance.sims,
        origin.z + Math.cos(rig.yaw) * horiz,
      ),
      look: new THREE.Vector3(origin.x, 1.1, origin.z),
    }
  }

  // A low Sims tilt looks along the street: a wall between you and the camera pulls it in (checked every third frame, and eased).
  let lowTick = 0
  let lowKeep = 1
  function pullInLow(pos, target, buildings) {
    const origin = new THREE.Vector3(target.x, 1.5, target.z)
    if (lowTick++ % 3 === 0) {
      const delta = pos.clone().sub(origin)
      const dist = delta.length()
      let keep = 1
      if (dist > 0.5) {
        raycaster.set(origin, delta.normalize())
        raycaster.far = dist
        const hit = raycaster.intersectObject(buildings, true).find((item) => item.object.name !== 'beacon' && item.object.name !== 'badge' && item.face && item.face.normal.y < 0.7)
        if (hit && hit.distance < dist) keep = Math.max(2.5, hit.distance - 0.6) / dist
      }
      lowKeep = keep
    }
    const goal = origin.clone().lerp(pos, lowKeep)
    goal.y = Math.max(goal.y, 1.2)
    return goal
  }

  function pullIn(pos, target, buildings) {
    if (rig.mode === 'sims' && buildings && rig.pitch < 36 * Math.PI / 180) return pullInLow(pos, target, buildings)
    if (rig.mode !== 'eye' || !buildings) return pos
    const origin = new THREE.Vector3(target.x, 1.45, target.z)
    const delta = pos.clone().sub(origin)
    const dist = delta.length()
    if (dist < 0.2) return pos
    raycaster.set(origin, delta.normalize())
    raycaster.far = dist
    const hit = raycaster.intersectObject(buildings, true).find((item) => item.object.name !== 'beacon' && item.object.name !== 'badge')
    if (!hit || hit.distance > dist - 0.05) return pos
    return origin.add(delta.multiplyScalar(Math.max(0.45, hit.distance - 0.3)))
  }

  return {
    get mode() { return rig.mode },
    get yaw() { return rig.yaw },
    set yaw(v) { rig.yaw = v },
    get pitchDeg() { return rig.pitch * 180 / Math.PI },
    get facing() { return rig.facing },
    set facing(v) { rig.facing = v },
    // Swing the camera round behind the player, smoothly.
    turnBehind(facing) {
      if (seeded) {
        fromPos.copy(displayPos)
        fromLook.copy(displayLook)
        blend = 0
      }
      rig.facing = facing
      rig.yaw = facing + Math.PI
    },
    setMode(next) {
      if (!MODES.includes(next) || (seeded && next === rig.mode)) return
      if (seeded) {
        fromPos.copy(displayPos)
        fromLook.copy(displayLook)
        blend = 0
        if (next === 'eye') {
          const dir = lookDir()
          rig.facing = Math.atan2(dir.x, dir.z)
        } else if (rig.mode === 'eye') {
          rig.yaw = rig.facing + Math.PI
        }
      }
      rig.mode = next
      try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
    },
    cycle() {
      const index = MODES.indexOf(rig.mode)
      this.setMode(MODES[(index + 1) % MODES.length])
    },
    drag(dx, dy) {
      if (rig.mode === 'eye') {
        rig.facing -= dx * 0.008
        rig.eyePitch = Math.min(0.55, Math.max(-0.25, rig.eyePitch + dy * 0.003))
        return
      }
      rig.yaw -= dx * (rig.mode === 'top' ? 0.004 : 0.008)
      if (rig.mode === 'sims') {
        rig.pitch = Math.min(60 * Math.PI / 180, Math.max(MIN_PITCH * Math.PI / 180, rig.pitch + dy * 0.004))
      }
    },
    // A scene's own starting distance for a mode (the day-1 home is smaller than campus).
    setDistance(mode, d) { if (rig.distance[mode] !== undefined) rig.distance[mode] = d },
    // A scene's own starting tilt in Sims view, within what a drag allows (45 to 60 degrees; the city looks further down the street).
    setPitch(deg) { rig.pitch = Math.min(60, Math.max(MIN_PITCH, deg)) * Math.PI / 180 },
    zoom(delta) {
      if (rig.mode === 'top') rig.distance.top = Math.min(110, Math.max(28, rig.distance.top + delta * 1.4))
      else if (rig.mode === 'eye') rig.distance.eye = Math.min(5.2, Math.max(1.8, rig.distance.eye + delta * 0.15))
      else rig.distance.sims = Math.min(40, Math.max(8, rig.distance.sims + delta))
    },
    moveForward() {
      return lookDir()
    },
    moveRight() {
      // (Y up, right-handed: looking along -z, right is +x)
      const f = lookDir()
      return { x: -f.z, z: f.x }
    },
    apply(camera, target, dt, buildings) {
      const point = new THREE.Vector3(target.x, 0, target.z)
      if (!seeded) follow.copy(point)
      // (the camera trails you a little: calm, never jerky)
      const lag = rig.mode === 'top' ? 2.2 : 4
      follow.lerp(point, 1 - Math.exp(-dt * lag))
      const goal = pose(point)
      goal.pos = pullIn(goal.pos, point, buildings)
      if (!seeded) {
        displayPos.copy(goal.pos)
        displayLook.copy(goal.look)
        seeded = true
        blend = 1
      } else if (blend < 1) {
        blend = Math.min(1, blend + dt / 0.5)
        const t = smooth(blend)
        displayPos.lerpVectors(fromPos, goal.pos, t)
        displayLook.lerpVectors(fromLook, goal.look, t)
      } else {
        displayPos.copy(goal.pos)
        displayLook.copy(goal.look)
      }
      camera.position.copy(displayPos)
      camera.lookAt(displayLook)
    },
  }
}
