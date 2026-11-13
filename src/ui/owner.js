// #/owner (job G): the owner's reports, one phone screen per section, plain words. state: src/owner.js `owner`.
// Classes start `ow-`; styles at the end of src/ui/quick.css. Each section says what it counts; docs/owner-reports.md
// says what to do when a number looks wrong.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const n = (v) => (v == null ? '…' : Number(v).toLocaleString('en-ZA'))
const pct = (o) => (o && o.of ? `${Math.round((o.back / o.of) * 100)}% <small>(${o.back} of ${o.of})</small>` : '<small>not enough players yet</small>')
const when = (iso) => { try { return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
const bars = (rows, key, val, label = (r) => r[key]) => {
  if (!rows?.length) return '<p class="ow-none">Nothing in this range.</p>'
  const max = Math.max(...rows.map((r) => Number(r[val]) || 0), 1)
  return `<ol class="ow-bars">${rows.map((r) => `<li><span>${esc(label(r))}</span><i style="--w:${Math.round(((Number(r[val]) || 0) / max) * 100)}%"></i><b>${n(r[val])}</b></li>`).join('')}</ol>`
}
const row = (label, value) => `<div class="ow-row"><dt>${label}</dt><dd>${value}</dd></div>`
const section = (id, title, body, note = '') => `<section class="ow-sec" data-ow="${id}"><h2>${title}</h2>${note ? `<p class="ow-note">${note}</p>` : ''}${body}</section>`

export function ownerScreen(o, allowed) {
  const head = `<div class="lg-top"><a class="lg-back" href="#/">← Back</a></div>`
  if (!allowed || o.denied) {
    return `<main class="screen lg ow" data-screen="owner">${head}<article class="lg-card"><p class="lg-kicker">Soft Life</p><h1>Owner</h1>
      <p class="ow-none" data-ow="denied">Owner only. Sign in with the owner's account (Settings) to see the reports.</p></article></main>`
  }
  const r = o.reports
  const days = [1, 7, 30].map((d) => `<button type="button" class="ow-day" data-act="owner-days" data-days="${d}" aria-pressed="${o.days === d}">${d === 1 ? 'Today' : `${d} days`}</button>`).join('')
  const L = o.live
  const live = L ? `<dl>${row('Players online now', `<b data-ow-online>${n(L.players)}</b>`)}${row('Realtime connections', `${n(L.players)} of ${n(L.plan.connections)} <small>(${n(L.plan.capOff.connections)} with the spend cap off)</small>`)}${row('Realtime messages a second', `${n(L.messages)} of ${n(L.plan.messages)} <small>(estimate)</small>`)}${row('Capacity line', L.capacity ? `${n(L.capacity.online)} in of ${n(L.capacity.max)}, ${n(L.capacity.waiting)} waiting` : '<small>run supabase/launch.sql again</small>')}</dl>
      ${bars(L.areas, 'area', 'players', (a) => (a.area === 'campus' ? 'Campus' : a.area[0].toUpperCase() + a.area.slice(1)))}` : '<p class="ow-none">Counting the rooms…</p>'
  const g = r.growth
  const growth = g ? `<dl>${row('New players today', `<b>${n(g.today)}</b>`)}${row('New this week', n(g.week))}${row('Back the next day', pct(g.d1))}${row('Back after 7 days', pct(g.d7))}</dl><h3>Where they are from</h3>${bars(g.countries, 'country', 'n')}` : ''
  const t = r.time
  const time = t ? `<dl>${row('Sessions', n(t.sessions))}${row('Average session', `${n(t.avgSession)} min`)}${row('Minutes per player a day', n(t.minutesPerPlayerDay))}${row('Sessions per player a day', n(t.sessionsPerPlayerDay))}</dl>${bars(t.byDay, 'day', 'players', (x) => `${x.day} players`)}` : ''
  const h = r.hot
  const hot = h ? `<h3>Minutes by area</h3>${bars(h.areas, 'area', 'minutes')}<h3>Minutes by hour (SAST)</h3>${bars(h.hours, 'hour', 'minutes', (x) => `${String(x.hour).padStart(2, '0')}:00`)}<h3>Activities by place</h3>${bars(h.places, 'place', 'visits')}` : ''
  const f = r.feedback
  const feedback = f ? (f.rows.length ? `<ol class="ow-list">${f.rows.map((x) => `<li><b>${x.stars ? '★'.repeat(x.stars) : ''}</b> ${esc(x.message || '(no words)')}<small>${esc(when(x.at))} · ${esc(x.kind || '')} · ${esc(String(x.device || '').slice(0, 40))}</small></li>`).join('')}</ol>` : '<p class="ow-none">No feedback in this range.</p>') : ''
  const s = r.support
  const support = s ? `<h3>Reported posts</h3>${s.posts.length ? `<ol class="ow-list">${s.posts.map((x) => `<li data-ow-post="${x.id}"><b>${esc(x.name)}</b> “${esc(x.body)}”<small>${n(x.reports)} report${x.reports === 1 ? '' : 's'}${x.hidden ? ' · hidden until you decide' : ''}</small><span class="ow-two"><button type="button" class="ow-keep" data-act="owner-mod" data-kind="post" data-id="${x.id}" data-keep="1">Keep</button><button type="button" class="ow-hide" data-act="owner-mod" data-kind="post" data-id="${x.id}" data-keep="0">Hide</button></span></li>`).join('')}</ol>` : '<p class="ow-none">None.</p>'}
      <h3>Reported groups</h3>${s.groups.length ? `<ol class="ow-list">${s.groups.map((x) => `<li data-ow-group="${esc(x.id)}"><b>${esc(x.name)}</b> ${esc(x.topic || '')}<small>${n(x.reports)} report${x.reports === 1 ? '' : 's'}${x.hidden ? ' · out of suggestions' : ''}</small><span class="ow-two"><button type="button" class="ow-keep" data-act="owner-mod" data-kind="group" data-id="${esc(x.id)}" data-keep="1">Keep</button><button type="button" class="ow-hide" data-act="owner-mod" data-kind="group" data-id="${esc(x.id)}" data-keep="0">Hide</button></span></li>`).join('')}</ol>` : '<p class="ow-none">None.</p>'}
      <dl>${row('Chat lines reported', n(s.lineReports))}</dl><h3>Blocks a day</h3>${bars(s.blocks, 'day', 'n')}<h3>Word filter stops a day</h3>${bars(s.filter, 'day', 'n')}` : ''
  const c = r.chat
  const chat = c ? `<dl>${row('Messages', n(c.lines))}${row('In The Quad', n(c.quad))}${row('Active groups', n(c.activeGroups))}${row('Pings sent', n(c.pings))}${row('Players with pings on', n(c.pingsOn))}</dl><h3>Messages by hour (SAST)</h3>${bars(c.perHour, 'hour', 'n', (x) => `${String(x.hour).padStart(2, '0')}:00`)}` : ''
  const e = r.errors
  const errors = e ? `${bars(e.byKind, 'kind', 'n')}${e.rows.length ? `<ol class="ow-list">${e.rows.slice(0, 40).map((x) => `<li><b>${esc(x.kind || 'error')}</b> ${esc(String(x.message || '').slice(0, 160))}<small>${esc(when(x.at))} · ${esc(x.screen || '')} ${esc(x.step || '')} · ${esc(String(x.build || '').slice(0, 20))} · ${esc(String(x.device || '').slice(0, 40))}</small></li>`).join('')}</ol>` : '<p class="ow-none">No errors in this range.</p>'}` : ''
  const m = r.economy
  const economy = m ? `<dl>${row('Players counted', n(m.players))}${row('Money, middle player', `R${n(m.spread?.p50)}`)}${row('Poorest 10% under', `R${n(m.spread?.p10)}`)}${row('Richest 10% over', `R${n(m.spread?.p90)}`)}${row('Richest', `R${n(m.spread?.max)}`)}</dl><h3>Invite rewards by inviter</h3>${m.invites.length ? `<ol class="ow-list">${m.invites.map((x) => `<li><b>${esc(x.name)}</b> ${n(x.claimed)} claimed, ${n(x.back)} came back</li>`).join('')}</ol>` : '<p class="ow-none">None in this range.</p>'}` : ''
  const loading = (k) => (r[k] === undefined ? '<p class="ow-none">Loading…</p>' : r[k] === null ? '<p class="ow-none">Could not load this report.</p>' : '')
  return `<main class="screen lg ow" data-screen="owner">${head}<article class="lg-card"><p class="lg-kicker">Soft Life</p><h1>Owner</h1>
    <div class="ow-days" role="group" aria-label="Time range">${days}</div>
    ${o.error ? `<p class="ow-none ow-err">${esc(o.error)}</p>` : ''}
    ${section('live', 'Live', live)}
    ${section('growth', 'Growth', growth || loading('growth'), 'New = first day in the game. Back = played again the next day, or a week or more later.')}
    ${section('time', 'Time played', time || loading('time'))}
    ${section('hot', 'Hot areas', hot || loading('hot'), 'Counts only, nobody\'s path.')}
    ${section('feedback', 'Feedback', feedback || loading('feedback'), 'Newest first.')}
    ${section('support', 'Support', support || loading('support'), 'Keep: shown again, reports cleared. Hide: a post is deleted; a group stays out of suggestions and its link stops working.')}
    ${section('chat', 'Chat and pings', chat || loading('chat'))}
    ${section('errors', 'Errors', errors || loading('errors'), 'Load errors and crashes from phones, newest first.')}
    ${section('economy', 'Economy', economy || loading('economy'), 'Many invites claimed and few came back from one inviter: look at it.')}
    <p class="ow-note">${o.loading ? 'Loading…' : o.at ? `Checked ${esc(o.at.toLocaleTimeString('en-ZA'))}` : ''}</p>
    </article></main>`
}
