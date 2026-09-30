// Cart quantity updates via Shopify AJAX API
document.querySelectorAll('[data-qty-btn]').forEach(btn => {
  btn.addEventListener('click', () => {
    const item  = btn.closest('[data-cart-item]');
    const input = item.querySelector('[data-qty-input]');
    const delta = btn.dataset.qtyBtn === 'inc' ? 1 : -1;
    const qty   = Math.max(0, parseInt(input.value, 10) + delta);
    input.value = qty;
    updateItem(input.dataset.key, qty);
  });
});

document.querySelectorAll('[data-remove-item]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    updateItem(btn.dataset.removeItem, 0);
  });
});

async function updateItem(key, quantity) {
  await fetch('/cart/change.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: key, quantity }),
  });
  window.location.reload();
}
