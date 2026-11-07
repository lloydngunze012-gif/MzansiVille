// The "Install Soft Life" screen (#/install, also #install), reached from the game menu.
// What it shows follows src/install.js installMode(): the browser's prompt on Android,
// Share > Add to Home Screen on iPhone, the browser-menu steps elsewhere, and a short
// "already on your home screen" once it's installed.
import { installMode } from '../install.js'

const STEPS = {
  ios: [
    'Tap the Share button at the bottom of Safari (the square with an arrow).',
    'Scroll down and tap Add to Home Screen.',
    'Tap Add. Soft Life opens from your home screen like an app.',
  ],
  manual: [
    'Tap the three-dot menu at the top right of your browser.',
    'Tap Install app, or Add to home screen.',
    'Tap Install. Soft Life opens from your home screen like an app.',
  ],
}

export function installScreen(state) {
  const mode = installMode()
  const back = state.run ? '#/play' : '#/'
  let body
  if (mode === 'done') {
    body = '<p class="in-lede">Soft Life is on your home screen. Open it from there for the full-screen campus.</p>'
  } else if (mode === 'prompt') {
    body = `<p class="in-lede">Put Soft Life on your home screen. It opens full screen like an app: no app store, no big download.</p>
      <button class="lg-go in-go" type="button" data-act="install-go">Install Soft Life</button>`
  } else {
    body = `<p class="in-lede">Put Soft Life on your home screen. It opens full screen like an app: no app store, no big download.</p>
      <ol class="in-steps" data-mode="${mode}">${STEPS[mode].map((text, i) => `<li><b>${i + 1}</b><span>${text}</span></li>`).join('')}</ol>`
  }
  return `<main class="screen lg" data-screen="install" data-mode="${mode}">
    <div class="lg-top"><a class="lg-back" href="${back}">← Back</a></div>
    <article class="lg-card">
      <img class="in-icon" src="/icons/icon-192.png" alt="" width="64" height="64">
      <p class="lg-kicker">On your phone</p>
      <h1>${mode === 'done' ? 'Installed' : 'Install Soft Life'}</h1>
      ${body}
    </article>
  </main>`
}
