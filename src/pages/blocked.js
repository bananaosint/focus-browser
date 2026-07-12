const params = new URLSearchParams(window.location.search)
const host = params.get('host') || ''
const targetUrl = params.get('url') || ''

document.getElementById('host').textContent = host

const showOverrideBtn = document.getElementById('show-override-btn')
const overridePanel = document.getElementById('override-panel')
const startBreathBtn = document.getElementById('start-breath-btn')
const breathCircle = document.getElementById('breath-circle')
const breathLabel = document.getElementById('breath-label')

const stepIntent = document.getElementById('step-intent')
const intentInput = document.getElementById('intent-input')
const continueBtn = document.getElementById('continue-btn')

let selectedMinutes = 5

// 1. Reveal Override Panel
showOverrideBtn.addEventListener('click', () => {
  overridePanel.classList.remove('hidden')
  showOverrideBtn.classList.add('hidden')
})

// 2. Guided Breathing Challenge (10 Seconds)
let breathTimer = null
let breathPhaseInterval = null
startBreathBtn.addEventListener('click', () => {
  startBreathBtn.disabled = true
  startBreathBtn.textContent = 'Challenge Active'
  
  let remaining = 10
  breathLabel.textContent = `Breathe... ${remaining}s`
  
  // Toggle inhale/exhale animation every 2.5 seconds
  let isInhale = true
  breathCircle.classList.add('inhale')
  
  breathPhaseInterval = setInterval(() => {
    isInhale = !isInhale
    if (isInhale) {
      breathCircle.classList.add('inhale')
      breathLabel.style.color = '#ff8fa3'
    } else {
      breathCircle.classList.remove('inhale')
      breathLabel.style.color = '#5b8def'
    }
  }, 2500)
  
  // Overall countdown timer
  breathTimer = setInterval(() => {
    remaining -= 1
    if (remaining <= 0) {
      clearInterval(breathTimer)
      clearInterval(breathPhaseInterval)
      
      // End Challenge
      breathCircle.classList.remove('inhale')
      breathLabel.textContent = 'Complete ✓'
      breathLabel.style.color = '#a3e0a8'
      startBreathBtn.classList.add('hidden')
      
      // Unlock Step 2
      stepIntent.classList.remove('disabled-step')
      intentInput.disabled = false
      intentInput.focus()
      return
    }
    
    // Inhale / Exhale label text
    const text = isInhale ? 'Breathe In' : 'Breathe Out'
    breathLabel.textContent = `${text} (${remaining}s)`
  }, 1000)
})

// 3. Segmented Duration Control
const segmentButtons = document.querySelectorAll('.segment-btn')
segmentButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    segmentButtons.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    selectedMinutes = Number(btn.dataset.minutes) || 5
    updateButtonText()
  })
})

function updateButtonText() {
  continueBtn.textContent = `Override Block (${selectedMinutes} min)`
}

// 4. Intent Input Validation (Minimum 8 Characters)
intentInput.addEventListener('input', () => {
  const text = intentInput.value.trim()
  continueBtn.disabled = text.length < 8
})

// 5. Submit Override
const statusBanner = document.getElementById('status-banner')

continueBtn.addEventListener('click', async () => {
  if (continueBtn.disabled) return

  // Disable inputs during evaluation
  continueBtn.disabled = true
  intentInput.disabled = true
  const segmentBtns = document.querySelectorAll('.segment-btn')
  segmentBtns.forEach(btn => btn.disabled = true)

  const originalBtnText = continueBtn.textContent
  continueBtn.textContent = 'Evaluating justification...'

  statusBanner.classList.add('hidden')
  statusBanner.className = 'status-banner'

  const justification = intentInput.value.trim()

  try {
    const res = await fetch(`focus-action://evaluate?host=${encodeURIComponent(host)}&justification=${encodeURIComponent(justification)}`)
    const result = await res.json()

    statusBanner.classList.remove('hidden')

    if (result.approved) {
      statusBanner.classList.add('approved')
      statusBanner.innerHTML = `
        <strong>APPROVED</strong>
        <div>${result.reason}</div>
        <button id="let-me-in-btn" class="btn btn-primary" style="margin-top: 10px; background: #10b981; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">Let me in</button>
      `
      continueBtn.textContent = 'Approved ✓'
      continueBtn.disabled = true

      const letMeInBtn = document.getElementById('let-me-in-btn')
      letMeInBtn.addEventListener('click', () => {
        letMeInBtn.disabled = true
        letMeInBtn.textContent = 'Entering...'
        const action =
          `focus-action://unlock?host=${encodeURIComponent(host)}` +
          `&target=${encodeURIComponent(targetUrl)}&minutes=${selectedMinutes}`
        window.location.href = action
      })
    } else {
      statusBanner.classList.add('denied')
      statusBanner.innerHTML = `<strong>DENIED</strong><div>${result.reason}</div>`

      // Re-enable inputs for another try
      continueBtn.disabled = false
      intentInput.disabled = false
      segmentBtns.forEach(btn => btn.disabled = false)
      continueBtn.textContent = originalBtnText
    }
  } catch (err) {
    // Graceful error bypass fallback
    console.error(err)
    statusBanner.classList.remove('hidden')
    statusBanner.classList.add('approved')
    statusBanner.innerHTML = `
      <strong>BYPASSED</strong>
      <div>Error connecting to AI Gatekeeper: ${err.message}. Unlocking site.</div>
      <button id="let-me-in-btn" class="btn btn-primary" style="margin-top: 10px; background: #10b981; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">Let me in</button>
    `
    continueBtn.textContent = 'Bypassed ✓'
    continueBtn.disabled = true

    const letMeInBtn = document.getElementById('let-me-in-btn')
    letMeInBtn.addEventListener('click', () => {
      letMeInBtn.disabled = true
      letMeInBtn.textContent = 'Entering...'
      const action =
        `focus-action://unlock?host=${encodeURIComponent(host)}` +
        `&target=${encodeURIComponent(targetUrl)}&minutes=${selectedMinutes}`
      window.location.href = action
    })
  }
})

// Initial trigger to sync override button text
updateButtonText()
