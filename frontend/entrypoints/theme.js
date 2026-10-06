import '../styles/theme.scss'
// First, so its listeners and list observers are in place before any feature's.
import '../scripts/analytics.js'
import '../scripts/header.js'
import '../scripts/search.js'
import '../scripts/add-to-cart.js'
import '../scripts/cart.js'
import '../scripts/product-carousel.js'
import '../scripts/product-recommendations.js'
import '../scripts/product.js'
import '../scripts/account-modal.js'
import '../scripts/wishlist.js'
import '../scripts/main-collection.js'
import '../scripts/semantic-search.js'
import '../scripts/essie-chat.js'
import '../scripts/essie-dock.js'
import '../scripts/editorial-contents.js'

// Expose header height as a CSS custom property for layout calculations
function setHeaderHeight() {
  const header = document.getElementById('site-header')
  if (header) {
    document.documentElement.style.setProperty(
      '--header-height',
      `${header.offsetHeight}px`
    )
  }
}

// Mark JS as available for CSS hooks
document.documentElement.classList.replace('no-js', 'js')

document.addEventListener('DOMContentLoaded', () => {
  setHeaderHeight()
  window.addEventListener('resize', setHeaderHeight, { passive: true })
})
