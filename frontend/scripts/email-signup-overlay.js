// Email signup overlay — sections/email-signup-overlay.liquid.
//
// A native <dialog>: showModal() traps focus, Esc closes it and the page
// behind is inert. What's here is when it may appear:
//
// - Never on a visitor's first page view: from their second page, or after
//   about 30 seconds and halfway down the first, whichever comes first.
// - Closing it keeps it away for 30 days; signing up keeps it away for good.
//   Any customer form that signs up (footer, homepage) counts, as does arriving
//   from one of our emails (`utm_medium=email`).
// - It waits while Essie, the menu drawer, the search overlay, the cart panel
//   or another dialog is open, and for a while after an add to cart.
//
// The section leaves it out for signed-in customers and on the cart, account
// and password pages.

import { track } from './analytics.js';

const dialog = document.querySelector('[data-email-signup]');

const STATE_KEY = 'wlu.signup'; // { subscribed: true } or { dismissedUntil: ms }
const VIEWS_KEY = 'wlu.signup.views'; // pages seen before it was shown
const DISMISS_DAYS = 30;
const FIRST_PAGE_DELAY = 30_000;
const RETRY = 3_000; // while something else is open
const CART_PAUSE = 20_000; // after an add to cart

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: it just shows again */ }
  },
};

const params = new URLSearchParams(window.location.search);

// Signed up anywhere on the site (Shopify adds `customer_posted` after a
// successful customer form), or came from an email: they're on the list.
if (params.get('customer_posted') === 'true' || params.get('utm_medium') === 'email') {
  store.set(STATE_KEY, { subscribed: true });
}

function suppressed() {
  const state = store.get(STATE_KEY);
  if (state?.subscribed) return true;
  return Boolean(state?.dismissedUntil && state.dismissedUntil > Date.now());
}

let lastCartAdd = 0;

function somethingElseOpen() {
  const root = document.documentElement;
  return (
    Date.now() - lastCartAdd < CART_PAUSE ||
    root.classList.contains('is-scroll-locked') || // menu drawer, search overlay
    root.classList.contains('is-essie-open') ||
    document.querySelector('[data-essie][data-open]') ||
    document.querySelector('.site-header--cart-open') ||
    document.querySelector('dialog[open]')
  );
}

function lockScroll(locked) {
  document.documentElement.classList.toggle('is-scroll-locked', locked);
}

function open() {
  if (dialog.open) return;
  dialog.showModal();
  lockScroll(true);
}

if (dialog && typeof dialog.showModal === 'function') {
  const designMode = dialog.hasAttribute('data-design-mode');
  const result = dialog.querySelector('[data-email-signup-result]')?.dataset.emailSignupResult;
  let shownAt = 0;

  dialog.querySelector('[data-email-signup-close]')?.addEventListener('click', () => dialog.close());

  // A click that lands on the <dialog> itself is on the backdrop.
  dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    lockScroll(false);
    if (designMode || !shownAt) return;
    if (!store.get(STATE_KEY)?.subscribed) {
      store.set(STATE_KEY, { dismissedUntil: Date.now() + DISMISS_DAYS * 86_400_000 });
    }
    track('email_signup_close', { result: result || 'none' });
  });

  dialog.querySelector('form')?.addEventListener('submit', () => {
    track('email_signup_submit');
  });

  if (designMode) {
    // Open while the section is selected in the theme editor.
    document.addEventListener('shopify:section:select', e => {
      if (dialog.closest('.shopify-section')?.id === `shopify-section-${e.detail.sectionId}`) open();
    });
    document.addEventListener('shopify:section:deselect', () => dialog.open && dialog.close());
  } else if (result) {
    // Back from posting the form: show how it went.
    shownAt = Date.now();
    if (result === 'success') {
      store.set(STATE_KEY, { subscribed: true });
      track('email_signup', { method: 'overlay' });
    }
    open();
  } else if (!suppressed()) {
    const views = (store.get(VIEWS_KEY) || 0) + 1;
    store.set(VIEWS_KEY, views);

    document.addEventListener('click', e => {
      if (e.target.closest('[data-add-to-cart], [name="add"]')) lastCartAdd = Date.now();
    }, true);
    document.addEventListener('submit', e => {
      if (e.target.action?.includes('/cart/add')) lastCartAdd = Date.now();
    }, true);

    const show = () => {
      if (suppressed()) return;
      if (somethingElseOpen()) {
        setTimeout(show, RETRY);
        return;
      }
      shownAt = Date.now();
      open();
      track('email_signup_view');
    };

    if (views >= 2) {
      // A moment after the page settles, not on top of its first paint.
      setTimeout(show, 4_000);
    } else {
      // First page: 30 seconds in and halfway down, in either order.
      let waited = false;
      let scrolled = false;
      const ready = () => {
        if (!waited || !scrolled) return;
        window.removeEventListener('scroll', onScroll);
        show();
      };
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0 && window.scrollY / max < 0.5) return;
        scrolled = true;
        ready();
      };
      setTimeout(() => { waited = true; ready(); }, FIRST_PAGE_DELAY);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
}
