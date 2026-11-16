import { track } from './analytics.js';

// Promo Banner — rolls through its slides, each rising out of the strip as the
// next rises in from below. Pauses on hover and keyboard focus, while the tab
// is hidden, and on the slide picked in the theme editor.
//
// Reports GA4's promotion events: view_promotion for each slide the first time
// it is on screen, select_promotion when a linked slide is clicked.

class PromoBanner extends HTMLElement {
  connectedCallback() {
    this.slides = [...this.querySelectorAll('.promo-banner__slide')];
    if (!this.slides.length) return;

    this.index = 0;
    this.seen = new Set();
    this.trackViews();
    this.addEventListener('click', (event) => {
      const slide = event.target.closest('a.promo-banner__slide');
      if (slide) track('select_promotion', this.promotion(slide));
    });

    if (this.slides.length < 2) return;

    this.interval = Number(this.dataset.interval) || 5000;
    this.pauses = new Set();

    const pause = (reason) => () => { this.pauses.add(reason); this.stop(); };
    const resume = (reason) => () => { this.pauses.delete(reason); this.start(); };

    this.addEventListener('mouseenter', pause('hover'));
    this.addEventListener('mouseleave', resume('hover'));
    this.addEventListener('focusin', pause('focus'));
    this.addEventListener('focusout', resume('focus'));

    this.onVisibility = () => (document.hidden ? pause('hidden') : resume('hidden'))();
    document.addEventListener('visibilitychange', this.onVisibility);

    // Theme editor: show the slide being edited and hold it there.
    this.onBlockSelect = (event) => {
      const i = this.slides.indexOf(event.target);
      if (i === -1) return;
      this.pauses.add('editor');
      this.stop();
      if (i !== this.index) this.go(i);
    };
    this.onBlockDeselect = (event) => {
      if (!this.slides.includes(event.target)) return;
      resume('editor')();
    };
    document.addEventListener('shopify:block:select', this.onBlockSelect);
    document.addEventListener('shopify:block:deselect', this.onBlockDeselect);

    this.start();
  }

  disconnectedCallback() {
    this.stop();
    this.viewObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('shopify:block:select', this.onBlockSelect);
    document.removeEventListener('shopify:block:deselect', this.onBlockDeselect);
  }

  // The banner counts as seen once half of it is in view; each slide is
  // reported the first time it is showing while that's so.
  trackViews() {
    if (!('IntersectionObserver' in window)) return;
    this.viewObserver = new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      if (this.inView) this.reportView();
    }, { threshold: 0.5 });
    this.viewObserver.observe(this);
  }

  reportView() {
    const slide = this.slides[this.index];
    if (!this.inView || this.seen.has(slide)) return;
    this.seen.add(slide);
    track('view_promotion', this.promotion(slide));
  }

  promotion(slide) {
    const { promotionId, promotionName, creativeName } = slide.dataset;
    return {
      promotion_id: promotionId,
      promotion_name: promotionName,
      creative_name: creativeName,
      creative_slot: `slide_${this.slides.indexOf(slide) + 1}`,
      slide_count: this.slides.length,
      has_link: slide.matches('a'),
    };
  }

  start() {
    if (this.pauses.size || this.timer) return;
    this.timer = setInterval(() => this.go((this.index + 1) % this.slides.length), this.interval);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  go(next) {
    const current = this.slides[this.index];
    const incoming = this.slides[next];

    // Clear any slide still rolling out from the last move.
    this.slides.forEach((slide) => {
      if (slide !== current) slide.classList.remove('is-leaving');
    });

    current.classList.remove('is-active');
    current.classList.add('is-leaving');
    current.setAttribute('aria-hidden', 'true');
    current.inert = true;

    incoming.classList.add('is-active');
    incoming.removeAttribute('aria-hidden');
    incoming.inert = false;

    current.addEventListener(
      'transitionend',
      () => {
        if (!current.classList.contains('is-active')) current.classList.remove('is-leaving');
      },
      { once: true },
    );

    this.index = next;
    this.reportView();
  }
}

customElements.define('promo-banner', PromoBanner);
