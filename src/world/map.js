import { actionsAt, actionState } from '../engine/sim.js'
import { doorPoint } from './layout.js'
import { areaCounts } from '../presence.js'
import { CITY, LOTS, PARTS, RIDE_EXTRA, RIDE_WAIT, RING_OUT, SPAWN, STOPS, WAVE2, lotOf, moneyOf, partAt, partOf, waysTo } from '../city/plan.js'
const PAD = 8
// Short names so labels never run into each other on a phone.
const SHORT = {
  'Engineering Lecture Venue': 'Eng', 'Science Lecture Venue': 'Science', 'Law Lecture Venue': 'Law',
  'Health Sciences Lecture Venue': 'Health', 'Greenway Grocer': 'Greenway', 'Sports Centre': 'Sports',
  'Cafeteria': 'Caf', 'Main Gate': 'Gate', 'Bus Stop': 'Bus',
}

// The map's frame: every building fits, with a little margin.
function frameOf(buildings) {
  if (!buildings.length) return { x: -60, z: -60, w: 120, h: 120 }
  const minX = Math.min(...buildings.map((b) => b.minX)) - PAD
  const maxX = Math.max(...buildings.map((b) => b.minX + b.w)) + PAD
  const minZ = Math.min(...buildings.map((b) => b.minZ)) - PAD
  const maxZ = Math.max(...buildings.map((b) => b.minZ + b.d)) + PAD
  return { x: minX, z: minZ, w: maxX - minX, h: maxZ - minZ }
}
// (job I) the campus's buildings as the campus scene last laid them out: the whole map shows them when zoomed in
let campusPlaces = []
// A campus place picked on the whole map while you are in SunnyBay: the campus walks you there once you are back.
let campusGoal = ''
export function takeCampusGoal() { const g = campusGoal; campusGoal = ''; return g }
const KIND_ICON = {
  hub: '◆',
  food: '🍽',
  transit: '🚌',
  shop: '🛒',
  venue: '⚽',
  study: '📖',
  lecture: '🎓',
  residence: '⌂',
}

function available(district, run, placeId) {
  return actionsAt(district, run, placeId).filter((action) => !actionState(district, run, action).hidden)
}

