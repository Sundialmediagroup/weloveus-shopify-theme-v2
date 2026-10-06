// Contents list — sections/main-page.liquid and sections/main-article.liquid.
//
// Lists the page's h2s in the aside so long pages (terms, delivery, long-form stories)
// can be scanned and jumped through. Built here rather than in Liquid because
// the headings live inside the merchant's rich text. Short pages keep the list
// hidden, and so does no JavaScript.

const MIN_HEADINGS = 3

const nav = document.querySelector('[data-page-contents]')
const content = document.querySelector('[data-page-content]')

const slugify = text =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

if (nav && content) {
  const headings = [...content.querySelectorAll('h2')].filter(h => h.textContent.trim())
  const list = nav.querySelector('[data-page-contents-list]')

  if (list && headings.length >= MIN_HEADINGS) {
    const links = new Map()

    headings.forEach((heading, i) => {
      // Rich text rarely carries ids; give each heading a stable, unique one.
      if (!heading.id) {
        const base = slugify(heading.textContent) || `section-${i + 1}`
        let id = base
        for (let n = 2; document.getElementById(id); n++) id = `${base}-${n}`
        heading.id = id
      }

      const item = document.createElement('li')
      const link = document.createElement('a')
      link.className = 'editorial__contents-link'
      link.dataset.trackContent = 'contents_link'
      link.href = `#${heading.id}`
      link.textContent = heading.textContent.trim()
      item.append(link)
      list.append(item)
      links.set(heading, link)
    })

    nav.hidden = false

    // Marks the section being read: the last heading to cross a band near the
    // top of the viewport.
    const setCurrent = heading => {
      links.forEach((link, h) => {
        if (h === heading) link.setAttribute('aria-current', 'true')
        else link.removeAttribute('aria-current')
      })
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) setCurrent(entry.target)
        })
      },
      { rootMargin: '0px 0px -70% 0px' }
    )

    headings.forEach(h => observer.observe(h))
  }
}
