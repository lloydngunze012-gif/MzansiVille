// The Caf busy at meal times (owner, 12 Nov, job J; docs/world-designer/caf-world.md). The four staff behind their
// counters, working (a gesture now and then) and turning to greet you when you come up; a queue on the lane; people
// stepping up to Mama Liz's mat, going off with a tray to a seat and eating there, and after a while out of the door
// and, a little later, back in at the end of the queue. At meal times (breakfast, lunch, supper) about a dozen
// students, otherwise a few. The staff are full students (you stand at their counter); the patrons are the cheap
// instanced people of extras.js (one crowd, 8 draw calls), since ten full students cost 160 draw calls and halved the
// frame rate on a slow phone (caf.spec, 13 Nov).
import { createAvatar, gesture, poseAvatar } from './avatar3d.js'
import { lookForPerson } from './cast.js'
import { createExtras, looksFor } from './extras.js'

const STAFF = [['hot', 'mama_liz'], ['indian', 'aunty_premi'], ['grill', 'uncle_jaco'], ['coffee', 'kyle']]
// meal times, game minutes: 06:30-09:00, 12:00-14:00, 17:30-19:30
export const mealTime = (m) => (m >= 390 && m < 540) || (m >= 720 && m < 840) || (m >= 1050 && m < 1170)

