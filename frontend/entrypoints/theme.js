import '../styles/theme.scss'
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
