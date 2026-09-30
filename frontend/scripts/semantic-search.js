// Slot-machine placeholder for the homepage search prompt
// (sections/semantic-search.liquid).
//
// Progressive enhancement only: without this the bar shows the placeholder
// setting and searches the same. The reel pauses whenever it could get in the
// way — focus, a typed value, off screen, a hidden tab — and is never built
// for prefers-reduced-motion, where the rolling is the motion.
//
// The reel is drawn over the input (see _semantic-search.scss). The native
// placeholder is kept in step with it, so the field's accessible description
// and an empty submit both use the phrase on show.

const ROLL_EVERY_MS = 3500

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

document.querySelectorAll('[data-semantic-search]').forEach(root => {
  const form = root.querySelector('form')
  const input = root.querySelector('input[type="search"]')
  if (!form || !input) return

  let phrases
  try {
    phrases = JSON.parse(root.dataset.suggestions)
  } catch {
    return
  }
  if (!Array.isArray(phrases) || phrases.length === 0) return

  // Every placeholder is an example query, so an empty submit searches the one
  // on show rather than landing on an empty results page.
  form.addEventListener('submit', () => {
    if (!input.value.trim() && input.placeholder) input.value = input.placeholder
  })

  if (reducedMotion) return

  // The setting's own placeholder goes first, then the suggestion blocks.
  const all = [...new Set([input.placeholder, ...phrases].filter(Boolean))]
  const count = all.length
  if (count < 2) return

  const field = document.createElement('span')
  field.className = 'semantic-search__field'
  input.before(field)
  field.append(input)

  // Two slots: the phrase on show, and the next one waiting below it. A roll
  // animates both (see _semantic-search.scss); when it ends the next phrase is
  // copied into the current slot and the class comes off, in the same frame.
  const makeItem = modifier => {
    const item = document.createElement('span')
    item.className = `semantic-search__reel-item${modifier ? ` semantic-search__reel-item--${modifier}` : ''}`
    const text = document.createElement('span')
    text.className = 'semantic-search__reel-text'
    item.append(text)
    return { item, text }
  }

  const reel = document.createElement('span')
  reel.className = 'semantic-search__reel'
  reel.setAttribute('aria-hidden', 'true')

  const current = makeItem()
  const upcoming = makeItem('next')
  current.text.textContent = all[0]
  reel.append(current.item, upcoming.item)
  field.append(reel)

  let position = 0
  let rolling = false
  let onScreen = true
  let fallback

  const paused = () =>
    rolling || !onScreen || document.hidden || document.activeElement === input || input.value !== ''

  // Roll length, from the same token the stylesheet uses.
  const rollMs = () =>
    parseFloat(getComputedStyle(root).getPropertyValue('--duration-slower')) || 0

  const land = () => {
    if (!rolling) return
    window.clearTimeout(fallback)

    position = (position + 1) % count
    current.text.textContent = all[position]
    reel.classList.remove('semantic-search__reel--rolling')

    input.placeholder = all[position]
    rolling = false
  }

  const roll = () => {
    if (paused()) return
    rolling = true
    upcoming.text.textContent = all[(position + 1) % count]
    reel.classList.add('semantic-search__reel--rolling')
    // animationend never fires if the roll is interrupted (a tab switch
    // mid-roll), which would leave the reel stuck; land it regardless.
    fallback = window.setTimeout(land, rollMs() + 100)
  }

  upcoming.item.addEventListener('animationend', land)

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
    }).observe(root)
  }

  window.setInterval(roll, ROLL_EVERY_MS)
})
