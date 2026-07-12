const phaseLabelEl = document.getElementById('phase-label')
const timeEl = document.getElementById('time')
const dotsEl = document.getElementById('cycle-dots')
const primaryBtn = document.getElementById('primary-btn')
const resetBtn = document.getElementById('reset-btn')
const skipBtn = document.getElementById('skip-btn')
const muteBtn = document.getElementById('mute-btn')

const PHASE_LABELS = { work: 'Work', shortBreak: 'Short Break', longBreak: 'Long Break' }

function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function render(state) {
  document.body.className = 'phase-' + state.phase
  phaseLabelEl.textContent = PHASE_LABELS[state.phase] || state.phase
  timeEl.textContent = formatTime(state.remainingMs)
  primaryBtn.textContent = state.running ? 'Pause' : 'Start'
  muteBtn.classList.toggle('active', !!state.settings.muted)
  muteBtn.innerHTML = window.FocusIcons.svg(state.settings.muted ? 'bellOff' : 'bell', 15)
  muteBtn.title = state.settings.muted ? 'Unmute session-end sound' : 'Mute session-end sound'

  const total = state.settings.cyclesBeforeLongBreak
  // How many work sessions completed in the current cycle-set: a value of 0
  // right after finishing a set (i.e. now on a long break) should read as
  // "full", not "empty" — hence the `|| total` fallback.
  const filled = (state.cycle % total) || (state.cycle > 0 ? total : 0)
  dotsEl.innerHTML = ''
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div')
    dot.className = 'dot' + (i < filled ? ' filled' : '')
    dotsEl.appendChild(dot)
  }
}

primaryBtn.addEventListener('click', async () => {
  const state = await window.pomodoroAPI.getState()
  if (state.running) window.pomodoroAPI.pause()
  else window.pomodoroAPI.start()
})
resetBtn.addEventListener('click', () => window.pomodoroAPI.reset())
skipBtn.addEventListener('click', () => window.pomodoroAPI.skip())

muteBtn.addEventListener('click', async () => {
  const state = await window.pomodoroAPI.getState()
  window.pomodoroAPI.setMuted(!state.settings.muted)
})

document.querySelectorAll('.adjust-btn').forEach((btn) => {
  btn.addEventListener('click', () => window.pomodoroAPI.adjustTime(Number(btn.dataset.delta)))
})

window.pomodoroAPI.onState(render)
window.pomodoroAPI.getState().then(render)

// ---- theme ----
function applyPomodoroTheme(t) {
  if (t) window.FocusTheme.applyTheme(t.palette, t.mode)
}
window.pomodoroAPI.getTheme().then(applyPomodoroTheme)
window.pomodoroAPI.onThemeChanged(applyPomodoroTheme)
