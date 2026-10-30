function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

export function moneyScaled(money) {
  return clamp((Number(money) / 3000) * 100, 0, 100)
}

export function balancedScore(stats) {
  const vals = [
    moneyScaled(stats.money),
    clamp(stats.energy, 0, 100),
    clamp(stats.grades, 0, 100),
    clamp(stats.social, 0, 100),
    clamp(stats.hunger, 0, 100),
  ]
  return Math.round(100 - (Math.max(...vals) - Math.min(...vals)))
}

export function rollingAverage(history, now, key) {
  const cut = new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000
  const rows = (history || []).filter((item) => new Date(item.at).getTime() > cut)
  if (!rows.length) return null
  const sum = rows.reduce((total, item) => total + Number(item[key] || 0), 0)
  return sum / rows.length
}
