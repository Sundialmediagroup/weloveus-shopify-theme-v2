import { showCartPanel, refreshCartCount } from './cart-feedback.js';
import { track, itemFrom, listOf, lineItemProperties, markFeature, syncCartAttributes } from './analytics.js';

// Product card "Add to Cart" sticker — adds the first available variant.
// Capture phase so it wins over the surrounding card link.
document.addEventListener('click', async e => {
  const sticker = e.target.closest('[data-add-to-cart]');
  if (!sticker) return;

  e.preventDefault();
  e.stopPropagation();

  const original = sticker.innerHTML;
  sticker.innerHTML = '…';

  const card = sticker.closest('[data-item]');
  const list = listOf(sticker);

  try {
    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sticker.dataset.addToCart,
        quantity: 1,
        properties: lineItemProperties(card?.dataset.productId, 'quick_add', list.item_list_id),
      }),
    });

    track('quick_add', { ...list, success: res.ok, items: card ? [itemFrom(card, { quantity: 1 })] : [] });

    if (res.ok) {
      sticker.innerHTML = 'Added!';
      showCartPanel();
      refreshCartCount();
      markFeature('quick_add');
      markFeature(list.item_list_id);
      syncCartAttributes();
    } else {
      sticker.innerHTML = 'Error';
    }

    setTimeout(() => { sticker.innerHTML = original; }, 1800);
  } catch {
    sticker.innerHTML = original;
  }
}, true);
