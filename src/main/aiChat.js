// FocusCompanion: the AI chat sidebar's actual provider integration. Split
// from src/aiChat/ (the renderer UI) on purpose — the API key lives in main-
// process-only settings, and tool execution needs access to tabManager/
// pomodoro/history, none of which a sandboxed, no-Node renderer can touch
// directly.

const SYSTEM_PROMPT = `You are "FocusCompanion," a hyper-efficient, distraction-free productivity assistant built directly into the user's web browser.

Your goal is to help the user manage their attention, synthesize web information, and maintain a state of deep work.

CRITICAL BEHAVIOR:
1. Be concise. Never use two paragraphs when two sentences will do.
2. Do not use conversational filler ("Sure, I can help with that!"). Get straight to the point or the action.
3. If the user asks you to do something outside your capability, state clearly: "I cannot perform that action."
4. Format all lists, steps, and key data points using clear Markdown.`

const vm = require('vm')

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'
const DEFAULT_OPENAI_MODEL = 'gpt-4o'
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOOL_ITERATIONS = 5 // safety net against a runaway tool-call loop, not a normal case
const MACRO_MAX_ITERATIONS = 20 // macros are expected to chain many more steps than a normal chat turn
const MACRO_MAX_MS = 3 * 60 * 1000 // wall-clock cap so a macro can't run forever even mid-iteration
const READ_TAB_CHAR_LIMIT = 12_000 // enough for a real article/page, not so much it dominates the context window
const SANDBOX_SCRIPT_TIMEOUT_MS = 3000 // vm.runInContext's own timeout, for CPU-bound infinite loops
const PAGE_SCRIPT_TIMEOUT_MS = 8000 // executeJavaScript has no native timeout, so this races it manually

// Tool schema in a provider-neutral shape; converted to each provider's own
// format (Anthropic's input_schema vs. OpenAI's function.parameters) right
// before the request goes out.
const TOOLS = [
  {
    name: 'new_tab',
    description: 'Opens a new browser tab at the given URL.',
    parameters: {
      url: { type: 'string', description: 'The URL to open (a full https:// URL, or a bare domain).' }
    },
    required: ['url']
  },
  {
    name: 'read_tab',
    description:
      "Reads the full visible text of a tab that is ALREADY open, given its URL, so questions about that page can be answered. Only works for tabs the user currently has open — cannot fetch or open a page that isn't already a tab (use new_tab first, then ask again once it's loaded).",
    parameters: {
      url: { type: 'string', description: 'The URL of the already-open tab to read.' }
    },
    required: ['url']
  },
  {
    name: 'start_pomodoro',
    description: 'Starts a Pomodoro focus timer with the given work and break durations, in minutes. Replaces any timer currently running.',
    parameters: {
      timeon: { type: 'number', description: 'Work session length in minutes.' },
      timeoff: { type: 'number', description: 'Break length in minutes.' }
    },
    required: ['timeon', 'timeoff']
  },
  {
    name: 'read_history',
    description: "Returns the user's recent browsing history (URL, title, last-visited time) to find or reopen relevant past sites.",
    parameters: {},
    required: []
  },
  {
    name: 'run_sandboxed_script',
    description:
      'Runs JavaScript in an isolated sandbox with NO access to the page, network, or filesystem — use this for pure computation: parsing/analyzing CSV or JSON text, math, formatting, extracting patterns from text. The `input` string (if given) is available in the script as the global `input`. The script must assign its output to `result` (e.g. `result = total`); `console.log(...)` calls are also captured and returned.',
    parameters: {
      code: { type: 'string', description: 'JavaScript to run. Assign the final answer to `result`.' },
      input: { type: 'string', description: 'Optional raw text (e.g. CSV or JSON) made available to the script as the global `input`.' }
    },
    required: ['code']
  },
  {
    name: 'run_page_script',
    description:
      "Runs JavaScript directly inside an ALREADY-OPEN tab's page (same DOM access as that page's own scripts) to click buttons, fill and submit forms, hide elements, or scrape dynamic content. Only works on tabs the user already has open. Requires the user to have enabled agentic browser tools in Settings.",
    parameters: {
      url: { type: 'string', description: 'The URL of the already-open tab to run the script in.' },
      code: { type: 'string', description: 'JavaScript to run in the page. Return a value to get it back (must be JSON-serializable).' }
    },
    required: ['url', 'code'],
    requiresAgentic: true
  },
  {
    name: 'read_block_settings',
    description: "Returns the site blocker's current state: whether it's enabled, the blocklist (distracting sites redirected to a blocked page), and the allowlist (exceptions that override the blocklist).",
    parameters: {},
    required: []
  },
  {
    name: 'manage_site_list',
    description:
      "Adds or removes a domain pattern from the site blocker's blocklist or allowlist (e.g. add \"reddit.com\" to the blocklist, or add an exception to the allowlist). Plain domains match themselves and subdomains; \"*\" works as a simple wildcard (e.g. \"*.tumblr.com\").",
    parameters: {
      action: { type: 'string', enum: ['add', 'remove'], description: 'Whether to add or remove the pattern.' },
      list: { type: 'string', enum: ['block', 'allow'], description: 'Which list to modify.' },
      pattern: { type: 'string', description: 'The domain pattern, e.g. "reddit.com" or "*.tumblr.com".' }
    },
    required: ['action', 'list', 'pattern']
  },
  {
    name: 'read_activity_log',
    description:
      "Returns recent minute-by-minute snapshots of the active tab (URL, title, time), logged only during running Pomodoro work sessions — use this to answer questions like \"what have I been working on\" or \"summarize my last session.\"",
    parameters: {
      limit: { type: 'number', description: 'Max number of most-recent entries to return (default 100).' }
    },
    required: []
  }
]

