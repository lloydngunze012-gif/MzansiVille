// Reusable scenes for every activity outside the Quad's own scripts (activities.js).
// Each scene plays out in front of the place, or cuts inside to a small room
// (rooms.js) through the opening door. The camera frames the moment up close.
import * as THREE from 'three'

// action id -> [scene, options]. Every action in activities.csv is listed (a check
// in scripts/sim-check.mjs keeps it that way).
export const SCENE_OF = {
  wake_noodles: ['cook', { what: 'noodles' }],
  wake_skip: ['walkOut', {}],
  wake_phone: ['phone', { call: false }],
  go_walk: ['walkPath', { far: true }],
  go_bus: ['busRide', { to: 'campus' }],
  lecture_attend: ['lecture', {}],
  lecture_back: ['lecture', { back: true }],
  cafeteria_meal: ['queueBuy', { food: 'pap and wors', eat: true }],
  library_study: ['study', { room: 'library' }],
  sports_gym: ['exercise', { kind: 'gym' }],
  res_party: ['party', {}],
  call_home: ['phone', { call: true }],
  sleep: ['sleep', {}],
  smig_sitin: ['lecture', {}],
  smig_board: ['readBoard', { lines: ['SMIG NOTICES', 'Case competition: sign up by Fri', 'Tutor wanted: Accounting 101', 'Lost: blue calculator'] }],
  smig_steps: ['sitEat', { food: 'chips', seat: 'steps' }],
  smig_case: ['groupStudy', { room: 'library', props: 'papers' }],
  smig_lab: ['study', { room: 'lab', laptop: true }],
  smig_beanbag: ['nap', { on: 'beanbag' }],
  hs_sitin: ['lecture', {}],
  hs_board: ['readBoard', { lines: ['CLINIC ROSTER', 'Wk 1: Ward B, 07:00', 'Bring your own stethoscope', 'Vaccination forms due Tue'] }],
  hs_lawn: ['sitEat', { food: 'sandwich', seat: 'grass' }],
  hs_cards: ['groupStudy', { room: 'library', props: 'cards' }],
  hs_prac: ['study', { room: 'lab' }],
  hs_bob: ['skeleton', {}],
  sci_sitin: ['lecture', {}],
  sci_board: ['readBoard', { lines: ['LAB TIMETABLE', 'Chem 1A: Mon & Wed 14:00', 'Goggles compulsory', 'Lab coats R180 at the shop'] }],
  sci_fountain: ['sitEat', { food: 'sandwich', seat: 'fountain' }],
  sci_report: ['groupStudy', { room: 'lab', props: 'papers' }],
  sci_open: ['study', { room: 'lab' }],
  sci_lawn: ['nap', { on: 'grass' }],
  law_sitin: ['lecture', {}],
  law_board: ['readBoard', { lines: ['MOOT COURT ROSTER', 'Round 1: Thu 17:00', 'Dress code: formal', 'Bring three copies'] }],
  law_steps: ['chat', { who: ['naledi', 'x5'], eat: true, lines: ['Is pineapple on pizza a crime?', 'Objection. Delicious.', 'Sustained, but only on Fridays.'] }],
  law_moot: ['moot', {}],
  law_read: ['study', { room: 'library' }],
  law_lurk: ['watch', { what: 'door', lines: ['Raised voices behind the door. Someone is winning.'] }],
  eng_sitin: ['lecture', {}],
  eng_board: ['readBoard', { lines: ['PROJECT BOARD', 'Bridge contest: Wed 12:00', 'Egg drop: bring your own egg', 'Workshop safety talk Mon'] }],
  eng_bridge: ['watch', { what: 'bridge', lines: ['It holds! Ten kilograms! The crowd goes wild.'] }],
  eng_eggdrop: ['build', { what: 'egg' }],
  eng_workshop: ['build', { what: 'prototype' }],
  eng_print: ['watch', { what: 'printer', lines: ['Layer by layer. It is hypnotic.'] }],
  gate_guard: ['chat', { who: ['x7'], role: 'guard', lines: ['Morning, security!', 'Morning! Student card, please. Sharp.', 'Have a good day, hey.'] }],
  gate_vetkoek: ['queueBuy', { food: 'vetkoek with mince', eat: true, stall: 'gate' }],
  gate_taxi: ['watch', { what: 'taxis', lines: ['A taxi hoots twice. That means town. Everyone knows.'] }],
  gate_spaza: ['queueBuy', { food: 'chips and a cooldrink', stall: 'spaza' }],
  gate_wall: ['sitRelax', { seat: 'wall', lines: ['The sky goes orange over the taxi rank.'] }],
  gate_visitors: ['chat', { who: ['x7', 'x3'], role: 'guard', lines: ['My cousin is visiting.', 'Sign here, and here. Welcome to campus!', 'Thank you!'] }],
  gate_night: ['chat', { who: ['x7'], role: 'guard', lines: ['Quiet night?', 'Too quiet. Want some rooibos?', 'Always.'] }],
  gate_curfew: ['exercise', { kind: 'run' }],
  quad_study: null, quad_src: null, quad_busker: null, quad_touch: null, quad_dance: null, quad_clouds: null, quad_lights: null, quad_longway: null, quad_friends: null, quad_vendor: null, lecture_skip: null, job_shift: null,
  caf_queue: ['queueBuy', { food: 'pap and egg', eat: true }],
  caf_grab: ['queueBuy', { food: 'muffin', walkAway: true }],
  caf_between: ['queueBuy', { food: 'bunny chow', eat: true, quick: true }],
  caf_table: ['eatTogether', { who: ['x0', 'x4'] }],
  lib_drop: ['sitRelax', { room: 'library', lines: ['Bag down. Deep breath. Okay.'] }],
  lib_between: ['study', { room: 'library' }],
  lib_group: ['groupStudy', { room: 'library', props: 'books' }],
  lib_printer: ['print', {}],
  lib_night: ['study', { room: 'library', night: true }],
  sport_stretch: ['exercise', { kind: 'stretch' }],
  sport_pass: ['walkPath', {}],
  sport_gap: ['exercise', { kind: 'run' }],
  sport_pickup: ['exercise', { kind: 'ball' }],
  sport_watch: ['watch', { what: 'match', lines: ['Goal! The stand erupts. You erupt a little too.'] }],
  bus_early: ['busRide', { queue: true, to: 'campus' }],
  bus_timetable: ['readBoard', { lines: ['BUS TIMETABLE', 'Res - Campus: every 15 min', 'Last bus 22:30', 'Town: on the hour'] }],
  bus_back: ['busRide', { to: 'res', back: true }],
  bus_town: ['busRide', { to: 'town' }],
  bus_last: ['busRide', { to: 'res', night: true }],
  res_o_lock: ['walkOut', { lock: true }],
  res_o_notes: ['fetch', { what: 'notes' }],
  res_o_corridor: ['chat', { who: ['x2', 'x6'], lines: ['Who has the iron?', 'Room 14. Bring it back this time.', 'Haha, maybe.'] }],
  res_o_cook: ['cook', { what: 'pap and gravy' }],
  res_o_late_chat: ['sleepTalk', {}],
  res_r_breakfast: ['cook', { what: 'oats', quiet: true }],
  res_r_out: ['walkOut', { quiet: true }],
  res_r_reading: ['sitRead', { room: 'bedroom' }],
  res_r_tea: ['cook', { what: 'tea', friend: true }],
  res_r_lights: ['sleep', {}],
  res_s_fridge: ['cook', { what: 'fridge' }],
  res_s_out: ['walkOut', { together: true }],
  res_s_ball: ['exercise', { kind: 'ball' }],
  res_s_stoep: ['sitRelax', { seat: 'stoep', lines: ['The courtyard is loud and warm. You stay a while.'] }],
  res_s_kitchen: ['cook', { what: 'two-minute noodles', friend: true }],
  res_other_kettle: ['cook', { what: 'kettle' }],
  res_other_out: ['walkOut', {}],
  res_other_quiet: ['sitRead', { room: 'bedroom' }],
  res_other_floor: ['chat', { who: ['x8'], lines: ['Hi, you just moved in?', 'Room 22. I have a kettle and no friends.', 'You have one now.'] }],
  res_other_wash: ['laundry', {}],
  off_pack: ['fetch', { what: 'bag', room: 'lounge' }],
  off_stop: ['walkPath', {}],
  off_return: ['fetch', { what: 'textbook', room: 'lounge' }],
  off_supper: ['cook', { what: 'supper', friend: true }],
  off_couch: ['couch', {}],
  off_late: ['walkOut', { lock: true }],
  tutor: ['groupStudy', { room: 'library', props: 'books' }],
  off_campus_party: ['party', {}],
  write_exam: ['lecture', { exam: true }],
  organt_rep: ['flyerShift', {}],
}

