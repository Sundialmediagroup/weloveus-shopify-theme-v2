// Confirmation toast — the pill under the header actions (sections/header.liquid)
// saying something went in the cart or the wishlist, with a link to it, and
// the header badge that changed giving a small pop. Shared by cart-feedback.js
// (card stickers and the PDP form) and wishlist.js.
//
// Subtle by design: it doesn't take focus or block the page, and it goes after
// a few seconds, though not while the pointer or focus is on it. Esc dismisses
// it. Screen readers hear it through a separate status region, which has to be
// on the page before its text changes to be announced.

const HIDE_AFTER = 3500;

const toast = document.querySelector('[data-toast]');
const status = document.querySelector('[data-toast-status]');

let hideTimer;
let held = false; // pointer over it, or focus in it

function schedule() {
  clearTimeout(hideTimer);
  if (!held) hideTimer = setTimeout(hide, HIDE_AFTER);
}

export function hide() {
  clearTimeout(hideTimer);
  toast?.classList.remove('is-open');
}

export function isOpen() {
  return Boolean(toast?.classList.contains('is-open'));
}

// kind: 'cart' | 'wishlist' | 'error'. The text and link come from the
// toast's data attributes (locale strings); `text` overrides the message.
export function showToast(kind, { text } = {}) {
  if (!toast) return;

  const d = toast.dataset;
  const message = text || d[`text${kind[0].toUpperCase()}${kind.slice(1)}`] || '';
  const link = toast.querySelector('[data-toast-link]');

  toast.dataset.kind = kind;
  toast.querySelector('[data-toast-text]').textContent = message;
  if (link) {
    const href = kind === 'cart' ? d.cartUrl : kind === 'wishlist' ? d.wishlistUrl : '';
    link.hidden = !href;
    if (href) {
      link.href = href;
      link.textContent = kind === 'cart' ? d.linkCart : d.linkWishlist;
    }
  }

  // Restarted, so a second add in a row is seen as new.
  toast.classList.remove('is-open');
  void toast.offsetWidth;
  toast.classList.add('is-open');
  schedule();

  if (status) {
    status.textContent = '';
    requestAnimationFrame(() => { status.textContent = message; });
  }
}

// A small pop on a header count badge, once its number has changed.
export function bump(el) {
  if (!el) return;
  el.classList.remove('is-bumped');
  void el.offsetWidth;
  el.classList.add('is-bumped');
}

if (toast) {
  toast.addEventListener('pointerenter', () => { held = true; clearTimeout(hideTimer); });
  toast.addEventListener('pointerleave', () => { held = false; schedule(); });
  toast.addEventListener('focusin', () => { held = true; clearTimeout(hideTimer); });
  toast.addEventListener('focusout', e => {
    if (toast.contains(e.relatedTarget)) return;
    held = false;
    schedule();
  });
  toast.querySelector('[data-toast-close]')?.addEventListener('click', hide);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) hide();
  });

  document.addEventListener('animationend', e => {
    if (e.animationName === 'header-badge-bump') e.target.classList.remove('is-bumped');
  });
}
