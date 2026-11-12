// Notifications (owner, 11 Nov): once a day (a Vercel cron, vercel.json) the summary push "3 new students from
// Durban joined today. Say hi." to players who are not in the game and have it on (supabase/chat.sql
// chat_push_digest). Vercel sends CRON_SECRET as a bearer token; anything else is refused.
import { liveDeps, pushDigest } from './_push.js'

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'no' })
  const deps = await liveDeps()
  if (!deps) return res.status(503).json({ error: 'not set up' })
  try { return res.status(200).json(await pushDigest(deps)) } catch { return res.status(500).json({ error: 'failed' }) }
}
