import { showCartPanel, refreshCartCount } from './cart-feedback.js';

// Product detail page controller.
//
// The section renders the correct variant server-side, so everything here is
// progressive enhancement: variant switching without a reload, availability
// feedback, AJAX add-to-cart, the sticky mobile buy bar, and image zoom.

class ProductPage extends HTMLElement {
  connectedCallback() {
    this.variants = this.readVariants();
    if (!this.variants.length) return;

    this.form = this.querySelector('[data-pdp-form]');
    this.idInput = this.querySelector('[data-pdp-variant-id]');
    this.submit = this.querySelector('[data-pdp-submit]');
    this.submitText = this.querySelector('[data-pdp-submit-text]');
    this.stickySubmit = this.querySelector('[data-pdp-sticky-submit]');

    this.text = {
      add: this.dataset.textAdd,
      adding: this.dataset.textAdding,
      added: this.dataset.textAdded,
      soldOut: this.dataset.textSoldOut,
      unavailable: this.dataset.textUnavailable,
      error: this.dataset.textError,
    };

    this.initOptions();
    this.initQuantity();
    this.initGallery();
    this.initStickyBar();
    this.initZoom();
    this.initDescription();
    this.initStickyColumns();

    this.form?.addEventListener('submit', e => this.onSubmit(e));
  }

  readVariants() {
    const script = this.querySelector('[data-pdp-variants]');
    if (!script) return [];

    try {
      return JSON.parse(script.textContent);
    } catch {
      return [];
    }
  }

  // ─── Variant options ───────────────────────────────────────────────────────

  initOptions() {
    this.optionGroups = [...this.querySelectorAll('[data-pdp-option-position]')]
      .map(el => ({ el, select: el.querySelector('[data-pdp-option-select]') }))
      .filter(group => group.select);

    if (!this.optionGroups.length) return;

    this.addEventListener('change', e => {
      if (!e.target.matches('[data-pdp-option-select]')) return;
      this.onOptionChange();
    });

    // Reflect availability for the server-rendered selection
    this.updateOptionAvailability();
  }

  selectedValues() {
    return this.optionGroups.map(group => group.select.value || null);
  }

  onOptionChange() {
    this.updateOptionAvailability();

    const selected = this.selectedValues();
    const variant = this.variants.find(v =>
      v.options.length === selected.length && v.options.every((opt, i) => opt === selected[i])
    );

    this.applyVariant(variant);
  }

  // A value is offered only when some *in-stock* variant carries it alongside
  // the choices already made at earlier positions. Everything else is removed
  // from the list rather than left greyed out, so every choice in a dropdown is
  // one the shopper can actually buy. (`hidden` does that everywhere but
  // Safari, which ignores it on <option>; `disabled` covers Safari.)
  //
  // Narrowing an earlier option can pull the ground out from under a later one —
  // picking a colour that only comes in Small while Large is checked — so a
  // selection that has just been hidden moves to the first value still standing
  // and the pass runs again on the corrected choice.
  updateOptionAvailability() {
    for (let attempt = 0; attempt <= this.optionGroups.length; attempt += 1) {
      const selected = this.selectedValues();
      let repaired = false;

      this.optionGroups.forEach((group, index) => {
        const options = [...group.select.options];

        options.forEach(option => {
          const offered = this.variants.some(v =>
            v.available &&
            v.options[index] === option.value &&
            selected.slice(0, index).every((value, i) => value === null || v.options[i] === value)
          );

          option.disabled = !offered;
          option.hidden = !offered;
        });

        const current = group.select.selectedOptions[0];
        if (current && current.disabled) {
          const fallback = options.find(o => !o.disabled);
          if (fallback) {
            group.select.value = fallback.value;
            repaired = true;
          }
        }
      });

      if (!repaired) return;
    }
  }