export function createCampusMap(host) {
  const overlay = document.createElement('div')
  overlay.className = 'map-overlay'
  overlay.hidden = true
  overlay.innerHTML = `
    <div class="map-card">
      <div class="map-head"><h2>Campus map</h2><span class="map-head-btns"><button type="button" data-map="city">Whole map</button> <button type="button" data-map="close">Close</button></span></div>
      <div class="map-canvas"></div>
      <aside class="map-detail" hidden>
        <h3></h3>
        <p class="blurb"></p>
        <p class="count"></p>
        <div class="stack">
          <button type="button" data-map="walk">Walk here</button>
          <button type="button" data-map="shut">Close</button>
        </div>
      </aside>
    </div>`
  const minimap = document.createElement('button')
  minimap.className = 'minimap'
  minimap.type = 'button'
  minimap.setAttribute('aria-label', 'Open the campus map')
  minimap.innerHTML = '<canvas width="140" height="140"></canvas>'
  host.append(overlay, minimap)
  const stage = overlay.querySelector('.map-canvas')
  const detail = overlay.querySelector('.map-detail')
  const ctx = minimap.querySelector('canvas').getContext('2d')
  let buildings = []
  let paths = []
  let district = null
  let run = null
  let active = new Set()
  let onGo = null
  let onWalk = () => {}
  let onCity = () => {}
  let selected = null

  function placeButtons() {
    const f = frameOf(buildings)
    // The stage keeps the map's own shape, so pins sit exactly on their buildings.
    stage.style.aspectRatio = `${f.w} / ${f.h}`
    stage.innerHTML = `<svg viewBox="${f.x} ${f.z} ${f.w} ${f.h}" class="map-svg" aria-hidden="true">
      <rect x="${f.x}" y="${f.z}" width="${f.w}" height="${f.h}" fill="#6ea84e"></rect>
    </svg>`
    const svg = stage.querySelector('svg')
    for (const path of paths) {
      for (let i = 1; i < path.length; i += 1) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', path[i - 1].x)
        line.setAttribute('y1', path[i - 1].z)
        line.setAttribute('x2', path[i].x)
        line.setAttribute('y2', path[i].z)
        line.setAttribute('stroke', '#e4d2b0')
        line.setAttribute('stroke-width', '3.2')
        line.setAttribute('stroke-linecap', 'round')
        svg.append(line)
      }
    }
    // Pin spots in % of the map. The Quad stays on its building; neighbours move aside
    // so every pin has room for a 44px tap. The buildings themselves are not moved.
    const spot = new Map(buildings.map((b) => [b.id, { x: ((b.x - f.x) / f.w) * 100, y: ((b.z - f.z) / f.h) * 100 }]))
    const minGap = 14
    const clamp = (n) => Math.max(8, Math.min(92, n))
    for (let pass = 0; pass < 10; pass++) {
      for (const a of buildings) for (const b of buildings) {
        if (a.id >= b.id) continue
        const p = spot.get(a.id)
        const q = spot.get(b.id)
        const dx = q.x - p.x
        const dy = q.y - p.y
        const d = Math.hypot(dx, dy)
        if (d >= minGap) continue
        const ux = d ? dx / d : 1
        const uy = d ? dy / d : 0
        const push = minGap - d
        if (a.id === 'quad') { q.x = clamp(q.x + ux * push); q.y = clamp(q.y + uy * push) }
        else if (b.id === 'quad') { p.x = clamp(p.x - ux * push); p.y = clamp(p.y - uy * push) }
        else {
          p.x = clamp(p.x - ux * push / 2); p.y = clamp(p.y - uy * push / 2)
          q.x = clamp(q.x + ux * push / 2); q.y = clamp(q.y + uy * push / 2)
        }
      }
    }
    // A label goes above its icon when a neighbour sits just below, so the words don't stack.
    const above = new Set()
    for (const a of buildings) for (const b of buildings) {
      if (a.id >= b.id) continue
      const p = spot.get(a.id)
      const q = spot.get(b.id)
      if (Math.abs(p.x - q.x) > 18 || Math.abs(p.y - q.y) > 9) continue
      above.add(p.y <= q.y ? a.id : b.id)
    }
    for (const building of buildings) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      line.setAttribute('x', building.minX)
      line.setAttribute('y', building.minZ)
      line.setAttribute('width', building.w)
      line.setAttribute('height', building.d)
      line.setAttribute('rx', '1.2')
      line.setAttribute('fill', active.has(building.id) ? '#f0c400' : '#fffaf2')
      svg.append(line)
      const button = document.createElement('button')
      const hub = building.id === 'quad'
      button.type = 'button'
      button.className = `map-pin${hub ? ' hub' : ''}${above.has(building.id) ? ' above' : ''}${active.has(building.id) ? ' live' : ''}`
      button.style.left = `${hub ? spot.get(building.id).x : Math.max(6, Math.min(94, spot.get(building.id).x))}%`
      button.style.top = `${hub ? spot.get(building.id).y : Math.max(5, Math.min(95, spot.get(building.id).y))}%`
      button.setAttribute('aria-label', hub ? 'The Quad' : building.name)
      button.innerHTML = `<span class="ico">${hub ? KIND_ICON.hub : (KIND_ICON[building.kind] || '•')}</span><span class="lbl">${hub ? 'The Quad' : (SHORT[building.name] || building.name.replace(/ House$/, ''))}</span>`
      button.dataset.place = building.id
      button.addEventListener('click', () => { close(); onGo ? onGo(building.id) : select(building) })
      stage.append(button)
    }
    const you = document.createElement('div')
    you.className = 'map-you'
    stage.append(you)
  }

  function select(building) {
    selected = building
    const place = district.places.find((item) => item.id === building.id)
    const count = available(district, run, building.id).length
    detail.hidden = false
    detail.querySelector('h3').textContent = building.name
    detail.querySelector('.blurb').textContent = place?.blurb || ''
    detail.querySelector('.count').textContent = count === 1 ? '1 thing to do now' : `${count} things to do now`
  }

  function drawYou(x, z, facing) {
    const you = stage.querySelector('.map-you')
    if (!you) return
    const f = frameOf(buildings)
    you.style.left = `${((x - f.x) / f.w) * 100}%`
    you.style.top = `${((z - f.z) / f.h) * 100}%`
    you.style.transform = `translate(-50%, -50%) rotate(${facing}rad)`
  }

  overlay.addEventListener('click', (event) => {
    const act = event.target.closest('[data-map]')?.dataset.map
    if (act === 'close' || act === 'shut') close()
    if (act === 'city') { close(); onCity() }
    if (act === 'walk' && selected) {
      const door = doorPoint(selected)
      close()
      onWalk(door.x, door.z)
    }
  })
  minimap.addEventListener('click', () => open())

  function open() {
    overlay.hidden = false
    detail.hidden = true
    selected = null
    placeButtons()
  }
  function close() {
    overlay.hidden = true
  }

  return {
    open,
    close,
    isOpen: () => !overlay.hidden,
    setHandler(fn) { onWalk = fn },
    setGo(fn) { onGo = fn },
    setCity(fn) { onCity = fn },
    sync(next) {
      if (next?.buildings) campusPlaces = next.buildings
      buildings = next.buildings
      paths = next.paths || []
      district = next.district
      run = next.run
      active = next.active
      const low = localStorage.getItem('mzansiville.quality') === 'low'
      minimap.hidden = low
      if (!overlay.hidden) {
        placeButtons()
        if (selected) select(buildings.find((item) => item.id === selected.id) || selected)
      }
    },
    frame(player) {
      if (!overlay.hidden) drawYou(player.x, player.z, player.facing)
      if (minimap.hidden) return
      const size = 140
      const radius = 36
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = '#1c1915'
      ctx.beginPath()
      ctx.arc(70, 70, 66, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#6ea84e'
      ctx.beginPath()
      ctx.arc(70, 70, 60, 0, Math.PI * 2)
      ctx.fill()
      for (const building of buildings) {
        const px = 70 + ((building.x - player.x) / radius) * 60
        const py = 70 + ((building.z - player.z) / radius) * 60
        if (Math.hypot(px - 70, py - 70) > 58) continue
        ctx.fillStyle = active.has(building.id) ? '#f0c400' : '#fffaf2'
        ctx.fillRect(px - 3, py - 3, 6, 6)
      }
      ctx.save()
      ctx.translate(70, 70)
      ctx.rotate(player.facing)
      ctx.fillStyle = '#1c1915'
      ctx.beginPath()
      ctx.moveTo(0, -7)
      ctx.lineTo(5, 6)
      ctx.lineTo(-5, 6)
      ctx.fill()
      ctx.restore()
    },
  }
}

