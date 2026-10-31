// Activities you can see: each action at a place is a short scene the student
// plays (queue for food, sit and chat, read on the grass...) before its result
// lands. scene.js supplies the api; a small timer bar shows how long is left.
import * as THREE from 'three'
import STORY from '../../data/campusville/place_story.json'
import { createScenes, SCENE_OF } from './scenes.js'

// action id -> script name. Anything unlisted at a dressed place uses 'stand'.
export const SCRIPTS = {
  quad_vendor: 'queueFood',
  quad_friends: 'benchChat',
  quad_busker: 'watchStage',
  quad_study: 'readGrass',
  lecture_skip: 'lieGrass',
  quad_clouds: 'lieGrass',
  quad_src: 'srcTable',
  quad_touch: 'jog',
  quad_dance: 'dance',
  quad_lights: 'benchSit',
  quad_longway: 'walkLoop',
  job_shift: 'flyers',
}

// The scene an action plays: a Quad script, else a reusable scene (scenes.js).
export function sceneName(actionId) {
  return SCRIPTS[actionId] || SCENE_OF[actionId]?.[0] || 'stand'
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]

// Something to hold: a vetkoek, a book or a flyer, on the right hand.
function holdable(kind) {
  const mats = {
    food: new THREE.MeshStandardMaterial({ color: 0xc8843a, roughness: 0.8 }),
    book: new THREE.MeshStandardMaterial({ color: 0x1e5bb8, roughness: 0.7 }),
    flyer: new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9 }),
  }
  const size = { food: [0.22, 0.12, 0.18], book: [0.3, 0.06, 0.22], flyer: [0.24, 0.02, 0.32] }[kind]
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mats[kind])
  mesh.name = `held-${kind}`
  return mesh
}

