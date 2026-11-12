// Activities you play in SunnyBay (owner, 12 Nov, job K). city.js hands every row picked in a place to this module:
//   - the bowling rows: you walk to your lane, then the lane game (src/minigames.js); NPCs bowl on the other lanes
//     (a ball rolls down, the pins clatter) and the desk has a SHOES sign over it;
//   - the racing cabinet rows: you walk to a cabinet, then the 20-second race;
//   - the library's reading rows: you sit at the long table, then the focus moment, whose score sets the Grades;
//   - the gym's training rows: you walk to the bench, then a set, whose score sets the Energy cost and the gain;
//   - the swim: you walk to the waterline and swim out to the near buoy and back;
//   - everything else: your student visibly does it for a few seconds (eats, drinks, reads, dances, works out,
//     browses, works, talks), each with its own sound, before the result card.
// The beach also has a ball lying on the sand: tap it for a kick-about with the people there (tap to kick).
import * as THREE from 'three'
import { gesture, holdIn, playClip, preloadClips, stopClip } from './avatar3d.js'
import { playMini } from '../minigames.js'
import { play } from '../actsound.js'
import { SPEED as FAST } from '../speed.js'

const lc = (s) => String(s || '').toLowerCase()
// Which rows are games (by id: the rows come from city.md and keep their ids).
const MINI = {
  arcade_take_a_lane_with_your_people: 'bowling', arcade_learn_the_bowling_approach: 'bowling', arcade_hit_the_strike_light: 'bowling', arcade_buy_a_private_bowling_night: 'bowling',
  arcade_play_one_racing_cabinet: 'race', arcade_chase_a_score_for_the_wall: 'race',
  city_library_read_a_chapter_by_the_window: 'focus', city_library_copy_four_pages: 'focus', city_library_take_the_group_table: 'focus', city_library_put_your_phone_in_the_basket: 'focus',
  gym_buy_a_day_pass_and_stretch: 'reps', gym_lift_with_a_friend_spotting: 'reps', gym_take_the_treadmills_side_by_side: 'reps', gym_learn_the_squat: 'reps',
  gym_pay_for_eight_sessions_with_the_head_trainer: 'reps', gym_ride_the_window_bike_at_sunset: 'reps', gym_try_the_corner_bell_carefully: 'reps',
  beach_swim_to_the_near_buoy: 'swim',
}
// Where you go first, in room metres from the room's centre (props in city_places.json).
const SPOT = { bowling: [-3.4, 4.0, Math.PI], race: [8.0, -3.5, Math.PI / 2], focus: [4.6, -1.7, 0], reps: [4.4, 0.6, Math.PI] }
const LANES = [-7.6, -5.5] // (the other two lanes: NPCs bowl there)

// What your student is seen doing for an ordinary row, and the sound of it.
function actOf(place, row) {
  const n = lc(row.name)
  if (row.gig) return { kind: 'work', clip: /cart|push|trolley/.test(n) ? 'Push_Loop' : null, sound: /desk|till|counter|bank/.test(n) || place.id === 'bank' ? 'keys' : 'thud' }
  if (/haircut|trim|braid|salon|barber|fade|style/.test(n) || place.id === 'barber') return { kind: 'salon', sound: 'snip' }
  if (/dance|choir|sing|karaoke|song|music|hum|dj/.test(n)) return { kind: 'dance', clip: 'Dance_Loop', sound: 'clap' }
  if (/milkshake|coffee|flat white|tea|drink|water|smoothie|cooldrink|juice|mocktail|latte|cup/.test(n)) return { kind: 'drink', prop: 'cup', sound: 'sip' }
  if (/eat|muffin|soft serve|banana|fruit|peanut|chips|burger|bunny|meal|lunch|breakfast|pie|ice.cream|snack|biryani|kota|vetkoek|special|sandwich|pizza|popcorn/.test(n)) return { kind: 'eat', prop: 'food', sound: 'crunch' }
  if (/treadmill|run|jog|walk|promenade|waterline|lap/.test(n)) return { kind: 'move', clip: 'Jog_Fwd_Loop', sound: 'breath' }
  if (/volleyball|jump|ball/.test(n)) return { kind: 'move', clip: 'Jump_Loop', sound: 'thud' }
  if (/lift|squat|stretch|bell|weights|press|push.?up|train/.test(n)) return { kind: 'move', clip: /stretch/.test(n) ? 'Fixing_Kneeling' : 'Punch_Jab', sound: 'clank' }
  if (/read|book|chapter|copy|page|plan|board|map|notes|study|question|form|sign|card|ticket|leaflet|menu/.test(n)) return { kind: 'read', prop: 'book', sound: 'page' }
  if (/pray|church|pew|candle|service/.test(n)) return { kind: 'quiet', sound: 'hum' }
  if (/pay|account|deposit|withdraw|balance|bank|save|budget|insur/.test(n) || place.id === 'bank') return { kind: 'pay', prop: 'paper', sound: 'cash' }
  if (/buy|try|window|browse|shop|pick|basket|fit|shoes|clothes|bag|look at|test.?drive|car/.test(n)) return { kind: 'shop', prop: 'bag', sound: 'rustle' }
  if (/friend|people|chat|together|with your|group|share|talk|meet|someone/.test(n)) return { kind: 'talk', clip: 'Idle_Talking_Loop', sound: 'chatter' }
  return { kind: 'do', sound: 'rustle' }
}

