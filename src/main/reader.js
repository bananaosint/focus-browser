// Heuristic, dependency-free content extraction — not Mozilla Readability
// (no network access to pull in a package for this, and it fits the "no
// unnecessary deps" pattern already set by the hand-rolled tray icon). Scores
// candidate containers by text length minus link density, same basic idea
// Readability uses, just far simpler. Good enough for typical article pages;
// see README's Known limitations for what it misses (comments sections,
// multi-column layouts, JS-gated content that hasn't rendered yet).
const EXTRACTION_SCRIPT = `(() => {
  try {
    const KILL_TAGS = ['script','style','noscript','iframe','object','embed','form','button','svg','nav','header','footer','aside','video','audio']
    const clone = document.body.cloneNode(true)
    KILL_TAGS.forEach((tag) => clone.querySelectorAll(tag).forEach((el) => el.remove()))
    clone.querySelectorAll('*').forEach((el) => {
      ;[...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name) || (attr.name === 'href' && /^javascript:/i.test(attr.value))) {
          el.removeAttribute(attr.name)
        }
      })
    })

    const candidates = [...clone.querySelectorAll('article, main, div, section')]
    let best = null
    let bestScore = 0
    for (const el of candidates) {
      const text = el.textContent || ''
      const linkText = [...el.querySelectorAll('a')].reduce((sum, a) => sum + (a.textContent || '').length, 0)
      const density = text.length ? linkText / text.length : 1
      const score = text.length * (1 - Math.min(density, 0.9))
      if (score > bestScore) { bestScore = score; best = el }
    }
    if (!best || bestScore < 200) return null

    const title = (document.title || best.querySelector('h1')?.textContent || '').trim()
    return { title, content: best.innerHTML }
  } catch {
    return null
  }
})()`

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function buildReaderHtml(title, content, sourceUrl) {
  let hostname = ''
  try { hostname = new URL(sourceUrl).hostname } catch { /* leave blank */ }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title || 'Reader')}</title>
<style>
  * { box-sizing: border-box; }
  html, body { background: #1e1f22; color: #dcdde0; margin: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; padding: 60px 20px 100px; }
  .reader { max-width: 640px; margin: 0 auto; }
  .source { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #6d6e73; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }
  h1 { font-size: 30px; line-height: 1.3; margin-bottom: 28px; font-weight: 600; }
  .content { font-size: 18px; line-height: 1.7; }
  .content img { max-width: 100%; height: auto; border-radius: 6px; }
  .content a { color: #7fa8ef; }
  .content * { max-width: 100%; }
  .content h2, .content h3 { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin-top: 1.6em; }
</style>
</head>
<body>
  <div class="reader">
    <div class="source">Reader view &middot; ${escapeHtml(hostname)}</div>
    <h1>${escapeHtml(title || '')}</h1>
    <div class="content">${content}</div>
  </div>
</body>
</html>`
}

module.exports = { EXTRACTION_SCRIPT, buildReaderHtml }
