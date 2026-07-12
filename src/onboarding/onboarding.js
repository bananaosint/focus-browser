// Onboarding renderer — manages the 5-slide carousel. Runs in the modal
// BrowserWindow created by openOnboardingWindow() in main.js. Depends on
// window.FocusTheme (palettes.js + applyTheme.js), window.FocusIcons
// (icons.js), and window.onboardingAPI (onboarding-preload.js).
;(function () {
  const TOTAL_SLIDES = 5
  let currentIndex = 0

  const stage    = document.getElementById('stage')
  const dotsEl   = document.getElementById('dots')
  const backBtn  = document.getElementById('back-btn')
  const nextBtn  = document.getElementById('next-btn')
  const skipBtn  = document.getElementById('skip-btn')
  const slides   = stage.querySelectorAll('.slide')

  // ---- dots ----
  function buildDots() {
    dotsEl.innerHTML = ''
    for (let i = 0; i < TOTAL_SLIDES; i++) {
      const dot = document.createElement('span')
      dot.className = 'dot' + (i === currentIndex ? ' active' : '')
      dotsEl.appendChild(dot)
    }
  }

  // ---- slide transitions ----

  // Check once whether the user prefers reduced motion; if so we just swap
  // visibility with no animation.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function goTo(index) {
    if (index < 0 || index >= TOTAL_SLIDES) return
    currentIndex = index

    slides.forEach((slide, i) => {
      if (i === currentIndex) {
        slide.classList.add('active')
      } else {
        slide.classList.remove('active')
      }
    })

    // Update dots
    const dots = dotsEl.querySelectorAll('.dot')
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex)
    })

    // Back disabled on first slide
    backBtn.disabled = currentIndex === 0

    // Last slide: "Get started" instead of "Next"
    if (currentIndex === TOTAL_SLIDES - 1) {
      nextBtn.textContent = 'Get started'
    } else {
      nextBtn.textContent = 'Next'
    }
  }

  // ---- actions ----

  function finish() {
    window.onboardingAPI.dismiss('completed')
  }

  function skip() {
    window.onboardingAPI.dismiss('skipped')
  }

  function next() {
    if (currentIndex === TOTAL_SLIDES - 1) {
      finish()
    } else {
      goTo(currentIndex + 1)
    }
  }

  function back() {
    goTo(currentIndex - 1)
  }

  // ---- event listeners ----

  nextBtn.addEventListener('click', next)
  backBtn.addEventListener('click', back)
  skipBtn.addEventListener('click', skip)

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      back()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      skip()
    }
  })

  // ---- theme init ----

  function applyResolvedTheme(resolved) {
    if (window.FocusTheme && window.FocusTheme.applyTheme) {
      window.FocusTheme.applyTheme(resolved.palette, resolved.mode)
    }
  }

  window.onboardingAPI.getTheme().then(applyResolvedTheme)
  window.onboardingAPI.onThemeChanged(applyResolvedTheme)

  // ---- icons + initial state ----

  if (window.FocusIcons) window.FocusIcons.hydrate(document)
  buildDots()
  goTo(0)
})()
