import { avatarSvg } from './avatar.js'

const app = document.getElementById('app')

function title() {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem('mzansiville.v1') || 'null')
  } catch {
    saved = null
  }
  const day = saved?.run?.day
  const continueBtn = day
    ? `<button class="btn ghost block" type="button" data-go="play">Continue · day ${day}</button>`
    : ''
  return `
    <main class="screen dark" data-screen="title">
      <div class="avatar-preview">${avatarSvg({ skin: 'amber', hair: 'braids', outfit: 'hoodie' }, '', 120)}</div>
      <p class="chip">A district at a time</p>
      <h1 class="wordmark" style="margin-top:18px">Mzansi<br/><em>Ville</em></h1>
      <p class="lede">A life sim you can finish on the bus. Guest first. Your person stays when the next district opens.</p>
      <div class="grow"></div>
      <div class="stack">
        ${continueBtn}
        <button class="btn primary block" type="button" data-go="rules">Start as guest</button>
      </div>
      <nav class="links" style="margin-top:18px">
        <a href="#/rules">Rules</a>
        <a href="#/privacy">Privacy</a>
        <a href="#/terms">Terms</a>
      </nav>
    </main>`
}

function soon(name, titleText) {
  return `
    <main class="screen pad" data-screen="${name}">
      <a class="link" href="#/">Back</a>
      <h1 style="margin-top:18px">${titleText}</h1>
      <p class="lede">This screen is next.</p>
    </main>`
}

function render() {
  const shot = new URLSearchParams(location.search).get('shot')
  const route = (location.hash.replace(/^#\/?/, '').split('/')[0] || 'title')
  const name = shot || route
  if (name === 'title' || name === '') app.innerHTML = title()
  else if (name === 'rules') app.innerHTML = soon('rules', 'Community rules')
  else if (name === 'privacy') app.innerHTML = soon('privacy', 'Privacy')
  else if (name === 'terms') app.innerHTML = soon('terms', 'Terms')
  else app.innerHTML = title()
  const screen = app.querySelector('[data-screen]')
  app.dataset.screen = screen?.dataset.screen || 'title'
}

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-go]')
  if (!button) return
  location.hash = '#/' + button.dataset.go
})

window.addEventListener('hashchange', render)
render()
