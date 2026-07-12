// New-tab page behavior: time-of-day greeting, live clock, a calm generative
// background pattern, a search box, and the bookmarks grid. No preload/IPC —
// this is sandboxed tab content; the theme arrives via theme-state.js + the
// __applyFbTheme push (see newtab.html).

// ---- greeting + clock ----
const greetingEl = document.getElementById('greeting')
const clockEl = document.getElementById('clock')

function updateGreetingAndClock() {
  const now = new Date()
  const h = now.getHours()
  let g
  if (h < 5) g = 'Still up'
  else if (h < 12) g = 'Good morning'
  else if (h < 17) g = 'Good afternoon'
  else if (h < 22) g = 'Good evening'
  else g = 'Good night'
  greetingEl.textContent = g
  const hh = String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  clockEl.textContent = `${hh}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}
updateGreetingAndClock()
setInterval(updateGreetingAndClock, 15000)

// ---- search ----
// Sandboxed page: navigate ourselves. URL-ish input goes straight there,
// everything else is a Google search (the address bar honors the configured
// engine; this is a lightweight convenience surface).
const searchInput = document.getElementById('search-input')
searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = searchInput.value.trim()
  if (!q) return
  let url
  if (/^https?:\/\//i.test(q)) url = q
  else if (/^\S+\.[a-z]{2,}([/:?#].*)?$/i.test(q)) url = 'https://' + q
  else url = 'https://www.google.com/search?q=' + encodeURIComponent(q)
  window.location.href = url
})

// ---- generative background pattern ----
// A handful of thin curved strokes in the theme's accent color, low opacity,
// control points randomized per load and drifting slowly via sine offsets.
// Cheap (no noise library), calm (<=5 strokes), and considerate: it renders a
// single static frame under prefers-reduced-motion and pauses while the tab is
// hidden (Page Visibility API).
const canvas = document.getElementById('pattern')
const ctx = canvas.getContext('2d')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let strokes = []
let rafId = null
let dpr = 1

function accentColor() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--fb-accent').trim()
  return c || '#d98b6b'
}

function seedStrokes() {
  const count = 3 + Math.floor(Math.random() * 3) // 3..5
  strokes = []
  for (let i = 0; i < count; i++) {
    const pts = []
    const n = 3 + Math.floor(Math.random() * 2)
    for (let j = 0; j <= n; j++) {
      pts.push({
        bx: Math.random(),
        by: Math.random(),
        ax: 0.04 + Math.random() * 0.08, // drift amplitude (fraction of viewport)
        ay: 0.04 + Math.random() * 0.08,
        px: Math.random() * Math.PI * 2,
        py: Math.random() * Math.PI * 2,
        sp: 0.15 + Math.random() * 0.25 // drift speed
      })
    }
    strokes.push({ pts, width: 1 + Math.random() * 1.5, alpha: 0.1 + Math.random() * 0.06 })
  }
}

function resize() {
  dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
}

function draw(timeMs) {
  const W = canvas.width
  const H = canvas.height
  const t = (timeMs || 0) / 1000
  ctx.clearRect(0, 0, W, H)
  ctx.strokeStyle = accentColor()
  ctx.lineCap = 'round'
  for (const s of strokes) {
    ctx.globalAlpha = s.alpha
    ctx.lineWidth = s.width * dpr
    ctx.beginPath()
    const coords = s.pts.map((p) => {
      const x = (p.bx + Math.sin(t * p.sp + p.px) * p.ax) * W
      const y = (p.by + Math.cos(t * p.sp + p.py) * p.ay) * H
      return { x, y }
    })
    ctx.moveTo(coords[0].x, coords[0].y)
    for (let i = 1; i < coords.length; i++) {
      const xc = (coords[i - 1].x + coords[i].x) / 2
      const yc = (coords[i - 1].y + coords[i].y) / 2
      ctx.quadraticCurveTo(coords[i - 1].x, coords[i - 1].y, xc, yc)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function loop(ts) {
  draw(ts)
  rafId = requestAnimationFrame(loop)
}

function startAnimation() {
  if (reduceMotion || rafId !== null) return
  rafId = requestAnimationFrame(loop)
}
function stopAnimation() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
}

function initPattern() {
  resize()
  seedStrokes()
  if (reduceMotion) draw(0)
  else startAnimation()
}

// Re-seed + recolor when the theme changes (called from __applyFbTheme).
window.__fbRefreshPattern = function () {
  seedStrokes()
  if (reduceMotion) draw(0)
}

window.addEventListener('resize', () => { resize(); if (reduceMotion) draw(0) })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAnimation()
  else startAnimation()
})
initPattern()

// ---- bookmarks ----
const grid = document.getElementById('bookmarks-grid')
const emptyState = document.getElementById('no-bookmarks')
const list = window.BOOKMARKS || []
if (list.length === 0) {
  emptyState.classList.remove('hidden')
} else {
  list.forEach((b) => {
    const card = document.createElement('a')
    card.className = 'bookmark-card'
    card.href = b.url
    const name = b.title || b.url
    const initial = name.trim().replace(/^(https?:\/\/)?(www\.)?/, '').charAt(0).toUpperCase()
    const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const iconBg = `hsl(${hash % 360}, 32%, 42%)`
    const icon = document.createElement('div')
    icon.className = 'bookmark-icon'
    icon.style.background = iconBg
    icon.textContent = initial
    const title = document.createElement('div')
    title.className = 'bookmark-title'
    title.title = name
    title.textContent = name
    card.appendChild(icon)
    card.appendChild(title)
    grid.appendChild(card)
  })
}
