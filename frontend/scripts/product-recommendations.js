// Fetches product recommendations when the section approaches the viewport.
// Shopify only exposes `recommendations.products` to a Section Rendering API
// request, so the section ships empty and swaps itself in here.

class ProductRecommendations extends HTMLElement {
  connectedCallback() {
    if (!this.dataset.url) return;

    if (!('IntersectionObserver' in window)) {
      this.load();
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        if (!entries[0].isIntersecting) return;
        obs.unobserve(this);
        this.load();
      },
      { rootMargin: '0px 0px 400px 0px' }
    );

    observer.observe(this);
  }

  async load() {
    try {
      const res = await fetch(this.dataset.url);
      if (!res.ok) return;

      const html = new DOMParser().parseFromString(await res.text(), 'text/html');
      const incoming = html.querySelector('product-recommendations');

      // Leave the section empty unless a carousel actually came back. Not an
      // innerHTML check: Shopify injects a product-attribution <script> into
      // the response, so a response whose every product was filtered out by
      // the carousel's exclusions still reads as non-empty.
      if (!incoming?.querySelector('product-carousel')) return;

      this.innerHTML = incoming.innerHTML;
    } catch {
      // Recommendations are supplementary; failing quietly is correct here
    }
  }
}

customElements.define('product-recommendations', ProductRecommendations);