class AiChat {
  constructor({ store, pomodoro, history, activityLog, blocker, getTabManager, resolveInput }) {
    this.store = store
    this.pomodoro = pomodoro
    this.history = history
    this.activityLog = activityLog
    this.blocker = blocker
    this.getTabManager = getTabManager // () => tabManager | null — primary window's, can go null if it's closed
    this.resolveInput = resolveInput
  }

  // ---- tool execution ----
  // Every tool operates on the primary window only, same scoping as the
  // sidebar itself (see the multi-window README section) — there's no
  // "which window" concept for the AI to reason about.

  async _executeTool(name, input) {
    const tabManager = this.getTabManager()
    switch (name) {
      case 'new_tab': {
        if (!tabManager) return { error: 'No browser window available.' }
        const url = String(input?.url || '').trim()
        if (!url) return { error: 'Missing url.' }
        const id = tabManager.createTab(this.resolveInput(url))
        return { opened: true, tabId: id }
      }
      case 'read_tab': {
        if (!tabManager) return { error: 'No browser window available.' }
        const url = String(input?.url || '').trim()
        if (!url) return { error: 'Missing url.' }
        const tab = this._findOpenTab(tabManager, url)
        if (!tab || !tab.view) return { error: 'No open tab with that URL. Only already-open tabs can be read.' }
        try {
          const text = await tab.view.webContents.executeJavaScript(
            `(document.body ? document.body.innerText : '').slice(0, ${READ_TAB_CHAR_LIMIT})`,
            true
          )
          return { url: tab.url, title: tab.title, text }
        } catch {
          return { error: 'Could not read that tab (it may not have finished loading).' }
        }
      }
      case 'start_pomodoro': {
        const workMin = Math.max(1, Math.round(Number(input?.timeon)) || this.pomodoro.settings.workMin)
        const breakMin = Math.max(1, Math.round(Number(input?.timeoff)) || this.pomodoro.settings.shortBreakMin)
        this.pomodoro.reset()
        this.pomodoro.updateSettings({ workMin, shortBreakMin: breakMin })
        this.pomodoro.start()
        return { started: true, workMin, breakMin }
      }
      case 'read_history': {
        return { entries: this.history.getRecent(30) }
      }
      case 'run_sandboxed_script': {
        return this._runSandboxedScript(input)
      }
      case 'read_block_settings': {
        const s = this.blocker.state
        return { enabled: s.enabled, blocklist: s.blocklist, allowlist: s.allowlist }
      }
      case 'manage_site_list': {
        const action = input?.action
        const list = input?.list
        const pattern = String(input?.pattern || '').trim()
        if (!pattern) return { error: 'Missing pattern.' }
        if (!['add', 'remove'].includes(action)) return { error: 'action must be "add" or "remove".' }
        if (!['block', 'allow'].includes(list)) return { error: 'list must be "block" or "allow".' }

        if (action === 'add' && list === 'block') this.blocker.addBlock(pattern)
        else if (action === 'add' && list === 'allow') this.blocker.addAllow(pattern)
        else if (action === 'remove' && list === 'block') this.blocker.removeBlock(pattern)
        else this.blocker.removeAllow(pattern)

        const s = this.blocker.state
        return { ok: true, blocklist: s.blocklist, allowlist: s.allowlist }
      }
      case 'read_activity_log': {
        const limit = Math.max(1, Math.min(500, Math.round(Number(input?.limit)) || 100))
        return { entries: this.activityLog.getRecent(limit) }
      }
      case 'run_page_script': {
        if (!this.store.get('aiChat').agenticToolsEnabled) {
          return { error: 'Agentic browser tools are disabled. Enable them in Settings → AI Chat.' }
        }
        if (!tabManager) return { error: 'No browser window available.' }
        const url = String(input?.url || '').trim()
        const code = String(input?.code || '')
        if (!url || !code) return { error: 'Missing url or code.' }
        const tab = this._findOpenTab(tabManager, url)
        if (!tab || !tab.view) return { error: 'No open tab with that URL. Only already-open tabs can be scripted.' }
        return this._runPageScript(tab, code)
      }
      default:
        return { error: `Unknown tool: ${name}` }
    }
  }

