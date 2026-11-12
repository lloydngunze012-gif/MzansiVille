// Activities you play (owner, 12 Nov, job K). Short games in one overlay over any scene: playMini(kind, opts) resolves
// with { score (0..1), ...what happened, note } when the player taps Continue (or Skip: a middling score).
//   bowling  a lane seen from behind the ball: drag to aim (the direction of the drag) and release (its length is
//            the power); the ball rolls, the pins fall, two rolls, the score (strike, spare, pins).
//   race     the racing cabinet: 20 seconds, three lanes, tap the left or right half to change lane; dodge the cones
//            and the slow cars; how far you got is your place.
//   focus    a study moment (library): a ring closes on the book eight times; tap as it lands. Accuracy sets the Grades.
//   reps     a set at the gym: the bar rises and falls; tap while it is in the green band. Good reps set the Energy
//            cost and the gain.
// Each has its own sounds (src/actsound.js). The overlay is a dialog, so the world pauses under it. Real time, not the
// tests' ?fast (a beat has to be tappable). window.mzansiMini() for tests: { kind, phase, due, rolls, score }.
import { engine, play, roll } from './actsound.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
let state = null
let css = false
function style() {
  if (css) return
  css = true
  const s = document.createElement('style')
  s.textContent = `
.mg{position:fixed;inset:0;z-index:175;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1117e6;font-family:Figtree,system-ui,sans-serif;color:#fff;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px calc(env(safe-area-inset-bottom,0px) + 12px);box-sizing:border-box;touch-action:none;user-select:none;-webkit-user-select:none}
.mg-head{width:min(100%,420px);display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
.mg-head h2{margin:0;font:800 21px/1.15 Graduate,Figtree,system-ui,sans-serif;color:#f0c400}
.mg-head p{margin:3px 0 0;font-size:14px;color:#e8e2d6;line-height:1.3}
.mg-skip{flex:none;min-height:40px;padding:0 14px;border-radius:20px;border:1.5px solid #ffffff55;background:transparent;color:#fff;font:700 14px Figtree,system-ui,sans-serif}
.mg canvas{width:min(100%,420px);flex:1 1 auto;max-height:62vh;min-height:300px;border-radius:16px;background:#1b2330;touch-action:none;display:block}
.mg-hint{width:min(100%,420px);margin:8px 0 0;text-align:center;font:700 15px Figtree,system-ui,sans-serif;color:#fff}
.mg-end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0d1117cc}
.mg-end>div{width:min(calc(100% - 24px),420px);box-sizing:border-box;padding:20px;border-radius:18px;background:#fffaf0;color:#1c1915;text-align:center;box-shadow:0 12px 30px #0008}
.mg-end b{display:block;font:800 30px Graduate,Figtree,system-ui,sans-serif;margin:2px 0 6px}
.mg-end p{margin:0 0 14px;font-size:15px;line-height:1.35}
.mg-end button{width:100%;min-height:48px;border:0;border-radius:24px;background:#f0c400;color:#1c1915;font:800 17px Figtree,system-ui,sans-serif}`
  document.head.append(s)
}

const TITLES = {
  bowling: ['Your lane', 'Drag up the lane to aim, let go to bowl. Two rolls.'],
  race: ['Racing cabinet', 'Tap left or right to change lane. 20 seconds. Dodge the cones.'],
  focus: ['Focus', 'Tap as the ring lands on the book. Eight pages.'],
  reps: ['One set', 'Tap while the bar is in the green. Eight reps.'],
}

