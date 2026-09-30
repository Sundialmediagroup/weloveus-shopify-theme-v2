// Account modal — snippets/account-modal.liquid.
//
// Native <dialog>: showModal() gives focus trapping, Escape to close and a
// backdrop for free. Triggers are delegated so markup injected later works.
//
// Exports openAccountModal() for wishlist.js, which opens it when a logged-out
// shopper taps a heart.

const dialog = document.querySelector('[data-account-modal]');
const supported = dialog && typeof dialog.showModal === 'function';

let lastTrigger = null;

// The fallback login leaves the site, so it carries the current page back.
function withReturnUrl(href) {
  const url = new URL(href, window.location.origin);
  url.searchParams.set('return_url', window.location.pathname + window.location.search);
  return url.toString();
}

export function openAccountModal() {
  if (!supported) return false;
  lastTrigger = document.activeElement;
  dialog.showModal();
  return true;
}

function initShopLogin() {
  const loginLink = dialog.querySelector('[data-account-login-link]');
  const shopLogin = dialog.querySelector('[data-account-shop-login] shop-login-button');

  if (loginLink) {
    loginLink.href = withReturnUrl(loginLink.getAttribute('href'));
    if (shopLogin) loginLink.textContent = loginLink.dataset.textAlternate;
  }

  if (!shopLogin) return;

  // Shopify owns this element's markup, so its options are set as attributes.
  // Same values as Shopify's Horizon account popover.
  shopLogin.setAttribute('full-width', 'true');
  shopLogin.setAttribute('persist-after-sign-in', 'true');
  shopLogin.setAttribute('analytics-context', 'loginWithShopSelfServe');
  shopLogin.setAttribute('flow-version', 'account-actions-popover');
  shopLogin.setAttribute('return-uri', window.location.href);

  // Reload so header, hearts and wishlist state render as the new customer.
  // A heart tapped before signing in is saved by wishlist.js after the reload.
  shopLogin.addEventListener('completed', () => window.location.reload());
}

if (supported) {
  initShopLogin();

  // The trigger stays a real link, so without JS it still reaches the login.
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-account-open]');
    if (!trigger) return;
    e.preventDefault();
    openAccountModal();
  });

  dialog.querySelector('[data-account-close]')?.addEventListener('click', () => dialog.close());

  // A click that lands on the <dialog> itself is on the backdrop.
  dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => {
    lastTrigger?.focus?.();
    lastTrigger = null;
  });
}