  // Isolated per call: no require/process/fetch/Buffer in scope, so the
  // script has no path to Node, Electron, the page, or the network — the
  // vm module's own timeout aborts CPU-bound infinite loops.
  _runSandboxedScript({ code, input } = {}) {
    if (!code || typeof code !== 'string') return { error: 'Missing code.' }
    const logs = []
    const sandbox = {
      input: typeof input === 'string' ? input : '',
      result: undefined,
      console: { log: (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')) },
      JSON,
      Math,
      Date
    }
    try {
      const context = vm.createContext(sandbox)
      vm.runInContext(code, context, { timeout: SANDBOX_SCRIPT_TIMEOUT_MS })
      return { result: context.result, logs }
    } catch (err) {
      return { error: err.message, logs }
    }
  }

  async _runPageScript(tab, code) {
    const wrapped = `(function(){ ${code}\n})()`
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Page script timed out.')), PAGE_SCRIPT_TIMEOUT_MS))
    try {
      const result = await Promise.race([tab.view.webContents.executeJavaScript(wrapped, true), timeout])
      return { url: tab.url, result: result === undefined ? null : result }
    } catch (err) {
      return { error: err.message || 'Page script failed.' }
    }
  }

  // Exact URL match first, then a looser same-hostname fallback — the model
  // often normalizes a URL slightly (adds/drops a trailing slash, the
  // scheme) when it echoes one back from earlier context.
  _findOpenTab(tabManager, url) {
    const tabs = [...tabManager.tabs.values()]
    const exact = tabs.find((t) => t.url === url)
    if (exact) return exact
    try {
      const host = new URL(url).hostname
      return tabs.find((t) => {
        try {
          return new URL(t.url).hostname === host
        } catch {
          return false
        }
      })
    } catch {
      return null
    }
  }

  // ---- orchestration ----

  // onEvent/maxIterations/isCancelled are optional: a normal chat turn omits
  // them (defaults below), while runMacro passes all three so callers can
  // observe progress live and cap a long-running background job — same
  // underlying per-provider loop either way, not a separate implementation.
  async runTurn({ history, userText, onEvent, maxIterations, isCancelled }) {
    const cfg = this.store.get('aiChat')
    if (!cfg.apiKey) throw new Error('No API key configured. Add one in Settings → AI Chat.')
    const tools = TOOLS.filter((t) => cfg.agenticToolsEnabled || !t.requiresAgentic)
    const opts = {
      apiKey: cfg.apiKey,
      model: cfg.model,
      history,
      userText,
      tools,
      onEvent: onEvent || (() => {}),
      maxIterations: maxIterations || MAX_TOOL_ITERATIONS,
      isCancelled: isCancelled || (() => false)
    }

    if (cfg.provider === 'anthropic') return this._runAnthropicTurn(opts)
    if (cfg.provider === 'openai') return this._runOpenAiTurn(opts)
    if (cfg.provider === 'gemini') return this._runGeminiTurn(opts)
    throw new Error(`Provider "${cfg.provider}" isn't wired up yet — pick Anthropic, OpenAI, or Gemini in Settings → AI Chat.`)
  }

  // Used by main.js's macro runner: same runTurn, just a higher iteration
  // cap plus a wall-clock cap so a background job can't run indefinitely.
  runMacro({ history, userText, onEvent, isCancelled }) {
    const deadline = Date.now() + MACRO_MAX_MS
    return this.runTurn({
      history,
      userText,
      onEvent,
      maxIterations: MACRO_MAX_ITERATIONS,
      isCancelled: () => Date.now() > deadline || (isCancelled ? isCancelled() : false)
    })
  }

  // ---- Anthropic (Messages API, native tool_use/tool_result blocks) ----

  async _callAnthropic({ apiKey, model, messages, tools }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: { type: 'object', properties: t.parameters, required: t.required }
        }))
      })
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.json()
  }

  async _runAnthropicTurn({ apiKey, model, history, userText, tools, onEvent, maxIterations, isCancelled }) {
    const messages = [...history, { role: 'user', content: userText }]
    const events = []
    const push = (e) => {
      events.push(e)
      onEvent(e)
    }

    for (let i = 0; i < maxIterations; i++) {
      if (isCancelled()) {
        push({ type: 'cancelled' })
        return { messages, events }
      }
      const response = await this._callAnthropic({ apiKey, model, messages, tools })
      messages.push({ role: 'assistant', content: response.content })

      response.content.filter((b) => b.type === 'text').forEach((b) => push({ type: 'text', text: b.text }))
      const toolUses = response.content.filter((b) => b.type === 'tool_use')
      if (!toolUses.length) return { messages, events }

      const toolResultContent = []
      for (const use of toolUses) {
        push({ type: 'tool_call', name: use.name, input: use.input })
        const result = await this._executeTool(use.name, use.input)
        push({ type: 'tool_result', name: use.name, result })
        toolResultContent.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) })
      }
      messages.push({ role: 'user', content: toolResultContent })
    }

    push({ type: 'text', text: '(Stopped after several tool calls without a final answer — try rephrasing.)' })
    return { messages, events }
  }

  // ---- OpenAI (Chat Completions API, function tool_calls) ----

  async _callOpenAi({ apiKey, model, messages, tools }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || DEFAULT_OPENAI_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: { type: 'object', properties: t.parameters, required: t.required } }
        }))
      })
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.json()
  }

  async _runOpenAiTurn({ apiKey, model, history, userText, tools, onEvent, maxIterations, isCancelled }) {
    const messages = [...history, { role: 'user', content: userText }]
    const events = []
    const push = (e) => {
      events.push(e)
      onEvent(e)
    }

    for (let i = 0; i < maxIterations; i++) {
      if (isCancelled()) {
        push({ type: 'cancelled' })
        return { messages, events }
      }
      const response = await this._callOpenAi({ apiKey, model, messages, tools })
      const choice = response.choices[0].message
      messages.push(choice)

      if (choice.content) push({ type: 'text', text: choice.content })
      const toolCalls = choice.tool_calls || []
      if (!toolCalls.length) return { messages, events }

      for (const call of toolCalls) {
        let input = {}
        try {
          input = JSON.parse(call.function.arguments || '{}')
        } catch {
          // leave input empty — malformed args from the model, not our bug to crash on
        }
        push({ type: 'tool_call', name: call.function.name, input })
        const result = await this._executeTool(call.function.name, input)
        push({ type: 'tool_result', name: call.function.name, result })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }

    push({ type: 'text', text: '(Stopped after several tool calls without a final answer — try rephrasing.)' })
    return { messages, events }
  }

  // ---- Gemini (generateContent API, function calling) ----

  async _callGemini({ apiKey, model, messages, tools }) {
    const modelName = model || DEFAULT_GEMINI_MODEL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        contents: messages,
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        tools: [
          {
            function_declarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: { type: 'object', properties: t.parameters, required: t.required }
            }))
          }
        ]
      })
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`)
    }
    return res.json()
  }

  async _runGeminiTurn({ apiKey, model, history, userText, tools, onEvent, maxIterations, isCancelled }) {
    const messages = [...history]
    if (userText) {
      messages.push({ role: 'user', parts: [{ text: userText }] })
    }
    const events = []
    const push = (e) => {
      events.push(e)
      onEvent(e)
    }

    for (let i = 0; i < maxIterations; i++) {
      if (isCancelled()) {
        push({ type: 'cancelled' })
        return { messages, events }
      }
      const response = await this._callGemini({ apiKey, model, messages, tools })

      if (!response.candidates || !response.candidates[0] || !response.candidates[0].content) {
        throw new Error('Invalid response from Gemini API')
      }

      const choice = response.candidates[0].content
      if (!choice.role) choice.role = 'model'
      messages.push(choice)

      let hasToolCalls = false
      const toolResultParts = []

      if (choice.parts) {
        for (const part of choice.parts) {
          if (part.text) {
            push({ type: 'text', text: part.text })
          }
          if (part.functionCall) {
            hasToolCalls = true
            const call = part.functionCall
            const input = call.args || {}
            push({ type: 'tool_call', name: call.name, input })
            const result = await this._executeTool(call.name, input)
            push({ type: 'tool_result', name: call.name, result })
            toolResultParts.push({
              functionResponse: {
                name: call.name,
                response: result
              }
            })
          }
        }
      }

      if (!hasToolCalls) return { messages, events }

      messages.push({
        role: 'user',
        parts: toolResultParts
      })
    }

    push({ type: 'text', text: '(Stopped after several tool calls without a final answer — try rephrasing.)' })
    return { messages, events }
  }

  async evaluateJustification({ host, justification }) {
    const cfg = this.store.get('aiChat')
    if (!cfg.apiKey) {
      return { approved: true, reason: 'AI Gatekeeper bypassed (No API key configured in Settings).' }
    }

    const systemPrompt = `You are the "Focus Browser Gatekeeper".
