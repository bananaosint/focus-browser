// Hand-rolled SVG line-icon set (stroke 2, round caps/joins, 24x24 viewBox),
// replacing every emoji/HTML-entity glyph used as a button face across the
// app. Inherits color via stroke="currentColor" and sizes to the width/height
// passed in. UMD-lite so it can be required in main (not currently needed) and
// used as a global in renderers.
//
// Usage in a renderer:
//   el.innerHTML = FocusIcons.svg('reload', 15)
//   FocusIcons.hydrate(document)   // fills every [data-icon] element
;(function () {
  // Just the inner path/shape markup per icon; svg() wraps it.
  const PATHS = {
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    forward: '<path d="M5 12h14M13 18l6-6-6-6"/>',
    reload: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    chart: '<path d="M4 20V10M12 20V4M20 20v-6"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 7-11 15-11 0 8-5 15-11 15z"/><path d="M4 20c4-3 7-6 11-11"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    bellOff: '<path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18 8a6 6 0 0 0-9.3-5"/><path d="M6 8c0 7-3 9-3 9h13"/><path d="M2 2l20 20"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    snowflake: '<path d="M12 2v20M4.2 7l15.6 10M19.8 7 4.2 17M12 6l3-3M12 6 9 3M12 18l3 3M12 18l-3 3"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
    incognito: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.55-.2-1-.5-1.4-.3-.4-.5-.85-.5-1.35a2 2 0 0 1 2-2h2.35A4.65 4.65 0 0 0 22 10.65 8.65 8.65 0 0 0 12 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    tabs: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    block: '<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    focusRings: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'
  }

  function svg(name, size) {
    const inner = PATHS[name]
    if (!inner) return ''
    const s = size || 16
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + inner + '</svg>'
  }

  // Fills any element carrying data-icon="name" (optional data-icon-size).
  function hydrate(root) {
    const scope = root || document
    scope.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon')
      const size = Number(el.getAttribute('data-icon-size')) || 16
      el.innerHTML = svg(name, size)
    })
  }

  const api = { svg, hydrate, PATHS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.FocusIcons = Object.assign(window.FocusIcons || {}, api)
})()
