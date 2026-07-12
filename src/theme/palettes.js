// Single source of truth for the theme system's color tokens.
//
// UMD-lite: works both as `require('../theme/palettes')` in the main process
// and as a plain <script src="../theme/palettes.js"> in every renderer (this
// project has no bundler — multi-file JS is loaded via <script> tags and a
// shared window namespace). Do not duplicate these hex values anywhere else;
// the Settings → Appearance UI and every window read them from here.
;(function () {
  // Three palettes, each with a light and dark variant. Token keys map 1:1 to
  // the --fb-* CSS custom properties applied to :root (see applyTheme.js).
  const PALETTES = {
    nightlofi: {
      label: 'Night lofi',
      blurb: 'Warm charcoal, dusty terracotta',
      light: { bg: '#f2ece2', surface: '#ffffff', text: '#2a221c', muted: '#8a7f70', border: '#e2d8c8', accent: '#c1734f' },
      dark:  { bg: '#211d1a', surface: '#2a2521', text: '#ece6df', muted: '#a89f92', border: '#3a332c', accent: '#d98b6b' }
    },
    washi: {
      label: 'Washi and ink',
      blurb: 'Paper, sumi ink, hanko red',
      light: { bg: '#f4ede1', surface: '#fbf7f0', text: '#221f1a', muted: '#857c6d', border: '#e3d8c4', accent: '#b23a2e' },
      dark:  { bg: '#1c1a17', surface: '#262320', text: '#ece5d8', muted: '#9b9082', border: '#37322b', accent: '#d9584a' }
    },
    zen: {
      label: 'Zen garden',
      blurb: 'Stone gray, sage and clay',
      light: { bg: '#eceeec', surface: '#f7f8f6', text: '#262a27', muted: '#7c847d', border: '#d7dbd6', accent: '#6f8f74' },
      dark:  { bg: '#1b1f1c', surface: '#232723', text: '#e2e6e2', muted: '#8b968e', border: '#333833', accent: '#8fb894' }
    }
  }

  const FONTS = {
    sans: '-apple-system, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Noto Serif", serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace'
  }

  const DEFAULT_THEME = { palette: 'nightlofi', mode: 'dark' }

  // Returns the flat color token set for a given palette + resolved mode.
  // `mode` here must already be 'light' or 'dark' — 'system' is resolved
  // upstream (main/theme.js) before this is ever called.
  function tokensFor(palette, mode) {
    const p = PALETTES[palette] || PALETTES[DEFAULT_THEME.palette]
    const m = mode === 'light' ? 'light' : 'dark'
    return p[m]
  }

  const api = { PALETTES, FONTS, DEFAULT_THEME, tokensFor }

  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.FocusTheme = Object.assign(window.FocusTheme || {}, api)
})()
