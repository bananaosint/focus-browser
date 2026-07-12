const { nativeTheme } = require('electron')
const { PALETTES, DEFAULT_THEME } = require('../theme/palettes')

// Sole owner + mutator of the persisted theme preference. Stores the user's
// *choice* — mode is one of 'light' | 'dark' | 'system' — and resolves the
// concrete light/dark at read/broadcast time. main.js wires onChange to do the
// actual fan-out (broadcast to trusted windows, rewrite theme-state.js, push
// into open newtab/blocked tabs); this class stays free of window plumbing.
class Theme {
  constructor(store) {
    this.store = store
    this.onChange = null // (resolved: { palette, mode }) => void
    // Re-broadcast when Windows' own light/dark setting flips, but only while
    // the user's mode is 'system'. When they've pinned light or dark, OS
    // changes are ignored entirely.
    nativeTheme.on('updated', () => {
      if (this.getRaw().mode === 'system' && this.onChange) this.onChange(this.getResolved())
    })
  }

  // The stored preference as-is ({ palette, mode } with mode possibly 'system').
  getRaw() {
    const t = this.store.get('theme') || {}
    const palette = PALETTES[t.palette] ? t.palette : DEFAULT_THEME.palette
    const mode = ['light', 'dark', 'system'].includes(t.mode) ? t.mode : DEFAULT_THEME.mode
    return { palette, mode }
  }

  // Resolves 'system' to a concrete 'light' | 'dark' using the OS setting.
  // This is what renderers actually apply — they never see 'system'.
  getResolved() {
    const { palette, mode } = this.getRaw()
    const resolved = mode === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : mode
    return { palette, mode: resolved }
  }

  set({ palette, mode }) {
    const patch = {}
    if (palette && PALETTES[palette]) patch.palette = palette
    if (['light', 'dark', 'system'].includes(mode)) patch.mode = mode
    if (!Object.keys(patch).length) return this.getResolved()
    this.store.update('theme', patch)
    const resolved = this.getResolved()
    if (this.onChange) this.onChange(resolved)
    return resolved
  }
}

module.exports = { Theme }
