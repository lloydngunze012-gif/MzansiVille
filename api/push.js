// Notifications (owner, 11 Nov): after a phone sends a line it POSTs { id, secret, thread } here; the database
// decides who gets a push (supabase/chat.sql chat_push_due) and this sends them. GET returns the public VAPID key
// the phones subscribe with. Setup (keys in Vercel's environment, never in the repo): docs/notifications.md.
import { liveDeps, pushForLine } from './_push.js'

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'GET') {
    const e = process.env
    // (ready: every key the push server needs is set; #/health shows it. The values are never sent.)
    return res.status(200).json({ key: e.VAPID_PUBLIC_KEY || '', ready: Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.SUPABASE_SERVICE_ROLE_KEY && (e.SUPABASE_URL || e.VITE_SUPABASE_URL)) })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const deps = await liveDeps()
  if (!deps) return res.status(503).json({ error: 'not set up' })
  let body = req.body
  try { if (typeof body === 'string') body = JSON.parse(body) } catch { body = {} }
  try {
    const out = await pushForLine(body || {}, deps)
    return res.status(out.error ? 400 : 200).json(out)
  } catch {
    return res.status(500).json({ error: 'failed' })
  }
}
