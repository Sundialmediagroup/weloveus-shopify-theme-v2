const header  = document.querySelector('.site-header');

// Scroll opacity
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 0);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Mega menus (Brands, Categories). Each trigger names its pane by
// aria-controls; the panes share one container, which is sized to whichever
// pane is showing so switching menus resizes it instead of stacking panels.
const mega  = document.querySelector('.site-header__mega');
const megas = [...document.querySelectorAll('.site-header__mega-trigger')]
  .map(trigger => ({ trigger, pane: document.getElementById(trigger.getAttribute('aria-controls')) }))
  .filter(({ pane }) => pane);

if (header && mega && megas.length) {
  let closeTimer;

  const open = item => {
    clearTimeout(closeTimer);
    megas.forEach(({ trigger, pane }) => {
      const active = pane === item.pane;
      pane.hidden = !active;
      pane.setAttribute('aria-hidden', String(!active));
      trigger.setAttribute('aria-expanded', String(active));
    });
    mega.style.setProperty('--mega-height', `${item.pane.offsetHeight}px`);
    header.classList.add('site-header--mega-open');
  };

  // The pane stays visible while the container collapses over it, so the
  // content does not vanish before the close animation runs.
  const close = () => {
    closeTimer = setTimeout(() => {
      header.classList.remove('site-header--mega-open');
      megas.forEach(({ trigger, pane }) => {
        pane.setAttribute('aria-hidden', 'true');
        trigger.setAttribute('aria-expanded', 'false');
      });
    }, 180);
  };

  megas.forEach(item => {
    item.trigger.addEventListener('mouseenter', () => open(item));
    item.trigger.addEventListener('mouseleave', close);
  });
  mega.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  mega.addEventListener('mouseleave', close);

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });
}
