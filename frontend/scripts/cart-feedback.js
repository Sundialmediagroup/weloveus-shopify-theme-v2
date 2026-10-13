import { showToast, bump } from './toast.js';

// Shared post-add-to-cart feedback: the confirmation toast and the cart
// count badge. Imported by both add-to-cart.js (card stickers) and
// product.js (PDP form) so the two paths behave identically.

// The confirmation itself is the shared toast (toast.js); the header badge
// pops once the new count is in.
export function showCartPanel() {
  showToast('cart');
}

export async function refreshCartCount() {
  let cart;

  try {
    const res = await fetch('/cart.js');
    if (!res.ok) return;
    cart = await res.json();
  } catch {
    return;
  }

  const badge = document.querySelector('.site-header__cart-count');

  if (badge) {
    // The cart page can empty the cart without a reload.
    if (cart.item_count === 0) {
      badge.remove();
    } else if (badge.textContent.trim() !== String(cart.item_count)) {
      badge.textContent = cart.item_count;
      bump(badge);
    }
    return;
  }

  if (cart.item_count > 0) {
    const cartLink = document.querySelector('.site-header__cart');
    if (!cartLink) return;

    const span = document.createElement('span');
    span.className = 'site-header__cart-count';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = cart.item_count;
    cartLink.appendChild(span);
    bump(span);
  }
}
