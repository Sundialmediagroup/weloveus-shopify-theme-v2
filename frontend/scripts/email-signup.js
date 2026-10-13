// Email signup section — sections/email-signup.liquid.
//
// Analytics, as the overlay sends them (email-signup-overlay.js), with
// `method` saying where: 'page' on the newsletter page, 'section' elsewhere.
// And the copy button beside the discount code.
//
// A signup here also keeps the overlay away: Shopify adds `customer_posted`
// to the URL after it, which email-signup-overlay.js already watches for.

import { track } from './analytics.js';

document.querySelectorAll('[data-email-signup-section]').forEach(section => {
  const method = section.dataset.emailSignupMethod || 'section';
  const result = section.querySelector('[data-email-signup-result]')?.dataset.emailSignupResult;

  section.querySelector('form')?.addEventListener('submit', () => {
    track('email_signup_submit', { method });
  });

  if (result === 'success') {
    track('email_signup', { method });
    // Back from posting: bring the thanks into view, as the page may have
    // reloaded scrolled to the top.
    section.scrollIntoView({ block: 'center' });
  }

  const copy = section.querySelector('[data-email-signup-copy]');
  const code = section.querySelector('[data-email-signup-code]');
  if (copy && code) {
    const label = copy.textContent;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent.trim());
        copy.textContent = copy.dataset.textCopied;
        setTimeout(() => { copy.textContent = label; }, 2000);
      } catch {
        // No clipboard access: select the code so it can be copied by hand.
        window.getSelection()?.selectAllChildren(code);
      }
    });
  }
});