// opts: { title, line (the staff's word), seconds (race) }
export function playMini(kind, opts = {}) {
  if (state) state.finish(null)
  style()
  const [title, hint] = TITLES[kind] || ['', '']
  const root = document.createElement('div')
  root.className = 'mg'
  root.dataset.kind = kind
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', opts.title || title)
  root.innerHTML = `<div class="mg-head"><div><h2>${esc(opts.title || title)}</h2><p>${esc(opts.line || hint)}</p></div><button type="button" class="mg-skip" data-mg="skip">Skip</button></div><canvas></canvas><p class="mg-hint">${esc(hint)}</p>`
  document.body.append(root)
  const canvas = root.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const fit = () => {
    const r = canvas.getBoundingClientRect()
    const k = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(r.width * k)
    canvas.height = Math.round(r.height * k)
    ctx.setTransform(k, 0, 0, k, 0, 0)
    return { w: r.width, h: r.height }
  }
  let size = fit()
  window.addEventListener('resize', () => { size = fit() })
  for (const t of ['pointerdown', 'touchstart', 'mousedown']) root.addEventListener(t, (e) => e.stopPropagation(), { passive: true })
  return new Promise((resolve) => {
    let raf = 0
    let last = performance.now()
    let ended = false
    const game = GAMES[kind]({ ctx, size: () => size, canvas, opts, end: (r) => showEnd(r) })
    state = { kind, phase: 'play', game, finish }
    function frame(now) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!ended) game.step(dt)
      game.draw()
    }
    raf = requestAnimationFrame(frame)
    function showEnd(r) {
      if (ended) return
      ended = true
      state.phase = 'end'
      state.result = r
      game.stop?.()
      const box = document.createElement('div')
      box.className = 'mg-end'
      box.innerHTML = `<div><small>${esc(r.kicker || 'Done')}</small><b>${esc(r.big)}</b><p>${esc(r.note || '')}</p><button type="button" data-mg="done">Continue</button></div>`
      root.append(box)
    }
    function finish(r) {
      cancelAnimationFrame(raf)
      game.stop?.()
      root.remove()
      state = null
      resolve(r)
    }
    root.addEventListener('click', (e) => {
      const k = e.target.closest('[data-mg]')?.dataset.mg
      if (k === 'done') finish(state.result)
      if (k === 'skip') { if (!ended) showEnd(game.skip()); else finish(state.result) }
    })
  })
}
export const miniOpen = () => Boolean(state)
window.mzansiMini = () => (state ? { kind: state.kind, phase: state.phase, ...(state.game.info?.() || {}), result: state.result || null } : null)

