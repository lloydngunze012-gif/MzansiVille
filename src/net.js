import { balancedScore } from './engine/board.js'

export const authEnabled = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

let clientPromise = null

const NETWORK_ERROR = 'Could not reach the server. Try again in a moment.'
const TIMEOUT_MS = 10000

// Resolve a promise or give up after ms. Never rejects on timeout; returns fallback.
function withTimeout(promise, ms = TIMEOUT_MS, fallback = null) {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms) }),
  ])
}

function errorText(err) {
  return (err && err.message) || NETWORK_ERROR
}

export async function getClient() {
  if (!authEnabled) return null
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } },
      ))
      .catch((err) => {
        console.warn('Supabase client unavailable, staying in guest mode', err)
        clientPromise = null
        return null
      })
  }
  try {
    const client = await withTimeout(clientPromise, TIMEOUT_MS, null)
    return client || null
  } catch {
    clientPromise = null
    return null
  }
}

export async function signInEmail(email) {
  const client = await getClient()
  if (!client) return { error: 'Supabase is not connected yet. Progress stays on this phone.' }
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin },
    })
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export async function signInGoogle() {
  const client = await getClient()
  if (!client) return { error: 'Supabase is not connected yet.' }
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin },
    })
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export async function signOut() {
  const client = await getClient()
  if (!client) return
  try {
    await client.auth.signOut()
  } catch (err) {
    console.warn('signOut failed', err)
  }
}

export async function currentSession() {
  const client = await getClient()
  if (!client) return null
  try {
    const { data } = await client.auth.getSession()
    return data?.session || null
  } catch {
    return null
  }
}

export async function pushProfile(run) {
  const client = await getClient()
  const session = await currentSession()
  if (!client || !session || !run) return { error: '' }
  try {
    const { error } = await client.from('profiles').update({
    display_name: run.character.name,
    residence: run.character.residence,
    course: run.character.course,
    avatar: run.character.avatar,
    handle: run.character.handle || null,
    district_id: run.character.districtId,
    state: run,
    money: run.stats.money,
    grades: run.stats.grades,
    balanced: balancedScore(run.stats),
    history: run.history || [],
    referral_code: run.referralCode || null,
    }).eq('id', session.user.id)
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export async function pullProfile(userId) {
  const client = await getClient()
  if (!client) return null
  try {
    const { data } = await client.from('profiles').select('state, suspended, role').eq('id', userId).maybeSingle()
    return data || null
  } catch {
    return null
  }
}

export async function fetchEventEdits(districtId) {
  const client = await getClient()
  if (!client) return []
  try {
    const { data } = await client.from('event_edits').select('event_id, title, body, choice_labels').eq('district_id', districtId)
    return data || []
  } catch {
    return []
  }
}

export async function fetchLeaderboard() {
  const client = await getClient()
  if (!client) return { rows: [], error: '' }
  try {
    const { data, error } = await client.rpc('leaderboard')
    return { rows: data || [], error: error?.message || '' }
  } catch (err) {
    return { rows: [], error: errorText(err) }
  }
}

export async function fetchLobby() {
  const client = await getClient()
  if (!client) return { messages: [], names: {}, error: '' }
  try {
    const { data, error } = await client
      .from('chat_messages')
      .select('id, user_id, body, created_at')
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) return { messages: [], names: {}, error: error.message }
    const ids = [...new Set((data || []).map((row) => row.user_id))]
    let names = {}
    if (ids.length) {
      try {
        const people = await client.from('profile_public').select('id, display_name, residence').in('id', ids)
        names = Object.fromEntries((people.data || []).map((person) => [person.id, person]))
      } catch {
        names = {}
      }
    }
    return { messages: data || [], names, error: '' }
  } catch (err) {
    return { messages: [], names: {}, error: errorText(err) }
  }
}

export async function sendLobby(userId, body) {
  const client = await getClient()
  if (!client) return { error: 'Save your progress to talk in the lobby.' }
  try {
    const { error } = await client.from('chat_messages').insert({ user_id: userId, body })
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export function subscribeLobby(onInsert) {
  let channel = null
  let closed = false
  getClient().then((client) => {
    if (!client || closed) return
    try {
      channel = client.channel('campus-lobby')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
          onInsert(payload.new)
        })
        .subscribe()
    } catch (err) {
      console.warn('Lobby subscribe failed', err)
      channel = null
    }
  }).catch(() => {})
  return () => {
    closed = true
    getClient().then((client) => {
      if (client && channel) client.removeChannel(channel)
    }).catch(() => {})
  }
}

export async function fileReport(reporterId, message, reason) {
  const client = await getClient()
  if (!client) return { error: 'Save your progress to report.' }
  try {
    const { error } = await client.from('reports').insert({
      reporter_id: reporterId,
      message_id: message?.id,
      reported_user_id: message?.user_id,
      reason,
      message_body: String(message.body || '').slice(0, 500),
    })
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export async function storeBlock(blockerId, blockedId) {
  const client = await getClient()
  if (!client) return { error: '' }
  try {
    const { error } = await client.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId })
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

async function adminRpc(name, args) {
  const client = await getClient()
  if (!client) return { error: 'Admins only' }
  try {
    const { error } = await client.rpc(name, args)
    return { error: error?.message || '' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

export async function fetchReports() {
  const client = await getClient()
  if (!client) return { rows: [], error: 'Admins only' }
  try {
    const { data, error } = await client.rpc('admin_reports')
    return { rows: data || [], error: error?.message || '' }
  } catch (err) {
    return { rows: [], error: errorText(err) }
  }
}

export async function suspendUser(userId, flag) {
  return adminRpc('admin_suspend', { target: userId, flag })
}

export async function closeReport(id) {
  return adminRpc('admin_close_report', { report: id })
}

export async function saveEventText(districtId, eventId, title, body, labels) {
  return adminRpc('admin_edit_event', {
    district: districtId,
    event: eventId,
    next_title: title,
    next_body: body,
    next_labels: labels,
  })
}
