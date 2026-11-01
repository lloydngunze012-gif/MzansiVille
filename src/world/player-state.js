// One state for the player, instead of six separate lock flags.
// free, walking and running: the controls are yours (the stick, ground taps, people).
// queueing, talking, doing, seated, sleeping: something is playing out; the screen
// shows one button to leave it, and leaving always comes back to free.
// The watchdog: a non-free state with nothing happening for 3 s goes back to free.

export const STATES = ['free', 'walking', 'running', 'queueing', 'talking', 'doing', 'seated', 'sleeping']
const OPEN = new Set(['free', 'walking', 'running'])
const LEAVE = { queueing: 'Leave queue', talking: 'Goodbye', doing: 'Stop', seated: 'Stand up', sleeping: 'Get up' }
const IDLE_LIMIT = 3000

export function createPlayerState({ host, onExit, alive }) {
  let state = 'free'
  let since = performance.now()
  let busyUntil = 0
  let lastBusy = performance.now()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ps-leave'
  button.hidden = true
  host.append(button)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    leave('button')
  })

  function show() {
    host.dataset.playerState = state
    const label = LEAVE[state]
    button.hidden = !label
    if (label) button.textContent = label
  }

  function set(next) {
    if (!STATES.includes(next)) throw new Error(`unknown player state ${next}`)
    if (next === state) return
    state = next
    since = performance.now()
    lastBusy = since
    show()
  }

  // Leave whatever is playing out: the owner of the state cleans up (onExit), and we
  // are free whatever it does.
  function leave(why = 'leave') {
    if (OPEN.has(state)) return
    const was = state
    try { onExit?.(was, why) } catch (error) { console.error(error) }
    if (state === was) set('free')
  }

  // Something is happening for the next few seconds (a wait, a walk, a chat on screen).
  function busy(seconds = 0.5) {
    const now = performance.now()
    busyUntil = Math.max(busyUntil, now + seconds * 1000)
    lastBusy = now
  }

  function watch() {
    if (OPEN.has(state)) return
    const now = performance.now()
    if (now < busyUntil || alive?.(state)) { lastBusy = now; return }
    if (now - lastBusy > IDLE_LIMIT) {
      host.dataset.playerStateRescued = `${state}@${Math.round(now)}`
      leave('watchdog')
    }
  }
  setInterval(watch, 500)
  show()

  return {
    get state() { return state },
    get since() { return since },
    // The stick, ground taps and taps on people work.
    get open() { return OPEN.has(state) },
    set,
    free() { if (state !== 'free') set('free') },
    leave,
    busy,
    watch,
  }
}
