// Leaderboards and the campus lobby, in the same purple-and-gold card style
// as the milestones screen.
import { formatMoney } from '../engine/format.js'
import { BOARD_TABS, rankRows } from '../social.js'
import { hud } from './game.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function fmt(tab, n) {
  if (tab === 'money') return formatMoney(Math.round(n))
  return String(Math.round(n))
}

function sampleTag(source) {
  return source === 'mock' ? '<span class="sc-sample">sample</span>' : ''
}

function youCard(run, local, tab) {
  if (!run || !local) return ''
  const key = (BOARD_TABS.find((t) => t[0] === tab) || BOARD_TABS[0])[2]
  return `<div class="sc-you"><span class="sc-rank">You</span><div><strong>${esc(run.character.name)}</strong><small>${esc(run.character.residence)} \u00b7 this phone only</small></div><b>${esc(fmt(tab, Number(local[key] ?? 0)))}</b></div>`
}

export function boardScreen(state, local) {
  const { run, district, board } = state
  const tab = board.tab || 'money'
  const scope = board.scope || 'all'
  const myRes = run?.character.residence
  const tabs = BOARD_TABS.map(([id, label, , icon]) => `<button type="button" class="sc-tab ${tab === id ? 'on' : ''}" data-act="board-tab" data-id="${id}" aria-pressed="${tab === id}">${icon} ${esc(label)}</button>`).join('')
  const scopes = [['all', 'Overall'], ['res', 'My res'], ['houses', 'Res vs res']].map(([id, label]) => `<button type="button" class="sc-scope ${scope === id ? 'on' : ''}" data-act="board-scope" data-id="${id}" aria-pressed="${scope === id}">${label}</button>`).join('')
  let body
  if (board.source === 'offline') {
    body = `<div class="sc-off"><span>\u{1F4E1}</span><h2>Leaderboards need a connection</h2><p>You can keep playing as a guest. Your score shows here once the campus server is reachable.</p><button type="button" class="g-go ghost" data-act="board-retry">Try again</button></div>${youCard(run, local, tab)}`
  } else if (board.source === 'loading') {
    body = '<p class="sc-note">Loading\u2026</p>'
  } else {
    let rows = board.rows || []
    if (local && scope !== 'houses' && !rows.some((r) => r.user_id === local.user_id)) rows = rows.concat({ ...local, you: true })
    const ranked = rankRows(rows, tab, scope, myRes).slice(0, 20)
    body = `<ol class="sc-list">${ranked.map((r, i) => scope === 'houses'
      ? `<li class="${r.mine ? 'me' : ''}"><span class="sc-rank">${i + 1}</span><div><strong>${esc(r.residence)}</strong><small>${r.n} student${r.n === 1 ? '' : 's'} \u00b7 average</small></div><b>${esc(fmt(tab, r.score))}</b></li>`
      : `<li class="${r.you || r.user_id === run?.userId ? 'me' : ''}"><span class="sc-rank">${i + 1}</span><div><strong>${esc(r.display_name)}${r.you ? ' (you)' : ''}</strong><small>${esc(r.residence || '')}</small></div><b>${esc(fmt(tab, r.score))}</b></li>`).join('') || '<li class="sc-empty">Nobody here yet.</li>'}</ol>`
  }
  return `<main class="screen g-screen lg" data-screen="leaderboard">
    ${hud(district, run, { strip: false })}
    <div class="lg-top"><a class="lg-back" href="#/play">\u2190 Back to campus</a></div>
    <article class="lg-card sc-card">
      <p class="lg-kicker">Leaderboards ${sampleTag(board.source)}</p>
      <h1>Who\u2019s winning first year</h1>
      <div class="sc-tabs" role="tablist">${tabs}</div>
      <div class="sc-scopes">${scopes}</div>
      ${board.error ? `<p class="sc-err">${esc(board.error)}</p>` : ''}
      ${body}
      <p class="sc-note">7-day average \u00b7 refreshes every 30 s${board.source === 'mock' ? ' \u00b7 sample rows, not real students' : ''}</p>
    </article>
  </main>`
}

