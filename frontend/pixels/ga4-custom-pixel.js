// GA4 forwarder for the theme's feature events (frontend/scripts/analytics.js).
//
// Not part of the theme build. Paste this file into Shopify admin → Settings →
// Customer events → Add custom pixel, and set its
// permissions to require Analytics consent. It runs in Shopify's pixel
// sandbox, which only shows it consented visitors' events.
//
// It forwards only the theme's own events. The Google & YouTube app keeps
// sending page views and ecommerce events (view_item, add_to_cart, purchase…);
// forwarding Shopify's standard events here as well would count them twice.
//
// Before relying on it: in GA4 DebugView, check that these events arrive in the
// same session as the app's page_view (same ga_session_id). If they open new
// sessions, the sandbox isn't seeing the _ga cookies — tell the theme developer
// before the data is used.

const MEASUREMENT_ID = 'G-9850NFSEP7' // the WeLoveUs stream, as the Google & YouTube app uses

const THEME_EVENTS = new Set([
  'view_item_list',
  'select_item',
  'select_content',
  'section_click',
  'quick_add',
  'add_to_wishlist',
  'remove_from_wishlist',
  'wishlist_login_prompt',
  'search_submit',
  'search_results',
  'predictive_search',
  'feature_view',
  'essie_open',
  'essie_message',
  'essie_products_shown',
  'essie_cart_view',
  'essie_action',
  'essie_checkout',
  'essie_error',
  'essie_new_chat',
  'essie_sign_in',
])

const script = document.createElement('script')
script.async = true
script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
document.head.appendChild(script)

window.dataLayer = window.dataLayer || []
function gtag() { window.dataLayer.push(arguments) }

// The page's own _ga cookie, read through the sandbox's cookie API, so events
// join the visitor GA4 already knows rather than a new one.
const ready = browser.cookie.get('_ga').then(value => {
  const clientId = (value || '').split('.').slice(-2).join('.')
  gtag('js', new Date())
  gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    ...(clientId.includes('.') ? { client_id: clientId } : {}),
  })
})

analytics.subscribe('all_custom_events', async event => {
  if (!THEME_EVENTS.has(event.name)) return
  await ready

  const { experiments, ...params } = event.customData || {}

  // Holdout groups as user properties: exp_essie, exp_quick_add, …
  if (experiments) {
    gtag('set', 'user_properties', Object.fromEntries(
      Object.entries(experiments).map(([feature, group]) => [`exp_${feature}`, group]),
    ))
  }

  // The sandbox has its own URL; report the shopper's page instead.
  const page = event.context?.document
  gtag('event', event.name, {
    ...params,
    page_location: page?.location?.href,
    page_referrer: page?.referrer,
    page_title: page?.title,
  })
})
