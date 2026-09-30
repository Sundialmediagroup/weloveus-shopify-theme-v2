// Collection page — load more products as the shopper scrolls.
//
// sections/main-collection.liquid server-renders the first page and a real
// "Load more" link to `?page=N`. This fetches that URL through the Section
// Rendering API, appends its cards and takes over its next link, so the link
// keeps working without JS and for crawlers.
//
// The first `data-auto-pages` loads happen on scroll; after that the shopper
// clicks, so the footer is reachable on a big collection.
//
// The address bar stays on page 1. Instead, how many pages were loaded (and
// the scroll position) is kept in sessionStorage, and a back/forward visit
// that misses the bfcache reloads those pages and scrolls back.

const grid = document.querySelector('[data-collection-grid]');
const more = document.querySelector('[data-collection-more]');

if (grid && more) init();

function init() {
  const status = more.querySelector('[data-collection-status]');
  const count = more.querySelector('[data-collection-count]');
  let link = more.querySelector('[data-collection-next]');
  if (!link) return;

  const sectionId = link.dataset.sectionId;
  const autoPages = Number(link.dataset.autoPages) || 0;
  const texts = {
    label: link.textContent,
    loading: link.dataset.textLoading,
    error: link.dataset.textError,
  };
  const storeKey = `collection:${location.pathname}${location.search}`;
  const pageSize = grid.children.length;
  let loaded = 1;
  let busy = false;
  let observer = null;

  const session = {
    get() {
      try { return JSON.parse(sessionStorage.getItem(storeKey)); } catch { return null; }
    },
    set(value) {
      try { sessionStorage.setItem(storeKey, JSON.stringify(value)); } catch { /* private mode */ }
    },
  };

  async function loadNext({ announce = true } = {}) {
    if (busy || !link) return false;
    busy = true;
    link.setAttribute('aria-disabled', 'true');
    link.textContent = texts.loading;

    try {
      const url = new URL(link.href);
      url.searchParams.set('section_id', sectionId);
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

      const cards = doc.querySelector('[data-collection-grid]')?.children ?? [];
      grid.append(...cards);
      loaded += 1;

      const nextCount = doc.querySelector('[data-collection-count]');
      if (nextCount && count) count.textContent = nextCount.textContent;

      const nextLink = doc.querySelector('[data-collection-next]');
      if (nextLink) {
        link.href = nextLink.getAttribute('href');
        link.textContent = texts.label;
        link.removeAttribute('aria-disabled');
        // Re-observe: if the new cards didn't push the link out of range, no
        // new intersection would fire and loading would stall.
        if (observer) {
          observer.unobserve(link);
          observer.observe(link);
        }
      } else {
        link.remove();
        link = null;
        observer?.disconnect();
      }

      if (announce && status && count) status.textContent = count.textContent;
      session.set({ ...session.get(), pages: loaded });
      return true;
    } catch {
      link.textContent = texts.label;
      link.removeAttribute('aria-disabled');
      if (status) status.textContent = texts.error;
      return false;
    } finally {
      busy = false;
    }
  }

  link.addEventListener('click', e => {
    e.preventDefault();
    loadNext().then(ok => {
      // Keyboard users land on the first new card, not back on the button.
      if (ok) grid.children[(loaded - 1) * pageSize]?.querySelector('a')?.focus({ preventScroll: true });
    });
  });

  // Auto-load while the link is within a screen of the viewport.
  if ('IntersectionObserver' in window && autoPages > 0) {
    observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      if (loaded > autoPages) { observer.disconnect(); return; }
      loadNext();
    }, { rootMargin: '100% 0px' });
  }

  // Back/forward without bfcache: reload what was showing, then scroll back.
  const nav = performance.getEntriesByType?.('navigation')[0];
  const saved = session.get();
  if (nav?.type === 'back_forward' && saved?.pages > 1) {
    history.scrollRestoration = 'manual';
    (async () => {
      while (loaded < saved.pages && link) {
        if (!(await loadNext({ announce: false }))) break;
      }
      window.scrollTo(0, saved.scroll || 0);
      if (link) observer?.observe(link);
    })();
  } else {
    session.set({ pages: 1 });
    if (link) observer?.observe(link);
  }

  window.addEventListener('pagehide', () => {
    session.set({ ...session.get(), scroll: window.scrollY });
  });
}
