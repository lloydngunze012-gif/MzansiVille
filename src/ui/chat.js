import { QUICK, chatLog, onChat, say } from '../chat.js'
import { CHAT_MAX } from '../engine/filter.js'

// Piece 3: the chat on campus. A round Talk button (bottom right, above Stop) opens a
// small panel at the bottom of the screen: the log of what was said near you (scrolls),
// eight quick phrases, and a text box (120 characters). The two-shot camera frames you
// and whoever is with you above it. "Say hi" on a player's card opens it too.
// Opening asks the scene for the two-shot (mzansi-chat-open); closing ends it
// (mzansi-convo-end). A name in the log opens that player's card (Block, Report).

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

// (the button lives in the 3D view; the panel over the whole page, above the game's
// bottom bar and under a player's card)
export function mountChat(host) {
  host.insertAdjacentHTML('beforeend', '<button type="button" class="chat-btn" aria-label="Talk to people near you"><span aria-hidden="true">\u{1F4AC}</span>Talk</button>')
  document.body.insertAdjacentHTML('beforeend', `
    <section class="chat-panel" role="dialog" aria-label="Chat with people near you" hidden>
      <header class="chat-head"><b>\u{1F4AC} Nearby</b><small>Heard within 15 m</small><button type="button" class="chat-x" aria-label="Close the chat">✕</button></header>
      <ol class="chat-log" aria-live="polite"></ol>
      <div class="chat-quick">${QUICK.map((q) => `<button type="button" data-say="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="chat-form" autocomplete="off">
        <input type="text" name="say" maxlength="${CHAT_MAX}" placeholder="Say something…" enterkeyhint="send" aria-label="Message">
        <span class="chat-count">0/${CHAT_MAX}</span>
        <button type="submit">Send</button>
      </form>
      <p class="chat-note" role="status"></p>
    </section>`)
  const button = host.querySelector('.chat-btn')
  const panel = document.body.querySelector('.chat-panel')
  const list = panel.querySelector('.chat-log')
  const input = panel.querySelector('input')
  const count = panel.querySelector('.chat-count')
  const note = panel.querySelector('.chat-note')
  let open = false

  const row = (m) => `<li class="${m.me ? 'me' : ''}">${m.me ? '<b>You</b>' : `<button type="button" class="chat-who" data-id="${esc(m.id)}" data-text="${esc(m.text)}">${esc(m.name)}</button>`} ${esc(m.text)}</li>`
  function paint() {
    const lines = chatLog()
    list.innerHTML = lines.length ? lines.map(row).join('') : '<li class="chat-empty">Nobody has said anything near you yet. Say howzit!</li>'
    list.scrollTop = list.scrollHeight
  }
  function tell(text, bad = false) {
    note.textContent = text || ''
    note.classList.toggle('bad', bad)
  }
  function show(withId) {
    if (!open) {
      open = true
      panel.hidden = false
      button.dataset.unread = ''
      tell('')
      paint()
      window.dispatchEvent(new CustomEvent('mzansi-chat-open', { detail: { id: withId || null } }))
    }
  }
  function hide() {
    if (!open) return
    open = false
    panel.hidden = true
    input.blur()
    window.dispatchEvent(new CustomEvent('mzansi-convo-end'))
  }
  function send(text) {
    const res = say(text)
    if (!res.ok) { tell(res.note, true); return false }
    tell(!res.heard ? 'Nobody heard that: you’re offline or off campus.' : res.note, !res.heard || Boolean(res.note))
    return true
  }

  button.addEventListener('click', (event) => { event.stopPropagation(); show() })
  panel.addEventListener('click', (event) => {
    event.stopPropagation()
    if (event.target.closest('.chat-x')) { hide(); return }
    const quick = event.target.closest('[data-say]')
    if (quick) { send(quick.dataset.say); return }
    const who = event.target.closest('.chat-who')
    if (who && !document.querySelector('.pc-sheet-wrap.on')) window.dispatchEvent(new CustomEvent('mzansi-player-card', { detail: { id: who.dataset.id, message: who.dataset.text, keep: true } }))
  })
  panel.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault()
    if (send(input.value)) { input.value = ''; count.textContent = `0/${CHAT_MAX}` }
  })
  input.addEventListener('input', () => { count.textContent = `${input.value.length}/${CHAT_MAX}` })
  // (taps in the panel never reach the 3D view under it)
  for (const type of ['pointerdown', 'touchstart']) panel.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  // The phone's keyboard: the panel rides up above it.
  const vv = window.visualViewport
  const lift = () => { panel.style.bottom = `${vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0}px` }
  vv?.addEventListener('resize', lift)
  vv?.addEventListener('scroll', lift)

  onChat((entry) => {
    if (open) paint()
    else if (!entry.me) button.dataset.unread = '1'
  })
  window.addEventListener('mzansi-open-chat', (event) => show(event.detail?.id))

  return {
    show,
    hide,
    isOpen: () => open,
    // The Talk button shows on campus when nothing else is open.
    available(yes) { button.hidden = !yes || open },
    repaint: paint,
  }
}