  applyVariant(variant) {
    this.setText('[data-pdp-price]', variant?.price ?? '');
    this.setText('[data-pdp-sticky-price]', variant?.price ?? '');

    const compare = this.querySelector('[data-pdp-compare]');
    const saving = this.querySelector('[data-pdp-saving]');
    const onSale = Boolean(variant?.compare_at && variant.saving);

    if (compare) {
      compare.textContent = onSale ? variant.compare_at : '';
      compare.hidden = !onSale;
    }
    if (saving) {
      saving.textContent = onSale ? variant.saving : '';
      saving.hidden = !onSale;
    }

    const stock = this.querySelector('[data-pdp-stock]');
    if (stock) {
      stock.textContent = variant?.stock_note ?? '';
      stock.dataset.level = variant ? variant.stock_level : 'out';
    }

    const skuRow = this.querySelector('[data-pdp-sku-row]');
    if (skuRow) {
      skuRow.hidden = !variant?.sku;
      this.setText('[data-pdp-sku]', variant?.sku ?? '');
    }

    if (this.idInput && variant) this.idInput.value = variant.id;

    const buyable = Boolean(variant?.available);
    let label = this.text.add;
    if (!variant) label = this.text.unavailable;
    else if (!variant.available) label = this.text.soldOut;

    if (this.submit) this.submit.disabled = !buyable;
    if (this.submitText) this.submitText.textContent = label;
    if (this.stickySubmit) {
      this.stickySubmit.disabled = !buyable;
      this.stickySubmit.textContent = label;
    }

    if (variant) {
      this.syncUrl(variant.id);
      if (variant.media_id) this.scrollToMedia(variant.media_id);
    }
  }

