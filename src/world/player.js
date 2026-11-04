// The player's movement: tap a spot, walk there, stop. Sims-style.
//
// Four rules, in order:
//   1. Speed ramps up and down. Nothing starts or stops in one frame.
//   2. You slow down before you arrive, and you stop on the spot, never past it.
//   3. You only move at full speed in the direction you are facing. Turning first
//      costs speed, so the body can never circle a target it is trying to reach.
//   4. stop() always works, from anywhere, in one frame of braking.
//
// A tap target (a route of points, the last one the place you tapped) is the main
// input. setStick() is still here for WASD on desktop; it wins and clears the target.
// Collisions slide per axis (try X, then Z) against plain axis-aligned boxes.

export const WALK = 2.3 // brisk walk (m/s)
export const JOG = 4.0 // a jog, for long trips and Shift
const JOG_FROM = 14 // trips longer than this jog
const JOG_MAX = 5.2

const ARRIVE = 0.18 // close enough to the tapped spot
const CORNER = 0.5 // close enough to a corner of the route: on to the next
const ACCEL = 9 // m/s per second, speeding up
const BRAKE = 14 // m/s per second, slowing down (stops feel crisp)
const TURN = 9 // heading lerp rate while moving
const TURN_STILL = 16 // heading lerp rate while standing or braking
const FACE_FLOOR = 0.15 // slowest fraction of speed while turning to face the way
const STALL = 0.0008 // a frame that moves less than this is a blocked frame
const STALL_FRAMES = 4 // this many blocked frames in a row drops the target