// ---------- bowling ----------
const LANE = 1.06
const HEAD = 18.3
const BALL_R = 0.11
const PIN_R = 0.06
function bowling({ ctx, size, canvas, end }) {
  const pins = []
  const reset = () => { pins.length = 0; for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) pins.push({ x: (j - i / 2) * 0.305, y: HEAD + i * 0.264, vx: 0, vy: 0, down: false, gone: false, t: 0 }) }
  reset()
  let ball = null
  let drag = null
  let rollNo = 1
  const rolls = []
  let settle = 0
  let rumble = null
  let hitSound = false
  let msg = ''
  const view = () => {
    const { w, h } = size()
    return { w, h, cx: w / 2, near: h - 40, far: h * 0.16, lw: Math.min(w * 0.62, 260) }
  }
  // lane metres -> screen (the near end at the bottom, the pins up the screen, getting smaller)
  const proj = (x, y) => {
    const v = view()
    const s = 1 / (1 + y / 5.2)
    const s0 = 1
    const sh = 1 / (1 + HEAD / 5.2)
    const k = (s - sh) / (s0 - sh)
    return { x: v.cx + x * v.lw * s, y: v.far + (v.near - v.far) * k, s }
  }
  const P = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() } }
  canvas.addEventListener('pointerdown', (e) => { if (ball || settle > 0) return; drag = { a: P(e), b: P(e) }; canvas.setPointerCapture?.(e.pointerId) })
  canvas.addEventListener('pointermove', (e) => { if (drag) drag.b = P(e) })
  canvas.addEventListener('pointerup', () => {
    if (!drag) return
    const { a, b } = drag
    drag = null
    const dx = b.x - a.x
    const dy = a.y - b.y // up the screen is down the lane
    if (dy < 20) { msg = 'Drag up the lane, then let go.'; return }
    const len = Math.min(260, Math.hypot(dx, dy))
    const speed = 5.5 + (len / 260) * 4.5
    const ang = Math.atan2(dx, dy) * 0.42
    ball = { x: 0, y: 0.4, vx: Math.sin(ang) * speed * 0.25, vy: Math.cos(ang) * speed, gutter: false }
    hitSound = false
    play('whoosh')
    rumble = roll()
    msg = ''
  })
  function stepBall(dt) {
    if (!ball) return
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt
    if (!ball.gutter && Math.abs(ball.x) > LANE / 2) { ball.gutter = true; ball.vx = 0; ball.x = Math.sign(ball.x) * (LANE / 2 + 0.07) }
    rumble?.set(Math.min(1, ball.vy / 10))
    // the pins: the ball knocks them, they knock each other
    if (!ball.gutter) for (const p of pins) {
      if (p.gone) continue
      const dx = p.x - ball.x
      const dy = p.y - ball.y
      const d = Math.hypot(dx, dy)
      if (d < BALL_R + PIN_R && d > 0) {
        const n = { x: dx / d, y: dy / d }
        const sp = Math.hypot(ball.vx, ball.vy)
        p.vx += n.x * sp * 0.9
        p.vy += n.y * sp * 0.9
        ball.vx -= n.x * sp * 0.06
        ball.vy *= 0.94
        if (!hitSound) { hitSound = true; play('pins', 9) }
      }
    }
    if (ball.y > HEAD + 1.4) { rumble?.stop(); rumble = null; ball = null; settle = 1.4 }
  }
  function stepPins(dt) {
    for (const p of pins) {
      if (p.gone) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.96
      p.vy *= 0.96
      if (Math.hypot(p.vx, p.vy) > 0.35) p.down = true
      if (p.down) p.t = Math.min(1, p.t + dt * 4)
    }
    for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i]
      const b = pins[j]
      if (a.gone || b.gone) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      if (d < PIN_R * 2.6 && d > 0 && (Math.hypot(a.vx, a.vy) > 0.3 || Math.hypot(b.vx, b.vy) > 0.3)) {
        const n = { x: dx / d, y: dy / d }
        const rel = (a.vx - b.vx) * n.x + (a.vy - b.vy) * n.y
        if (rel > 0) { a.vx -= n.x * rel * 0.6; a.vy -= n.y * rel * 0.6; b.vx += n.x * rel * 0.6; b.vy += n.y * rel * 0.6; b.down = true }
      }
    }
  }
  function afterRoll() {
    const down = pins.filter((p) => p.down && !p.gone).length
    rolls.push(down)
    for (const p of pins) if (p.down) p.gone = true
    const standing = pins.filter((p) => !p.gone).length
    if (rollNo === 1 && standing === 0) { play('cheer'); return finishGame('Strike!') }
    if (rollNo === 2) { const total = rolls[0] + rolls[1]; if (total === 10) play('cheer'); return finishGame(total === 10 ? 'Spare!' : `${total} of 10`) }
    rollNo = 2
    msg = down ? `${down} down. ${standing} to go.` : 'Gutter. Shake it off.'
  }
  function finishGame(big) {
    const total = rolls.reduce((a, b) => a + b, 0)
    end({ kicker: 'Your frame', big, note: rolls.length === 1 ? 'All ten with the first ball. The strike light is yours.' : `First ball ${rolls[0]}, second ball ${rolls[1]}: ${total} pins.`, score: total / 10, pins: total, rolls: [...rolls], strike: rolls.length === 1, spare: rolls.length === 2 && total === 10 })
  }
  return {
    info: () => ({ rolls: [...rolls], rolling: Boolean(ball), standing: pins.filter((p) => !p.gone && !p.down).length, roll: rollNo }),
    step(dt) {
      stepBall(dt)
      stepPins(dt)
      if (settle > 0) { settle -= dt; if (settle <= 0) afterRoll() }
    },
    draw() {
      const v = view()
      ctx.clearRect(0, 0, v.w, v.h)
      ctx.fillStyle = '#1b2330'
      ctx.fillRect(0, 0, v.w, v.h)
      // the lane: wood, with the gutters either side and the arrows
      const a = proj(-LANE / 2, 0); const b = proj(LANE / 2, 0); const c = proj(LANE / 2, HEAD + 1.2); const d = proj(-LANE / 2, HEAD + 1.2)
      const ga = proj(-LANE / 2 - 0.16, 0); const gb = proj(LANE / 2 + 0.16, 0); const gc = proj(LANE / 2 + 0.16, HEAD + 1.2); const gd = proj(-LANE / 2 - 0.16, HEAD + 1.2)
      ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.moveTo(ga.x, ga.y); ctx.lineTo(gb.x, gb.y); ctx.lineTo(gc.x, gc.y); ctx.lineTo(gd.x, gd.y); ctx.fill()
      const wood = ctx.createLinearGradient(0, v.far, 0, v.near); wood.addColorStop(0, '#c89a5c'); wood.addColorStop(1, '#e3bb7c')
      ctx.fillStyle = wood; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill()
      ctx.fillStyle = '#8a5a2b'
      for (const ax of [-0.3, -0.15, 0, 0.15, 0.3]) { const p = proj(ax, 4.6); ctx.beginPath(); ctx.moveTo(p.x, p.y - 7 * p.s); ctx.lineTo(p.x - 4 * p.s, p.y + 4 * p.s); ctx.lineTo(p.x + 4 * p.s, p.y + 4 * p.s); ctx.fill() }
      // the pins, far ones first
      const order = [...pins].filter((p) => !p.gone).sort((p, q) => q.y - p.y)
      for (const p of order) {
        const s = proj(p.x, p.y)
        const h = 26 * s.s * 3.2 * (1 - p.t * 0.75)
        const w = 8 * s.s * 3.2 * (1 + p.t * 0.6)
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.t * Math.sign(p.vx || 1) * 1.3)
        ctx.fillStyle = '#fbfbf7'; ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#d0312d'; ctx.fillRect(-w / 2, -h * 0.72, w, Math.max(1, h * 0.08))
        ctx.restore()
      }
      // the ball
      const bx = ball ? ball.x : 0
      const by = ball ? ball.y : 0.4
      const s = proj(bx, by)
      ctx.fillStyle = '#2a4fbf'; ctx.beginPath(); ctx.arc(s.x, s.y - 18 * s.s, 18 * s.s, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.arc(s.x - 6 * s.s, s.y - 24 * s.s, 5 * s.s, 0, Math.PI * 2); ctx.fill()
      // the aim while dragging
      if (drag) {
        const dx = drag.b.x - drag.a.x
        const dy = drag.a.y - drag.b.y
        const len = Math.min(260, Math.hypot(dx, dy))
        const ang = Math.atan2(dx, dy) * 0.42
        ctx.strokeStyle = '#f0c400'; ctx.lineWidth = 4; ctx.setLineDash([10, 8])
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 18); const tip = proj(Math.sin(ang) * 0.25 * (HEAD * 0.5), HEAD * 0.5); ctx.lineTo(tip.x, tip.y); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = '#f0c400'; ctx.fillRect(16, v.h - 24, (v.w - 32) * (len / 260), 8)
      }
      ctx.fillStyle = '#fff'; ctx.font = '800 15px Figtree, system-ui, sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`Ball ${rollNo} of 2`, 14, 24)
      ctx.textAlign = 'right'; ctx.fillText(`Pins down: ${rolls.reduce((x, y) => x + y, 0)}`, v.w - 14, 24)
      if (msg) { ctx.textAlign = 'center'; ctx.fillText(msg, v.w / 2, 48) }
    },
    skip() { const n = 6; rolls.splice(0, rolls.length, n); return { kicker: 'Your frame', big: `${n} of 10`, note: 'You let the lane decide. Six pins, no regrets.', score: 0.6, pins: n, rolls: [n], skipped: true } },
    stop() { rumble?.stop(); rumble = null },
  }
}

