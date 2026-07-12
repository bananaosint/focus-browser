// Shared in-window confirm modal for the Settings window. Used by the
// destructive-action confirms (Clear Browsing Data, delete password) and the
// agentic-tools enable confirm. Renders a themed overlay rather than a native
// dialog so it matches the rest of the redesign, and — per the spec's modality
// rule — makes the background genuinely unclickable: the scrim captures pointer
// events AND the rest of the window gets the `inert` attribute for the
// duration, so neither mouse nor keyboard/tab focus can reach it.
//
// show({ title, message, confirmLabel, danger, checkboxLabel }) -> Promise<boolean>
// If checkboxLabel is provided, Confirm stays disabled until it's checked.
;(function () {
  function show(opts) {
    const options = opts || {}
    return new Promise((resolve) => {
      const inertTargets = Array.from(document.body.children)

      const overlay = document.createElement('div')
      overlay.className = 'confirm-overlay'

      const card = document.createElement('div')
      card.className = 'confirm-card' + (options.danger ? ' danger' : '')
      card.setAttribute('role', 'dialog')
      card.setAttribute('aria-modal', 'true')

      const h = document.createElement('h3')
      h.className = 'confirm-title'
      h.textContent = options.title || 'Are you sure?'
      card.appendChild(h)

      if (options.message) {
        const p = document.createElement('p')
        p.className = 'confirm-message'
        p.textContent = options.message
        card.appendChild(p)
      }

      let checkbox = null
      if (options.checkboxLabel) {
        const label = document.createElement('label')
        label.className = 'confirm-checkbox'
        checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        const span = document.createElement('span')
        span.textContent = options.checkboxLabel
        label.appendChild(checkbox)
        label.appendChild(span)
        card.appendChild(label)
      }

      const actions = document.createElement('div')
      actions.className = 'confirm-actions'
      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'confirm-btn confirm-cancel'
      cancelBtn.textContent = options.cancelLabel || 'Cancel'
      const okBtn = document.createElement('button')
      okBtn.className = 'confirm-btn confirm-ok' + (options.danger ? ' danger' : '')
      okBtn.textContent = options.confirmLabel || 'Confirm'
      if (checkbox) okBtn.disabled = true
      actions.appendChild(cancelBtn)
      actions.appendChild(okBtn)
      card.appendChild(actions)
      overlay.appendChild(card)
      document.body.appendChild(overlay)

      // Block everything behind the overlay from mouse and keyboard/focus.
      inertTargets.forEach((el) => el.setAttribute('inert', ''))
      const previouslyFocused = document.activeElement

      function cleanup(result) {
        document.removeEventListener('keydown', onKey, true)
        inertTargets.forEach((el) => el.removeAttribute('inert'))
        overlay.remove()
        if (previouslyFocused && previouslyFocused.focus) {
          try { previouslyFocused.focus() } catch {}
        }
        resolve(result)
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false) }
        else if (e.key === 'Enter' && !okBtn.disabled) { e.preventDefault(); cleanup(true) }
      }

      if (checkbox) {
        checkbox.addEventListener('change', () => { okBtn.disabled = !checkbox.checked })
      }
      cancelBtn.addEventListener('click', () => cleanup(false))
      okBtn.addEventListener('click', () => { if (!okBtn.disabled) cleanup(true) })
      // A click on the backdrop (outside the card) cancels.
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cleanup(false) })
      document.addEventListener('keydown', onKey, true)

      ;(checkbox || okBtn).focus()
    })
  }

  const api = { show }
  if (typeof window !== 'undefined') window.ConfirmOverlay = Object.assign(window.ConfirmOverlay || {}, api)
})()