// opts: { scene, counters: [{ id, x }], back (z of the back wall), tableSets: [[x, z, rot]], longTables: [[x, z]],
//   stools: [[x, z]], door: { x, z }, minutes, player, blocked(x, z) }
export function createCafPeople(opts) {
  const { scene } = opts
  const busy = mealTime(Number(opts.minutes) || 720)
  const people = []
  const add = (look, x, z, rot, extra = {}) => {
    const a = createAvatar(look)
    a.userData.pose = 'stand'
    a.position.set(x, 0, z)
    a.rotation.y = rot
    scene.add(a)
    const p = { a, wait: Math.random() * 3, ...extra }
    people.push(p)
    return p
  }
  // the staff, behind their own counter, facing the hall
  const staff = STAFF.map(([cid, who], i) => {
    const c = opts.counters.find((k) => k.id === cid)
    return c ? add(lookForPerson(who, 40 + i), c.x, opts.back + 0.32, 0, { role: 'staff', id: who, home: { x: c.x, z: opts.back + 0.32 } }) : null
  }).filter(Boolean)
  // seats: the window bar's stools, two at each small table (either side), four at each long table
  const seats = []
  for (const [x, z] of opts.stools) seats.push({ x: x + 0.1, z, rot: -Math.PI / 2, y: 0.78, free: true })
  for (const [x, z, r] of opts.tableSets.slice(0, 6)) for (const s of [-1, 1]) seats.push({ x: x + Math.cos(r) * 0.62 * s, z: z - Math.sin(r) * 0.62 * s, rot: r + (s > 0 ? -Math.PI / 2 : Math.PI / 2), y: 0.46, free: true })
  for (const [x, z] of opts.longTables) for (const dx of [-0.6, 0.6]) for (const s of [-1, 1]) seats.push({ x: x + dx, z: z + s * 0.78, rot: s > 0 ? 0 : Math.PI, y: 0.46, free: true })
  const queueSlot = (i) => ({ x: -5.8 + 0.25, z: -2.35 + i * 0.95 }) // (the line comes up the lane towards Mama Liz's mat)
  const mat = { x: -5.8, z: -3.75 }
  const n = busy ? 10 : 4 // (a full Caf on a slow phone: ten students, four staff)
  const crowd = createExtras(scene, { max: 12 })
  const patrons = []
  const addPatron = (i, x, z, rot, extra) => {
    const e = crowd.add({ ...looksFor(i * 5 + 2), x, z, rot, pose: 'stand' })
    const p = { e, wait: Math.random() * 3, ...extra }
    patrons.push(p)
    return p
  }
  for (let i = 0; i < n; i++) {
    if (i < (busy ? 4 : 1)) { const q = queueSlot(i); addPatron(i, q.x, q.z, Math.PI, { role: 'queue', q: i }) } else {
      const free = seats.filter((s) => s.free)
      const seat = free[Math.floor((i * 7) % Math.max(1, free.length))]
      if (!seat) continue
      seat.free = false
      const p = addPatron(i, seat.x, seat.z, seat.rot, { role: 'eat', seat, t: 8 + Math.random() * 20 })
      p.e.pose = 'sitChair'
      p.e.seat = seat.y
    }
  }
  // the people in the line move up one
  const shuffle = () => { const q = patrons.filter((p) => p.role === 'queue').sort((a, b) => a.q - b.q); q.forEach((p, i) => { p.q = i; p.goal = queueSlot(i) }) }
  let frame = 0
  let served = 0
  function step(p, dt, speed = 1.1) {
    const e = p.e
    if (!p.goal) { if (e.pose === 'walk') e.pose = 'stand'; return true }
    const dx = p.goal.x - e.x
    const dz = p.goal.z - e.z
    const d = Math.hypot(dx, dz)
    if (d < 0.08) { p.goal = null; e.pose = 'stand'; return true }
    const s = Math.min(d, speed * dt)
    e.x += (dx / d) * s
    e.z += (dz / d) * s
    e.rot = Math.atan2(dx, dz)
    e.pose = 'walk'
    return false
  }
  function update(dt, clock) {
    frame++
    const me = opts.player()
    for (const s of staff) {
      // working: a gesture now and then; you at their counter: they turn to you and greet you
      const near = me && Math.hypot(me.position.x - s.home.x, me.position.z - (opts.back + 1.8)) < 1.8
      if (near && !s.greeted) { s.greeted = true; s.a.rotation.y = Math.atan2(me.position.x - s.home.x, me.position.z - s.home.z); gesture(s.a, 'emote-yes') }
      if (!near && s.greeted && Math.hypot(me.position.x - s.home.x, me.position.z - s.home.z) > 4) { s.greeted = false; s.a.rotation.y = 0 }
      s.wait -= dt
      if (s.wait <= 0) { s.wait = 3 + Math.random() * 4; if (!near) gesture(s.a, Math.random() < 0.5 ? 'interact-right' : 'pick-up') }
      if (frame % 4 === 0) poseAvatar(s.a, false, clock) // (behind a counter: every 4th frame)
    }
    for (const p of patrons) {
      if (p.role === 'queue') {
        step(p, dt, 0.8)
        // the front of the line goes up to the mat, is served, and goes off to sit with a tray
        if (p.q === 0 && !p.goal) {
          p.wait -= dt
          if (p.wait <= 0) { p.role = 'order'; p.goal = { ...mat }; p.wait = 2.2 }
        }
      } else if (p.role === 'order') {
        if (step(p, dt)) {
          p.e.rot = Math.PI
          p.wait -= dt
          if (p.wait <= 0) {
            served++
            if (staff[0]) gesture(staff[0].a, 'pick-up')
            const open = seats.filter((s) => s.free) // (any free seat, not the first: the long tables filled last and stayed empty)
            const seat = open[Math.floor(Math.random() * open.length)]
            shuffle()
            if (seat) { seat.free = false; p.seat = seat; p.role = 'toSeat'; p.goal = { x: seat.x + Math.sin(seat.rot) * 0.7, z: seat.z + Math.cos(seat.rot) * 0.7 } } else { p.role = 'leave'; p.goal = { ...opts.door } }
          }
        }
      } else if (p.role === 'toSeat') {
        if (step(p, dt)) {
          p.role = 'eat'
          p.t = 14 + Math.random() * 20
          Object.assign(p.e, { x: p.seat.x, z: p.seat.z, rot: p.seat.rot, pose: 'sitChair', seat: p.seat.y })
        }
      } else if (p.role === 'eat') {
        p.t -= dt
        if (p.t <= 0) {
          Object.assign(p.e, { x: p.seat.x + Math.sin(p.seat.rot) * 0.7, z: p.seat.z + Math.cos(p.seat.rot) * 0.7, pose: 'stand' })
          p.seat.free = true
          p.seat = null
          p.role = 'leave'
          p.goal = { ...opts.door }
        }
      } else if (p.role === 'leave') {
        if (step(p, dt)) { p.e.visible = false; p.role = 'out'; p.wait = 6 + Math.random() * 10 }
      } else if (p.role === 'out') {
        p.wait -= dt
        if (p.wait <= 0) {
          p.e.visible = true
          const back = patrons.filter((o) => o.role === 'queue').length
          p.role = 'queue'
          p.q = back
          p.goal = queueSlot(back)
          p.wait = 2 + Math.random() * 3
        }
      }
    }
    crowd.update(dt, clock)
  }
  return {
    busy,
    update,
    info: () => ({ busy, staff: staff.map((s) => s.id), patrons: patrons.length, queue: patrons.filter((p) => p.role === 'queue').length, eating: patrons.filter((p) => p.role === 'eat').length, served, seats: seats.length, freeSeats: seats.filter((s) => s.free).length }),
    avatars: () => people.map((p) => p.a),
    dispose() { for (const p of people) scene.remove(p.a); crowd.dispose() },
  }
}
