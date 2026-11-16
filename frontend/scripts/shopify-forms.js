// Shopify Forms — styles for inside the app's inline forms.
//
// The Forms app renders each form in a shadow root, which the theme stylesheet
// can't reach. Its custom properties cover colour, type and fields
// (_shopify-forms.scss); for the rest — question type, spacing, the button,
// the page layout — this puts _shopify-forms-shadow.scss inside the shadow
// root as a <style>, and puts it back if the app ever re-renders without it.
//
// A form placed under a page's content gets data-theme-layout="page", which
// the stylesheet uses for the side-by-side layout.
//
// Inert on pages without an inline form. Pop-up forms aren't touched.

import shadowCss from '../styles/_shopify-forms-shadow.scss?inline';

const roots = document.querySelectorAll('[data-forms-id]');

function addStyles(shadowRoot) {
  if (shadowRoot.querySelector(':scope > style[data-theme-styles]')) return;
  const style = document.createElement('style');
  style.dataset.themeStyles = '';
  style.textContent = shadowCss;
  shadowRoot.prepend(style);
}

function enhance(host, tries = 0) {
  if (host.dataset.themeStyled) return;
  // The shadow root can arrive a frame or two after the element.
  if (!host.shadowRoot) {
    if (tries < 60) requestAnimationFrame(() => enhance(host, tries + 1));
    return;
  }
  host.dataset.themeStyled = '';

  const section = host.closest('.shopify-section');
  if (section?.previousElementSibling?.querySelector('.editorial')) {
    host.dataset.themeLayout = 'page';
  }

  addStyles(host.shadowRoot);
  new MutationObserver(() => addStyles(host.shadowRoot)).observe(host.shadowRoot, { childList: true });
}

// The app's loader adds the form some time after the page loads.
roots.forEach((root) => {
  const check = () => root.querySelectorAll('shopify-forms-embed').forEach(enhance);
  check();
  new MutationObserver(check).observe(root, { childList: true, subtree: true });
});