The user has attempted to visit the blocked website "${host}" during their focus time.
They provided the following justification:
"${justification}"

Analyze the justification:
1. If the justification is a valid, productive reason (e.g. work-related research, checking documentation, code lookups, or fixing a direct work issue), reply with:
APPROVED
[A brief 1-2 sentence explaining why this is acceptable]

2. If the justification is unproductive, a distraction, or conversational filler (e.g. "I'm bored", "just want to check", "facebook", "twitter", "cat videos"), reply with:
DENIED
[A brief 1-2 sentence reminding the user of their focus goals and why this is not allowed]

CRITICAL REQUIREMENT:
Your response MUST begin with either the exact word "APPROVED" or "DENIED" on the first line.`

    let responseText = ''
    try {
      if (cfg.provider === 'anthropic') {
        responseText = await this._callAnthropicRaw({ apiKey: cfg.apiKey, model: cfg.model, systemPrompt })
      } else if (cfg.provider === 'openai') {
        responseText = await this._callOpenAiRaw({ apiKey: cfg.apiKey, model: cfg.model, systemPrompt })
      } else if (cfg.provider === 'gemini') {
        responseText = await this._callGeminiRaw({ apiKey: cfg.apiKey, model: cfg.model, systemPrompt })
      } else {
        throw new Error('Unsupported provider')
      }

      const lines = responseText.trim().split('\n')
      const firstLine = lines[0].trim().toUpperCase()
      const approved = firstLine.startsWith('APPROVED')
      const reason = lines.slice(1).join('\n').trim() || (approved ? 'Enjoy your session.' : 'Access denied.')

      return { approved, reason }
    } catch (err) {
      console.error('AI Gatekeeper evaluation failed:', err)
      return { approved: true, reason: 'AI Gatekeeper error: ' + err.message }
    }
  }

  // Called every 5 minutes (see main.js) while a Pomodoro work session is
  // running and the user has opted into the productivity monitor in
  // Settings. `entries` is already scoped by the caller to just the current
  // work session (not the whole stored log, not break-time browsing).
  // One-shot judgment call, same ON/OFF-style single-line-verdict pattern as
  // evaluateJustification above — deliberately not the tool-calling loop,
  // since the only action this is allowed to take is a passive nudge, not
  // anything that needs tool_use round-trips.
  async checkProductivity({ entries }) {
    const cfg = this.store.get('aiChat')
    if (!cfg.apiKey) return { checked: false }

    const activitySummary = entries.length
      ? entries
          .slice()
          .reverse()
          .map((e) => `- ${new Date(e.timestamp).toLocaleTimeString()}: ${e.title || e.url} (${e.url})`)
          .join('\n')
      : '(no activity recorded yet this session)'

    const systemPrompt = `You are the "Focus Browser Productivity Monitor".
