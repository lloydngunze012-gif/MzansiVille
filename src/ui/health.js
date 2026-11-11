// #/health: one screen, plain words. state: the result of checkHealth() (null while it runs).
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const yes = (ok) => `<b class="hl-${ok ? 'yes' : 'no'}" data-ok="${ok ? 'yes' : 'no'}">${ok ? 'Yes' : 'No'}</b>`

// Social SQL: the three later blocks of supabase/chat.sql (Social A, Social B, the follow-ups). "Yes" only when the
// newest of them is in, so the owner can see that a re-run took; otherwise which part is missing.
const social = (parts = []) => {
  const names = ['Social A', 'Social B', 'follow-ups']
  const all = parts.length === 3 && parts.every(Boolean)
  return all ? yes(true) : `${yes(false)} <small data-missing>run supabase/chat.sql again (missing: ${names.filter((_, i) => !parts[i]).join(', ')})</small>`
}

export function healthScreen(health, info) {
  const h = health
  const row = (label, value, id) => `<div class="hl-row"${id ? ` data-hl="${id}"` : ''}><dt>${label}</dt><dd>${value}</dd></div>`
  const rooms = h?.rooms?.length ? h.rooms.map((r) => `${esc(r.room)}: ${r.players}`).join(' · ') : h ? 'none yet' : '…'
  return `<main class="screen lg hl" data-screen="health">
    <div class="lg-top"><a class="lg-back" href="#/">← Back</a></div>
    <article class="lg-card"><p class="lg-kicker">Soft Life</p><h1>Health</h1>
    <dl class="hl-list">
      ${row('Version', esc(info.build), 'build')}
      ${row('Commit', esc(info.commit), 'commit')}
      ${row('Supabase reachable', h ? (h.connected ? `${yes(h.supabase?.ok)} <small>${h.supabase?.ms ?? ''} ms</small>` : '<b class="hl-no" data-ok="no">Not connected (no keys in this build)</b>') : '…', 'supabase')}
      ${row('Leaderboard SQL', h ? yes(h.sql.leaderboard) : '…', 'sql-board')}
      ${row('Feedback SQL', h ? yes(h.sql.feedback) : '…', 'sql-feedback')}
      ${row('Chat SQL', h ? yes(h.sql.chat) : '…', 'sql-chat')}
      ${row('Social SQL', h ? social(h.sql.social) : '…', 'sql-social')}
      ${row('Rooms and players online', h ? `<b data-hl-players>${h.players}</b> in ${h.rooms.length || 0} room${h.rooms.length === 1 ? '' : 's'}` : '…', 'online')}
      ${row('Rooms', rooms, 'rooms')}
      ${row('Checked', h ? esc(new Date(h.at).toLocaleTimeString('en-ZA')) : 'checking…', 'at')}
    </dl>
    <button class="lg-go" type="button" data-act="health-refresh">Check again</button>
    </article>
  </main>`
}
