class PromoBanner extends HTMLElement {
  connectedCallback() {
    this.textEl = this.querySelector('.promo-banner__text');
    if (!this.textEl) return;
    this.fit();
    new ResizeObserver(() => this.fit()).observe(this);
  }

  fit() {
    const { textEl } = this;
    textEl.style.fontSize = '100px';
    const ratio = this.offsetWidth / textEl.scrollWidth;
    textEl.style.fontSize = `${Math.floor(100 * ratio)}px`;
  }
}

customElements.define('promo-banner', PromoBanner);
