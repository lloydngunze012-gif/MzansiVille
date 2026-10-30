export function toMinutes(clock) {
  const [h, m] = String(clock || '0:0').split(':').map((part) => Number(part))
  return (h || 0) * 60 + (m || 0)
}

export function formatClock(mins) {
  const safe = ((Math.round(mins) % 1440) + 1440) % 1440
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function formatMoney(n) {
  const sign = n < 0 ? '-' : ''
  const body = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return `${sign}R${body}`
}

export function formatDelta(deltas) {
  const parts = []
  if (deltas.money) parts.push(deltas.money > 0 ? `+${formatMoney(deltas.money)}` : formatMoney(deltas.money))
  const labels = { energy: 'Energy', grades: 'Grades', social: 'Social', hunger: 'Hunger' }
  for (const key of Object.keys(labels)) {
    if (!deltas[key]) continue
    parts.push(`${labels[key]} ${deltas[key] > 0 ? '+' : ''}${deltas[key]}`)
  }
  return parts.join(' · ') || 'No change'
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayName(meta, day) {
  const start = Math.max(0, WEEKDAYS.indexOf(meta.calendar.startWeekday || 'Monday'))
  return WEEKDAYS[(start + (day - 1)) % 7]
}

export function hashString(value) {
  let h = 2166136261
  const text = String(value)
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function fillTemplate(text, pairs) {
  let out = String(text ?? '')
  for (const [key, value] of Object.entries(pairs)) {
    out = out.split(`{${key}}`).join(value ?? '')
  }
  return out
}