// ---------- the city view: "SunnyBay" (City job A) ----------
// District outlines and names, a pin for each of the 18 places (and one for the campus), small dots for the wave 2
// plots, where you are, and how many players are in each district. A tap on a pin shows the ways there with the
// price and the time: walking (always, free), a minibus taxi, the car. The campus map above stays the close-up.
// api: where() -> { x, z, facing, campus }, run() -> the save's run, go(way, target) with way 'walk' | 'taxi' |
// 'drive' and target a lot's id or 'campus', campusMap() (optional: opens the close-up).
const CM = { x: -372, z: -322, w: 702, h: 674 }
let cityCss = false
function cityStyle() {
  if (cityCss) return
  cityCss = true
  const style = document.createElement('style')
  style.textContent = `
.cm-overlay{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:#efe4cff5;font-family:Figtree,system-ui,sans-serif;color:#1c1915}
.cm-overlay[hidden]{display:none}
.cm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 8px}
.cm-head .cm-title{display:flex;align-items:center;gap:8px}
.cm-head h2{margin:0;font:800 22px Graduate,Figtree,system-ui,sans-serif}
.cm-head p{margin:0;font-size:14px;color:#6b5d48}
.cm-head button,.cm-ways button{min-height:44px;border:0;border-radius:22px;padding:0 16px;font:800 14px Figtree,system-ui,sans-serif;cursor:pointer}
.cm-head button{background:#22143b;color:#fff}
.cm-head .cm-campus{background:#f0c400;color:#1c1915;margin-right:6px}
.cm-back{width:44px!important;padding:0!important;background:#fffaf0!important;color:#1c1915!important;border:1.5px solid #e2d4b8!important;font-size:18px!important}
.cm-body{flex:0 1 auto;min-height:0;display:flex;align-items:flex-start;justify-content:center;padding:0 8px}
.cm-stage{position:relative;width:100%;max-width:min(560px,calc((100vh - 384px) * 1.04));aspect-ratio:${CM.w} / ${CM.h};border-radius:16px;overflow:hidden;border:1.5px solid #d9c9a8;background:#7f9a58}
.cm-stage svg{position:absolute;inset:0;width:100%;height:100%}
.cm-stage text{font:800 26px Figtree,system-ui,sans-serif;paint-order:stroke;stroke:#fffaf0;stroke-width:6px;stroke-linejoin:round}
.cm-stage text.n{font-size:20px;font-weight:700}
.cm-stage .cm-names{z-index:4;pointer-events:none}
.cm-pin{position:absolute;transform:translate(-50%,-50%);width:44px;height:44px;border:0;background:none;padding:0;cursor:pointer;display:grid;place-items:center}
.cm-pin span{width:30px;height:30px;border-radius:50%;background:#fffaf0;border:2px solid #22143b;display:grid;place-items:center;font-size:16px;box-shadow:0 2px 0 #0003}
.cm-pin.on span{background:#f0c400;transform:scale(1.18)}
.cm-pin.hub span{background:#22143b;border-color:#f0c400;width:36px;height:36px;font-size:18px}
.cm-you{position:absolute;width:0;height:0;pointer-events:none;z-index:3}
.cm-you::before{content:'';position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:#e8497a;border:3px solid #fff;box-shadow:0 0 0 3px #e8497a55}
.cm-detail{margin:8px auto 0;box-sizing:border-box;padding:12px 14px calc(env(safe-area-inset-bottom,0px) + 12px);border-radius:18px;background:#fffaf0;border:1.5px solid #e2d4b8;box-shadow:0 8px 24px #0003}
.cm-detail[hidden]{display:none}
.cm-detail h3{margin:0;font:800 19px Graduate,Figtree,system-ui,sans-serif}
.cm-detail .cm-sub{margin:2px 0 10px;font-size:14px;color:#6b5d48}
.cm-detail .cm-sub b{display:inline-block;padding:2px 8px;border-radius:999px;background:#f0c400;color:#1c1915;font-size:14px}
.cm-ways{display:flex;flex-direction:column;gap:6px}
.cm-ways button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border-radius:14px;background:#22143b;color:#fff;text-align:left;padding:6px 14px;font-size:15px}
.cm-ways button small{display:block;font-size:14px;font-weight:600;opacity:.85}
.cm-ways button b{white-space:nowrap;color:#f0c400;font-size:14px}
.cm-ways button:disabled{background:#e9dfc8;color:#6b5d48;cursor:default}
.cm-ways button:disabled b{color:#6b5d48}
.cm-hint{margin:8px auto 0;width:min(calc(100% - 24px),420px);text-align:center;font-size:14px;color:#6b5d48}
.cm-hint[hidden]{display:none}
.cm-world{position:absolute;inset:0;transform-origin:0 0;touch-action:none}
.cm-stage{touch-action:none;cursor:grab}
.cm-pin,.cm-cpin,.cm-stop,.cm-you{transform:translate(-50%,-50%) scale(var(--inv,1))}
.cm-pin i,.cm-cpin i,.cm-stop i{position:absolute;top:calc(100% - 6px);left:50%;transform:translateX(-50%);white-space:nowrap;font:800 11px/1.15 Figtree,system-ui,sans-serif;font-style:normal;color:#1c1915;background:#fffaf0e8;border:1px solid #d9c9a8;border-radius:6px;padding:1px 5px;pointer-events:none;display:none}
.cm-overlay[data-zoom="close"] .cm-pin i,.cm-overlay[data-zoom="close"] .cm-stop i,.cm-cpin i{display:block}
.cm-pin.hub i{display:block}
.cm-cpin{position:absolute;width:40px;height:40px;border:0;background:none;padding:0;cursor:pointer;display:none;place-items:center}
.cm-overlay[data-zoom="close"] .cm-cpin{display:grid}
.cm-cpin span{width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid #2f6a3a;display:grid;place-items:center;font-size:12px}
.cm-cpin.on span{background:#f0c400}
.cm-stop{position:absolute;width:0;height:0;pointer-events:none;display:none}
.cm-overlay[data-zoom="close"] .cm-stop{display:block}
.cm-overlay[data-zoom="close"] .cm-names{opacity:.4}
.cm-you{z-index:5}
.cm-you::after{content:'You are here';position:absolute;left:12px;top:-11px;white-space:nowrap;font:800 12px/1 Figtree,system-ui,sans-serif;color:#fff;background:#c2185b;border-radius:8px;padding:4px 6px}
.cm-body{flex-direction:column;align-items:center}
.cm-zoom{display:flex;gap:8px;justify-content:center;margin-top:8px;flex-wrap:wrap}
.cm-zoom button{width:44px;height:44px;border-radius:22px;border:1.5px solid #d9c9a8;background:#fffaf0;color:#1c1915;font:800 20px Figtree,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 0 #0002}
.cm-zoom button.wide{width:auto;padding:0 14px;font-size:14px}`
  document.head.append(style)
}