export function createActivities(api) {
  // api: { player, walkTo(x,z)->Promise, wait(s)->Promise, gesture(name), pose(p),
  //        face(x,z), say(text, who?), spot(place, id), dressing, progress(k), hold(mesh|null),
  //        moveAvatar(avatar, x, z, speed)->Promise, groove(level|null) }
  const quadSpot = (id) => api.spot('quad', id)

  const scripts = {
    // Join Mam' Gugu's queue, shuffle up as people are served, get your food, walk off eating.
    async queueFood() {
      const q = api.dressing.queue?.stall
      if (!q) return scripts.stand()
      q.busy = true // the line waits for you (no one leaves while you join)
      while (q.cycling) await api.wait(0.3)
      const end = q.slot(q.people.length)
      api.frame(q.front)
      await api.walkTo(end.x, end.z)
      api.face(q.front.x, q.front.z)
      api.say('The queue for vetkoek. Worth it.')
      for (let i = q.people.length; i > 0; i--) {
        api.progress(1 - i / (q.people.length + 1))
        await api.wait(0.9)
        await q.serveFront()
        const next = q.slot(i - 1)
        await api.walkTo(next.x, next.z)
        api.face(q.front.x, q.front.z)
      }
      api.gesture('interact-right')
      q.vendorServes()
      await api.wait(0.9)
      api.hold(holdable('food'))
      api.say('One vetkoek, extra polony. Sharp!')
      const away = quadSpot('benches')
      api.frame({ x: away.x + 2, z: away.z + 2 })
      await api.walkTo(away.x + 2, away.z + 2)
      api.gesture('emote-yes')
      await api.wait(1.2)
      api.hold(null)
      q.rejoin()
    },

    // Sit next to someone on a bench and chat.
    async benchChat() {
      const seat = api.freeSeat()
      if (!seat) return scripts.stand()
      api.frame(seat)
      await api.walkTo(seat.x + Math.sin(seat.rot) * 0.9, seat.z + Math.cos(seat.rot) * 0.9)
      api.sitAt(seat)
      const lines = ['Eish, did you see the queue at the caf?', 'Who is performing at open mic Friday?', 'My roommate ate my bread again.']
      for (let i = 0; i < 3; i++) {
        api.progress((i + 1) / 4)
        api.say(lines[i], i % 2 ? 'friend' : 'you')
        if (i % 2) seat.neighbour && api.gestureOf(seat.neighbour, 'emote-yes')
        else api.gesture('emote-yes')
        await api.wait(1.3)
      }
      api.stand()
    },

    // Watch the stage: the performer plays, you clap along.
    async watchStage() {
      const s = quadSpot('stage')
      api.frame({ x: s.x, z: s.z - 1 })
      await api.walkTo(s.x, s.z + 2.6)
      api.face(s.x, s.z - 3)
      api.groove(1)
      const performer = api.dressing.performer
      for (let i = 0; i < 3; i++) {
        api.progress((i + 1) / 4)
        if (performer) api.gestureOf(performer, i % 2 ? 'interact-right' : 'emote-yes')
        await api.wait(1.1)
        api.gesture('emote-yes')
      }
      api.say('That was actually fire.')
      await api.wait(0.8)
      api.groove(null)
    },

    // Sit on the grass under a tree, open a book, turn a page.
    async readGrass() {
      const b = quadSpot('benches')
      const x = b.x - 1.8
      const z = b.z + 3.2
      api.frame({ x, z })
      await api.walkTo(x, z)
      api.face(0, 0)
      api.pose('sit', 0)
      const book = holdable('book')
      api.hold(book)
      for (let i = 0; i < 3; i++) {
        api.progress((i + 1) / 4)
        await api.wait(1.1)
        book.rotation.z = i % 2 ? 0 : 0.5
      }
      api.hold(null)
      api.pose('stand')
    },

    // Lie on the grass and watch the clouds.
    async lieGrass() {
      const b = quadSpot('benches')
      await api.walkTo(b.x + 1.5, b.z + 4.2)
      api.pose('lie')
      api.say('That cloud looks like a bunny chow.')
      for (let i = 0; i < 3; i++) { api.progress((i + 1) / 4); await api.wait(1.1) }
      api.pose('stand')
    },

    // An SRC campaigner pitches and hands you a flyer.
    async srcTable() {
      const tables = api.dressing.srcTables || []
      const t = pick(tables)
      if (!t) return scripts.stand()
      api.frame(t.campaigner)
      await api.walkTo(t.front.x, t.front.z)
      api.face(t.x, t.z)
      api.gestureOf(t.campaigner, 'interact-right')
      api.say(pick(t.slate.lines), t.slate.name)
      api.progress(0.4)
      await api.wait(1.8)
      api.hold(holdable('flyer'))
      api.gesture('emote-yes')
      api.progress(0.8)
      await api.wait(1)
      api.hold(null)
    },

    // Touch rugby: jog a quick loop on the grass.
    async jog() {
      const c = { x: 6, z: 14 }
      api.pose('run')
      const loop = [[c.x + 3, c.z], [c.x, c.z + 3], [c.x - 3, c.z], [c.x, c.z - 3], [c.x + 3, c.z]]
      for (let i = 0; i < loop.length; i++) { api.progress((i + 1) / (loop.length + 1)); await api.walkTo(loop[i][0], loop[i][1], 6.5) }
      api.pose('stand')
      api.gesture('emote-yes')
      await api.wait(0.8)
    },

    // Dance by the stage on the beat.
    async dance() {
      const s = quadSpot('stage')
      await api.walkTo(s.x + 1.5, s.z + 3)
      api.face(s.x, s.z - 3)
      api.groove(1)
      api.pose('dance')
      for (let i = 0; i < 4; i++) { api.progress((i + 1) / 5); await api.wait(1) }
      api.pose('stand')
      api.groove(null)
    },

    // Sit on a bench under the lights.
    async benchSit() {
      const seat = api.freeSeat()
      if (!seat) return scripts.stand()
      await api.walkTo(seat.x + Math.sin(seat.rot) * 0.9, seat.z + Math.cos(seat.rot) * 0.9)
      api.sitAt(seat)
      api.say('The string lights make everything look like a movie.')
      for (let i = 0; i < 3; i++) { api.progress((i + 1) / 4); await api.wait(1.1) }
      api.stand()
    },

    // The long way round: a lap of the plaza.
    async walkLoop() {
      const pts = [[9, 4], [4, 9], [-4, 9], [-9, 4], [-9, -4]]
      for (let i = 0; i < pts.length; i++) { api.progress((i + 1) / (pts.length + 1)); await api.walkTo(pts[i][0], pts[i][1]) }
    },

    // A promo shift: hand out flyers by the stall.
    async flyers() {
      const s = quadSpot('stall')
      await api.walkTo(s.x + 1.5, s.z + 1.5)
      api.hold(holdable('flyer'))
      for (let i = 0; i < 4; i++) { api.progress((i + 1) / 5); api.gesture(i % 2 ? 'interact-left' : 'interact-right'); await api.wait(1) }
      api.hold(null)
    },

    // Fallback: walk to the place and do something with your hands.
    async stand() {
      for (let i = 0; i < 2; i++) { api.progress((i + 1) / 3); api.gesture('interact-right'); await api.wait(1) }
    },
  }

  const everywhere = createScenes(api)
  return {
    async run(actionId, placeId, extra) {
      if (SCRIPTS[actionId]) { await scripts[SCRIPTS[actionId]](); return SCRIPTS[actionId] }
      if (everywhere.has(actionId)) return everywhere.run(actionId, placeId, extra)
      await scripts.stand()
      return 'stand'
    },
  }
}

export const SLATES = STORY.src_slates
