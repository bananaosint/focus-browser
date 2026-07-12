// Applies a {palette, mode} theme to the current document by setting the
// --fb-* custom properties on :root. Renderer-only (needs a DOM); the main
// process never calls this — it just persists/broadcasts the preference and
// writes theme-state.js for the sandboxed pages.
//
// UMD-lite, same rationale as palettes.js. Depends on window.FocusTheme
// (palettes.js) being loaded first in a renderer.
;(function () {
  function resolveApi() {
    if (typeof window !== 'undefined' && window.FocusTheme) return window.FocusTheme
    if (typeof require !== 'undefined') return require('./palettes')
    return null
  }

  // mode must be resolved ('light' | 'dark') by the time it reaches here.
  function applyTheme(palette, mode, doc) {
    const api = resolveApi()
    if (!api) return
    const target = doc || (typeof document !== 'undefined' ? document : null)
    if (!target) return
    const tokens = api.tokensFor(palette, mode)
    const fonts = api.FONTS
    const root = target.documentElement
    root.style.setProperty('--fb-bg', tokens.bg)
    root.style.setProperty('--fb-surface', tokens.surface)
    root.style.setProperty('--fb-text', tokens.text)
    root.style.setProperty('--fb-muted', tokens.muted)
    root.style.setProperty('--fb-border', tokens.border)
    root.style.setProperty('--fb-accent', tokens.accent)
    // A translucent accent, handy for hover/active fills without a second token.
    root.style.setProperty('--fb-accent-soft', tokens.accent + '22')
    root.style.setProperty('--fb-font-sans', fonts.sans)
    root.style.setProperty('--fb-font-serif', fonts.serif)
    root.style.setProperty('--fb-font-mono', fonts.mono)
    // Expose the resolved palette/mode as data-attrs so CSS can special-case
    // e.g. light-mode-only rules without re-reading JS state.
    root.setAttribute('data-fb-palette', palette)
    root.setAttribute('data-fb-mode', mode === 'light' ? 'light' : 'dark')
  }

  const api = { applyTheme }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.FocusTheme = Object.assign(window.FocusTheme || {}, api)
})()