export const paceFor = (len) => (len <= JOG_FROM ? WALK : Math.min(JOG_MAX, Math.max(JOG, len / 12)))

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// blocked(x, z, solid): is a body standing here inside something? (solid false: only
// the edges of the map and the buildings, for scripted walks onto seats and spots)
export function createPlayer({ blocked }) {
  let body = null
  let stick = null // { x, z, run, mag } in world space, this frame
  let route = [] // points to walk through; the last is the target
  let pace = WALK
  let near = ARRIVE
  let solid = true
  let done = null // done(how): 'arrived', 'stalled' (blocked, dropped) or 'cancelled'
  let moving = false
  let speed = 0 // the speed we are actually travelling at, carried between frames
  let stuck = 0

  function remaining() {
    let len = 0
    let from = body.position
    for (const p of route) {
      len += Math.hypot(p.x - from.x, p.z - from.z)
      from = p
    }
    return len
  }

  // The walk is over: arrived, dropped (blocked), or cancelled. Its callback runs once.
  function finish(how) {
    route = []
    stuck = 0
    const fn = done
    done = null
    fn?.(how)
  }

  function step(dx, dz) {
    const p = body.position
    // (already inside an outline, just up from a chair or pushed in a crowd: walk out)
    const inside = blocked(p.x, p.z, solid)
    const nx = p.x + dx
    if (inside || !blocked(nx, p.z, solid)) p.x = nx
    const nz = p.z + dz
    if (inside || !blocked(p.x, nz, solid)) p.z = nz
  }

  // Turn the body toward (dx, dz) and report how much of full speed that heading
  // allows: facing the way, all of it; sideways or behind, a crawl until turned.
  function face(dx, dz, dt, braking) {
    const want = Math.atan2(dx, dz)
    const err = wrap(want - body.rotation.y)
    const rate = braking || speed < 0.4 ? TURN_STILL : TURN
    body.rotation.y += err * Math.min(1, dt * rate)
    return clamp(Math.cos(err), FACE_FLOOR, 1)
  }

  return {
    attach(group) { body = group; group.userData.leads = true; finish('cancelled'); stick = null; speed = 0 },
    // A walk through points (a route from the grid, ending where you tapped).
    // opts: pace (m/s, default by trip length), near (arrival distance), solid (collide
    // with props; scripted walks onto seats pass false), done(how).
    walkTo(points, opts = {}) {
      finish('cancelled')
      route = points.filter(Boolean).map((p) => ({ x: p.x, z: p.z }))
      near = opts.near ?? ARRIVE
      solid = opts.solid ?? true
      done = opts.done || null
      pace = opts.pace ?? paceFor(remaining())
      if (!route.length) finish('arrived')
      return pace
    },
    // Stop now. Braking takes one or two frames; nothing can refuse this.
    stop() { finish('cancelled'); stick = null },
    // Held up for good (pressed against something): stop, ending the walk as 'stalled',
    // so a walk that opens something where it ends (a chat, a place) still does.
    giveUp() { finish('stalled'); stick = null },
    // The stick or WASD this frame (null: let go). It wins and clears the target.
    // mag (0-1) scales the speed, so a small push is a slow walk.
    setStick(x, z, run, mag = 1) {
      stick = x || z ? { x, z, run, mag: clamp(mag, 0.35, 1) } : null
      if (stick && route.length) finish('cancelled')
    },
    get hasTarget() { return route.length > 0 },
    get target() { return route[route.length - 1] || null },
    get pace() { return pace },
    set pace(v) { pace = v },
    get moving() { return moving },
    get speed() { return speed },
    remaining: () => (body ? remaining() : 0),

    update(dt) {
      moving = false
      if (!body || dt <= 0) { speed = 0; return false }

      let dx = 0
      let dz = 0
      let want = 0 // the speed this frame is asking for
      let braking = false

      if (stick) {
        const m = Math.hypot(stick.x, stick.z)
        if (m > 0.001) {
          dx = stick.x / m
          dz = stick.z / m
          want = (stick.run ? JOG : WALK) * stick.mag
        }
      } else if (route.length) {
        let next = route[0]
        let d = Math.hypot(next.x - body.position.x, next.z - body.position.z)
        while (route.length > 1 && d < CORNER) {
          route.shift()
          next = route[0]
          d = Math.hypot(next.x - body.position.x, next.z - body.position.z)
        }
        dx = (next.x - body.position.x) / (d || 1)
        dz = (next.z - body.position.z) / (d || 1)
        want = pace
        if (route.length === 1) {
          // Arrived: close enough, or close enough and barely moving.
          if (d < near) { speed = 0; finish('arrived'); return false }
          // Start braking far enough out to stop exactly on the spot.
          const brakeDist = (speed * speed) / (2 * BRAKE) + near
          if (d <= brakeDist) { want = 0; braking = true }
        }
      }

      // Ramp toward the asked-for speed. Slowing down is quicker than speeding up.
      const rate = want > speed ? ACCEL : BRAKE
      speed += clamp(want - speed, -rate * dt, rate * dt)
      if (speed < 0.02) speed = 0

      if (!dx && !dz) { if (speed === 0) return false }
      else {
        // Turning costs speed, so the body never arcs around its own target.
        const allow = face(dx, dz, dt, braking)
        if (speed > want + 0.01 || braking) {
          // braking: keep the speed we have, just shed it
        } else {
          speed = Math.min(speed, Math.max(want * allow, 0))
        }
      }

      if (speed <= 0.01) { speed = 0; return false }

      // Never step past the target in one frame.
      let move = speed * dt
      if (!stick && route.length === 1) {
        const t = route[0]
        move = Math.min(move, Math.hypot(t.x - body.position.x, t.z - body.position.z))
      }

      const bx = body.position.x
      const bz = body.position.z
      step(dx * move, dz * move)
      const moved = Math.hypot(body.position.x - bx, body.position.z - bz)

      // Walking into something: a few blocked frames in a row and the target goes,
      // so the player can never jog on the spot against a wall.
      if (moved < STALL) {
        stuck += 1
        if (!stick && stuck >= STALL_FRAMES) { speed = 0; finish('stalled'); return false }
        speed = Math.max(0, speed - BRAKE * dt)
      } else {
        stuck = 0
      }

      const pose = body.userData.pose
      if (pose === 'stand' || pose === 'run' || pose === undefined) {
        body.userData.pose = speed > WALK * 1.25 ? 'run' : 'stand'
      }
      moving = speed > 0.05
      return moving
    },
  }
}
