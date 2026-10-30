import { avatarSvg } from './avatar.js'

function wrap(ctx, text, x, y, max, lineHeight) {
  const words = String(text || '').split(' ')
  let line = ''
  let drawn = 0
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > max && line) {
      ctx.fillText(line, x, y + drawn * lineHeight)
      line = word
      drawn += 1
      if (drawn === 2) return
    } else line = next
  }
  if (line && drawn < 2) ctx.fillText(line, x, y + drawn * lineHeight)
}

function loadSvg(svg) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Avatar image failed'))
    }
    image.src = url
  })
}

export async function drawShareCard(canvas, { district, run, url }) {
  const ctx = canvas.getContext('2d')
  canvas.width = 1080
  canvas.height = 1080
  ctx.fillStyle = '#1c1915'
  ctx.fillRect(0, 0, 1080, 1080)
  ctx.fillStyle = '#f0c400'
  ctx.fillRect(0, 0, 1080, 36)
  ctx.fillStyle = '#f4efe4'
  ctx.textAlign = 'center'
  ctx.font = '700 42px sans-serif'
  ctx.fillText('MzansiVille', 540, 120)
  ctx.font = '28px sans-serif'
  ctx.fillStyle = '#f0c400'
  ctx.fillText(district.meta.name, 540, 168)
  const svg = avatarSvg(run.character.avatar, district.meta.dialCode, 420)
  try {
    const image = await loadSvg(svg)
    ctx.drawImage(image, 330, 210, 420, 538)
  } catch {
    ctx.fillStyle = '#f0c400'
    ctx.beginPath()
    ctx.arc(540, 460, 120, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f4efe4'
  ctx.font = '700 64px sans-serif'
  ctx.fillText(run.character.name, 540, 820)
  ctx.font = '32px sans-serif'
  ctx.fillStyle = '#d9d0c2'
  ctx.fillText(`${run.character.residence} · Day ${run.day}`, 540, 870)
  ctx.fillStyle = '#f4efe4'
  ctx.font = '36px sans-serif'
  ctx.fillText(run.lastStatLine || `Grades ${run.stats.grades}`, 540, 930)
  ctx.fillStyle = '#f0c400'
  ctx.font = '28px sans-serif'
  wrap(ctx, run.lastEventLine || 'A day in the district.', 540, 980, 900, 34)
  ctx.fillStyle = '#8d867c'
  ctx.font = '24px sans-serif'
  ctx.fillText(url, 540, 1052)
}

export async function exportCard(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob
}
