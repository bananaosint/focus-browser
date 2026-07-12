// Owns the first-run onboarding "completed" flag. Skip and Finish both mark it
// completed — there is deliberately no separate skipped-vs-completed state
// (zero telemetry). Window creation lives in main.js alongside the other
// utility windows; this just gates whether it auto-shows.
class Onboarding {
  constructor(store) {
    this.store = store
  }

  isCompleted() {
    return !!(this.store.get('onboarding') || {}).completed
  }

  markCompleted() {
    this.store.update('onboarding', { completed: true, completedAt: new Date().toISOString() })
  }
}

module.exports = { Onboarding }
