// Leaderboards and lobby data. Three sources, in this order:
//  1. mock: ?mock=1, VITE_SOCIAL_MOCK=1 or localStorage mzansiville.mock=1.
//     Sample rows, clearly labelled, for screenshots and tests. No network.
//  2. Supabase, when configured and reachable (6 s timeout per call).
//  3. offline: unconfigured or unreachable. Screens show a friendly state
//     and a local-only "You" card. Nothing here ever throws.
import { authEnabled, fetchLeaderboard, fetchLobby } from './net.js'
import { filterText } from './engine/filter.js'
import { sampleBoard, sampleLobby } from './engine/social-data.js'

export { BOARD_TABS, rankRows, sampleBoard, sampleLobby } from './engine/social-data.js'

export function mockMode() {
  try {
    if (new URLSearchParams(location.search).get('mock') === '1') return true
    if (import.meta.env.VITE_SOCIAL_MOCK === '1') return true
    return localStorage.getItem('mzansiville.mock') === '1'
  } catch {
    return false
  }
}

function withTimeout(promise, ms = 6000) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout', timeout: true }), ms)),
  ]).catch((error) => ({ error: String(error?.message || error || 'network') }))
}

const unreachable = (error) => /timeout|fetch|network|load failed|ENOTFOUND|Failed|NetworkError|aborted/i.test(String(error || ''))

// Returns { source: 'mock'|'live'|'offline', rows, error }
export async function loadBoardRows() {
  if (mockMode()) return { source: 'mock', rows: sampleBoard(), error: '' }
  if (!authEnabled) return { source: 'offline', rows: [], error: '' }
  const result = await withTimeout(fetchLeaderboard())
  if (result.error) return { source: unreachable(result.error) ? 'offline' : 'live', rows: [], error: unreachable(result.error) ? '' : result.error }
  return { source: 'live', rows: result.rows || [], error: '' }
}

// Returns { source, messages, names, error }. Bodies are filtered here.
export async function loadLobby() {
  const clean = (list) => list.map((m) => ({ ...m, body: filterText(m.body).text, masked: filterText(m.body).masked || filterText(m.body).blocked }))
  if (mockMode()) return { source: 'mock', messages: clean(sampleLobby()).reverse(), names: {}, error: '' }
  if (!authEnabled) return { source: 'offline', messages: [], names: {}, error: '' }
  const result = await withTimeout(fetchLobby())
  if (result.error) return { source: unreachable(result.error) ? 'offline' : 'live', messages: [], names: {}, error: unreachable(result.error) ? '' : result.error }
  return { source: 'live', messages: clean(result.messages || []), names: result.names || {}, error: '' }
}

