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

// ─── Below `lg`: menu drawer and search overlay ──────────────────────────────

// Both stop the page behind from scrolling while they're open.
const lockScroll = locked => document.documentElement.classList.toggle('is-scroll-locked', locked);
const desktop = window.matchMedia('(min-width: 990px)');

// Menu drawer — a native <dialog>, so showModal() traps focus, Esc closes it
// and the page behind is inert. The browser returns focus to the opener.
const drawer = document.querySelector('[data-header-drawer]');
const drawerToggle = document.querySelector('[data-drawer-open]');

if (drawer && drawerToggle && typeof drawer.showModal === 'function') {
  drawerToggle.addEventListener('click', () => {
    drawer.showModal();
    drawerToggle.setAttribute('aria-expanded', 'true');
    lockScroll(true);
  });

  drawer.querySelector('[data-drawer-close]')?.addEventListener('click', () => drawer.close());

  // A click that lands on the <dialog> itself is on the backdrop.
  drawer.addEventListener('click', e => {
    if (e.target === drawer) drawer.close();
  });

  drawer.addEventListener('close', () => {
    drawerToggle.setAttribute('aria-expanded', 'false');
    lockScroll(false);
    drawerToggle.focus();
  });

  // Folding a long section from far down it would leave the drawer scrolled
  // past everything; bring its heading back into view instead. (`toggle`
  // doesn't bubble, hence capture.)
  drawer.addEventListener('toggle', e => {
    const group = e.target;
    if (!(group instanceof HTMLDetailsElement) || group.open) return;
    const heading = group.querySelector('summary');
    if (heading.getBoundingClientRect().top < 0) heading.scrollIntoView({ block: 'start' });
  }, true);

  // Nothing to show from `lg`, where the nav is back in the header.
  desktop.addEventListener('change', e => {
    if (e.matches && drawer.open) drawer.close();
  });
}

// Search overlay — the magnifier lays the header's search bar over the row.
// The magnifier is a link to the search page until this takes it over.
const searchToggle = document.querySelector('[data-search-toggle]');
const searchBar = document.getElementById('header-search-bar');
const searchInput = searchBar?.querySelector('input[type="search"]');

if (header && searchToggle && searchBar && searchInput) {
  searchToggle.setAttribute('role', 'button');
  searchToggle.setAttribute('aria-controls', searchBar.id);
  searchToggle.setAttribute('aria-expanded', 'false');

  const isOpen = () => header.classList.contains('site-header--search-active');

  const openSearch = () => {
    header.classList.add('site-header--search-active');
    searchToggle.setAttribute('aria-expanded', 'true');
    lockScroll(true);
    // In the same tap as the click, or iOS won't raise the keyboard.
    searchInput.focus();
  };

  const closeSearch = ({ restoreFocus = true } = {}) => {
    if (!isOpen()) return;
    header.classList.remove('site-header--search-active', 'site-header--search-open');
    document.querySelector('[data-predictive-results]')?.setAttribute('aria-hidden', 'true');
    searchToggle.setAttribute('aria-expanded', 'false');
    lockScroll(false);
    if (restoreFocus) searchToggle.focus();
  };

  searchToggle.addEventListener('click', e => {
    if (desktop.matches) return;
    e.preventDefault();
    openSearch();
  });

  searchBar.querySelector('[data-search-close]')?.addEventListener('click', () => closeSearch());

  // Capture phase, ahead of search.js: while suggestions are showing, Esc is
  // theirs to close; the next Esc closes the overlay.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (header.classList.contains('site-header--search-open')) return;
    closeSearch();
  }, true);

  // A tap anywhere outside the header (suggestions included) closes it, and
  // only that: the click it ends in doesn't also follow a link underneath.
  const swallowClick = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  document.addEventListener('pointerdown', e => {
    if (!isOpen() || header.contains(e.target)) return;
    closeSearch({ restoreFocus: false });
    document.addEventListener('click', swallowClick, { capture: true, once: true });
    // A drag or scroll ends without a click; don't eat the next real one.
    setTimeout(() => document.removeEventListener('click', swallowClick, { capture: true }), 600);
  });

  desktop.addEventListener('change', e => {
    if (e.matches) closeSearch({ restoreFocus: false });
  });
}