// One overlay for the whole page: the campus scene and the city scene each open it with their own api.
let cityMapUi = null
export function createCityMap(parent, api) {
  cityMapUi ||= buildCityMap(parent)
  const ui = cityMapUi
  return { open: () => ui.open(api), close: () => ui.close(), isOpen: () => ui.isOpen(), select: (id) => ui.select(id) }
}
function buildCityMap(parent) {
  let api = null
  cityStyle()
  const overlay = document.createElement('div')
  overlay.className = 'cm-overlay'
  overlay.hidden = true
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', `${CITY.name} map`)
  overlay.innerHTML = `<div class="cm-head"><div class="cm-title"><button type="button" class="cm-back" data-cm="close" aria-label="Back">←</button><div><h2>UMzansi &amp; ${CITY.name}</h2><p data-cm-here></p></div></div><span><button type="button" class="cm-campus" data-cm="campus" hidden>Close-up</button><button type="button" data-cm="close">Close</button></span></div>
    <div class="cm-body"><div class="cm-stage"><div class="cm-world"></div></div><div class="cm-zoom"><button type="button" data-cm="in" aria-label="Zoom in">+</button><button type="button" data-cm="out" aria-label="Zoom out">−</button><button type="button" class="wide" data-cm="campus-zoom">UMzansi</button><button type="button" class="wide" data-cm="me">Where I am</button></div></div>
    <p class="cm-hint">Tap a place to go there. Zoom in for every name.</p>
    <aside class="cm-detail" hidden></aside>`
  parent.append(overlay)
  const box = overlay.querySelector('.cm-stage')
  const stage = overlay.querySelector('.cm-world') // (job I: everything drawn lives in the world layer, which zooms and pans)
  const detail = overlay.querySelector('.cm-detail')
  const hint = overlay.querySelector('.cm-hint')
  let selected = null
  let timer = 0
  const px = (x) => ((x - CM.x) / CM.w) * 100
  const pz = (z) => ((z - CM.z) / CM.h) * 100
  const pins = [{ id: 'campus', name: 'University of Mzansi', short: 'UMzansi', icon: '🎓', part: 'campus', door: { x: 0, z: 0 }, hub: true }, ...LOTS]

  function draw() {
    const rect = (r, fill, extra = '') => `<rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" fill="${fill}" ${extra}></rect>`
    const river = CITY.river.rect
    let svg = `<svg viewBox="${CM.x} ${CM.z} ${CM.w} ${CM.h}" aria-hidden="true">`
    svg += rect([296, CM.z, CM.x + CM.w, CM.z + CM.h], '#2f86b3')
    svg += rect([250, CM.z, 296, CM.z + CM.h], '#f3e2b0')
    for (const p of PARTS) svg += rect(p.rect.map((v, i) => (p.id === 'beachfront' && i === 2 ? 250 : v)), p.ground, `stroke="${p.ink}" stroke-width="3" stroke-dasharray="10 7" rx="6"`)
    svg += rect([river[0], CM.z, river[2], CM.z + CM.h], '#3f8fb5')
    for (const b of CITY.bridges) svg += rect([river[0] - 3, b.z - 6, river[2] + 3, b.z + 6], '#8f8a80')
    svg += rect([-362, CM.z, -344, 350], '#34353a') + rect([-362, 332, 296, 350], '#34353a')
    for (const r of CITY.roads) svg += rect(r.rect, '#4a4b50')
    svg += `<circle cx="0" cy="0" r="${RING_OUT - 3.5}" fill="#6ea84e" stroke="#4a4b50" stroke-width="7"></circle><rect x="-4" y="88" width="8" height="26" fill="#4a4b50"></rect>`
    for (const l of WAVE2) svg += `<circle cx="${l.x}" cy="${l.z}" r="6" fill="#22143b" opacity=".35"></circle>`
    // (job I) the taxis' round: the gate on campus to every stop, dashed yellow
    const loop = ['gate', 'town', 'beachfront', 'suburbs', 'township', 'rank'].map((id) => STOPS.find((x) => x.id === id)).filter(Boolean)
    if (loop.length > 1) svg += `<polyline points="${[...loop, loop[0]].map((x) => `${x.x},${x.z}`).join(' ')}" fill="none" stroke="#f0c400" stroke-width="4" stroke-dasharray="9 7" opacity=".9"></polyline>`
    for (const s of STOPS) svg += `<rect x="${s.x - 6}" y="${s.z - 6}" width="12" height="12" rx="3" fill="#f0c400" stroke="#22143b" stroke-width="2"></rect>`
    // (job I) the campus's buildings, small, inside the ring
    for (const b of campusPlaces) svg += `<rect x="${b.minX}" y="${b.minZ}" width="${b.w}" height="${b.d}" rx="1.2" fill="#fffaf2" opacity=".85"></rect>`
    svg += '</svg>'
    stage.innerHTML = svg
    // district names (and how many players are there), each in a corner of its outline that no pin uses
    const LABEL = { campus: [0, -78, 'middle'], town: [142, 318, 'end'], suburbs: [0, -276, 'middle'], beachfront: [200, -270, 'middle'], township: [-250, -276, 'middle'], industrial: [-250, 318, 'middle'] }
    let names = `<svg viewBox="${CM.x} ${CM.z} ${CM.w} ${CM.h}" class="cm-names" aria-hidden="true">`
    for (const p of PARTS) {
      const [lx, lz, anchor] = LABEL[p.id]
      const lines = p.id === 'beachfront' ? ['Beach', 'front'] : [p.name]
      lines.forEach((t, i) => { names += `<text x="${lx}" y="${lz + i * 26}" text-anchor="${anchor}" fill="${p.ink}">${t}</text>` })
      names += `<text class="n" data-count="${p.id}" x="${lx}" y="${lz + lines.length * 26 - 2 - (lz > 300 ? 50 : 0)}" text-anchor="${anchor}" fill="${p.ink}"></text>`
    }
    stage.insertAdjacentHTML('beforeend', names + '</svg>')
    // pins: at their place, pushed apart a little so each keeps a 44 px tap
    const spot = new Map(pins.map((l) => [l.id, { x: px(l.door.x), y: pz(l.door.z) }]))
    const gap = Math.min(13, (40 / Math.max(1, stage.clientWidth)) * 100)
    for (let pass = 0; pass < 12; pass++) for (const a of pins) for (const b of pins) {
      if (a.id >= b.id) continue
      const p = spot.get(a.id)
      const q = spot.get(b.id)
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.hypot(dx, dy)
      if (d >= gap) continue
      const ux = d ? dx / d : 1
      const uy = d ? dy / d : 0
      const push = (gap - d) / 2
      if (!a.hub) { p.x -= ux * push; p.y -= uy * push }
      if (!b.hub) { q.x += ux * push; q.y += uy * push }
    }
    for (const l of pins) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `cm-pin${l.hub ? ' hub' : ''}`
      b.dataset.pin = l.id
      b.style.left = `${Math.max(5, Math.min(95, spot.get(l.id).x))}%`
      b.style.top = `${Math.max(5, Math.min(95, spot.get(l.id).y))}%`
      b.setAttribute('aria-label', l.name)
      b.innerHTML = `<span>${l.icon || '•'}</span><i>${l.hub ? 'UMzansi' : l.name}</i>`
      stage.append(b)
    }
    // (job I) the taxi stops by name, and every campus place (shown when zoomed in)
    for (const st of STOPS) {
      const n = document.createElement('div')
      n.className = 'cm-stop'
      n.style.left = `${px(st.x)}%`
      n.style.top = `${pz(st.z + 9)}%`
      n.innerHTML = `<i>\u{1F690} ${st.name}</i>`
      stage.append(n)
    }
    for (const c of campusPlaces) {
      const at = doorPoint(c)
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'cm-cpin'
      b.dataset.cpin = c.id
      b.style.left = `${px(at.x)}%`
      b.style.top = `${pz(at.z)}%`
      const label = c.id === 'quad' ? 'The Quad' : SHORT[c.name] || c.name.replace(/ House$/, '')
      b.setAttribute('aria-label', c.id === 'quad' ? 'The Quad' : c.name)
      b.innerHTML = `<span>${c.id === 'quad' ? KIND_ICON.hub : KIND_ICON[c.kind] || '•'}</span><i>${label}</i>`
      stage.append(b)
    }
    const you = document.createElement('div')
    you.className = 'cm-you'
    stage.append(you)
    place()
  }
  // ---- zoom and pan (job I): 1 = the whole map; names show from 1.9; drag to move about ----
  const view = { s: 1, tx: 0, ty: 0 }
  function applyView() {
    const W = box.clientWidth || 1
    const H = box.clientHeight || 1
    view.s = Math.max(1, Math.min(5, view.s))
    view.tx = Math.min(0, Math.max(W - W * view.s, view.tx))
    view.ty = Math.min(0, Math.max(H - H * view.s, view.ty))
    stage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`
    stage.style.setProperty('--inv', String(1 / view.s))
    overlay.dataset.zoom = view.s >= 1.9 ? 'close' : 'far'
    overlay.dataset.scale = view.s.toFixed(2)
  }
  function zoomAt(s, cx, cy) {
    const k = Math.max(1, Math.min(5, s)) / view.s
    view.tx = cx - (cx - view.tx) * k
    view.ty = cy - (cy - view.ty) * k
    view.s *= k
    applyView()
  }
  function centerOn(x, z, s) {
    view.s = s
    view.tx = box.clientWidth / 2 - (px(x) / 100) * box.clientWidth * s
    view.ty = box.clientHeight / 2 - (pz(z) / 100) * box.clientHeight * s
    applyView()
  }
  let drag = null
  let dragged = false
  box.addEventListener('pointerdown', (e) => { if (e.target.closest('.cm-zoom')) return; drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; dragged = false })
  box.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!dragged && Math.hypot(dx, dy) < 8) return
    dragged = true
    view.tx = drag.tx + dx
    view.ty = drag.ty + dy
    applyView()
  })
  const endDrag = () => { drag = null; setTimeout(() => { dragged = false }, 0) }
  box.addEventListener('pointerup', endDrag)
  box.addEventListener('pointercancel', endDrag)
  box.addEventListener('wheel', (e) => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(view.s * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - r.left, e.clientY - r.top) }, { passive: false })
  function place() {
    const w = api.where()
    const you = stage.querySelector('.cm-you')
    if (you) { you.style.left = `${px(w.x)}%`; you.style.top = `${pz(w.z)}%` }
    const part = w.campus ? partOf('campus') : partAt(w.x, w.z)
    overlay.querySelector('[data-cm-here]').textContent = `You are in ${part.id === 'campus' ? 'the Campus district' : part.name} · R${moneyOf(api.run())}`
    overlay.dataset.part = part.id
  }
  function counts() {
    areaCounts(PARTS.map((p) => p.id)).then((got) => {
      if (!got || overlay.hidden) return
      for (const p of PARTS) {
        const node = stage.querySelector(`[data-count="${p.id}"]`)
        if (node) node.textContent = got[p.id] ? `${got[p.id]} here` : ''
      }
      overlay.dataset.counts = JSON.stringify(got)
    })
  }
  // (job I) a campus place: on campus, walk there; in SunnyBay, the ways back to campus, then the campus walks you on
  function selectCampus(id) {
    const c = campusPlaces.find((b) => b.id === id)
    if (!c) return
    const w = api.where()
    const name = c.id === 'quad' ? 'The Quad' : c.name
    for (const b of stage.querySelectorAll('.cm-pin, .cm-cpin')) b.classList.toggle('on', b.dataset.cpin === id)
    selected = `campus:${id}`
    let rows = ''
    if (w.campus) rows = `<button type="button" data-way="campus-walk"><span>\u{1F6B6} Walk there<small>On campus</small></span><b>Free</b></button>`
    else {
      const ways = waysTo(api.run(), w, { x: SPAWN.x, z: SPAWN.z, part: 'campus' })
      rows += `<button type="button" data-way="walk"><span>\u{1F6B6} Walk<small>Back through the Main Gate, then to ${name}</small></span><b>Free · about ${ways.walk.minutes} min</b></button>`
      if (ways.taxi && !ways.taxi.short) rows += `<button type="button" data-way="taxi"><span>\u{1F690} Minibus taxi<small>To the campus gate, then on foot</small></span><b>R${ways.taxi.fare} · ${ways.taxi.minutes} min</b></button>`
    }
    detail.innerHTML = `<h3>${c.id === 'quad' ? KIND_ICON.hub : KIND_ICON[c.kind] || '•'} ${name}</h3><p class="cm-sub">Campus district</p><div class="cm-ways">${rows}</div>`
    detail.hidden = false
    detail.dataset.pin = selected
    hint.hidden = true
  }
  function select(id) {
    const w = api.where()
    const run = api.run()
    const lot = id === 'campus' ? null : lotOf(id)
    const dest = lot ? { x: lot.door.x, z: lot.door.z, part: lot.part, lot: lot.id } : { x: SPAWN.x, z: SPAWN.z, part: 'campus' }
    selected = id
    for (const b of stage.querySelectorAll('.cm-pin')) b.classList.toggle('on', b.dataset.pin === id)
    const ways = waysTo(run, w, dest)
    const here = !lot && w.campus
    let rows = ''
    if (here) rows = '<button type="button" data-way="close"><span>You are on campus<small>The campus map is the close-up</small></span><b>Campus map</b></button>'
    else {
      rows += `<button type="button" data-way="walk"><span>🚶 Walk<small>${w.campus ? 'Out of the Main Gate, then on foot' : CITY.travel.lines.walk}</small></span><b>Free · about ${ways.walk.minutes} min</b></button>`
      if (ways.taxi) {
        const t = ways.taxi
        rows += t.short
          ? `<button type="button" disabled data-way="taxi"><span>🚐 Minibus taxi<small>You are R${t.short} short for this one. Walking is free.</small></span><b>R${t.fare}</b></button>`
          : `<button type="button" data-way="taxi"><span>🚐 Minibus taxi<small>${t.alight ? `Taxi to ${t.alight.name}, then a short walk` : `From ${t.stop.name}${t.dist > 9 ? ` (${t.dist} m from you)` : ''}`}</small></span><b>R${t.fare} · ${t.minutes} min</b></button>`
      }
      if (!w.campus && ways.taxi) { const fare = ways.taxi.fare + RIDE_EXTRA; const short = fare > moneyOf(run); rows += `<button type="button" data-way="request"${short ? ' disabled' : ''}><span>\u{1F695} Request a ride<small>${short ? `You are R${fare - moneyOf(run)} short` : `A taxi comes to you in about ${RIDE_WAIT} min`}</small></span><b>R${fare}</b></button>` }
      if (!ways.car) rows += `<button type="button" disabled data-way="drive"><span>🚗 Drive<small>${CITY.travel.lines.noCar}</small></span><b>R${CITY.travel.car.petrol}</b></button>`
      else if (!ways.car.here) rows += `<button type="button" disabled data-way="drive"><span>🚗 Drive<small>${CITY.travel.lines.carAway.replace('{place}', ways.car.parkedName)}</small></span><b>R${ways.car.fare}</b></button>`
      else if (ways.car.short) rows += `<button type="button" disabled data-way="drive"><span>🚗 Drive<small>Petrol is R${ways.car.fare}: you are R${ways.car.short} short.</small></span><b>R${ways.car.fare}</b></button>`
      else rows += `<button type="button" data-way="drive"><span>🚗 Drive<small>Your own car, parked outside when you arrive</small></span><b>R${ways.car.fare} · instant</b></button>`
    }
    const name = lot ? lot.name : 'University of Mzansi'
    detail.innerHTML = `<h3>${lot?.icon || '🎓'} ${name}</h3><p class="cm-sub">${dest.part === 'campus' ? 'Campus district' : partOf(dest.part).name}${lot ? ` · <b>${CITY.soon.title}</b>` : ''}</p><div class="cm-ways">${rows}</div>`
    detail.hidden = false
    detail.dataset.pin = id
    hint.hidden = true
  }
  overlay.addEventListener('click', (event) => {
    if (dragged) return
    const pin = event.target.closest('.cm-pin')
    if (pin) { select(pin.dataset.pin); return }
    const cp = event.target.closest('.cm-cpin')
    if (cp) { selectCampus(cp.dataset.cpin); return }
    const zoom = event.target.closest('[data-cm]')?.dataset.cm
    if (zoom === 'in' || zoom === 'out') { zoomAt(view.s * (zoom === 'in' ? 1.6 : 1 / 1.6), box.clientWidth / 2, box.clientHeight / 2); return }
    if (zoom === 'campus-zoom') { centerOn(0, 0, 2.9); return }
    if (zoom === 'me') { const w = api.where(); centerOn(w.x, w.z, Math.max(2.4, view.s)); return }
    const way = event.target.closest('[data-way]')
    if (way && !way.disabled && selected) {
      const target = selected
      close()
      if (way.dataset.way === 'close') api.campusMap?.()
      else if (way.dataset.way === 'campus-walk') api.goCampus?.(target.slice(7))
      else if (target.startsWith('campus:')) { campusGoal = target.slice(7); api.go(way.dataset.way, 'campus') }
      else api.go(way.dataset.way, target)
      return
    }
    const act = event.target.closest('[data-cm]')?.dataset.cm
    if (act === 'close') close()
    if (act === 'campus') { close(); api.campusMap?.() }
  })
  function open(next) {
    api = next
    overlay.hidden = false
    detail.hidden = true
    hint.hidden = false
    selected = null
    overlay.querySelector('.cm-campus').hidden = !(api.campusMap && api.where().campus)
    draw()
    view.s = 1; view.tx = 0; view.ty = 0
    requestAnimationFrame(applyView)
    counts()
    clearInterval(timer)
    timer = setInterval(() => { if (overlay.hidden) clearInterval(timer); else place() }, 500)
    // The phone's own back gesture closes the map too, same as Close (owner, 10 Nov).
    try { history.pushState({ ...history.state, cmMapOpen: true }, '') } catch { /* private mode, or no history api */ }
  }
  function close() {
    overlay.hidden = true
    clearInterval(timer)
    if (history.state?.cmMapOpen) { try { history.back() } catch { /* ignore */ } }
  }
  window.addEventListener('popstate', () => { if (!overlay.hidden && !history.state?.cmMapOpen) { overlay.hidden = true; clearInterval(timer) } })
  return { open, close, isOpen: () => !overlay.hidden, select }
}