// ---------- the racing cabinet ----------
function race({ ctx, size, canvas, opts, end }) {
  const T = opts.seconds || 20
  let t = 0
  let lane = 1
  let x = 1
  let speed = 0.4
  let dist = 0
  let slow = 0
  let hits = 0
  const things = []
  let spawn = 0.6
  const motor = engine()
  let api = null
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect()
    lane = Math.max(0, Math.min(2, lane + (e.clientX - r.left < r.width / 2 ? -1 : 1)))
  })
  const finish = () => {
    const place = dist > 330 ? 1 : dist > 290 ? 2 : dist > 240 ? 3 : dist > 190 ? 4 : 5
    const ord = ['1st', '2nd', '3rd', '4th', '5th'][place - 1]
    end({ kicker: 'Race over', big: `${ord} of 6`, note: hits ? `${Math.round(dist)} m, and ${hits} bump${hits === 1 ? '' : 's'}. The cabinet prints a photo, not a payout.` : `${Math.round(dist)} m without a scratch. The cabinet prints a photo, not a payout.`, score: Math.min(1, dist / 360), place, dist: Math.round(dist), hits })
  }
  api = {
    info: () => ({ t: +t.toFixed(1), lane, dist: Math.round(dist), hits }),
    step(dt) {
      t += dt
      if (t >= T) { finish(); return }
      x += (lane - x) * Math.min(1, dt * 12)
      slow = Math.max(0, slow - dt)
      speed = Math.min(1, speed + dt * 0.08)
      const v = (slow > 0 ? 0.35 : 1) * (10 + 12 * speed)
      dist += v * dt
      motor.set(slow > 0 ? 0.2 : speed)
      spawn -= dt
      if (spawn <= 0) { spawn = 0.55 + Math.random() * 0.5 - speed * 0.2; things.push({ lane: Math.floor(Math.random() * 3), y: -0.1, kind: Math.random() < 0.6 ? 'cone' : 'car' }) }
      for (const o of things) o.y += dt * (v / 14) * (o.kind === 'car' ? 0.6 : 1)
      for (const o of things) if (!o.hit && o.y > 0.78 && o.y < 0.9 && Math.abs(o.lane - x) < 0.5) { o.hit = true; hits += 1; slow = 1; play('skid') }
      while (things.length && things[0].y > 1.2) things.shift()
    },
    draw() {
      const { w, h } = size()
      ctx.fillStyle = '#2f6b3a'; ctx.fillRect(0, 0, w, h)
      const rw = Math.min(w * 0.7, 300)
      const rx = (w - rw) / 2
      ctx.fillStyle = '#3a3c42'; ctx.fillRect(rx, 0, rw, h)
      ctx.fillStyle = '#f4f1e6'
      const off = (dist * 18) % 60
      for (const k of [1, 2]) for (let y = -60 + off; y < h; y += 60) ctx.fillRect(rx + (rw * k) / 3 - 2, y, 4, 30)
      const lx = (l) => rx + (rw * (l + 0.5)) / 3
      for (const o of things) {
        const cy = o.y * h
        if (o.kind === 'cone') { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(lx(o.lane), cy - 16); ctx.lineTo(lx(o.lane) - 12, cy + 12); ctx.lineTo(lx(o.lane) + 12, cy + 12); ctx.fill() }
        else { ctx.fillStyle = '#c9d6e0'; ctx.fillRect(lx(o.lane) - 16, cy - 26, 32, 52) }
      }
      const cy = h * 0.84
      ctx.fillStyle = slow > 0 && Math.floor(t * 10) % 2 ? '#f0c40099' : '#f0c400'
      ctx.fillRect(lx(x) - 17, cy - 28, 34, 56)
      ctx.fillStyle = '#1c1915'; ctx.fillRect(lx(x) - 12, cy - 18, 24, 12)
      ctx.fillStyle = '#fff'; ctx.font = '800 16px Figtree, system-ui, sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(`${Math.max(0, T - t).toFixed(1)} s`, 12, 24)
      ctx.textAlign = 'right'; ctx.fillText(`${Math.round(dist)} m`, w - 12, 24)
    },
    skip() { return { kicker: 'Race over', big: '4th of 6', note: 'You let go of the wheel. Fourth, and a photo.', score: 0.5, place: 4, dist: 200, hits: 0, skipped: true } },
    stop() { motor.stop() },
  }
  return api
}