function holdable(kind) {
  const spec = {
    food: [[0.34, 0.2, 0.28], 0xd08a3a],
    book: [[0.4, 0.08, 0.3], 0x1e5bb8],
    paper: [[0.3, 0.02, 0.4], 0xf4f1e6],
    phone: [[0.1, 0.2, 0.03], 0x1c1915],
    cup: [[0.16, 0.2, 0.16], 0xffffff],
    ball: [[0.32, 0.32, 0.32], 0xf4f1e6],
    tool: [[0.08, 0.4, 0.08], 0x8a8f96],
  }[kind] || [[0.2, 0.2, 0.2], 0xffffff]
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...spec[0]), new THREE.MeshStandardMaterial({ color: spec[1], roughness: 0.7, emissive: kind === 'phone' ? 0x2a6aff : 0x000000, emissiveIntensity: kind === 'phone' ? 0.25 : 0 }))
  mesh.name = `held-${kind}`
  return mesh
}

export function createScenes(api) {
  const P = () => api.player.position
  const steps = (n, each = 1.1, fn) => (async () => { for (let i = 0; i < n; i++) { api.progress((i + 1) / (n + 1)); if (fn) fn(i); await api.wait(each) } })()
  const side = (place, dx, dz = 0) => ({ x: place.front.x + dx, z: place.front.z + 2.6 + dz })

  // Through the door into a room, and back out again.
  async function goInside(place, kind) {
    await api.walkTo(place.door.x, place.door.z - 2.2)
    await api.wait(0.4) // the door swings open as you arrive (scene.js)
    await api.fade()
    const room = api.room(kind)
    api.teleport(room.anchors.door.x, room.anchors.door.z, Math.PI)
    api.frame(room.anchors.look)
    await api.wait(0.2)
    await api.unfade()
    return room
  }
  async function goOutside(place) {
    await api.fade()
    api.clearTemps()
    api.frame(null)
    api.teleport(place.door.x, place.door.z, 0)
    await api.wait(0.2)
    await api.unfade()
  }
  const sitOn = (seat) => { api.teleport(seat.x, seat.z, seat.rot); api.pose('sit', seat.y || 0.46) }

  // A small counter with a vendor and two people waiting, in front of a place.
  function tempStall(place, kind) {
    const o = side(place, 4.2, 1.5)
    const colors = { gate: [0x1f7a3a, 'GATE VETKOEK R12'], spaza: [0xc62828, 'SPAZA · CHIPS · COLDRINKS'] }[kind] || [0x1e5bb8, 'SNACKS']
    api.box(2.4, 1, 0.8, 0x9a6a40, o.x, 0.5, o.z)
    for (let i = 0; i < 5; i++) api.box(0.5, 0.06, 1.3, i % 2 ? 0xffffff : colors[0], o.x - 1 + i * 0.5, 2.35, o.z + 0.1)
    for (const s of [-1, 1]) api.box(0.08, 2.3, 0.08, 0x2b2b30, o.x + s * 1.15, 1.15, o.z - 0.35)
    api.sign([colors[1]], o.x, 1.85, o.z + 0.45, 0, 2.3, 0.4)
    const vendor = api.npc(kind === 'spaza' ? 'x10' : 'mam_gugu', o.x, o.z - 0.8, 0)
    const slot = (i) => ({ x: o.x, z: o.z + 1.4 + i * 1.0 })
    const people = [api.npc('x1', slot(0).x, slot(0).z, Math.PI), api.npc('x11', slot(1).x, slot(1).z, Math.PI)]
    return {
      vendor, slot, people, front: slot(0),
      async serveFront() {
        const p = people.shift()
        api.gestureOf(vendor, 'interact-right')
        api.gestureOf(p, 'pick-up')
        await api.wait(0.7)
        api.moveNpc(p, o.x + 3.5, o.z + 3)
        await Promise.all(people.map((q, i) => api.moveNpc(q, slot(i).x, slot(i).z, 1.6)))
        people.forEach((q) => { q.rotation.y = Math.PI })
      },
    }
  }

  const scenes = {
    // Join the queue, shuffle forward as people are served, get your food, eat or walk off.
    async queueBuy(place, opt) {
      let q
      let restore = null
      if (place.id === 'cafeteria' && api.dressing.queue?.caf?.people) {
        // The caf queue: everyone ahead is served, steps aside, the line moves up.
        const c = api.dressing.queue.caf
        const home = c.people.map((p) => ({ p, x: p.position.x, z: p.position.z, r: p.rotation.y }))
        restore = () => home.forEach(({ p, x, z, r }) => { p.position.set(x, 0, z); p.rotation.y = r })
        const line = c.people.slice()
        q = {
          vendor: c.auntie, slot: c.slot, people: line, front: c.front,
          async serveFront() {
            const p = line.shift()
            api.gestureOf(c.auntie, 'interact-right')
            api.gestureOf(p, 'pick-up')
            await api.wait(0.6)
            api.moveNpc(p, c.front.x - 3.5 - line.length * 0.9, c.front.z + 2.5)
            await Promise.all(line.map((o, i) => api.moveNpc(o, c.slot(i).x, c.slot(i).z, 2)))
            line.forEach((o) => { o.rotation.y = Math.PI })
          },
        }
      } else q = tempStall(place, opt.stall)
      const end = q.slot(q.people.length)
      api.frame(q.vendor)
      await api.walkTo(end.x, end.z)
      api.face(q.front.x, q.front.z - 2)
      api.say(`The queue for ${opt.food}.`)
      const n = q.people.length
      for (let i = n; i > 0; i--) {
        api.progress(1 - i / (n + 2))
        await api.wait(0.8)
        await q.serveFront()
        const next = q.slot(i - 1)
        await api.walkTo(next.x, next.z, 2.4)
        api.face(q.front.x, q.front.z - 2)
      }
      api.gestureOf(q.vendor, 'interact-right')
      api.say(`One ${opt.food}, please.`)
      await api.wait(1)
      api.gesture('pick-up')
      await api.wait(0.5)
      api.hold(holdable('food'))
      api.say(opt.food === 'muffin' ? 'Muffin secured. Walking.' : `${opt.food[0].toUpperCase()}${opt.food.slice(1)}. Sharp, thank you!`)
      api.progress(0.8)
      await api.wait(0.9)
      if (opt.eat) {
        const spot = side(place, -4, 1)
        api.frame(spot)
        await api.walkTo(spot.x, spot.z)
        api.face(place.front.x, place.front.z)
        for (let i = 0; i < 3; i++) { api.gesture('interact-right'); await api.wait(0.9) }
        api.say('Mmm. Worth every cent.')
        await api.wait(0.8)
      } else {
        const away = side(place, -5, 4)
        api.frame(away)
        await api.walkTo(away.x, away.z)
        api.gesture('interact-right')
        await api.wait(0.8)
      }
      api.hold(null)
      if (restore) restore()
    },

    // Sit somewhere (steps, grass, fountain edge) and eat.
    async sitEat(place, opt) {
      const s = side(place, -3.5, 0.5)
      if (opt.seat === 'fountain') {
        const f = side(place, -5.5, 1.5)
        api.box(2.2, 0.5, 2.2, 0xb8c0c8, f.x, 0.25, f.z)
        api.box(1.8, 0.06, 1.8, 0x5aa8e0, f.x, 0.52, f.z, { emissive: 0x5aa8e0, emissiveIntensity: 0.2 })
        s.x = f.x + 1.4
        s.z = f.z
      }
      if (opt.seat === 'steps') api.box(3.2, 0.36, 1.2, 0xc9c0b0, s.x, 0.18, s.z - 0.2)
      api.frame(s)
      await api.walkTo(s.x, s.z + 0.9)
      api.teleport(s.x, s.z, 0)
      api.pose('sit', opt.seat === 'grass' ? 0.05 : 0.4)
      api.hold(holdable('food'))
      api.say(`Lunch: ${opt.food}.`)
      await steps(3, 1.1, () => api.gesture('interact-right'))
      api.hold(null)
      api.pose('stand')
    },

    async eatTogether(place, opt) {
      const s = side(place, -4, 0.5)
      api.prop('/models/props/table.glb', s.x, s.z, { s: 2.3, rot: Math.PI / 2 })
      api.prop('/models/props/chair.glb', s.x - 0.95, s.z, { rot: Math.PI / 2 })
      const a = api.npc(opt.who[0], s.x + 0.95, s.z, -Math.PI / 2, { pose: 'sit', y: 0.46 })
      api.prop('/models/props/chair.glb', s.x + 0.95, s.z, { rot: -Math.PI / 2 })
      api.frame(s)
      await api.walkTo(s.x - 1.8, s.z + 0.5)
      sitOn({ x: s.x - 0.95, z: s.z, rot: Math.PI / 2, y: 0.46 })
      api.hold(holdable('food'))
      const lines = [['Can I sit here?', 'you'], ['Sure! Everyone squeezes in.', 'friend'], ['The caf is so full today.', 'you']]
      for (const [i, [text, who]] of lines.entries()) { api.progress((i + 1) / 4); api.say(text, who); api.gestureOf(who === 'you' ? null : a, 'emote-yes'); if (who === 'you') api.gesture('interact-right'); await api.wait(1.3) }
      api.hold(null)
      api.pose('stand')
    },

    async sitRead(place, opt) {
      const room = await goInside(place, opt.room || 'bedroom')
      const seat = room.anchors.sit || room.anchors.desk
      sitOn(seat)
      api.frame(seat)
      const book = holdable('book')
      api.hold(book)
      await steps(3, 1.2, (i) => { book.rotation.z = i % 2 ? 0 : 0.5 })
      api.hold(null)
      api.pose('stand')
      await goOutside(place)
    },

    async sitRelax(place, opt) {
      if (opt.room) {
        const room = await goInside(place, opt.room)
        sitOn(room.anchors.desk || room.anchors.sit)
        api.frame(room.anchors.look)
        api.say(opt.lines[0])
        await steps(3, 1.1)
        api.pose('stand')
        await goOutside(place)
        return
      }
      const s = side(place, -3.2, 0.5)
      if (opt.seat === 'wall') api.box(4, 0.6, 0.6, 0xd9c49c, s.x, 0.3, s.z - 0.3)
      if (opt.seat === 'stoep') api.box(4, 0.4, 1, 0xb09070, s.x, 0.2, s.z - 0.2)
      api.frame(s)
      await api.walkTo(s.x, s.z + 1)
      api.teleport(s.x, s.z, 0)
      api.pose('sit', opt.seat === 'wall' ? 0.62 : 0.42)
      api.say(opt.lines[0])
      await steps(3, 1.2)
      api.pose('stand')
    },

    async study(place, opt) {
      const room = await goInside(place, opt.room)
      const seat = opt.room === 'lab' ? room.anchors[opt.laptop ? 'laptop' : 'bench'] : room.anchors.desk
      if (opt.room === 'lab') { api.teleport(seat.x, seat.z, seat.rot) } else sitOn(seat)
      api.frame(seat)
      api.hold(holdable(opt.laptop ? 'paper' : 'book'))
      api.say(opt.night ? 'Just me, the lamp and chapter three.' : opt.room === 'lab' ? 'Measure twice. Write it down.' : 'Twenty pages. Starting... now.')
      await steps(3, 1.2, () => api.gesture(opt.room === 'lab' ? 'interact-left' : 'interact-right'))
      api.hold(null)
      api.pose('stand')
      await goOutside(place)
    },

    async groupStudy(place, opt) {
      const room = await goInside(place, opt.room)
      const seat = room.anchors.desk || room.anchors.bench
      const others = [room.anchors.desk2 || room.anchors.bench2, room.anchors.desk3].filter(Boolean)
      const people = others.map((s, i) => api.npc(['priya', 'noah', 'x4'][i], s.x, s.z, s.rot, { pose: room.kind === 'library' ? 'sit' : 'stand', y: s.y || 0 }))
      if (room.kind === 'library') sitOn(seat)
      else api.teleport(seat.x, seat.z, seat.rot)
      api.frame(room.anchors.look)
      api.hold(holdable(opt.props === 'cards' ? 'paper' : 'book'))
      const lines = { cards: ['Scaphoid!', 'Correct! Next card.', 'Lunate?'], papers: ['Who does the conclusion?', 'Not me. I did the graph.', 'Fine. I will.'], books: ['Chapter four, page 80.', 'Found it!', 'Okay, quiz me.'] }[opt.props] || ['Okay, let us split it up.', 'I take part one.', 'Deal.']
      for (const [i, line] of lines.entries()) {
        api.progress((i + 1) / 4)
        api.say(line, i % 2 ? 'friend' : 'you')
        if (i % 2) api.gestureOf(people[0], 'interact-right'); else api.gesture('interact-right')
        await api.wait(1.3)
      }
      api.hold(null)
      api.pose('stand')
      await goOutside(place)
    },

    async lecture(place, opt) {
      const room = await goInside(place, 'classroom')
      const l = room.anchors.lecturer
      const lecturer = api.npc('dr_moodley', l.x, l.z, l.rot)
      room.anchors.seats.forEach((s, i) => { if (i !== 5 && i !== 11 && i % 3 !== 1) api.npc(`x${i % 12}`, s.x, s.z, s.rot, { pose: 'sit', y: s.y }) })
      const seat = opt.back ? room.anchors.backSeat : room.anchors.seat
      await api.glide(seat.x, seat.z + 0.6)
      sitOn(seat)
      api.frame(room.anchors.board)
      if (opt.exam) {
        api.hold(holdable('paper'))
        api.say('Turn your papers over. You may begin.', 'Invigilator')
        await steps(4, 1.2, () => api.gesture('interact-right'))
      } else if (opt.back) {
        api.hold(holdable('phone'))
        api.say('Just checking one thing. For 40 minutes.')
        await steps(3, 1.2, () => api.gestureOf(lecturer, 'interact-right'))
      } else {
        api.hold(holdable('paper'))
        api.say('Today: the basics. Write this down.', 'Lecturer')
        await steps(3, 1.2, (i) => { api.gestureOf(lecturer, i % 2 ? 'interact-left' : 'interact-right'); api.gesture('interact-right') })
      }
      api.hold(null)
      api.pose('stand')
      await goOutside(place)
    },

    async moot(place) {
      const room = await goInside(place, 'classroom')
      const l = room.anchors.lecturer
      const judge = api.npc('naledi', l.x, l.z, l.rot)
      const stand = room.anchors.seats[1]
      await api.glide(stand.x, stand.z - 0.6)
      api.face(l.x, l.z)
      api.frame(judge)
      const lines = [['My lord, the goat had no intention.', 'you'], ['The goat ate the evidence.', 'Judge'], ['Then the evidence was delicious.', 'you']]
      for (const [i, [text, who]] of lines.entries()) { api.progress((i + 1) / 4); api.say(text, who); if (who === 'you') api.gesture('interact-right'); else api.gestureOf(judge, 'emote-no'); await api.wait(1.4) }
      await goOutside(place)
    },

    async skeleton(place) {
      const room = await goInside(place, 'lab')
      const s = room.anchors.skeleton
      await api.glide(s.x, s.z)
      api.face(s.x, s.z - 2)
      api.frame({ x: s.x, z: s.z - 1 })
      for (const [i, bone] of ['Femur.', 'Clavicle.', 'Scaphoid... I think.'].entries()) { api.progress((i + 1) / 4); api.say(bone); api.gesture('interact-right'); await api.wait(1.2) }
      await goOutside(place)
    },

    async readBoard(place, opt) {
      const b = side(place, 3.6, -0.6)
      for (const s of [-1, 1]) api.box(0.1, 2.2, 0.1, 0x4a3426, b.x + s * 1.2, 1.1, b.z)
      api.sign(opt.lines, b.x, 1.5, b.z + 0.06, 0, 2.4, 1.4)
      api.frame({ x: b.x, z: b.z })
      await api.walkTo(b.x, b.z + 1.6)
      api.face(b.x, b.z)
      await steps(3, 1.1, (i) => { if (i === 1) { api.gesture('interact-right'); api.say('Noted. Very noted.') } })
    },

    async chat(place, opt) {
      const s = side(place, -3, 1)
      const people = opt.who.map((id, i) => api.npc(id, s.x + (i ? 1.1 : 0), s.z - 1.2, 0))
      api.frame(people[0])
      await api.walkTo(s.x + 0.4, s.z + 0.2)
      api.face(people[0].position.x, people[0].position.z)
      people.forEach((p) => { p.rotation.y = Math.atan2(P().x - p.position.x, P().z - p.position.z) })
      if (opt.eat) api.hold(holdable('food'))
      for (const [i, line] of opt.lines.entries()) {
        api.progress((i + 1) / (opt.lines.length + 1))
        const them = i % 2 === 1
        api.say(line, them ? (opt.role === 'guard' ? 'Security' : 'Friend') : 'you')
        if (them) api.gestureOf(people[i % people.length], 'interact-right'); else api.gesture('emote-yes')
        await api.wait(1.4)
      }
      api.hold(null)
    },

    async watch(place, opt) {
      let focus
      if (opt.what === 'taxis') focus = { x: 0, z: 118 }
      else if (opt.what === 'door') focus = place.door
      else {
        focus = side(place, 3.5, 0.5)
        if (opt.what === 'bridge') {
          api.box(3, 0.12, 0.4, 0x9a6a40, focus.x, 1, focus.z)
          for (const s of [-1, 1]) api.box(0.4, 1, 0.4, 0x8a8f96, focus.x + s * 1.4, 0.5, focus.z)
          api.npc('amir', focus.x - 1, focus.z - 1, 0)
          api.npc('x2', focus.x + 1, focus.z - 1, 0)
        } else if (opt.what === 'printer') {
          api.box(1, 1, 1, 0x2b2b30, focus.x, 0.5, focus.z)
          api.box(0.8, 0.06, 0.06, 0xf0c400, focus.x, 0.9, focus.z, { emissive: 0xf0c400, emissiveIntensity: 0.5 })
        } else if (opt.what === 'match') {
          ;['luke', 'x2', 'x6'].forEach((id, i) => api.npc(id, focus.x - 2 + i * 2, focus.z - 2, 0, { pose: 'run' }))
        }
      }
      api.frame(focus)
      const spot = opt.what === 'taxis' ? { x: place.door.x + 2, z: place.door.z + 2 } : side(place, 1, 3)
      await api.walkTo(spot.x, spot.z)
      api.face(focus.x, focus.z)
      await steps(3, 1.2, (i) => { if (i === 1) api.say(opt.lines[0]); if (i === 2) api.gesture('emote-yes') })
    },

    async build(place, opt) {
      const room = await goInside(place, 'lab')
      const s = room.anchors.bench
      api.teleport(s.x, s.z, s.rot)
      api.frame(s)
      const thing = api.box(0.5, 0.3, 0.5, opt.what === 'egg' ? 0xf4f1e6 : 0x8a8f96, s.x, 1.15, s.z - 0.8)
      api.hold(holdable('tool'))
      await steps(4, 1, (i) => { api.gesture(i % 2 ? 'interact-left' : 'interact-right'); thing.scale.y = 1 + i * 0.35; thing.position.y = 1.15 + i * 0.05 })
      api.say(opt.what === 'egg' ? 'The egg survives. For now.' : 'It works! Mostly.')
      api.hold(null)
      await api.wait(0.8)
      await goOutside(place)
    },

    async exercise(place, opt) {
      const c = side(place, 0, 4)
      api.frame(c)
      if (opt.kind === 'stretch') {
        await api.walkTo(c.x, c.z)
        api.pose('sit', 0.05)
        await steps(3, 1.2, (i) => api.gesture(i % 2 ? 'interact-left' : 'interact-right'))
        api.pose('stand')
        return
      }
      if (opt.kind === 'ball') {
        const mate = api.npc('luke', c.x + 3, c.z, -Math.PI / 2)
        await api.walkTo(c.x - 1, c.z)
        api.face(mate.position.x, mate.position.z)
        const ball = api.box(0.32, 0.32, 0.32, 0xf4f1e6, c.x - 0.6, 0.9, c.z)
        for (let i = 0; i < 4; i++) {
          api.progress((i + 1) / 5)
          const from = i % 2 ? mate.position.x - 0.4 : c.x - 0.6
          const to = i % 2 ? c.x - 0.6 : mate.position.x - 0.4
          api.gesture('interact-right')
          for (let k = 0; k <= 10; k++) { ball.position.x = from + (to - from) * (k / 10); ball.position.y = 0.9 + Math.sin((k / 10) * Math.PI) * 1.2; await api.wait(0.06) }
          if (i % 2 === 0) api.gestureOf(mate, 'interact-right')
        }
        return
      }
      // run / gym: a jogging loop
      api.pose('run')
      const loop = [[c.x + 3, c.z], [c.x, c.z + 3], [c.x - 3, c.z], [c.x, c.z - 3], [c.x + 3, c.z]]
      for (let i = 0; i < loop.length; i++) { api.progress((i + 1) / (loop.length + 1)); await api.walkTo(loop[i][0], loop[i][1], 6.5) }
      api.pose('stand')
      api.gesture('emote-yes')
      api.say(opt.kind === 'gym' ? 'Legs: destroyed. Spirit: strong.' : 'Made it!')
      await api.wait(1)
    },

    async walkPath(place, opt) {
      const pts = opt.far ? [[4, 6], [8, 12], [4, 18]] : [[3, 4], [-3, 6], [0, 9]]
      api.frame(null)
      for (let i = 0; i < pts.length; i++) {
        api.progress((i + 1) / (pts.length + 1))
        const p = side(place, pts[i][0], pts[i][1])
        api.frame(p)
        await api.walkTo(p.x, p.z)
      }
    },

    async walkOut(place, opt) {
      const room = await goInside(place, 'bedroom')
      const bag = room.anchors.bag || room.anchors.look
      await api.glide(bag.x, bag.z + 0.6)
      api.frame(bag)
      api.gesture('pick-up')
      api.say(opt.lock ? 'Keys, phone, wallet. Lock it.' : opt.quiet ? 'Shh. Out without a sound.' : 'Bag, go.')
      await steps(2, 1)
      await api.glide(room.anchors.door.x, room.anchors.door.z)
      await goOutside(place)
      const out = side(place, 2, 6)
      if (opt.together) { api.npc('x6', out.x + 1, out.z - 1, 0); api.npc('x2', out.x - 1, out.z - 1.5, 0) }
      api.frame(out)
      await api.walkTo(out.x, out.z)
    },

    async fetch(place, opt) {
      const room = await goInside(place, opt.room || 'bedroom')
      const spot = room.anchors.desk || room.anchors.sit
      await api.glide(spot.x, spot.z + 0.8)
      api.frame(spot)
      api.gesture('pick-up')
      await api.wait(0.6)
      api.hold(holdable(opt.what === 'bag' ? 'tool' : 'book'))
      api.say(opt.what === 'bag' ? 'Packed. Everything. Probably.' : `Got the ${opt.what}!`)
      await steps(2, 1)
      api.hold(null)
      await goOutside(place)
    },

    async cook(place, opt) {
      const room = await goInside(place, 'kitchen')
      const a = room.anchors
      const spot = opt.what === 'fridge' ? a.fridge : opt.what === 'kettle' || opt.what === 'tea' || opt.what === 'noodles' ? a.kettle : a.stove
      let friend = null
      if (opt.friend) friend = api.npc(place.id.startsWith('off') ? 'x0' : 'x8', a.sit2.x, a.sit2.z, a.sit2.rot, { pose: 'sit', y: a.sit2.y })
      await api.glide(spot.x, spot.z)
      api.face(spot.x, spot.z - 2)
      api.frame({ x: spot.x, z: spot.z - 1 })
      const line = { noodles: 'Kettle on. Noodles in. Two minutes, says the packet.', fridge: 'Someone labelled the milk. Respect.', tea: 'Two cups. One for you, one for company.', kettle: 'The kettle at the end of the passage. It sings.', 'pap and gravy': 'Pap: stirred. Gravy: legendary.' }[opt.what] || `Making ${opt.what}.`
      api.say(line)
      await steps(3, 1.1, (i) => api.gesture(i % 2 ? 'interact-left' : 'interact-right'))
      api.hold(holdable(opt.what === 'tea' || opt.what === 'kettle' ? 'cup' : 'food'))
      sitOn(a.sit)
      api.frame(a.table)
      if (friend) { api.say('This is the best part of the day.', 'friend'); api.gestureOf(friend, 'emote-yes') }
      await api.wait(1.2)
      api.gesture('interact-right')
      await api.wait(0.8)
      api.hold(null)
      api.pose('stand')
      await goOutside(place)
    },

    async laundry(place) {
      const room = await goInside(place, 'kitchen')
      const w = room.anchors.washer
      const mate = api.npc('x8', w.x + 0.9, w.z + 1, Math.PI)
      await api.glide(w.x, w.z)
      api.face(w.x - 1, w.z)
      api.frame({ x: w.x - 0.5, z: w.z })
      const lines = [['Is this your sock?', 'you'], ['It is now everyone’s sock.', 'friend'], ['Fair.', 'you']]
      for (const [i, [t, who]] of lines.entries()) { api.progress((i + 1) / 4); api.say(t, who); if (who === 'you') api.gesture('pick-up'); else api.gestureOf(mate, 'emote-yes'); await api.wait(1.3) }
      await goOutside(place)
    },

    async phone(place, opt) {
      const room = await goInside(place, 'bedroom')
      sitOn(room.anchors.sit)
      api.frame(room.anchors.sit)
      const phone = holdable('phone')
      api.hold(phone)
      if (opt.call) {
        phone.rotation.x = 0.4
        api.say('Hi Ma! Yes, I’m eating. Yes, vegetables. Mostly.')
        await steps(3, 1.3, (i) => { if (i === 2) api.say('Love you too. Bye, Ma.') })
      } else {
        api.say('Twelve notifications. Three are the res group arguing.')
        await steps(3, 1.1, () => api.gesture('interact-right'))
      }
      api.hold(null)
      api.pose('stand')
      await goOutside(place)
    },

    async sleep(place) {
      const room = await goInside(place, 'bedroom')
      const bed = room.anchors.bed
      await api.glide(bed.x + 1, bed.z)
      api.teleport(bed.x, bed.z, bed.rot)
      api.pose('lie')
      api.player.position.y = bed.lieY
      api.frame(bed)
      api.say('Zzz…')
      await steps(3, 1.2)
      api.pose('stand')
      await goOutside(place)
    },

    async sleepTalk(place) {
      const room = await goInside(place, 'bedroom')
      const bed = room.anchors.bed
      api.teleport(bed.x, bed.z, bed.rot)
      api.pose('lie')
      api.player.position.y = bed.lieY
      api.frame(bed)
      for (const [i, [t, who]] of [['Are you awake?', 'you'], ['(through the wall) Unfortunately.', 'Neighbour'], ['Same. Goodnight, wall.', 'you']].entries()) { api.progress((i + 1) / 4); api.say(t, who); await api.wait(1.4) }
      api.pose('stand')
      await goOutside(place)
    },

    async couch(place) {
      const room = await goInside(place, 'lounge')
      sitOn(room.anchors.sit)
      api.frame(room.anchors.look)
      api.say('One episode. Okay, two.')
      await steps(3, 1.3)
      api.pose('stand')
      await goOutside(place)
    },

    async nap(place, opt) {
      const s = side(place, -3.2, 1)
      if (opt.on === 'beanbag') api.box(1.3, 0.5, 1.3, 0x7b3fe4, s.x, 0.25, s.z)
      api.frame(s)
      await api.walkTo(s.x + 1.2, s.z)
      api.teleport(s.x, s.z, 0)
      api.pose('lie')
      api.player.position.y = opt.on === 'beanbag' ? 0.6 : 0.28
      api.say(opt.on === 'beanbag' ? 'The beanbag swallows you whole.' : 'The clouds look like exam papers.')
      await steps(3, 1.2)
      api.pose('stand')
    },

    async print(place) {
      const room = await goInside(place, 'library')
      const p = room.anchors.printer
      await api.glide(p.x, p.z)
      api.face(p.x, p.z - 2)
      api.frame({ x: p.x, z: p.z - 1 })
      api.say('Paper jam. Of course.')
      await steps(2, 1.1, () => api.gesture('interact-right'))
      api.hold(holdable('paper'))
      api.say('Printed! R1 a page. Worth it.')
      await api.wait(1)
      api.hold(null)
      await goOutside(place)
    },

    async flyerShift(place) {
      const s = side(place, -3, 2)
      api.frame(s)
      await api.walkTo(s.x, s.z)
      api.hold(holdable('paper'))
      const passer = api.npc('x3', s.x + 4, s.z + 2, -Math.PI / 2)
      api.moveNpc(passer, s.x - 4, s.z + 2, 1.4)
      for (let i = 0; i < 4; i++) { api.progress((i + 1) / 5); api.gesture(i % 2 ? 'interact-left' : 'interact-right'); if (i === 1) api.say('Organt tees, 031 pride! Flyer?'); await api.wait(1) }
      api.hold(null)
    },

    async party(place) {
      const s = side(place, 0, 4)
      const crew = ['x0', 'x2', 'x4', 'x6', 'x8'].map((id, i) => api.npc(id, s.x + Math.cos(i * 1.25) * 2.2, s.z + Math.sin(i * 1.25) * 2.2, 0, { pose: 'dance' }))
      crew.forEach((p) => { p.rotation.y = Math.atan2(s.x - p.position.x, s.z - p.position.z) })
      for (let i = 0; i < 8; i++) api.box(0.12, 0.12, 0.12, [0xff4d6d, 0xf0c400, 0x4dd0e1, 0x7b3fe4][i % 4], s.x - 3 + i * 0.85, 3, s.z, { emissive: [0xff4d6d, 0xf0c400, 0x4dd0e1, 0x7b3fe4][i % 4], emissiveIntensity: 1.5 })
      api.frame(s)
      await api.walkTo(s.x, s.z)
      api.groove(1)
      api.pose('dance')
      api.say('Amapiano on, worries off.')
      await steps(4, 1.1)
      api.pose('stand')
      api.groove(null)
    },

    async busRide(place, opt) {
      // The stop is on the west side of the station, away from the gate.
      const stop = { x: place.b.minX - 3, z: place.b.z }
      const bus = new THREE.Group()
      const body = api.box(3, 2.2, 8, 0xf0c400, 0, 0, 0)
      body.removeFromParent()
      body.position.set(0, 1.3, 0)
      bus.add(body)
      for (let i = 0; i < 4; i++) { const w = api.box(0.06, 0.7, 1.4, 0x2a3442, 0, 0, 0); w.removeFromParent(); w.position.set(1.52, 1.7, -2.6 + i * 1.8); bus.add(w) }
      bus.position.set(stop.x - 2.6, 0, stop.z - 40)
      api.campus.group.parent.add(bus)
      if (opt.queue) { api.npc('x1', stop.x, stop.z - 0.9, 0); api.npc('x5', stop.x + 0.2, stop.z - 1.9, 0) }
      api.frame(stop)
      await api.walkTo(stop.x, stop.z)
      api.face(stop.x, stop.z - 4)
      api.say(opt.night ? 'Last bus. Do not miss it.' : 'Here it comes.')
      for (let k = 0; k <= 30; k++) { bus.position.z = stop.z - 40 + 40 * (1 - (1 - k / 30) ** 2); await api.wait(0.05) }
      api.progress(0.5)
      api.gesture('interact-right')
      await api.wait(0.5)
      api.frame(bus.position)
      api.player.visible = false
      await api.wait(0.4)
      for (let k = 0; k <= 25; k++) { bus.position.z += 1.4; await api.wait(0.04) }
      await api.fade(opt.to === 'town' ? '\u{1F68C} Into town…' : opt.to === 'res' ? '\u{1F68C} Back to res…' : '\u{1F68C} Riding…')
      bus.removeFromParent()
      api.player.visible = true
      api.teleport(stop.x - 1.5, stop.z + 1, Math.PI)
      api.say(opt.to === 'town' ? 'Town: done. Bus back: done.' : opt.back ? 'Got the book. Back again.' : 'Made it.')
      await api.unfade()
      api.progress(0.9)
      await api.wait(1)
    },
  }

  return {
    has: (id) => Boolean(SCENE_OF[id]),
    async run(id, placeId) {
      const [name, opt] = SCENE_OF[id]
      const place = api.placeInfo(placeId)
      if (!place || !scenes[name]) return null
      await scenes[name](place, opt || {})
      return name
    },
    names: Object.keys(scenes),
  }
}
