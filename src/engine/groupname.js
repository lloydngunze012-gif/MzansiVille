// A chat group's name (Chat sprint, 11 Nov): 3 to 40 characters, no slur or swearing, and it must pass the same
// list as an @handle (data/campusville/handle_blocklist.json: no "admin", "official", "UMzansi staff" and the like).
// The server filters the words again when the group is made (supabase/chat.sql chat_group_create).
import LIST from '../../data/campusville/handle_blocklist.json' with { type: 'json' }
import { filterText } from './filter.js'

export function groupNameOk(name) {
  const text = String(name || '').replace(/\s+/g, ' ').trim()
  if (text.length < 3 || text.length > 40) return false
  const f = filterText(text)
  if (f.blocked || f.masked) return false
  const bare = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
  if (!bare || LIST.exact.includes(bare)) return false
  return !LIST.reserved.some((w) => bare.includes(w.replace(/_/g, '')))
}
