// The "Install Soft Life" screen (#/install, also #install), reached from the game menu.
// What it shows follows src/install.js installMode(): the browser's prompt on Android,
// Share > Add to Home Screen on iPhone, the browser-menu steps elsewhere, and a short
// "already on your home screen" once it's installed.
import { chromeIntent, installMode } from '../install.js'

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

// iPhone and iPad: a bottom sheet over whatever screen you are on, an arrow down to Safari's Share button.
export function iosSheet() {
  return `<div class="in-sheet" role="dialog" aria-modal="true" aria-label="Install Soft Life">
    <button class="in-scrim" type="button" data-act="install-close" aria-label="Close"></button>
    <div class="in-panel">
      <h2>Install Soft Life</h2>
      <p class="in-apple">Apple only lets you add apps to the home screen from Safari's Share button. It takes three taps.</p>
      <ol class="in-steps" data-mode="ios">${STEPS.ios.map((text, i) => `<li><b>${i + 1}</b><span>${text}</span></li>`).join('')}</ol>
      <button class="lg-go in-go" type="button" data-act="install-close">Got it</button>
      <div class="in-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 3v15M5.5 12 12 18.5 18.5 12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Share is down here</span></div>
    </div>
  </div>`
}

export function installScreen(state) {
  const mode = installMode()
  const back = state.run ? '#/play' : '#/'
  let body
  if (mode === 'done') {
    body = '<p class="in-lede">Soft Life is on your home screen. Open it from there for the full-screen campus.</p>'
  } else if (mode === 'inapp') {
    body = `<p class="in-lede">This browser inside another app can't install Soft Life. Open the game in Chrome, then tap Install.</p>
      <a class="lg-go in-go" href="${chromeIntent()}" data-act="open-chrome">Open in Chrome</a>`
  } else if (mode === 'inapp-ios') {
    body = `<p class="in-lede">This browser inside another app can't install Soft Life. Copy the link, open Safari, paste it, then tap Install.</p>
      <button class="lg-go in-go" type="button" data-act="copy-link">Copy link, then open Safari</button>
      <p class="in-copied" role="status" aria-live="polite"></p>`
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
