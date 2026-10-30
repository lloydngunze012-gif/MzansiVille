// 1080x1080 share card in the cover style: deep purple, gold, flat vector,
// with a round game badge (no university crest).
import { avatarSvg } from './avatar.js'

const PURPLE = '#2a1846'
const VIOLET = '#5b23c9'
const GOLD = '#f0c400'
const CREAM = '#fff6e6'
const ORANGE = '#ff8a3d'
const DISPLAY = "'Arial Black', 'Arial Bold', Impact, system-ui, sans-serif"

function lines(ctx, text, max, maxLines) {
  const words = String(text || '').split(/\s+/)
  const out = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > max && line) {
      out.push(line)
      line = word
      if (out.length === maxLines) break
    } else line = next
  }
  if (line && out.length < maxLines) out.push(line)
  if (out.length === maxLines && words.join(' ') !== out.join(' ')) {
    let last = out[maxLines - 1]
    while (ctx.measureText(`${last}\u2026`).width > max && last.length > 1) last = last.slice(0, -1)
    out[maxLines - 1] = `${last.replace(/[\s,.;:]+$/, '')}\u2026`
  }
  return out
}

function loadSvg(svg) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Avatar image failed')) }
    image.src = url
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Round game badge: gold rim, purple coin, crown. Not a university crest.
function badge(ctx, cx, cy, s) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.fillStyle = '#120d18'
  ctx.beginPath(); ctx.arc(0, 6, 72, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = VIOLET
  ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill()
  // crown
  ctx.fillStyle = GOLD
  ctx.beginPath()
  ctx.moveTo(-36, 22); ctx.lineTo(-40, -18); ctx.lineTo(-18, 2); ctx.lineTo(0, -28)
  ctx.lineTo(18, 2); ctx.lineTo(40, -18); ctx.lineTo(36, 22)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = CREAM
  ctx.fillRect(-36, 26, 72, 10)
  ctx.restore()
}

export function shareContent(run, milestone) {
  const stat = milestone
    ? { label: 'Unlocked', value: milestone.title }
    : bestStat(run)
  const event = milestone ? milestone.text : (run.lastEventLine || 'A quiet day on campus.')
  return { stat, event, kicker: milestone ? `Milestone \u00b7 Day ${run.day}` : `End of day ${run.summary?.day || run.day}` }
}

function bestStat(run) {
  const s = run.stats
  const options = [
    ['Grades', s.grades, `${Math.round(s.grades)}`],
    ['Social', s.social, `${Math.round(s.social)}`],
    ['Money', Math.min(100, s.money / 30), `R${Math.round(s.money).toLocaleString('en-ZA').replace(/,/g, ' ')}`],
  ]
  options.sort((a, b) => b[1] - a[1])
  return { label: options[0][0], value: options[0][2] }
}