Below is everything the user has had open, minute by minute, so far in their CURRENT Pomodoro work session:
${activitySummary}

Judge whether this reflects focused, productive work or drifting into distraction (social media, entertainment, unrelated browsing).
1. If it looks productive, or there isn't enough activity yet to tell, reply with exactly:
ON_TRACK

2. If it looks like the user has drifted, reply with:
OFF_TRACK
[A short, encouraging 1-2 sentence nudge to show the user directly, referencing what pulled their attention]

CRITICAL REQUIREMENT:
Your response MUST begin with either the exact word "ON_TRACK" or "OFF_TRACK" on the first line.`

    try {
      let responseText
      if (cfg.provider === 'anthropic') {
        responseText = await this._callAnthropicRaw({ apiKey: cfg.apiKey, model: cfg.model, systemPrompt })
      } else if (cfg.provider === 'openai') {
        responseText = await this._callOpenAiRaw({ apiKey: cfg.apiKey, model: cfg.model, systemPrompt })
      } else if (cfg.provider === 'gemini') {
        responseText = await this._callGeminiRaw({ apiKey: cfg.apiKey, model: cfg.model, systemPrompt })
      } else {
        return { checked: false }
      }

      const lines = responseText.trim().split('\n')
      const offTrack = lines[0].trim().toUpperCase().startsWith('OFF_TRACK')
      const message = lines.slice(1).join('\n').trim()
      return { checked: true, offTrack, message }
    } catch (err) {
      console.error('Productivity monitor check failed:', err)
      return { checked: false }
    }
  }

  async _callAnthropicRaw({ apiKey, model, systemPrompt }) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Evaluate my request.' }]
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const json = await res.json()
    return json.content[0].text
  }

  async _callOpenAiRaw({ apiKey, model, systemPrompt }) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || DEFAULT_OPENAI_MODEL,
        max_tokens: 256,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Evaluate my request.' }
        ]
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const json = await res.json()
    return json.choices[0].message.content
  }

  async _callGeminiRaw({ apiKey, model, systemPrompt }) {
    const modelName = model || DEFAULT_GEMINI_MODEL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Evaluate my request.' }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const json = await res.json()
    return json.candidates[0].content.parts[0].text
  }
}

module.exports = { AiChat, SYSTEM_PROMPT, TOOLS }
