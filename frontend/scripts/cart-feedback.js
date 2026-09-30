// Shared post-add-to-cart feedback: the header confirmation panel and the
// cart count badge. Imported by both add-to-cart.js (card stickers) and
// product.js (PDP form) so the two paths behave identically.

let closeTimer;

export function showCartPanel() {
  const header = document.querySelector('.site-header');
  const panel  = document.getElementById('site-cart-panel');
  if (!header || !panel) return;

  header.classList.add('site-header--cart-open');
  panel.setAttribute('aria-hidden', 'false');

  clearTimeout(closeTimer);
  closeTimer = setTimeout(closeCartPanel, 3000);
}

export function closeCartPanel() {
  const header = document.querySelector('.site-header');
  const panel  = document.getElementById('site-cart-panel');

  header?.classList.remove('site-header--cart-open');
  panel?.setAttribute('aria-hidden', 'true');
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
    badge.textContent = cart.item_count;
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
  }
}

// Close the panel on any click outside the header
document.addEventListener('click', e => {
  const header = document.querySelector('.site-header');
  if (header?.classList.contains('site-header--cart-open') && !header.contains(e.target)) {
    closeCartPanel();
  }
});