export async function drawShareCard(canvas, { district, run, url, milestone = null }) {
  const ctx = canvas.getContext('2d')
  canvas.width = 1080
  canvas.height = 1080
  const { stat, event, kicker } = shareContent(run, milestone)

  // background
  const bg = ctx.createRadialGradient(540, 120, 60, 540, 300, 1000)
  bg.addColorStop(0, '#4b1fa3')
  bg.addColorStop(0.5, PURPLE)
  bg.addColorStop(1, '#1a0f2e')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 1080, 1080)
  // flat rays
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = GOLD
  for (let i = 0; i < 12; i++) {
    ctx.beginPath(); ctx.moveTo(540, 470)
    const a = (i / 12) * Math.PI * 2
    ctx.lineTo(540 + Math.cos(a) * 1200, 470 + Math.sin(a) * 1200)
    ctx.lineTo(540 + Math.cos(a + 0.18) * 1200, 470 + Math.sin(a + 0.18) * 1200)
    ctx.closePath(); ctx.fill()
  }
  ctx.restore()
  // gold frame
  ctx.lineWidth = 14
  ctx.strokeStyle = GOLD
  roundRect(ctx, 26, 26, 1028, 1028, 44); ctx.stroke()

  badge(ctx, 150, 150, 1.05)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = GOLD
  ctx.font = `900 78px ${DISPLAY}`
  ctx.fillText('MzansiVille', 270, 150)
  ctx.fillStyle = ORANGE
  ctx.font = `900 28px ${DISPLAY}`
  ctx.fillText(kicker.toUpperCase(), 274, 196)

  // avatar disc
  ctx.fillStyle = '#120d18'
  ctx.beginPath(); ctx.arc(330, 548, 214, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = GOLD
  ctx.beginPath(); ctx.arc(330, 540, 214, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ece3fb'
  ctx.beginPath(); ctx.arc(330, 540, 196, 0, Math.PI * 2); ctx.fill()
  try {
    const image = await loadSvg(avatarSvg(run.character.avatar, district.meta.dialCode, 360))
    const h = 360 * (image.height / image.width || 1.28)
    ctx.save()
    ctx.beginPath(); ctx.arc(330, 540, 196, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(image, 330 - 150, 540 - 175, 300, (300 * h) / 360)
    ctx.restore()
  } catch {
    ctx.fillStyle = VIOLET
    ctx.beginPath(); ctx.arc(330, 500, 80, 0, Math.PI * 2); ctx.fill()
  }

  // name + residence + day
  ctx.fillStyle = CREAM
  ctx.font = `900 62px ${DISPLAY}`
  const nameLines = lines(ctx, run.character.name, 450, 2)
  nameLines.forEach((l, i) => ctx.fillText(l, 580, 400 + i * 66))
  const y0 = 400 + nameLines.length * 66
  ctx.fillStyle = '#d8c8ff'
  ctx.font = '600 32px system-ui, sans-serif'
  ctx.fillText(run.character.residence, 582, y0 + 4)
  // day pill
  ctx.fillStyle = GOLD
  roundRect(ctx, 580, y0 + 34, 190, 64, 32); ctx.fill()
  ctx.fillStyle = '#2a1206'
  ctx.font = `900 34px ${DISPLAY}`
  ctx.fillText(`DAY ${run.day}`, 608, y0 + 79)

  // stat tile
  ctx.fillStyle = '#120d18'
  roundRect(ctx, 580, y0 + 128, 420, 150, 28); ctx.fill()
  ctx.fillStyle = CREAM
  roundRect(ctx, 580, y0 + 120, 420, 150, 28); ctx.fill()
  ctx.fillStyle = ORANGE
  ctx.font = `900 24px ${DISPLAY}`
  ctx.fillText(stat.label.toUpperCase(), 610, y0 + 162)
  ctx.fillStyle = VIOLET
  let size = 64
  ctx.font = `900 ${size}px ${DISPLAY}`
  while (ctx.measureText(stat.value).width > 360 && size > 30) { size -= 4; ctx.font = `900 ${size}px ${DISPLAY}` }
  ctx.fillText(stat.value, 610, y0 + 240)

  // event ribbon
  ctx.fillStyle = '#120d18'
  roundRect(ctx, 80, 808, 920, 150, 30); ctx.fill()
  ctx.fillStyle = '#ffffff14'
  roundRect(ctx, 80, 800, 920, 150, 30); ctx.fill()
  ctx.strokeStyle = '#f0c40088'
  ctx.lineWidth = 3
  roundRect(ctx, 80, 800, 920, 150, 30); ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.font = `900 72px ${DISPLAY}`
  ctx.fillText('\u201C', 104, 878)
  ctx.fillStyle = CREAM
  ctx.font = '600 36px system-ui, sans-serif'
  const ev = lines(ctx, event, 800, 2)
  ev.forEach((l, i) => ctx.fillText(l, 160, (ev.length === 1 ? 888 : 864) + i * 48))

  // url
  ctx.textAlign = 'center'
  ctx.fillStyle = GOLD
  ctx.font = `900 30px ${DISPLAY}`
  ctx.fillText(String(url || '').toUpperCase(), 540, 1010)
}

export async function exportCard(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