function propMesh(kind) {
  const m = (geo, color) => new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }))
  if (kind === 'cup') return m(new THREE.CylinderGeometry(0.045, 0.035, 0.11, 10), '#f6f2ea')
  if (kind === 'food') return m(new THREE.BoxGeometry(0.13, 0.05, 0.1), '#c8873e')
  if (kind === 'book') return m(new THREE.BoxGeometry(0.17, 0.035, 0.23), '#7a2f3a')
  if (kind === 'paper') return m(new THREE.BoxGeometry(0.16, 0.005, 0.22), '#ffffff')
  if (kind === 'bag') return m(new THREE.BoxGeometry(0.26, 0.3, 0.1), '#f0c400')
  return null
}

// api (from city.js): { scene, player(), inside(), folk(), walkNear(x, z) -> Promise, toast(text), run(), save(), clock() }
export function createCityPlay(api) {
  preloadClips()
  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(60, ms / FAST)))
  let bowlers = null
  let shoes = null
  let kick = null
  let ball = null
  const log = [] // (tests: what was played, with the score)

  // ---------- a row ----------
  const kindOf = (row) => MINI[row.id] || ''
  // Before the result: the game, or the moment. Returns { adjust(deltas), note } (or {} for an ordinary row).
  async function playRow(place, row) {
    const kind = kindOf(row)
    if (!kind) { await doIt(place, row); return {} }
    if (kind === 'swim') { await swim(place); log.push({ row: row.id, kind }); return { note: '\u{1F30A} Out to the near buoy and back. The sand walk is the medal.' } }
    const room = api.inside()?.room
    const at = SPOT[kind]
    if (room && at) {
      await api.walkNear(room.centre.x + at[0], room.centre.z + at[1])
      api.player().rotation.y = at[2]
      if (kind === 'focus') { holdIn(api.player(), propMesh('book')); play('page') }
      await wait(400)
    }
    const staff = place.dress?.staffName ? `${place.dress.staffName}: “${place.dress.during || place.dress.greet || ''}”` : ''
    const r = await playMini(kind, { line: staff || undefined })
    holdIn(api.player(), null)
    const res = r || { score: 0.5 }
    log.push({ row: row.id, kind, score: +Number(res.score || 0).toFixed(2), skipped: Boolean(res.skipped) })
    const q = Math.max(0, Math.min(1, Number(res.score) || 0))
    if (kind === 'focus') return { note: `\u{1F4D6} ${res.big}: ${res.note}`, adjust: (d) => { if (d.grades > 0) d.grades = Math.max(1, Math.round(d.grades * (0.5 + q))) } }
    if (kind === 'reps') return { note: `\u{1F3CB} ${res.big}: ${res.note}`, adjust: (d) => { if (d.energy < 0) d.energy = Math.round(d.energy * (1.3 - 0.5 * q)); for (const k of ['social', 'grades']) if (d[k] > 0) d[k] = Math.max(1, Math.round(d[k] * (0.6 + 0.6 * q))) } }
    if (kind === 'bowling') return { note: `\u{1F3B3} ${res.big} ${res.note}`, adjust: (d) => { if (res.strike) d.social = (d.social || 0) + 2; else if (res.spare) d.social = (d.social || 0) + 1 } }
    if (kind === 'race') return { note: `\u{1F3CE} ${res.big}. ${res.note}`, adjust: (d) => { if (res.place === 1) d.social = (d.social || 0) + 1 } }
    return {}
  }
  // An ordinary row: about three seconds of your student doing it, with a prop in hand and its sound.
  async function doIt(place, row) {
    const p = api.player()
    const a = actOf(place, row)
    const prop = a.prop ? propMesh(a.prop) : null
    if (prop) holdIn(p, prop)
    if (a.clip) playClip(p, a.clip)
    log.push({ row: row.id, kind: a.kind, sound: a.sound })
    for (let i = 0; i < 3; i++) {
      if (!a.clip) gesture(p, 'interact-right')
      play(a.sound)
      await wait(1000)
    }
    stopClip(p)
    holdIn(p, null)
  }
  // The swim: down to the waterline, out to the near buoy and back (Swim_Fwd_Loop, splashes).
  async function swim(place) {
    const p = api.player()
    const door = place.lot.door
    const shore = { x: 292, z: door.z + 6 }
    await api.walkNear(shore.x, shore.z)
    p.rotation.y = Math.PI / 2
    playClip(p, 'Swim_Fwd_Loop')
    const out = 16
    const steps = 40
    for (const dir of [1, -1]) {
      p.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
      for (let i = 0; i < steps; i++) {
        p.position.x += (dir * out) / steps
        p.position.y = -0.75
        if (i % 8 === 0) play('splash')
        await wait(110)
      }
    }
    p.position.y = 0
    stopClip(p)
    play('splash')
  }

  // ---------- the bowling hall: NPCs on the other lanes, the shoe counter ----------
  function enterRoom(place, room) {
    leaveRoom()
    if (place.id !== 'arcade') return
    const group = new THREE.Group()
    group.name = 'bowlers'
    const ballGeo = new THREE.SphereGeometry(0.11, 12, 10)
    bowlers = LANES.map((x, i) => {
      const b = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ color: i ? '#c62828' : '#1f6b4a' }))
      b.visible = false
      group.add(b)
      return { x: room.centre.x + x, z0: room.centre.z + 3.6, z1: room.centre.z - 5.7, ball: b, t: 2 + i * 2.3, rolling: -1, who: null }
    })
    // a sign over the desk: this is where you get your shoes
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 80
    const g = c.getContext('2d')
    g.fillStyle = '#f0c400'; g.fillRect(0, 0, 256, 80)
    g.fillStyle = '#1c1915'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHOES', 128, 42)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    shoes = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }))
    shoes.position.set(room.centre.x + 3.6, 2.6, room.centre.z + 3.4)
    shoes.name = 'shoes-sign'
    group.add(shoes)
    api.scene.add(group)
    bowlers.group = group
  }
  function leaveRoom() {
    if (bowlers?.group) { api.scene.remove(bowlers.group); bowlers.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.() }) }
    bowlers = null
    shoes = null
  }
  // The patrons nearest each lane bowl there, now and then.
  function updateBowlers(dt) {
    if (!bowlers) return
    const folk = api.folk()?.list || []
    for (const b of bowlers) {
      if (b.rolling >= 0) {
        b.rolling += dt / 1.8
        const k = Math.min(1, b.rolling)
        b.ball.position.set(b.x, 0.12, b.z0 + (b.z1 - b.z0) * k)
        b.ball.rotation.x -= dt * 12
        if (k >= 1) { b.ball.visible = false; b.rolling = -1; play('pins', 6, 0.35) }
        continue
      }
      b.t -= dt
      if (b.t > 0) continue
      b.t = 5 + Math.random() * 4
      const who = folk.filter((f) => !f.staff && f.avatar.visible).sort((p, q) => Math.hypot(p.avatar.position.x - b.x, p.avatar.position.z - b.z0) - Math.hypot(q.avatar.position.x - b.x, q.avatar.position.z - b.z0))[0]
      if (who) {
        who.avatar.position.set(b.x, 0, b.z0 + 0.5)
        who.avatar.rotation.y = Math.PI
        who.goal = null
        who.wait = 3.2
        gesture(who.avatar, 'interact-right')
      }
      b.ball.position.set(b.x, 0.12, b.z0)
      b.ball.visible = true
      b.rolling = 0
      play('whoosh', null, 0.3)
    }
  }

  // ---------- the beach: a ball on the sand, a kick-about ----------
  function beachBall(place) {
    if (ball) return ball
    ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshLambertMaterial({ color: '#ffffff' }))
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 18), new THREE.MeshLambertMaterial({ color: '#e8497a' }))
    ball.add(stripe)
    ball.name = 'beach-ball'
    ball.position.set(place.lot.door.x + 12.5, 0.16, place.lot.door.z + 1.5)
    api.scene.add(ball)
    return ball
  }
  function dropBall() { if (ball) { api.scene.remove(ball); ball = null } kick = null }
  // tap(ray): a tap on the ball starts the kick-about; during it, any tap kicks when the ball is coming to you.
  function tapBeach(ray, ground) {
    if (kick) { kickTap(); return true }
    if (!ball || !ray) return false
    const hit = ray.ray.distanceToPoint(ball.position) < 0.6
    if (!hit && !(ground && Math.hypot(ground.x - ball.position.x, ground.z - ball.position.z) < 1.2)) return false
    startKick()
    return true
  }
  function startKick() {
    const p = api.player()
    const folk = (api.folk()?.list || []).filter((f) => !f.staff && f.avatar.visible).slice(0, 2)
    if (!folk.length) { api.toast('Nobody to kick it to yet.'); return }
    const c = ball.position.clone()
    const ring = [p, ...folk.map((f) => f.avatar)]
    ring.forEach((a, i) => {
      const ang = (i / ring.length) * Math.PI * 2
      if (a !== p) { a.position.set(c.x + Math.cos(ang) * 3.6, 0, c.z + Math.sin(ang) * 3.6); a.userData.lastPos?.copy(a.position) }
    })
    for (const f of folk) { f.goal = null; f.wait = 999; f.kick = true }
    kick = { ring, folk, at: 0, to: 1, t: 0, dur: 0.9, touches: 0, clean: 0, due: false, kicked: false }
    api.toast('⚽ Kick-about! Tap when the ball comes to you.')
    play('thud')
  }
  function kickTap() {
    if (!kick?.due || kick.kicked) return
    kick.kicked = true
    kick.clean += 1
    play('thud')
    gesture(api.player(), 'interact-right')
  }
  function updateKick(dt) {
    if (!kick || !ball) return
    const k = kick
    const from = k.ring[k.at].position
    const to = k.ring[k.to].position
    k.t += dt / k.dur
    const t = Math.min(1, k.t)
    ball.position.set(from.x + (to.x - from.x) * t, 0.16 + Math.sin(t * Math.PI) * 1.2, from.z + (to.z - from.z) * t)
    ball.rotation.x += dt * 8
    for (const a of k.ring) if (a !== api.player()) a.rotation.y = Math.atan2(ball.position.x - a.position.x, ball.position.z - a.position.z)
    const toMe = k.to === 0
    k.due = toMe && t > 0.72
    if (t < 1) return
    // landed: an NPC passes it on; you pass it on if you tapped in time, else it rolls off and comes back
    if (toMe) {
      k.touches += 1
      if (!k.kicked) { play('miss'); api.toast('Missed it. It comes back.') }
      k.kicked = false
    } else { play('thud'); gesture(k.ring[k.to], 'interact-right') }
    k.at = k.to
    k.to = toMe ? 1 + Math.floor(Math.random() * k.folk.length) : 0
    k.t = 0
    if (k.touches >= 6) endKick()
  }
  function endKick() {
    const k = kick
    kick = null
    for (const f of k.folk) { f.wait = 2; f.kick = false }
    const run = api.run()
    if (run?.stats) {
      run.stats.social = Math.min(100, (run.stats.social || 0) + 2 + Math.min(2, k.clean - 3 > 0 ? k.clean - 3 : 0))
      run.stats.energy = Math.max(0, (run.stats.energy || 0) - 3)
      api.save()
    }
    log.push({ row: 'beach_kickabout', kind: 'kickabout', score: +(k.clean / 6).toFixed(2) })
    api.toast(`⚽ Kick-about: ${k.clean} of 6 clean. +Social`)
    play(k.clean >= 5 ? 'cheer' : 'clap')
  }

  return {
    kindOf, playRow, doIt, enterRoom, leaveRoom, beachBall, dropBall, tapBeach, kicking: () => Boolean(kick),
    update(dt) { updateBowlers(dt); updateKick(dt) },
    info: () => ({ log: [...log], bowlers: bowlers ? bowlers.map((b) => ({ rolling: b.rolling >= 0 })) : null, shoes: Boolean(shoes), kick: kick ? { touches: kick.touches, clean: kick.clean, due: kick.due } : null, ball: ball ? { x: +ball.position.x.toFixed(2), z: +ball.position.z.toFixed(2) } : null }),
  }
}
