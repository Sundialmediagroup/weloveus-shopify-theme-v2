// Feature analytics — the theme's own events, on top of the ecommerce events
// the Google & YouTube app already sends (page_view, view_item, add_to_cart,
// begin_checkout, purchase, search, collection view_item_list). Nothing here
// repeats those.
//
// Events go out through Shopify.analytics.publish(), which respects the
// visitor's consent, and are forwarded to GA4 by the custom pixel in
// frontend/pixels/ga4-custom-pixel.js (pasted into Shopify admin → Settings →
// Customer events). They're also pushed to window.dataLayer for a future GTM.
//
// Two more records go with each order, so a feature's revenue can be read
// straight from Shopify, whatever GA4 misses:
//   - line item properties `_source` (the list the product was found in) and
//     `_added_via` (quick_add | pdp), from lineItemProperties()
//   - cart attributes `_features` (touchpoints used), `_experiments` (holdout
//     groups) and `_ga_client_id` (to join orders to GA4 users), from
//     syncCartAttributes()
// Underscored keys are hidden at checkout and stay on the order.
//
// Markup hooks:
//   [data-item-list="<id>"][data-item-list-name]  a list of products
//   [data-item] + snippets/item-data.liquid       one selectable product
//   [data-feature="<id>"]                         sends feature_view on sight
//   [data-card="<type>"]                          a card, for section_click
//   "class": "section-type--<file>" in a section's schema  its section_type
//
// Debug: localStorage.setItem('wlu.debug', '1') logs every event.

const configEl = document.getElementById('analytics-config')
const config = configEl ? JSON.parse(configEl.textContent) : {}
const experiments = window.wluExperiments || {}

// Lists that get no view_item_list from here: the app already reports
// collection and search pages (Shopify's collection_viewed and
// search_submitted), and Essie reports its own (essie_products_shown).
const NO_IMPRESSIONS = new Set(['collection', 'search_results', 'essie'])

const SOURCES_KEY = 'wlu.sources' // product id → list it was last selected from
const FEATURES_KEY = 'wlu.features' // touchpoints used this visit

const debug = (() => {
  try { return localStorage.getItem('wlu.debug') === '1' } catch { return false }
})()

function session(fn) {
  try { return fn(window.sessionStorage) } catch { return null }
}

function readJson(key, fallback) {
  try { return JSON.parse(session(s => s.getItem(key))) || fallback } catch { return fallback }
}

// ─── Sending ───────────────────────────────────────────────────────────────────

export function track(name, params = {}) {
  const payload = {
    ...params,
    page_template: config.template,
    currency: config.currency,
    experiments,
  }

  if (debug) console.debug('[analytics]', name, payload)

  try { window.Shopify?.analytics?.publish?.(name, payload) } catch { /* never break the page */ }
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event: name, ...payload })
}

export function inHoldout(feature) {
  return experiments[feature] === 'holdout'
}

// ─── Items ─────────────────────────────────────────────────────────────────────

export function listOf(el) {
  const list = el?.closest('[data-item-list]')
  return {
    item_list_id: list?.dataset.itemList || 'other',
    item_list_name: list?.dataset.itemListName || list?.dataset.itemList || 'other',
  }
}

// GA4 item from an element carrying snippets/item-data.liquid.
export function itemFrom(el, extra = {}) {
  const d = el?.dataset || {}
  const item = {
    item_id: d.itemId,
    item_name: d.itemName,
    item_brand: d.itemBrand || undefined,
    item_category: d.itemCategory || undefined,
    price: d.itemPrice ? Number(d.itemPrice) : undefined,
    ...extra,
  }
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined && v !== ''))
}

function indexIn(el) {
  const list = el.closest('[data-item-list]')
  if (!list) return undefined
  return [...list.querySelectorAll('[data-item]')].indexOf(el)
}

// ─── Touchpoints ───────────────────────────────────────────────────────────────

export function markFeature(feature) {
  const features = new Set(readJson(FEATURES_KEY, []))
  if (features.has(feature)) return
  features.add(feature)
  session(s => s.setItem(FEATURES_KEY, JSON.stringify([...features])))
}

function rememberSource(productId, listId) {
  if (!productId) return
  const sources = readJson(SOURCES_KEY, {})
  sources[productId] = listId
  session(s => s.setItem(SOURCES_KEY, JSON.stringify(sources)))
}

// Properties for a /cart/add.js line. `via` is the control used.
export function lineItemProperties(productId, via, listId) {
  const source = listId || readJson(SOURCES_KEY, {})[productId] || 'direct'
  return { _source: source, _added_via: via }
}

function analyticsAllowed() {
  const privacy = window.Shopify?.customerPrivacy
  return privacy?.analyticsProcessingAllowed ? privacy.analyticsProcessingAllowed() : true
}

function gaClientId() {
  const match = document.cookie.match(/(?:^|;\s*)_ga=GA\d\.\d\.(\d+\.\d+)/)
  return match ? match[1] : ''
}

