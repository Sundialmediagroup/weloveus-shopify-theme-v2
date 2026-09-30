class ProductCarousel extends HTMLElement {
  connectedCallback() {
    this.track   = this.querySelector('.product-carousel__track');
    this.prevBtn = this.querySelector('.product-carousel__btn--prev');
    this.nextBtn = this.querySelector('.product-carousel__btn--next');
    if (!this.track) return;

    this.prevBtn?.addEventListener('click', () => this.step(-1));
    this.nextBtn?.addEventListener('click', () => this.step(1));
    this.track.addEventListener('scroll', () => this.sync(), { passive: true });
    this.sync();
  }

  step(dir) {
    const item = this.track.querySelector('.product-carousel__item');
    if (!item) return;
    const gap = parseFloat(getComputedStyle(this.track).gap) || 0;
    this.track.scrollBy({ left: dir * (item.offsetWidth + gap), behavior: 'smooth' });
  }

  sync() {
    const { scrollLeft, scrollWidth, clientWidth } = this.track;
    if (this.prevBtn) this.prevBtn.disabled = scrollLeft <= 0;
    if (this.nextBtn) this.nextBtn.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
  }
}

customElements.define('product-carousel', ProductCarousel);
