// A stale page after a redeploy (owner, 6 Nov): the phone still has the old page, whose
// game files (hashed chunk names) are gone from the server, so the next lazy load (the
// 3D campus, the morning, a lecture) fails and the player sat on an empty green screen.
// Any failed game-file load now shows "Updating..." for a second and reloads the page,
// which fetches the new build. A reload at most once every 30 s, so a real outage
// never loops; the save is on the phone and is kept.

const KEY = 'mzansiville.updateReload'
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i
let going = false

export function reloadForUpdate(reason = '') {
  if (going) return true
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0
    if (Date.now() - last < 30000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { /* storage blocked: reload once anyway */ }
  going = true
  const card = document.createElement('div')
  card.className = 'updating'
  card.setAttribute('role', 'status')
  card.dataset.reason = String(reason).slice(0, 120)
  // (styled inline: the stylesheet may be one of the files that failed)
  card.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#f4ecdcf2'
  card.innerHTML = '<p style="margin:0;padding:14px 24px;border-radius:999px;background:#fffaf0;border:1.5px solid #e3d8c4;color:#1c1915;font:800 17px system-ui;box-shadow:0 6px 18px #0002">Updating…</p>'
  document.body.append(card)
  setTimeout(() => location.reload(), 1000)
  return true
}

export function isStaleLoad(error) {
  return STALE.test(String(error?.message || error || ''))
}

// Vite tells us when a lazy chunk (or its CSS) fails to load.
window.addEventListener('vite:preloadError', (event) => { event.preventDefault?.(); reloadForUpdate('preload') })
// A failed dynamic import nobody caught.
window.addEventListener('unhandledrejection', (event) => { if (isStaleLoad(event.reason)) reloadForUpdate(event.reason?.message) })
// A module script that failed to load (a <script> or a chunk of ours from /assets/).
window.addEventListener('error', (event) => {
  const src = event.target?.src || event.target?.href || ''
  if ((event.target !== window && /\/assets\/.+\.(js|css)(\?|$)/.test(src)) || isStaleLoad(event.message)) reloadForUpdate(src || event.message)
}, true)
// Tests (read only): has this page asked for an update reload?
window.mzansiUpdating = () => going
