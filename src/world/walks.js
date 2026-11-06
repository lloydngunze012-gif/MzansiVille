// Short straight walks for scripted people: a place's own people (the queues, dress.js)
// and an activity's (scene.js moveNpc). One walk per person at a time (owner, 6 Nov):
// two walks on one person each stepped it and turned it every frame, so it shook on the
// spot and neither walk finished (the queue NPCs vibrating at Mam' Gugu's stall).
//
// start(avatar, x, z, speed) -> a Promise of how the walk ended:
//   'arrived'   it got there;
//   'stalled'   it was held back (the collision pass pushing it off a spot someone stands
//               on): under 0.1 m closer in 1.5 s, so it stops where it is;
//   'replaced'  a newer walk for the same person took over;
//   'stopped'   stop(avatar).
// Only 'arrived' and 'stalled' mean the walk is over (ended(how)): run the next step
// (face the counter, the next leg of a route) only then, never after 'replaced'.

const STALL_TIME = 1.5 // seconds without getting...
const STALL_GAIN = 0.1 // ...this much closer: held back for good
const TURN_MIN = 0.01 // never turn to face a step shorter than 1 cm

export const ended = (how) => how === 'arrived' || how === 'stalled'

export function createWalks() {
  const list = []
  let maxPer = 0 // (tests, read only) the most walks one person has had at once
  const endings = { arrived: 0, stalled: 0, replaced: 0, stopped: 0 } // (tests) how walks ended

  function end(i, how) {
    const w = list[i]
    list.splice(i, 1)
    endings[how] += 1
    w.resolve(how)
  }
  function stop(avatar, how = 'stopped') {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].avatar === avatar) end(i, how)
  }
  function start(avatar, x, z, speed = 1.8) {
    stop(avatar, 'replaced')
    const d = Math.hypot(x - avatar.position.x, z - avatar.position.z)
    // (a tiny correction never turns them: it would spin someone on the spot)
    return new Promise((resolve) => list.push({ avatar, x, z, speed, resolve, best: d, since: 0, turn: d >= TURN_MIN }))
  }
  // Each frame: step everyone; the people who are walking this frame.
  function step(dt) {
    const moving = new Set()
    const per = new Map()
    for (const w of list) per.set(w.avatar, (per.get(w.avatar) || 0) + 1)
    for (const n of per.values()) maxPer = Math.max(maxPer, n)
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i]
      const a = w.avatar.position
      const dx = w.x - a.x
      const dz = w.z - a.z
      const d = Math.hypot(dx, dz)
      const s = w.speed * dt
      if (d <= s) { a.x = w.x; a.z = w.z; end(i, 'arrived'); continue }
      // (d is measured after last frame's collision pass: someone pushed back as fast as
      // they walk gets no closer)
      if (d < w.best - STALL_GAIN) { w.best = d; w.since = 0 } else if ((w.since += dt) >= STALL_TIME) { end(i, 'stalled'); continue }
      a.x += (dx / d) * s
      a.z += (dz / d) * s
      if (w.turn && d >= TURN_MIN) w.avatar.rotation.y = Math.atan2(dx, dz)
      moving.add(w.avatar)
    }
    return moving
  }

  return {
    start,
    stop,
    step,
    has: (avatar) => list.some((w) => w.avatar === avatar),
    count: (avatar) => list.reduce((n, w) => n + (w.avatar === avatar ? 1 : 0), 0),
    // Forget every walk without settling them (a scene's people are gone; nothing waits on them).
    drop() { list.length = 0 },
    get size() { return list.length },
    get maxPer() { return maxPer },
    get endings() { return { ...endings } },
    resetMax() { maxPer = 0 },
  }
}
