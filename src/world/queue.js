// One queue system for every counter (Auntie Pinky's window, Mam' Gugu's stall, any
// counter to come): one ordered line, first come first served, one person served at a
// time, nobody cuts in. The player joins at the back like anyone else; at the front the
// line waits for them until they leave it (their order is done, or they walked off).

// opts: slot(i) where the i-th person stands; face: the way the line faces;
// server: who serves; aside(n): where the n-th served person steps to eat;
// move(avatar, x, z, speed) -> Promise of how it ended (walks.js: 'arrived', 'stalled',
// 'replaced', 'stopped'); stop(avatar): end someone's walk; gesture(avatar, name);
// isPlayer(avatar): the player (moved by their own walk, not by the line).
// One walk per person (owner, 6 Nov): a newer walk replaces an older one, and what was to
// follow the older one (facing the counter, the next leg round the line) doesn't happen.
import { ms } from '../speed.js'
import { ended } from './walks.js'

export function createLine({ slot, face, server, aside, outside, move, stop = () => {}, gesture, isPlayer }) {
  const line = []
  const eating = [] // served, stepped aside, back in line later
  const id = Symbol('line')
  let serving = null
  let moving = 0
  let rest = 2 // seconds until the front person is served
  let lastMove = 0
  let late = 0
  let changed = 0 // (tests) when the line last changed: someone joined, left or was served

  const now = () => performance.now()
  function walk(avatar, x, z, speed) {
    moving += 1
    lastMove = now()
    return move(avatar, x, z, speed).finally(() => { moving -= 1; lastMove = now() })
  }
  // Held back on the way to place i (someone stands on it): close enough, like the front
  // person served from where they are. Their place changes, and they walk again.
  const heldAt = (a, i) => a.userData.lineHeld?.line === id && a.userData.lineHeld.i === i
  // Walk to place i, then face the counter (only if the walk ended there, never after a
  // newer walk replaced it).
  function toPlace(a, i, speed) {
    const s = slot(i)
    a.userData.lineHeld = null
    return walk(a, s.x, s.z, speed).then((how) => {
      if (!ended(how)) return how
      a.rotation.y = face
      if (how === 'stalled') a.userData.lineHeld = { line: id, i }
      return how
    })
  }
  // Everyone (but the player, who walks up by themself) steps up to their place.
  function shuffle() {
    changed = now()
    return Promise.all(line.map((a, i) => {
      if (isPlayer(a)) return null
      const s = slot(i)
      // (already there, or held back right by it: any walk left over from before ends)
      if (Math.hypot(a.position.x - s.x, a.position.z - s.z) < 0.05 || heldAt(a, i)) { stop(a); return null }
      return toPlace(a, i, 1.5)
    }))
  }

  async function serveFront() {
    const a = line[0]
    serving = a
    gesture(server, 'interact-right')
    gesture(a, 'pick-up')
    await new Promise((r) => setTimeout(r, ms(900)))
    line.shift()
    serving = null
    eating.push(a)
    a.userData.lineHeld = null
    const spot = aside(eating.length - 1)
    walk(a, spot.x, spot.z, 1.4).then((how) => { if (ended(how)) gesture(a, 'emote-yes') })
    await shuffle()
    // Back to the end of the line after eating (whoever is there by then is ahead).
    setTimeout(() => {
      const i = eating.indexOf(a)
      if (i < 0) return
      eating.splice(i, 1)
      join(a)
    }, ms(5000 + Math.random() * 3000))
  }

  function join(a) {
    if (line.includes(a)) return line.indexOf(a)
    line.push(a)
    changed = now()
    if (!isPlayer(a)) {
      const i = line.length - 1
      const s = slot(i)
      // (round the outside of the line, not through the people in it; the second leg only
      // if the first one ended, and only while they are still in the line)
      const o = outside ? outside(i) : null
      const there = () => (line.includes(a) ? toPlace(a, line.indexOf(a), 1.4) : null)
      if (o && Math.hypot(a.position.x - s.x, a.position.z - s.z) > 1.5) walk(a, o.x, o.z, 1.4).then((how) => { if (ended(how)) there() })
      else there()
    }
    return line.length - 1
  }

  function leave(a) {
    const i = line.indexOf(a)
    if (i < 0) return
    line.splice(i, 1)
    if (serving === a) serving = null
    rest = Math.max(rest, 1.2)
    shuffle()
  }

  // Each frame (dress.update): serve the front person when it's their turn. The player
  // at the front is served by talking to her: the line waits until they leave it.
  function update(dt) {
    if (serving || !line.length) return
    const front = line[0]
    if (isPlayer(front)) return
    const s = slot(0)
    // (still stepping up; someone held back by the crowd is served from where they are)
    if (Math.hypot(front.position.x - s.x, front.position.z - s.z) > 0.3 && !heldAt(front, 0) && (late += dt) < 4) return
    late = 0
    rest -= dt
    if (rest > 0) return
    // (quicker when the player is waiting: everyone ahead of you served within seconds)
    rest = line.some(isPlayer) ? 0.8 : 4 + Math.random() * 3
    serveFront()
  }

  return {
    get people() { return line.filter((a) => !isPlayer(a)) },
    // (tests) everyone the line moves: those in it and those stepped aside to eat
    get members() { return line.filter((a) => !isPlayer(a)).concat(eating) },
    get order() { return line.slice() },
    get serving() { return serving },
    indexOf: (a) => line.indexOf(a),
    hasPlayer: () => line.some(isPlayer),
    // Something is happening: someone being served or walking to their place.
    active: () => Boolean(serving) || moving > 0 || now() - lastMove < ms(2500) || rest < 1.5,
    // (tests, read only) when the line last changed, and how many walks are under way
    get changed() { return changed },
    get walking() { return moving },
    join,
    leave,
    update,
    slot,
  }
}

// The player waits in a line in an activity (api: the activity api): join at the back,
// step up each time the line moves, until they're at the front. They stay in the line
// (being served) until the caller leaves it. say(n): what they say with n people ahead.
export async function waitInLine(api, q, { say, frame = true } = {}) {
  const line = q.line
  const me = api.player
  api.state('queueing')
  if (frame) api.frame(q.front)
  line.join(me)
  let at = -1
  const total = Math.max(1, line.indexOf(me))
  try {
    for (;;) {
      const i = line.indexOf(me)
      if (i < 0) throw new Error('left the line')
      const s = q.slot(i)
      const off = Math.hypot(s.x - me.position.x, s.z - me.position.z)
      if (i !== at || off > 0.5) {
        if (i !== at) {
          at = i
          api.progress(1 - i / (total + 1))
          if (say) say(i)
        }
        await api.walkTo(s.x, s.z, at === total ? undefined : 1.5)
        api.face(q.front.x + Math.sin(q.face) * 3, q.front.z + Math.cos(q.face) * 3)
      }
      if (i === 0) break
      await api.wait(0.25)
    }
  } catch (error) {
    line.leave(me)
    throw error
  }
  api.progress(1)
}
