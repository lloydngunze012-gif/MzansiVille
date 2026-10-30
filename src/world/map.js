import { actionsAt, actionState } from '../engine/sim.js'
import { WORLD_MAX, WORLD_MIN } from './layout.js'

const PAD = 22
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
  let onWalk = () => {}
  let selected = null

  function placeButtons() {
    const span = WORLD_MAX - WORLD_MIN + PAD * 2
    const origin = WORLD_MIN - PAD
    stage.innerHTML = `<svg viewBox="${origin} ${origin} ${span} ${span}" class="map-svg" aria-hidden="true">
      <rect x="${origin}" y="${origin}" width="${span}" height="${span}" fill="#6ea84e"></rect>
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
      button.style.left = `${((building.x - origin) / span) * 100}%`
      button.style.top = `${((building.z - origin) / span) * 100}%`
      button.innerHTML = `<span class="ico">${KIND_ICON[building.kind] || '•'}</span><span>${building.name}</span>`
      button.addEventListener('click', () => select(building))
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
    const span = WORLD_MAX - WORLD_MIN + PAD * 2
    const origin = WORLD_MIN - PAD
    you.style.left = `${((x - origin) / span) * 100}%`
    you.style.top = `${((z - origin) / span) * 100}%`
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
