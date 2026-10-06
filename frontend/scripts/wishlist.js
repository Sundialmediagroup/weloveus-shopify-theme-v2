// Wishlist hearts ([data-wishlist-toggle]) on cards and the PDP.
//
// State lives in the `custom.wishlist` customer metafield. The theme can read
// it but not write it, so writes go to the app proxy at /apps/wishlist, which
// Shopify signs with the logged-in customer's ID before forwarding to the
// function in ../wishlist-proxy/ (separate project). The proxy answers with the full saved list,
// and that list is treated as the truth.
//
// Logged out: the product ID is parked in sessionStorage and the account modal
// opens (falling back to the Shopify login page). Signing in reloads the page,
// and the parked product is saved then.

import { openAccountModal } from './account-modal.js';
import { track, itemFrom, listOf, markFeature } from './analytics.js';

const configEl = document.getElementById('wishlist-config');
const config = configEl ? JSON.parse(configEl.textContent) : null;

const PENDING_KEY = 'wishlist:pending';
const SYNC_KEY = 'wishlist:ids';

let saved = new Set((config?.ids || []).map(String));
const inFlight = new Set();

function session(fn) {
  try { return fn(window.sessionStorage); } catch { return null; }
}

function loginUrl() {
  const url = new URL(config.loginUrl, window.location.origin);
  url.searchParams.set('return_url', window.location.pathname + window.location.search);
  return url.toString();
}

function togglesFor(id) {
  return document.querySelectorAll(`[data-wishlist-toggle="${id}"]`);
}

function paint(id) {
  const pressed = String(saved.has(id));
  togglesFor(id).forEach(el => el.setAttribute('aria-pressed', pressed));
}

function paintAll() {
  document.querySelectorAll('[data-wishlist-toggle]').forEach(el => {
    el.setAttribute('aria-pressed', String(saved.has(el.dataset.wishlistToggle)));
  });
}

function announce(text) {
  const status = document.querySelector('[data-wishlist-status]');
  if (!status || !text) return;
  // Cleared first so the same message twice in a row is still announced.
  status.textContent = '';
  requestAnimationFrame(() => { status.textContent = text; });
}

function setPending(id, pending) {
  togglesFor(id).forEach(el => el.classList.toggle('is-pending', pending));
}

function paintCount() {
  document.querySelectorAll('[data-wishlist-count]').forEach(el => {
    el.textContent = saved.size;
    el.hidden = saved.size === 0;
  });
}

// On the wishlist page an unsaved product has no business staying on screen.
function pruneWishlistPage(id) {
  const page = document.querySelector('[data-wishlist-page]');
  if (!page || saved.has(id)) return;

  page.querySelector(`[data-wishlist-item="${id}"]`)?.remove();

  if (!page.querySelector('[data-wishlist-item]')) {
    page.querySelector('[data-wishlist-empty]')?.removeAttribute('hidden');
  }
}

async function request(action, id) {
  const res = await fetch(config.proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action, product_id: id }),
  });
  if (!res.ok) throw new Error(`Wishlist ${action} failed: ${res.status}`);
  const data = await res.json();
  return new Set((data.ids || []).map(String));
}

async function setSaved(id, shouldSave) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  setPending(id, true);

  const previous = new Set(saved);

  // Optimistic — the heart fills under the finger, not after a round trip.
  if (shouldSave) saved.add(id); else saved.delete(id);
  paint(id);
  paintCount();

  try {
    saved = await request(shouldSave ? 'add' : 'remove', id);
    session(s => s.setItem(SYNC_KEY, JSON.stringify([...saved])));
    trackSave(id, shouldSave);
    announce(saved.has(id) ? config.textAdded : config.textRemoved);
  } catch (err) {
    console.error(err);
    saved = previous;
    announce(config.textError);
  } finally {
    inFlight.delete(id);
    setPending(id, false);
    paint(id);
    paintCount();
    pruneWishlistPage(id);
  }
}

// Any element describing the product will do: a card, or the PDP itself.
function trackSave(id, added) {
  const el = document.querySelector(`[data-product-id="${id}"]`);
  track(added ? 'add_to_wishlist' : 'remove_from_wishlist', {
    ...listOf(el),
    items: el ? [itemFrom(el)] : [],
  });
  if (added) markFeature('wishlist');
}

function activate(toggle) {
  const id = toggle.dataset.wishlistToggle;

  if (!config.loggedIn) {
    // Logged out, the heart is a sign-in prompt; this counts how often.
    track('wishlist_login_prompt', listOf(toggle));
    session(s => s.setItem(PENDING_KEY, id));
    if (!openAccountModal()) window.location.href = loginUrl();
    return;
  }

  setSaved(id, !saved.has(id));
}

if (config) {
  // Capture phase so a card heart wins over the surrounding card link.
  document.addEventListener('click', e => {
    const toggle = e.target.closest('[data-wishlist-toggle]');
    if (!toggle) return;

    e.preventDefault();
    e.stopPropagation();
    activate(toggle);
  }, true);

  // The card heart is a span inside a link, so it needs button keys by hand.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const toggle = e.target.closest('span[data-wishlist-toggle]');
    if (!toggle) return;

    e.preventDefault();
    e.stopPropagation();
    activate(toggle);
  }, true);

  // Back/forward cache restores the page as it was, which may predate a
  // change made on the page the shopper is coming back from.
  window.addEventListener('pageshow', e => {
    if (!e.persisted || !config.loggedIn) return;
    const synced = session(s => s.getItem(SYNC_KEY));
    if (!synced) return;
    saved = new Set(JSON.parse(synced));
    paintAll();
    paintCount();
  });

  // Finish a save that was interrupted by the login redirect.
  if (config.loggedIn) {
    const pending = session(s => s.getItem(PENDING_KEY));
    if (pending) {
      session(s => s.removeItem(PENDING_KEY));
      if (!saved.has(pending)) setSaved(pending, true);
    }
  }
}
