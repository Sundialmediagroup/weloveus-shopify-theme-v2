// Predictive suggestions for the header search bar.
//
// Progressive enhancement only: the bar is a plain GET form to /search, so with
// this script absent — or a request in flight when Enter is pressed — the page
// still searches. Nothing here is required for search to work.

import { track } from './analytics.js'

const form = document.querySelector('[data-predictive-form]')
const input = form?.querySelector('[data-predictive-input]')
const panel = document.querySelector('[data-predictive-results]')
const status = document.querySelector('[data-predictive-status]')
const header = document.querySelector('.site-header')

if (form && input && panel && header) {
  // Two characters is where Shopify's prefix matching stops returning most of
  // the catalogue, and it keeps a request off every single keystroke.
  const MIN_LENGTH = 2
  const DEBOUNCE_MS = 200
  const RESULT_LIMIT = 6
  // Reported once the shopper stops typing, not for every prefix on the way.
  const TRACK_AFTER_MS = 1500

  let trackTimer
  let lastTracked = ''

  // Built from the form's own action so a locale-prefixed storefront
  // (/en-gb/search) keeps working — the endpoint is always <search url>/suggest.
  const suggestUrl = new URL(`${new URL(form.action).pathname}/suggest`, window.location.origin)

  let debounceTimer
  let controller

  const open = () => {
    if (!panel.innerHTML.trim()) return
    header.classList.add('site-header--search-open')
    panel.setAttribute('aria-hidden', 'false')
    // Both panels hang off the same edge of the header, so they cannot be open
    // at once. The mega menu is hover-driven and would otherwise sit on top.
    header.classList.remove('site-header--mega-open')
  }

  const close = () => {
    header.classList.remove('site-header--search-open')
    panel.setAttribute('aria-hidden', 'true')
  }

  // The count only — see the note in header.liquid on why the panel itself is
  // not the live region.
  const announce = text => {
    if (status) status.textContent = text
  }

  const clear = () => {
    close()
    panel.innerHTML = ''
    announce('')
  }

  async function fetchSuggestions(query) {
    // Supersede the in-flight request: results arriving out of order would
    // otherwise show suggestions for a prefix the shopper has moved past.
    controller?.abort()
    controller = new AbortController()

    suggestUrl.searchParams.set('q', query)
    suggestUrl.searchParams.set('section_id', 'predictive-search')
    suggestUrl.searchParams.set('resources[type]', 'product,collection')
    suggestUrl.searchParams.set('resources[limit]', RESULT_LIMIT)

    try {
      const res = await fetch(suggestUrl, { signal: controller.signal })
      if (!res.ok) return

      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const results = doc.querySelector('.predictive-search')

      if (!results) {
        clear()
        return
      }

      panel.innerHTML = results.outerHTML
      announce(panel.querySelector('[data-predictive-count]')?.textContent.trim() ?? '')
      open()

      clearTimeout(trackTimer)
      trackTimer = setTimeout(() => {
        if (query === lastTracked) return
        lastTracked = query
        track('predictive_search', {
          search_term: query,
          results_count: Number(results.dataset.resultsCount) || 0,
        })
      }, TRACK_AFTER_MS)
    } catch {
      // Aborted, offline, or a bad response — the form still submits.
    }
  }

  input.addEventListener('input', () => {
    const query = input.value.trim()
    clearTimeout(debounceTimer)

    if (query.length < MIN_LENGTH) {
      controller?.abort()
      clear()
      return
    }

    debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS)
  })

  // Coming back to a bar that already has a term should show what was found
  // rather than making the shopper type a character to get it back.
  input.addEventListener('focus', open)

  // Submitting navigates; leaving the panel up over the outgoing page reads as
  // a stuck overlay on a slow connection.
  form.addEventListener('submit', close)

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header.classList.contains('site-header--search-open')) {
      close()
      input.focus()
    }
  })

  // Arrow keys walk the suggestions, so the list is reachable without tabbing
  // past it. Focus leaves the input on the first ArrowDown and comes back on
  // ArrowUp from the top.
  const links = () => [...panel.querySelectorAll('a')]

  form.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return
    const first = links()[0]
    if (!first) return
    event.preventDefault()
    first.focus()
  })

  panel.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

    const all = links()
    const index = all.indexOf(document.activeElement)
    if (index < 0) return

    event.preventDefault()

    if (event.key === 'ArrowUp' && index === 0) {
      input.focus()
      return
    }

    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    all[Math.min(Math.max(next, 0), all.length - 1)].focus()
  })

  // Pointer and keyboard both leave the same way: anything outside the bar and
  // the panel dismisses it.
  document.addEventListener('click', event => {
    if (form.contains(event.target) || panel.contains(event.target)) return
    close()
  })

  document.addEventListener('focusin', event => {
    if (form.contains(event.target) || panel.contains(event.target)) return
    close()
  })
}