// ---------- a study moment (tap on the beat) ----------
function focus({ ctx, size, canvas, end }) {
  const BEATS = 8
  const GAP = 0.95
  let t = -0.6
  let n = 0
  let tapped = false
  let perfect = 0
  let good = 0
  let flash = ''
  let flashT = 0
  let api = null
  let ticked = -1
  const phase = () => (t - n * GAP) / GAP // 0..1 through the current beat; the ring lands at 1
  canvas.addEventListener('pointerdown', () => {
    if (t < 0 || n >= BEATS || tapped) return
    const off = Math.abs(1 - phase()) * GAP
    tapped = true
    if (off < 0.12) { perfect += 1; flash = 'Perfect'; play('pencil') } else if (off < 0.26) { good += 1; flash = 'Good'; play('page') } else { flash = 'Lost the line'; play('miss') }
    flashT = 0.6
  })
  api = {
    info: () => ({ beat: n, due: t >= 0 && n < BEATS && !tapped && Math.abs(1 - phase()) * GAP < 0.1, perfect, good }),
    step(dt) {
      t += dt
      flashT = Math.max(0, flashT - dt)
      if (t < 0) return
      if (Math.floor(t / GAP) !== ticked && t - Math.floor(t / GAP) * GAP > GAP * 0.8) { ticked = Math.floor(t / GAP); play('tok') }
      if (t >= (n + 1) * GAP + 0.26) {
        if (!tapped) { flash = 'Missed one'; flashT = 0.5 }
        n += 1
        tapped = false
        if (n >= BEATS) {
          const acc = (perfect + good * 0.6) / BEATS
          end({ kicker: 'Pages done', big: `${perfect + good} of ${BEATS}`, note: acc > 0.8 ? 'Every line went in. That is the good kind of tired.' : acc > 0.45 ? 'Most of it stuck. The rest can wait for coffee.' : 'Your eyes read it. Your brain was elsewhere.', score: acc, perfect, good })
        }
      }
    },
    draw() {
      const { w, h } = size()
      ctx.fillStyle = '#20283a'; ctx.fillRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      // the open book
      ctx.fillStyle = '#f4efe4'; ctx.fillRect(cx - 110, cy - 70, 104, 140); ctx.fillRect(cx + 6, cy - 70, 104, 140)
      ctx.fillStyle = '#c9bfa8'
      for (let i = 0; i < 7; i++) { ctx.fillRect(cx - 98, cy - 52 + i * 18, 80, 3); ctx.fillRect(cx + 18, cy - 52 + i * 18, 80, 3) }
      ctx.strokeStyle = '#f0c400'; ctx.lineWidth = 5
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.stroke()
      if (t >= 0 && n < BEATS) {
        const r = 34 + (1 - Math.min(1, phase())) * 150
        ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.fillStyle = '#fff'; ctx.font = '800 16px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`Page ${Math.min(BEATS, n + 1)} of ${BEATS}`, cx, 28)
      if (flashT > 0) { ctx.fillStyle = '#f0c400'; ctx.font = '800 22px Figtree, system-ui, sans-serif'; ctx.fillText(flash, cx, h - 30) }
    },
    skip() { return { kicker: 'Pages done', big: 'Skimmed', note: 'You skimmed it. Some of it stayed.', score: 0.5, perfect: 0, good: 0, skipped: true } },
  }
  return api
}

// ---------- a set at the gym ----------
function reps({ ctx, size, canvas, end }) {
  const REPS = 8
  let t = 0
  let n = 0
  let goodReps = 0
  let pos = 0
  let dir = 1
  let rate = 0.9
  let flash = ''
  let flashT = 0
  let cool = 0
  let api = null
  const band = () => ({ lo: 0.62 - n * 0.012, hi: 0.86 - n * 0.02 })
  canvas.addEventListener('pointerdown', () => {
    if (n >= REPS || cool > 0) return
    const b = band()
    const ok = pos >= b.lo && pos <= b.hi
    if (ok) { goodReps += 1; flash = 'Clean rep'; play('clank'); setTimeout(() => play('breath'), 180) } else { flash = 'Wobbly'; play('miss') }
    flashT = 0.6
    n += 1
    cool = 0.35
    rate += 0.12
    if (n >= REPS) {
      const q = goodReps / REPS
      setTimeout(() => end({ kicker: 'Set done', big: `${goodReps} of ${REPS}`, note: q > 0.75 ? 'Clean reps. Brad nods. That is a lot, from Brad.' : q > 0.4 ? 'Some clean, some wobbly. Rest is a set too.' : 'Form first, then the weight. Next time.', score: q, good: goodReps }), 400)
    }
  })
  api = {
    info: () => { const b = band(); return { rep: n, good: goodReps, due: n < REPS && cool <= 0 && pos > b.lo + 0.03 && pos < b.hi - 0.03 } },
    step(dt) {
      t += dt
      cool = Math.max(0, cool - dt)
      flashT = Math.max(0, flashT - dt)
      pos += dir * rate * dt
      if (pos > 1) { pos = 1; dir = -1 } else if (pos < 0) { pos = 0; dir = 1 }
    },
    draw() {
      const { w, h } = size()
      ctx.fillStyle = '#20262e'; ctx.fillRect(0, 0, w, h)
      const x = w / 2 - 24
      const top = 50
      const H = h - 110
      ctx.fillStyle = '#3a4250'; ctx.fillRect(x, top, 48, H)
      const b = band()
      ctx.fillStyle = '#2fa35a'; ctx.fillRect(x, top + H * (1 - b.hi), 48, H * (b.hi - b.lo))
      const y = top + H * (1 - pos)
      ctx.fillStyle = '#f0c400'; ctx.fillRect(x - 40, y - 6, 128, 12)
      ctx.fillStyle = '#1c1915'; ctx.fillRect(x - 52, y - 16, 14, 32); ctx.fillRect(x + 86, y - 16, 14, 32)
      ctx.fillStyle = '#fff'; ctx.font = '800 16px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(`Rep ${Math.min(REPS, n + 1)} of ${REPS} · clean ${goodReps}`, w / 2, 28)
      if (flashT > 0) { ctx.fillStyle = '#f0c400'; ctx.font = '800 22px Figtree, system-ui, sans-serif'; ctx.fillText(flash, w / 2, h - 24) }
    },
    skip() { return { kicker: 'Set done', big: 'Half a set', note: 'You did the easy half. The bar noticed.', score: 0.5, good: 4, skipped: true } },
  }
  return api
}

const GAMES = { bowling, race, focus, reps }
