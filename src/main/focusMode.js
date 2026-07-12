class FocusMode {
  constructor(store) {
    this.store = store
    this.onChange = null // wired by main.js to broadcast state to chrome + settings
  }

  get state() {
    return this.store.get('focusMode')
  }

  setEnabled(enabled) {
    this._update({ enabled: !!enabled })
  }

  setTabLimit(limit) {
    const n = Math.max(0, Math.floor(Number(limit)) || 0)
    this._update({ tabLimit: n })
  }

  _update(patch) {
    this.store.update('focusMode', patch)
    this.onChange?.(this.state)
  }
}

module.exports = { FocusMode }
