const header  = document.querySelector('.site-header');

// Scroll opacity
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 0);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const trigger = document.querySelector('.site-header__brands-trigger');
const mega    = document.querySelector('.site-header__mega');

if (header && trigger && mega) {
  let closeTimer;

  const open = () => {
    clearTimeout(closeTimer);
    header.classList.add('site-header--mega-open');
    trigger.setAttribute('aria-expanded', 'true');
    mega.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    closeTimer = setTimeout(() => {
      header.classList.remove('site-header--mega-open');
      trigger.setAttribute('aria-expanded', 'false');
      mega.setAttribute('aria-hidden', 'true');
    }, 180);
  };

  trigger.addEventListener('mouseenter', open);
  trigger.addEventListener('mouseleave', close);
  mega.addEventListener('mouseenter', open);
  mega.addEventListener('mouseleave', close);

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });
}