// Brings the cart's attributes up to date with this visit. The features list
// is merged with what the cart already holds — a cart outlives the visit.
// Skips the write when the cart already holds the same values.
export async function syncCartAttributes() {
  try {
    const res = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart.js`)
    if (!res.ok) return
    const cart = await res.json()
    if (!cart.item_count) return

    const current = cart.attributes || {}
    const features = new Set([
      ...String(current._features || '').split(',').filter(Boolean),
      ...readJson(FEATURES_KEY, []),
    ])
    const groups = Object.entries(experiments)
      .filter(([, group]) => group !== 'off')
      .map(([feature, group]) => `${feature}:${group}`)

    const attributes = {
      _features: [...features].sort().join(','),
      _experiments: groups.join(','),
    }
    if (analyticsAllowed()) attributes._ga_client_id = gaClientId()

    if (Object.entries(attributes).every(([k, v]) => (current[k] || '') === v)) return

    await fetch(`${window.Shopify?.routes?.root ?? '/'}cart/update.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes }),
    })
  } catch {
    // Attribution is best effort; the cart itself is unaffected.
  }
}

// ─── List impressions ──────────────────────────────────────────────────────────

const seenLists = new WeakSet()
const seenFeatures = new Set()

const viewObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const el = entry.target
      viewObserver.unobserve(el)

      if (el.matches('[data-item-list]') && !seenLists.has(el)) {
        seenLists.add(el)
        const items = [...el.querySelectorAll('[data-item]')]
          .slice(0, 20)
          .map((item, index) => itemFrom(item, { index }))
        if (items.length) track('view_item_list', { ...listOf(el), items })
      }

      if (el.matches('[data-feature]')) {
        const feature = el.dataset.feature
        if (seenFeatures.has(feature)) return
        seenFeatures.add(feature)
        track('feature_view', { feature, experiment_variant: experiments[feature] || 'off' })
      }
    })
  }, { threshold: 0 })
  : null

// Call again for lists added after load (recommendations, Essie).
export function observeLists(root = document) {
  if (!viewObserver) return
  root.querySelectorAll('[data-item-list]').forEach(list => {
    if (!NO_IMPRESSIONS.has(list.dataset.itemList)) viewObserver.observe(list)
  })
  // A held-out feature is collapsed, not removed, so it still reports when its
  // place on the page is reached — the comparison the holdout needs.
  root.querySelectorAll('[data-feature]').forEach(el => viewObserver.observe(el))
}

// ─── Delegated tracking ────────────────────────────────────────────────────────

// Product selections. The quick-add sticker and wishlist heart stop their
// clicks in the capture phase, so only clicks that follow the link get here.
document.addEventListener('click', e => {
  const el = e.target.closest('[data-item]')
  if (!el) return

  const list = listOf(el)
  track('select_item', { ...list, items: [itemFrom(el, { index: indexIn(el) })] })
  rememberSource(el.dataset.productId, list.item_list_id)
  markFeature(list.item_list_id)
})

// Clicks inside the page's sections, as `section_click` with the parameters
// the v1 theme sent (assets/analytics.js there), so reports built on it carry
// on across the relaunch. A product card click sends this and select_item:
// this one answers "which section, how far down the page", select_item ties
// the click to revenue.
//
// Sections are the template's own (`shopify-section-template--…`), not the
// header and footer groups, counted from the top for section_position. Their
// type comes from the `section-type--<file>` class each section's schema puts
// on its wrapper. A card is anything marked [data-card="<type>"]; any other
// link in a section is reported as element_type `link`.
const TEMPLATE_SECTIONS = '[id^="shopify-section-template"]'

document.addEventListener('click', e => {
  const link = e.target.closest('a[href]')
  const section = link?.closest(TEMPLATE_SECTIONS)
  if (!section) return

  const type = [...section.classList].find(c => c.startsWith('section-type--'))
  const params = {
    section_id: section.id.replace('shopify-section-', ''),
    section_type: type ? type.slice('section-type--'.length) : 'unknown',
    section_position: [...document.querySelectorAll(TEMPLATE_SECTIONS)].indexOf(section) + 1,
    destination_url: link.getAttribute('href'),
  }

  const card = link.closest('[data-card]')
  if (card) {
    track('section_click', {
      ...params,
      element_type: 'card',
      card_type: card.dataset.card,
      card_index: [...section.querySelectorAll('[data-card]')].indexOf(card) + 1,
    })
  } else {
    track('section_click', {
      ...params,
      element_type: 'link',
      link_text: link.textContent.trim().replace(/\s+/g, ' ').slice(0, 100),
    })
  }
})

// Searches, by where they were typed. The app reports the results page; this
// says which bar the search came from.
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-search-form]')
  if (!form) return

  const input = form.querySelector('input[name="q"]')
  track('search_submit', {
    search_type: form.dataset.searchForm,
    search_term: input?.value.trim() || input?.placeholder || '',
  })
  markFeature(`search_${form.dataset.searchForm}`)
})

// Navigation inside a feature: brand suggestions, contents links.
document.addEventListener('click', e => {
  const el = e.target.closest('[data-track-content]')
  if (!el) return
  track('select_content', {
    content_type: el.dataset.trackContent,
    content_id: el.dataset.trackContentId || el.textContent.trim().slice(0, 100),
  })
})

// The search results page: the count, so searches that find nothing show up.
const results = document.querySelector('[data-search-results]')
if (results) {
  track('search_results', {
    search_term: results.dataset.searchTerm,
    results_count: Number(results.dataset.resultsCount) || 0,
  })
}

// The cart page is the last stop before checkout.
if (document.querySelector('[data-cart]')) syncCartAttributes()

observeLists()
