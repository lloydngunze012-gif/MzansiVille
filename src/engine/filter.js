const WORDS = [
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'slut', 'whore',
]

export function cleanText(raw) {
  let out = String(raw ?? '')
  for (const word of WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi')
    out = out.replace(re, (match) => '*'.repeat(match.length))
  }
  return out.trim()
}

export function canSend(stamps, now = Date.now()) {
  const recent = stamps.filter((t) => now - t < 10 * 60 * 1000)
  if (recent.length && now - recent[recent.length - 1] < 3000) {
    return { ok: false, reason: 'Wait a few seconds.', stamps: recent }
  }
  if (recent.length >= 30) return { ok: false, reason: '30 messages per 10 minutes.', stamps: recent }
  return { ok: true, reason: '', stamps: recent }
}
