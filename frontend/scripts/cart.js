// Cart page — sections/main-cart.liquid.
//
// Each change posts to /cart/change.js and asks for this section back in the
// same response (the Section Rendering API), then swaps the new markup in. No
// reload, and the totals, discounts and line prices are always the server's.
// Delegated from the section wrapper because every update replaces its contents.

import { refreshCartCount } from './cart-feedback.js'

const root = document.querySelector('[data-cart]')
const section = root?.closest('.shopify-section')

if (root && section) {
  // Read once: `root` is replaced by the first update.
  const { sectionId, textUpdated = '', textError = '' } = root.dataset

  const announce = text => {
    const status = section.querySelector('[data-cart-status]')
    if (status) status.textContent = text
  }

  const update = async (key, quantity, focusSelector) => {
    const cart = section.querySelector('[data-cart]')
    cart.classList.add('is-updating')

    try {
      const res = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart/change.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: key,
          quantity,
          sections: [sectionId],
          sections_url: window.location.pathname,
        }),
      })
      if (!res.ok) throw new Error(res.status)

      const data = await res.json()
      const html = data.sections?.[sectionId]
      if (!html) throw new Error('no section')

      const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('.shopify-section')
      section.innerHTML = fresh ? fresh.innerHTML : html

      refreshCartCount()
      announce(textUpdated)

      // Put focus back on the control that was used, or on the heading when
      // the line is gone.
      const target =
        (focusSelector && section.querySelector(`[data-key="${key}"] ${focusSelector}`)) ||
        section.querySelector('h1')
      if (target) {
        if (target.tagName === 'H1') target.setAttribute('tabindex', '-1')
        target.focus({ preventScroll: true })
      }
    } catch {
      section.querySelector('[data-cart]')?.classList.remove('is-updating')
      announce(textError)
    }
  }

  section.addEventListener('click', e => {
    const qtyBtn = e.target.closest('[data-qty-btn]')
    if (qtyBtn) {
      const item = qtyBtn.closest('[data-cart-item]')
      const input = item.querySelector('[data-qty-input]')
      const delta = qtyBtn.dataset.qtyBtn === 'inc' ? 1 : -1
      const qty = Math.max(0, (parseInt(input.value, 10) || 0) + delta)
      input.value = qty
      update(item.dataset.key, qty, `[data-qty-btn="${qtyBtn.dataset.qtyBtn}"]`)
      return
    }

    const remove = e.target.closest('[data-remove-item]')
    if (remove) {
      e.preventDefault()
      update(remove.closest('[data-cart-item]').dataset.key, 0)
    }
  })

  // Typed quantities commit on change (blur or Enter), not on every keystroke.
  section.addEventListener('change', e => {
    const input = e.target.closest('[data-qty-input]')
    if (!input) return
    const qty = Math.max(0, parseInt(input.value, 10) || 0)
    update(input.closest('[data-cart-item]').dataset.key, qty, '[data-qty-input]')
  })

  // Enter in a quantity field would otherwise submit the whole form to /cart.
  section.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-qty-input]')) {
      e.preventDefault()
      e.target.blur()
    }
  })
}