  // Descriptions run from a single line to well over a thousand words. The
  // section ships the copy clamped so nothing paints at full height and then
  // collapses; this decides which products actually needed it.
  initDescription() {
    const body = this.querySelector('[data-pdp-description]');
    const toggle = this.querySelector('[data-pdp-description-toggle]');
    if (!body || !toggle) return;

    const more = toggle.textContent.trim();
    const less = toggle.dataset.textLess;

    // Fits inside the clamp, so the clamp is doing nothing but costing a
    // control — drop it and leave the toggle hidden.
    if (body.scrollHeight <= body.clientHeight + 1) {
      body.classList.remove('pdp__detail-body--collapsible');
      return;
    }

    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const expanded = body.classList.toggle('is-expanded');
      toggle.textContent = expanded ? less : more;
      toggle.setAttribute('aria-expanded', String(expanded));
      this.syncStickyColumns();
    });
  }

  // A sticky column taller than the space below the header pins its top and
  // leaves its own bottom permanently unreachable. Expanding a long description
  // is the usual way to get there, so the columns are re-measured on every
  // resize and on every toggle.
  initStickyColumns() {
    this.stickyColumns = [...this.querySelectorAll('.pdp__aside-inner, .pdp__info-inner')];
    if (!this.stickyColumns.length) return;

    this.syncStickyColumns();
    window.addEventListener('resize', () => this.syncStickyColumns(), { passive: true });
  }

  syncStickyColumns() {
    if (!this.stickyColumns?.length) return;

    const header = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--header-height'),
    ) || 0;
    const room = window.innerHeight - header;

    this.stickyColumns.forEach(col => {
      col.classList.toggle('is-unstuck', col.scrollHeight > room);
    });
  }

  setText(selector, value) {
    const el = this.querySelector(selector);
    if (el) el.textContent = value;
  }

  syncUrl(variantId) {
    if (!this.dataset.productUrl) return;

    const url = new URL(window.location.href);
    url.searchParams.set('variant', variantId);
    window.history.replaceState({}, '', url);
  }

  // ─── Quantity ──────────────────────────────────────────────────────────────

  initQuantity() {
    const input = this.querySelector('[data-pdp-qty-input]');
    if (!input) return;

    this.querySelectorAll('[data-pdp-qty]').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = btn.dataset.pdpQty === 'inc' ? 1 : -1;
        const next = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
        input.value = next;
      });
    });

    // Guard against manual entry of 0 or junk
    input.addEventListener('change', () => {
      const value = parseInt(input.value, 10);
      if (!Number.isFinite(value) || value < 1) input.value = 1;
    });
  }

  // ─── Media gallery ─────────────────────────────────────────────────────────

  initGallery() {
    this.track = this.querySelector('[data-pdp-track]');
    this.dots = [...this.querySelectorAll('[data-pdp-dot]')];
    this.counter = this.querySelector('[data-pdp-media-current]');
    if (!this.track) return;

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => this.scrollToMedia(dot.dataset.pdpDot));
    });

    if (this.dots.length) {
      this.track.addEventListener('scroll', () => this.queueGallerySync(), { passive: true });
    }
  }

  queueGallerySync() {
    if (this.gallerySyncQueued) return;
    this.gallerySyncQueued = true;

    requestAnimationFrame(() => {
      this.gallerySyncQueued = false;
      this.syncGallery();
    });
  }

  syncGallery() {
    // Only meaningful in the horizontal (mobile) layout
    if (this.track.scrollWidth <= this.track.clientWidth) return;

    const items = [...this.track.querySelectorAll('[data-pdp-media]')];
    const trackRect = this.track.getBoundingClientRect();
    const centre = trackRect.left + trackRect.width / 2;

    // Viewport rects rather than offsetLeft — the track is not a positioned
    // ancestor, so offsetLeft is not measured from the track's scroll origin.
    const index = items.findIndex(item => {
      const rect = item.getBoundingClientRect();
      return rect.left <= centre && rect.right > centre;
    });
    if (index < 0) return;

    this.dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    if (this.counter) this.counter.textContent = index + 1;
  }

  scrollToMedia(mediaId) {
    const target = this.querySelector(`[data-pdp-media="${mediaId}"]`);
    // `nearest` keeps the desktop stack from jumping when the image is already visible
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // ─── Sticky buy bar ────────────────────────────────────────────────────────

  initStickyBar() {
    this.sticky = this.querySelector('[data-pdp-sticky]');
    const anchor = this.querySelector('.pdp__buy');
    if (!this.sticky || !anchor || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show only once the buy block has scrolled up out of view, never before it
        const scrolledPast = entry.boundingClientRect.top < 0;
        this.sticky.hidden = entry.isIntersecting || !scrolledPast;
      },
      { threshold: 0 }
    );

    observer.observe(anchor);
  }

  // ─── Zoom ──────────────────────────────────────────────────────────────────

  initZoom() {
    this.dialog = this.querySelector('[data-pdp-zoom-dialog]');
    if (!this.dialog || typeof this.dialog.showModal !== 'function') return;

    this.querySelectorAll('[data-pdp-zoom]').forEach(trigger => {
      trigger.addEventListener('click', () => this.openZoom(trigger.dataset.pdpZoom));
    });

    this.querySelector('[data-pdp-zoom-close]')?.addEventListener('click', () => {
      this.dialog.close();
    });

    // Click the backdrop (the dialog itself, outside the image track) to close
    this.dialog.addEventListener('click', e => {
      if (e.target === this.dialog) this.dialog.close();
    });
  }

  openZoom(mediaId) {
    this.dialog.showModal();

    const target = this.dialog.querySelector(`[data-pdp-zoom-item="${mediaId}"]`);
    if (!target) return;

    // Wait for layout — the track has no scroll width until the dialog is open
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
    });
  }

  // ─── Add to cart ───────────────────────────────────────────────────────────

  async onSubmit(e) {
    if (!this.idInput?.value) return;

    e.preventDefault();

    const buttons = [this.submit, this.stickySubmit].filter(Boolean);
    const restore = this.submitText?.textContent;

    buttons.forEach(btn => { btn.disabled = true; });
    if (this.submitText) this.submitText.textContent = this.text.adding;

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.idInput.value,
          quantity: parseInt(this.querySelector('[data-pdp-qty-input]')?.value, 10) || 1,
        }),
      });

      if (!res.ok) throw new Error('add-to-cart failed');

      if (this.submitText) this.submitText.textContent = this.text.added;
      showCartPanel();
      refreshCartCount();
    } catch {
      if (this.submitText) this.submitText.textContent = this.text.error;
    } finally {
      setTimeout(() => {
        if (this.submitText) this.submitText.textContent = restore ?? this.text.add;
        buttons.forEach(btn => { btn.disabled = false; });
      }, 1800);
    }
  }
}

customElements.define('product-page', ProductPage);
