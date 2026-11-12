// "Online" / "last seen 2 h ago" (owner, 12 Nov, job I): for friends both ways only (the server sends `seen` for no
// one else). seen: an ISO time; online: the server's "seen in the last 70 s".
export function seenText(seen, online, now = Date.now()) {
  if (online) return 'online'
  const t = Date.parse(seen || '')
  if (!Number.isFinite(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 2) return 'last seen just now'
  if (min < 60) return `last seen ${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `last seen ${h} h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'last seen yesterday' : d < 30 ? `last seen ${d} days ago` : 'last seen a while ago'
}
