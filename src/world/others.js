import * as THREE from 'three'
import { createAvatar, poseAvatar } from './avatar3d.js'
import { peersOnCampus } from '../presence.js'

// The other real students (presence.js): the same character model as everyone, in
// their own look, placed where the network says they are (interpolated there), with
// their name and student number over their head. They're kept out of the collision
// pass, the crowd's personal space and tap picking: players pass through each other,
// and a tap on one walks you there.

const MAX_SHOWN = 24 // the nearest this many (a phone draws only so many people)
const TAG_FAR = 45 // tags show this far away (NPC tags stop at 10 m)

function makeTag(name, num) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 112
  const ctx = canvas.getContext('2d')
  ctx.font = 'bold 38px sans-serif'
  const numText = num.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3')
  const w = Math.min(312, Math.max(ctx.measureText(name).width + 64, 190))
  const x0 = (320 - w) / 2
  ctx.fillStyle = 'rgba(10,40,30,0.88)'
  ctx.beginPath()
  ctx.roundRect(x0, 6, w, 100, 26)
  ctx.fill()
  ctx.strokeStyle = '#3ddc84'
  ctx.lineWidth = 4
  ctx.stroke()
  // The green dot: a real person, online now.
  ctx.fillStyle = '#3ddc84'
  ctx.beginPath()
  ctx.arc(x0 + 26, 40, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 160 + 12, 40, w - 60)
  ctx.font = 'bold 26px monospace'
  ctx.fillStyle = '#bff5d5'
  ctx.fillText(numText, 160, 80)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }))
  sprite.renderOrder = 2
  sprite.name = 'player-tag'
  sprite.raycast = () => {}
  sprite.userData.text = `${name} ${num}`
  return sprite
}

export function createOthers(scene) {
  const group = new THREE.Group()
  group.name = 'others'
  scene.add(group)
  const shown = new Map() // id -> { avatar, lookKey, tagKey, clock, seen }

  function build(peer) {
    const avatar = createAvatar(peer.meta.look)
    avatar.userData.remote = peer.id
    avatar.userData.leads = true // we turn them (to the way they face), not poseAvatar
    // Not a tap target: a tap on them is a tap on the ground there.
    avatar.traverse((node) => { node.raycast = () => {} })
    avatar.position.set(peer.x, peer.y || 0, peer.z)
    avatar.rotation.y = peer.h
    group.add(avatar)
    return { avatar, lookKey: JSON.stringify(peer.meta.look), tagKey: '', clock: Math.random() * 10 }
  }

  // here: is your own player on the campus map (not in a room off it)?
  function update(dt, camera, me, here, eyeView) {
    const now = here ? peersOnCampus() : []
    now.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))
    const keep = new Set()
    for (const peer of now.slice(0, MAX_SHOWN)) {
      keep.add(peer.id)
      let entry = shown.get(peer.id)
      // A new look (they changed outfit): a new body.
      if (entry && entry.lookKey !== JSON.stringify(peer.meta.look)) { remove(peer.id); entry = null }
      if (!entry) { entry = build(peer); shown.set(peer.id, entry) }
      const { avatar } = entry
      const before = { x: avatar.position.x, z: avatar.position.z }
      avatar.position.x = peer.x
      avatar.position.z = peer.z
      const pose = peer.p === 'walk' ? 'stand' : peer.p
      avatar.userData.pose = pose
      if (pose === 'sit' || pose === 'lie') avatar.position.y = peer.y || 0
      else if (avatar.userData.baseY === undefined && !avatar.userData.sitMove) avatar.position.y = 0
      avatar.rotation.y = peer.h
      const moved = Math.hypot(avatar.position.x - before.x, avatar.position.z - before.z)
      const walking = (peer.p === 'walk' || peer.p === 'run') && moved > 0.0005
      entry.clock += dt
      entry.walking = walking
      poseAvatar(avatar, walking, entry.clock)
      // Name and student number, readable on a phone at any distance (the tag grows
      // with distance past 8 m, so it never shrinks to a speck).
      const tagKey = `${peer.meta.name}|${peer.meta.num}`
      if (entry.tagKey !== tagKey) {
        if (entry.tag) avatar.remove(entry.tag)
        entry.tag = makeTag(peer.meta.name, peer.meta.num)
        entry.tag.position.y = 2.12
        avatar.add(entry.tag)
        entry.tagKey = tagKey
      }
      const d = camera.position.distanceTo(avatar.position)
      const s = Math.max(1, d / 9)
      entry.tag.scale.set(0.86 * s, 0.3 * s, 1)
      entry.tag.position.y = (pose === 'sit' ? 1.62 : 2.12) + 0.15 * (s - 1)
      const flat = Math.hypot(avatar.position.x - me.x, avatar.position.z - me.z)
      entry.tag.visible = flat < TAG_FAR && !(eyeView && flat < 2.2)
    }
    for (const id of [...shown.keys()]) if (!keep.has(id)) remove(id)
  }

  function remove(id) {
    const entry = shown.get(id)
    if (!entry) return
    entry.avatar.userData.disposed = true
    group.remove(entry.avatar)
    shown.delete(id)
  }

  function dispose() {
    for (const id of [...shown.keys()]) remove(id)
    scene.remove(group)
  }

  // Tests (read only): the real students drawn here, where, and their tag.
  function report(camera) {
    return [...shown.entries()].map(([id, e]) => ({
      id,
      x: +e.avatar.position.x.toFixed(2),
      z: +e.avatar.position.z.toFixed(2),
      pose: e.avatar.userData.pose,
      walking: Boolean(e.walking),
      ready: Boolean(e.avatar.userData.rigged),
      tag: e.tag?.userData.text || '',
      tagShown: Boolean(e.tag?.visible),
      dist: camera ? +camera.position.distanceTo(e.avatar.position).toFixed(1) : null,
    }))
  }

  return { group, update, dispose, report, count: () => shown.size }
}
