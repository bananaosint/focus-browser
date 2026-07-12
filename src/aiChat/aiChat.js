const widthShrinkBtn = document.getElementById('width-shrink-btn')
const widthGrowBtn = document.getElementById('width-grow-btn')
const clearBtn = document.getElementById('clear-btn')
const bannerEl = document.getElementById('not-configured-banner')
const messagesEl = document.getElementById('messages')
const inputEl = document.getElementById('chat-input')
const sendBtn = document.getElementById('send-btn')
const macroBtn = document.getElementById('macro-btn')

// jobId -> { log, stopBtn } for macros currently running in the background
// (main process keeps the actual state; this is just the UI's view of it).
const activeMacros = new Map()

const WIDTH_STEP = 40
let currentWidth = 320
let hasApiKey = false
let sending = false

// Provider-shaped conversation history (Anthropic/OpenAI message objects,
// including tool_use/tool_result blocks) — sent back to main.js on every
// turn and appended to there, not reconstructed from what's on screen. The
// *displayed* messages below are a simplified view of the same thing.
let conversation = []

// ---- minimal, safe markdown rendering ----
//
// Not a CommonMark implementation — covers what an LLM asked to "format
// lists, steps, and key data points using clear Markdown" actually produces
// (bold, inline code, code blocks, links, headers, bullet/numbered lists).
// Escaping happens *before* any markdown transform runs, and the transforms
// only ever produce a fixed set of safe tags — matters because assistant
// replies can echo back content from a page read via the read_tab tool, so
// this text isn't fully trusted the way the user's own typed input is.
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function renderMarkdown(text) {
  let html = escapeHtml(text)

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  html = html.replace(/^#{1,3} (.*)$/gm, '<h3>$1</h3>')

  const lines = html.split('\n')
  const out = []
  let listType = null
  for (const line of lines) {
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    const numbered = /^\d+\.\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol'
      if (listType !== type) {
        if (listType) out.push(`</${listType}>`)
        out.push(`<${type}>`)
        listType = type
      }
      out.push(`<li>${bullet ? bullet[1] : numbered[1]}</li>`)
    } else {
      if (listType) {
        out.push(`</${listType}>`)
        listType = null
      }
      out.push(line)
    }
  }
  if (listType) out.push(`</${listType}>`)

  return out.join('\n').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>')
}

// ---- display ----

function addMessage(role, text) {
  const el = document.createElement('div')
  el.className = 'message ' + role
  if (role === 'assistant') el.innerHTML = renderMarkdown(text)
  else el.textContent = text
  messagesEl.appendChild(el)
  messagesEl.scrollTop = messagesEl.scrollHeight
  return el
}

