const { Notification } = require('electron')

const NOTIFY_MESSAGES = {
  work: ['Work session complete', 'Nice work — take a break.'],
  shortBreak: ['Break over', 'Back to it — next work session starting.'],
  longBreak: ['Long break over', 'Back to it — next work session starting.']
}

class Pomodoro {
  constructor(store) {
    this.store = store
    this.phase = 'work' // 'work' | 'shortBreak' | 'longBreak'
    this.cycle = 0 // count of completed work sessions
    this.running = false
    this.remainingMs = this._durationFor('work')
    this._interval = null
    this._bootstrapped = false // has the current phase actually been started via start()?
    this.onChange = null // wired by main.js to broadcast state + update the tray
    // Fired only on real phase transitions (natural completion, skip, or a
    // reset that crosses out of 'work') — never on pause/resume. That's what
    // lets main.js drive the Milestone 5 auto-focus integration off these
    // without pausing becoming a backdoor to instantly lift site blocking.
    this.onPhaseBegin = null // (phase) => void
    this.onPhaseEnd = null // (phase) => void
  }

  get settings() {
    return this.store.get('pomodoro')
  }

  _durationFor(phase) {
    const s = this.settings
    if (phase === 'work') return s.workMin * 60_000
    if (phase === 'shortBreak') return s.shortBreakMin * 60_000
    return s.longBreakMin * 60_000
  }

  start() {
    if (this.running) return
    this.running = true
    // Phase transitions during auto-run (_advance) already fire onPhaseBegin
    // themselves; this only covers the cold-start case where the very first
    // work session begins via an explicit Start click.
    if (!this._bootstrapped) {
      this._bootstrapped = true
      this.onPhaseBegin?.(this.phase)
    }
    this._interval = setInterval(() => this._tick(), 1000)
    this._emit()
  }

  pause() {
    if (!this.running) return
    this.running = false
    clearInterval(this._interval)
    this._interval = null
    this._emit()
  }

  reset() {
    const wasPhase = this.phase
    this.pause()
    this.phase = 'work'
    this.cycle = 0
    this.remainingMs = this._durationFor('work')
    this._bootstrapped = false // next start() begins a fresh, hook-triggering work session
    if (wasPhase !== 'work') this.onPhaseEnd?.(wasPhase)
    this._emit()
  }

  skip() {
    this._advance(true)
  }

  updateSettings(patch) {
    this.store.update('pomodoro', patch)
    // Only snap the current countdown to the new duration if nothing is
    // running yet — an in-progress session shouldn't jump around because the
    // user tweaked a setting in another window.
    if (!this.running) this.remainingMs = this._durationFor(this.phase)
    this._emit()
  }

  setMuted(muted) {
    this.store.update('pomodoro', { muted: !!muted })
    this._emit()
  }

  // +/- minutes on the fly, from the timer window's adjust buttons. Clamped
  // at 0, not at the configured duration — deliberately lets a session run
  // longer than its own settings if the user asks for it. Doesn't force an
  // immediate phase change if this drops remainingMs to 0; the next regular
  // _tick() (at most 1s later, if running) picks it up exactly like a
  // natural completion. If paused, it just sits at 0 until Start is pressed.
  adjustTime(deltaMs) {
    this.remainingMs = Math.max(0, this.remainingMs + deltaMs)
    this._emit()
  }

  _tick() {
    this.remainingMs -= 1000
    if (this.remainingMs <= 0) {
      this._advance(false)
      return
    }
    this._emit()
  }

  _advance(isManualSkip) {
    const endedPhase = this.phase
    if (this.phase === 'work') {
      this.cycle += 1
      this.phase = this.cycle % this.settings.cyclesBeforeLongBreak === 0 ? 'longBreak' : 'shortBreak'
    } else {
      this.phase = 'work'
    }
    this.remainingMs = this._durationFor(this.phase)
    if (!isManualSkip) this._notify(endedPhase)
    this.onPhaseEnd?.(endedPhase)
    this.onPhaseBegin?.(this.phase)
    this._emit()
  }

  _notify(endedPhase) {
    if (this.settings.muted) return
    if (!Notification.isSupported()) return
    const [title, body] = NOTIFY_MESSAGES[endedPhase] || ['Session complete', '']
    new Notification({ title, body }).show()
  }

  getState() {
    return {
      phase: this.phase,
      cycle: this.cycle,
      running: this.running,
      remainingMs: this.remainingMs,
      settings: this.settings
    }
  }

  _emit() {
    this.onChange?.(this.getState())
  }
}

module.exports = { Pomodoro }
