// The player's movement, after the softlife prototype: two inputs and nothing else.
// The stick (or WASD) first: it wins and clears any target. Then a tap target (a route
// of points, the last one the place you tapped). Otherwise idle. Collisions slide per
// axis (try X, then Z) against plain axis-aligned boxes. scene.js only wires this up.

// A brisk walk (m/s): the walk clip plays at the speed you really move. Trips longer
// than JOG_FROM are a jog (the run clip, played slower), up to JOG_MAX.
export const WALK = 1.75
export const JOG = 3.4
const JOG_FROM = 15
const JOG_MAX = 4.5
const ARRIVE = 0.2 // close enough to a tapped spot
const CORNER = 0.35 // close enough to a corner of the route: on to the next
const STALL = 0.0005 // a frame that moves less than this toward the target drops it
const TURN = 12 // heading lerp rate

// How fast to go for a trip this long: a brisk walk, or a jog past 15 m.
export const paceFor = (len) => (len <= JOG_FROM ? WALK : Math.min(JOG_MAX, Math.max(JOG, len / 14)))

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

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
  let speed = 0

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

  return {
    attach(group) { body = group; group.userData.leads = true; finish('cancelled'); stick = null },
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
    stop() { finish('cancelled'); stick = null },
    // The stick this frame (null: let go), and how far it's pushed (0-1). It wins and
    // clears the target.
    setStick(x, z, run, mag = 1) {
      stick = x || z ? { x, z, run, mag } : null
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
      speed = 0
      if (!body || dt <= 0) return false
      let dx = 0
      let dz = 0
      if (stick) {
        const m = Math.hypot(stick.x, stick.z)
        // (a little push, a slow walk; further out, faster; all the way, a run)
        if (m > 0.001) { dx = stick.x / m; dz = stick.z / m; speed = stick.run ? JOG : WALK * Math.min(1, Math.max(0.35, stick.mag)) }
      } else if (route.length) {
        let next = route[0]
        let d = Math.hypot(next.x - body.position.x, next.z - body.position.z)
        while (route.length > 1 && d < CORNER) {
          route.shift()
          next = route[0]
          d = Math.hypot(next.x - body.position.x, next.z - body.position.z)
        }
        if (route.length === 1 && d < near) { finish('arrived'); return false }
        dx = (next.x - body.position.x) / d
        dz = (next.z - body.position.z) / d
        speed = Math.min(pace, Math.max(1.2, remaining() * 4))
        // (the last few centimetres of a precise stop: never past the spot)
        if (route.length === 1) speed = Math.min(speed, d / dt)
      }
      if (speed <= 0.01) return false
      const bx = body.position.x
      const bz = body.position.z
      step(dx * speed * dt, dz * speed * dt)
      const moved = Math.hypot(body.position.x - bx, body.position.z - bz)
      if (!stick && moved < STALL) { finish('stalled'); speed = 0; return false }
      body.rotation.y += wrap(Math.atan2(dx, dz) - body.rotation.y) * Math.min(1, dt * TURN)
      const pose = body.userData.pose
      if (pose === 'stand' || pose === 'run' || pose === undefined) body.userData.pose = speed > WALK * 1.4 ? 'run' : 'stand'
      moving = true
      return true
    },
  }
}