function addToolNote(text) {
  const el = document.createElement('div')
  el.className = 'tool-note'
  el.textContent = text
  messagesEl.appendChild(el)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function summarizeToolResult(name, result) {
  if (result?.error) return `⚠ ${result.error}`
  switch (name) {
    case 'new_tab':
      return '✓ opened tab'
    case 'read_tab':
      return `✓ read "${result.title || result.url}" (${(result.text || '').length.toLocaleString()} chars)`
    case 'start_pomodoro':
      return `✓ started timer (${result.workMin}m on / ${result.breakMin}m off)`
    case 'read_history':
      return `✓ found ${result.entries?.length ?? 0} history entries`
    case 'run_sandboxed_script':
      return `✓ ran script${result.logs?.length ? ` (${result.logs.length} log line${result.logs.length === 1 ? '' : 's'})` : ''}`
    case 'run_page_script':
      return `✓ ran page script on ${result.url || 'tab'}`
    case 'read_block_settings':
      return `✓ blocker ${result.enabled ? 'enabled' : 'disabled'} (${result.blocklist?.length ?? 0} blocked, ${result.allowlist?.length ?? 0} allowed)`
    case 'manage_site_list':
      return `✓ updated site list (${result.blocklist?.length ?? 0} blocked, ${result.allowlist?.length ?? 0} allowed)`
    case 'read_activity_log':
      return `✓ found ${result.entries?.length ?? 0} activity log entries`
    default:
      return '✓ done'
  }
}

// ---- background macros ----

function createMacroCard(goalText) {
  const card = document.createElement('div')
  card.className = 'macro-card'

  const header = document.createElement('div')
  header.className = 'macro-header'
  const title = document.createElement('span')
  title.textContent = `⚙ Running: ${goalText.slice(0, 60)}`
  const stopBtn = document.createElement('button')
  stopBtn.className = 'macro-stop'
  stopBtn.textContent = 'Stop'
  header.append(title, stopBtn)

  const log = document.createElement('div')
  log.className = 'macro-log'

  card.append(header, log)
  messagesEl.appendChild(card)
  messagesEl.scrollTop = messagesEl.scrollHeight
  return { log, stopBtn }
}

function appendMacroLog(log, text) {
  const el = document.createElement('div')
  el.textContent = text
  log.appendChild(el)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

async function runMacro() {
  const text = inputEl.value.trim()
  if (!text || macroBtn.disabled) return

  addMessage('user', text)
  inputEl.value = ''
  macroBtn.disabled = true

  const { log, stopBtn } = createMacroCard(text)
  try {
    const { jobId } = await window.aiChatAPI.runMacro(conversation, text)
    stopBtn.addEventListener('click', () => window.aiChatAPI.cancelMacro(jobId))
    activeMacros.set(jobId, { log, stopBtn })
  } catch (err) {
    appendMacroLog(log, `⚠ ${err.message || 'Could not start background task.'}`)
    stopBtn.disabled = true
  } finally {
    macroBtn.disabled = false
  }
}

window.aiChatAPI.onMacroEvent(({ jobId, event }) => {
  const entry = activeMacros.get(jobId)
  if (!entry) return
  if (event.type === 'text') appendMacroLog(entry.log, event.text)
  else if (event.type === 'tool_call') appendMacroLog(entry.log, `🔧 ${event.name}(${JSON.stringify(event.input)})`)
  else if (event.type === 'tool_result') appendMacroLog(entry.log, summarizeToolResult(event.name, event.result))
  else if (event.type === 'cancelled') appendMacroLog(entry.log, '⏹ stopped')
})

window.aiChatAPI.onMacroDone(({ jobId, ok, messages, error }) => {
  const entry = activeMacros.get(jobId)
  if (!entry) return
  entry.stopBtn.disabled = true
  entry.stopBtn.textContent = 'Done'
  if (ok) conversation = messages
  else appendMacroLog(entry.log, `⚠ ${error}`)
  activeMacros.delete(jobId)
})

macroBtn.addEventListener('click', runMacro)

let thinkingEl = null
function showThinking() {
  thinkingEl = document.createElement('div')
  thinkingEl.className = 'tool-note thinking'
  thinkingEl.textContent = 'FocusCompanion is thinking…'
  messagesEl.appendChild(thinkingEl)
  messagesEl.scrollTop = messagesEl.scrollHeight
}
function hideThinking() {
  thinkingEl?.remove()
  thinkingEl = null
}

function setSending(value) {
  sending = value
  sendBtn.disabled = value
  inputEl.disabled = value
}

// ---- sending ----

async function sendMessage() {
  const text = inputEl.value.trim()
  if (!text || sending) return

  addMessage('user', text)
  inputEl.value = ''
  setSending(true)
  showThinking()

  try {
    const result = await window.aiChatAPI.sendMessage(conversation, text)
    hideThinking()

    if (!result.ok) {
      addToolNote(`⚠ ${result.error}`)
      return
    }

    conversation = result.messages
    result.events.forEach((event) => {
      if (event.type === 'text') addMessage('assistant', event.text)
      else if (event.type === 'tool_call') addToolNote(`🔧 ${event.name}(${JSON.stringify(event.input)})`)
      else if (event.type === 'tool_result') addToolNote(summarizeToolResult(event.name, event.result))
    })
  } catch (err) {
    hideThinking()
    addToolNote(`⚠ ${err.message || 'Something went wrong.'}`)
  } finally {
    setSending(false)
    inputEl.focus()
  }
}

sendBtn.addEventListener('click', sendMessage)
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

clearBtn.addEventListener('click', () => {
  conversation = []
  messagesEl.innerHTML = ''
})

widthShrinkBtn.addEventListener('click', () => window.aiChatAPI.setSidebarWidth(currentWidth - WIDTH_STEP))
widthGrowBtn.addEventListener('click', () => window.aiChatAPI.setSidebarWidth(currentWidth + WIDTH_STEP))

function applyState(state) {
  currentWidth = state.sidebarWidth
  hasApiKey = !!state.apiKey
  bannerEl.classList.toggle('hidden', hasApiKey)
}

window.aiChatAPI.onState(applyState)
window.aiChatAPI.getState().then(applyState)
