const PITCH_MIN = 45 * Math.PI / 180
const PITCH_MAX = 60 * Math.PI / 180
const DIST_MIN = 8
const DIST_MAX = 40

export function createFollowCamera() {
  const rig = {
    yaw: 0.85,
    pitch: 56 * Math.PI / 180,
    distance: 26,
  }

  function clampPitch(value) {
    return Math.min(PITCH_MAX, Math.max(PITCH_MIN, value))
  }

  return {
    rig,
    drag(dx, dy) {
      rig.yaw -= dx * 0.008
      rig.pitch = clampPitch(rig.pitch + dy * 0.004)
    },
    zoom(delta) {
      rig.distance = Math.min(DIST_MAX, Math.max(DIST_MIN, rig.distance + delta))
    },
    apply(camera, target) {
      const horiz = rig.distance * Math.cos(rig.pitch)
      const height = rig.distance * Math.sin(rig.pitch)
      camera.position.set(
        target.x + Math.sin(rig.yaw) * horiz,
        1.2 + height,
        target.z + Math.cos(rig.yaw) * horiz,
      )
      camera.lookAt(target.x, 1.1, target.z)
    },
    flatForward() {
      return { x: -Math.sin(rig.yaw), z: -Math.cos(rig.yaw) }
    },
    flatRight() {
      return { x: Math.cos(rig.yaw), z: -Math.sin(rig.yaw) }
    },
  }
}