function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.round(m / 60)}h`
}

export function lobbyScreen(state) {
  const { run, district, chat, save } = state
  const hidden = new Set([...(save.mutes || []), ...(save.blocks || [])])
  const list = (chat.messages || []).filter((m) => !hidden.has(m.user_id)).slice(0, 40).reverse()
  const msgs = list.map((m) => {
    const person = chat.names?.[m.user_id]
    const name = m.name || person?.display_name || 'Student'
    const res = m.residence || person?.residence || ''
    const mine = run?.userId && m.user_id === run.userId
    const menu = chat.menuId === m.id
      ? `<div class="sc-menu" role="menu">${chat.reportId === m.id
        ? `<p>Why are you reporting this?</p>${['Harassment', 'Hate', 'Sexual content', 'Spam', 'Something else'].map((r) => `<button type="button" role="menuitem" data-act="reason" data-id="${esc(m.id)}" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}`
        : `<button type="button" role="menuitem" data-act="mute" data-id="${esc(m.user_id)}">\u{1F507} Mute ${esc(name)}</button><button type="button" role="menuitem" data-act="block" data-id="${esc(m.user_id)}">\u26D4 Block</button><button type="button" role="menuitem" class="warn" data-act="report" data-id="${esc(m.id)}">\u{1F6A9} Report message</button>`}</div>`
      : ''
    return `<li class="${mine ? 'me' : ''}"><div class="sc-mh"><strong>${esc(name)}</strong><small>${esc(res)} \u00b7 ${ago(m.created_at)}</small>${mine ? '' : `<button type="button" class="sc-more" data-act="msg-menu" data-id="${esc(m.id)}" aria-label="Options for ${esc(name)}">\u22EF</button>`}</div><p class="${m.masked ? 'masked' : ''}">${esc(m.body)}</p>${m.masked ? '<small class="sc-flt">filtered</small>' : ''}${menu}</li>`
  }).join('')
  const offline = chat.source === 'offline'
  const guest = !run?.userId
  const prompt = chat.prompt
    ? `<div class="g-scrim" data-act="prompt-close"></div><aside class="g-result sc-prompt"><p class="g-kind">Campus lobby</p><h2>Make a free account to post</h2><p>Guests can read the lobby. To post, save your student so people know who\u2019s talking and reports reach a real account.</p><div class="g-two"><button type="button" class="g-go ghost" data-act="prompt-close">Not now</button><button type="button" class="g-go" data-act="nav" data-go="save">Save progress</button></div></aside>`
    : ''
  return `<main class="screen g-screen lg" data-screen="chat">
    ${hud(district, run, { strip: false })}
    <div class="lg-top"><a class="lg-back" href="#/play">\u2190 Back to campus</a></div>
    <article class="lg-card sc-card sc-lobby">
      <p class="lg-kicker">Campus lobby ${sampleTag(chat.source)}</p>
      <h1>The Quad</h1>
      ${offline ? '<div class="sc-off"><span>\u{1F4E1}</span><h2>The lobby needs a connection</h2><p>Your game is saved on this phone. Come back when you\u2019re online.</p><button type="button" class="g-go ghost" data-act="chat-retry">Try again</button></div>' : `<ol class="sc-chat" id="log">${msgs || '<li class="sc-empty">Nobody has spoken yet. Say howzit.</li>'}</ol>`}
      ${chat.error ? `<p class="sc-err">${esc(chat.error)}</p>` : ''}
      ${chat.notice ? `<p class="sc-ok" role="status">${esc(chat.notice)}</p>` : ''}
      ${offline ? '' : `<div class="sc-compose"><input id="composer" maxlength="280" placeholder="${guest ? 'Guests can read. Tap to post\u2026' : 'Say something kind\u2026'}" value="${esc(chat.draft || '')}" aria-label="Message"><button type="button" class="g-go" data-act="send">Send</button></div>`}
      <p class="sc-note">One room \u00b7 no DMs \u00b7 bad words are filtered \u00b7 slurs never send${chat.source === 'mock' ? ' \u00b7 sample messages' : ''}</p>
    </article>
    ${prompt}
  </main>`
}
