import { actionsAt, actionState } from '../engine/sim.js'
const PAD = 8
// Short names so labels never run into each other on a phone.
const SHORT = {
  'Engineering Lecture Venue': 'Engineering', 'Science Lecture Venue': 'Science', 'Law Lecture Venue': 'Law',
  'Health Sciences Lecture Venue': 'Health Sci', 'Other on-campus blocks': 'Other blocks', 'Main Bus Station': 'Bus station',
  'Off-campus res (bus home)': 'Off-campus res',
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
const KIND_ICON = {
  hub: '◆',
  food: '🍽',
  transit: '🚌',
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
      <div class="map-head"><h2>Campus map</h2><button type="button" data-map="close">Close</button></div>
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
    // Pin spots in % of the map; pins too close together are pushed apart so each stays tappable.
    const spot = new Map(buildings.map((b) => [b.id, { x: ((b.x - f.x) / f.w) * 100, y: ((b.z - f.z) / f.h) * 100 }]))
    const minGap = 12
    for (let pass = 0; pass < 6; pass++) {
      for (const a of buildings) for (const b of buildings) {
        if (a === b) continue
        const p = spot.get(a.id)
        const q = spot.get(b.id)
        const dx = q.x - p.x
        const dy = q.y - p.y
        const d = Math.hypot(dx, dy)
        if (d >= minGap) continue
        const push = (minGap - d) / 2
        const ux = d ? dx / d : 1
        const uy = d ? dy / d : 0
        p.x -= ux * push; p.y -= uy * push; q.x += ux * push; q.y += uy * push
      }
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
      button.type = 'button'
      button.className = `map-pin${active.has(building.id) ? ' live' : ''}`
      button.style.left = `${Math.max(6, Math.min(94, spot.get(building.id).x))}%`
      button.style.top = `${Math.max(5, Math.min(95, spot.get(building.id).y))}%`
      button.innerHTML = `<span class="ico">${KIND_ICON[building.kind] || '•'}</span><span class="lbl">${SHORT[building.name] || building.name}</span>`
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
    if (act === 'walk' && selected) {
      const door = { x: selected.x, z: selected.maxZ + 5 }
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
    sync(next) {
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
