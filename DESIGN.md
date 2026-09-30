# DESIGN.md

Design and code standards for **WeLoveUs-v2**. Read this before building a new
section, snippet, or component so the theme stays internally consistent.

The system is intentionally small: **tokens define the look, primitives define
the layout, sections compose them.** If you find yourself writing a raw value,
it usually belongs in a token.

---

## 1. Architecture at a glance

```
frontend/
  entrypoints/theme.js      # Single Vite entry — imports theme.scss + every script
  scripts/*.js              # Vanilla ES modules, one per feature
  styles/
    abstracts/
      _variables.scss       # Compile-time only: the $breakpoints map
      _mixins.scss          # respond-to, respond-below, container, truncate, …
    _tokens.scss            # ALL design tokens, as CSS custom properties on :root
    _reset.scss             # Modern reset + element defaults
    _typography.scss        # Heading scale, body copy, .rte, a11y utilities
    _layout.scss            # .container .section .grid .stack .cluster
    _components.scss        # .btn .input .badge primitives
    _<section-name>.scss    # One partial per section/component
    theme.scss              # @use manifest — order matters
sections/                   # Liquid + {% schema %}, no styles
snippets/                   # Reusable partials with a documented contract
layout/theme.liquid         # Head, skip link, header/main/footer
```

Build: Vite 5 + `vite-plugin-shopify` compiles `theme.js` → `assets/`.
`snippets/vite-tag.liquid` is **generated** — never hand-edit it.

---

## 2. Non-negotiables

1. **No hardcoded design values.** Colors, spacing, type sizes, radii, shadows,
   z-index, easing and durations all come from `_tokens.scss`. If a value isn't
   in there and it's reusable, add a token first.
2. **`@use` / `@forward` only.** Never `@import` — it's deprecated in dart-sass.
3. **Tokens are CSS custom properties, not Sass variables.** Sass variables exist
   only for things that must resolve at compile time (currently just
   `$breakpoints`).
4. **Semantic tokens in components, primitives only in `_tokens.scss`.**
   Use `var(--color-fg-muted)`, not `var(--color-neutral-500)`.
5. **Mobile-first.** Write the small-screen rule, then layer `@include
   respond-to('lg')`. Reach for `respond-below()` only to undo something.
6. **One stylesheet per section**, named to match the Liquid file
   (`sections/promo-banner.liquid` → `frontend/styles/_promo-banner.scss`), and
   registered in `theme.scss`. Do not add `<style>` blocks to sections.
   (`_components.scss` has a stale comment claiming otherwise — ignore it.)

---

## 3. Tokens

Full list in `frontend/styles/_tokens.scss`. The scales:

| Group | Tokens | Notes |
|---|---|---|
| Color primitives | `--color-neutral-0` … `-950` | Never used directly in components |
| Brand palette | `--color-brand-teal/red/plum/cream/sand/green` | Primitives from the brand guidelines — map a semantic token, don't use directly |
| Surfaces | `--color-bg`, `--color-bg-nav`, `--color-bg-header` (cream), `--color-bg-feature` (sand), `--color-bg-highlight` (green), `--color-bg-inverted` (black), `--color-bg-footer`, `--color-bg-subtle`, `--color-bg-raised` | `--color-bg` is white (`--color-neutral-0`) |
| Text | `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-fg-inverted`, `--color-fg-highlight` (cream, for emphasis on `--color-bg-highlight`) | |
| Borders | `--color-border`, `--color-border-strong` | |
| Brand | `--color-accent*` (near-black), `--color-secondary*` (`#630056` plum) | Each has `-fg` and `-hover` |
| Feedback | `--color-success/error/warning/info` + `-bg` | |
| Spacing | `--space-1` … `--space-48` | 4px base unit; suffix = unit count |
| Type size | `--text-xs` … `--text-7xl` | |
| Leading | `--leading-none` … `--leading-loose` | |
| Tracking | `--tracking-tighter` … `--tracking-widest` | |
| Weight | `--weight-thin` … `--weight-black` | |
| Radius | `--radius-none` … `--radius-full` | Buttons/badges use `--radius-full` |
| Shadow | `--shadow-xs` … `--shadow-2xl`, `--shadow-inner` | |
| Z-index | `--z-below` … `--z-toast` | **Only** source of stacking values |
| Motion | `--ease-*`, `--duration-*`, `--transition-fast/base/slow` | |
| Layout | `--page-width`, `--page-gutter`, `--site-frame`, `--grid-cols`, `--grid-gap` (= `--site-frame`: every carousel and card grid), `--header-height` | |

**Spacing rhythm.** Section padding is `--space-16` mobile / `--space-24` at `lg`
(`.section`). Page sections inside `#main-content` additionally get
`padding-bottom: --space-6` → `--space-12` at `lg`. Prefer `--space-3`/`4`/`6`
for component internals.

**Two runtime tokens** are populated outside Sass:
- `--page-width` — overwritten server-side by `snippets/css-variables.liquid`
  from `settings.page_width`.
- `--header-height` — set by `theme.js` after first paint and on resize. Use it
  for sticky offsets and full-height calculations; never measure the header again
  in your own script.

**Adding a token:** put it in the right `─── Group ───` block, keep the aligned
comment style, and add a `// px` comment for rem values.

---

## 4. Layout primitives

Compose these before writing new layout CSS.

| Class | Behavior |
|---|---|
| `.container` | `max-width: var(--page-width)`, centered, `--page-gutter` inline padding |
| `.section` | Vertical section padding (responsive) |
| `.grid` | 12-column CSS grid, `--grid-gap` |
| `.stack` | Flex column; override gap with `--stack-gap` |
| `.cluster` | Wrapping flex row, centered; override gap with `--cluster-gap` |
| `.overlay` | Fixed full-bleed scrim at `--z-overlay` |

`body` carries `padding: var(--site-frame)` (12px on phones, 20px from `md`) — the whole site sits in a small
inset frame. `#main-content`'s top padding (the gap under the full-bleed header) is
also `--site-frame`, so changing the token moves every edge together. The header and
footer break out of the frame with negative `--site-frame` margins and run full-bleed. Account for it before adding full-bleed elements; sections that must
span edge-to-edge use `padding-inline: var(--site-frame)` on their own container
instead (see `_promo-banner.scss`).

Mixins available from `abstracts/mixins`:
`respond-to($bp)`, `respond-below($bp)`, `container`, `visually-hidden`,
`truncate`, `line-clamp($lines)`, `fluid-type($min, $max, $min-vw, $max-vw)`.

Breakpoints: `sm 640` · `md 768` · `lg 990` · `xl 1200` · `2xl 1440`.
`lg` is the main desktop switch.

---

## 5. Naming — BEM

```scss
.product-card { }              // block
.product-card__media { }       // element
.product-card__title { }       // element
.btn--primary { }              // modifier
.site-header--mega-open { }    // stateful modifier (toggled by JS)
.is-scrolled { }               // transient state, JS-toggled
```

- Block name matches the section/snippet filename.
- Elements are flat — `__mega-inner`, not `__mega__inner`.
- `--modifier` for variants and component-owned state; bare `is-*` for transient
  runtime state.
- Keep selectors one class deep. No nesting for specificity, no element selectors
  outside `_reset.scss` / `_typography.scss`.

---

## 6. Per-instance variation: local custom properties

This is the theme's signature pattern. When a section setting or snippet argument
needs to change a style, **pass it as a scoped custom property** and let the
stylesheet consume it with a token fallback. Never write full inline styles.

```liquid
<div class="promo-banner" style="--banner-bg: {{ bg }}; --banner-color: {{ color }};">
```
```scss
.promo-banner {
  background-color: var(--banner-bg, var(--color-fg));
  color: var(--banner-color, var(--color-bg));
}
```

Existing examples: `--banner-bg`, `--banner-color`, `--card-ratio`,
`--stack-gap`, `--cluster-gap`. The fallback is required — the component must
render correctly with no setting.

---

## 7. Typography

Headings are styled at the **element level** in `_typography.scss`; don't
re-declare `font-size` on an `h2` unless the design genuinely diverges. Weight
defaults to `--weight-regular` (Söhne 400) with tight leading and tracking.

| Element | Mobile | ≥ lg |
|---|---|---|
| `h1` | `--text-5xl` | `--text-7xl` |
| `h2` | `--text-3xl` | `--text-4xl` |
| `h3` | `--text-2xl` | `--text-3xl` |
| `h4` | `--text-xl` | — |
| `h5` | `--text-lg` | — |
| `h6` | `--text-base`, uppercase | — |

- `p` is capped at `68ch` for readability; consecutive paragraphs get
  `--space-4` of top margin.
- Wrap any Shopify rich-text output in `.rte` — it supplies flow spacing,
  list styling, blockquotes, underlined links and `hr` rules. Bare `ul`/`ol` are
  unstyled by the reset on purpose.
- Fonts load from `snippets/fonts.liquid` (self-hosted Söhne woff2, 400/700,
  `font-display: swap`). Use `--font-heading` / `--font-body`, never the family
  name.
- For display type that must scale continuously, use `fluid-type()` or an
  explicit `clamp()` (as `.promo-banner__text` does).

---

## 8. Components

`_components.scss` holds only genuinely global primitives:

- `.btn` + `.btn--primary` / `--secondary` / `--ghost` / `--sm` / `--lg`.
  Uppercase, `--tracking-wider`, pill radius. Handles `:disabled` **and**
  `[aria-disabled="true"]`.
- `.input` — full-width, `--radius-sm`, visible `:focus-visible` ring.
- `.badge` — pill, uppercase, `--text-xs`.

Extend a primitive with a new modifier rather than building a parallel button.
Anything that isn't reused across at least two sections belongs in that section's
own partial.

---

## 9. Liquid conventions

**Sections** — settings resolved in one `{%- liquid -%}` block at the top,
markup next, `{% schema %}` last. Always give the schema a `"tag": "section"`
and a `presets` entry so it's placeable in the editor.

**Snippets** — open with a contract comment:

```liquid
{%- comment -%}
  Renders a product card.

  Accepts:
  - product:      {Object}  Shopify product object (required)
  - lazy:         {Boolean} Lazy-load the image. Default: true
  - image_ratio:  {String}  CSS aspect-ratio value. Default: '1 / 1'
{%- endcomment -%}
```

Then normalize every optional argument with `| default:` before use, so the
snippet is safe to `render` with only its required inputs.

Other rules:
- Whitespace-control tags (`{%-`, `-%}`) everywhere.
- `| escape` on anything interpolated into an attribute; `| money` for prices;
  `| t` for all user-facing copy (11 locales live in `locales/`).
- Explain non-obvious commerce logic in a `{%- comment -%}`, the way
  `product-card.liquid` justifies restricting quick-add to single-variant
  products.

**Images** — always through `image_url` + `image_tag` with `widths`, `loading`,
and explicit `width`/`height` (prevents CLS). Provide a `placeholder_svg_tag`
fallback when the image may be blank:

```liquid
{{ card_image | image_url: width: 1000 | image_tag:
   class: 'product-card__image', alt: image_alt,
   loading: loading_attr, widths: '400, 600, 800, 1000',
   width: card_image.width, height: card_image.height }}
```

---

## 10. JavaScript

Vanilla ES modules. No framework, no bundled runtime beyond Vite.

- One file per feature in `frontend/scripts/`, imported from
  `entrypoints/theme.js`. Cross-script helpers are named exports
  (`cart-feedback.js` → `showCartPanel`, `refreshCartCount`).
- **Guard, don't assume.** Query, check, then bind — every script must be inert
  on templates where its markup is absent:
  ```js
  const header = document.querySelector('.site-header');
  if (!header) return;
  ```
- **Delegate** for anything rendered many times or injected later — bind once on
  `document` and use `closest('[data-*]')`, as `add-to-cart.js` does.
- Hooks: `data-*` attributes for JS targets, classes for styling. Don't bind to a
  BEM class if a data attribute will do.
- `{ passive: true }` on `scroll` / `resize` listeners.
- Express state as a class toggle and let CSS animate it; never write transition
  values from JS.
- Cart writes go to Shopify's AJAX API (`/cart/add.js`, `/cart/change.js`) inside
  `try`/`catch`, with the trigger showing pending → result → restored label.
- `theme.js` swaps `html.no-js` → `html.js`, so `.no-js` selectors are a valid
  progressive-enhancement hook.

---

## 11. Accessibility

Treated as part of the definition of done, not a pass afterwards.

- Keep ARIA in lockstep with visual state. Opening the mega-menu sets
  `aria-expanded="true"` on the trigger and `aria-hidden="false"` on the panel;
  closing reverses both.
- Every dismissible overlay closes on `Escape`.
- Focus is invisible for pointer input and clearly visible for keyboard:
  `:focus { outline: none }` + a 2px `:focus-visible` ring. Never remove the
  `:focus-visible` outline.
- Icon-only controls need `aria-label`; decorative counters and glyphs get
  `aria-hidden="true"`.
- Use `.visually-hidden` (or the mixin) for screen-reader-only text — not
  `display: none`.
- Live regions (`aria-live="polite"`) for async feedback such as the cart panel.
- `layout/theme.liquid` provides the skip link and `<main id="main-content"
  tabindex="-1">`; keep landmark roles on new top-level regions.
- RTL is supported for `ar`/`he` via `dir` on `<html>` — use logical properties
  (`padding-inline`, `margin-inline`, `inset`) rather than `left`/`right`.

**Motion.** `prefers-reduced-motion` is handled once, globally, by zeroing the
`--duration-*` tokens. That only works if your transitions use
`var(--transition-*)` or `var(--duration-*)`. A hardcoded `0.3s` opts your
component out of the accessibility guarantee.

---

## 12. Adding a new section — checklist

1. `sections/my-thing.liquid` — liquid block, markup, `{% schema %}` with
   `tag: "section"` + `presets`.
2. `frontend/styles/_my-thing.scss` — BEM under a `.my-thing` block, tokens only.
3. Register it in `theme.scss` (after `components`, grouped with the other
   sections).
4. Settings that affect style → scoped custom properties with token fallbacks.
5. Behavior → `frontend/scripts/my-thing.js`, imported in `theme.js`, guarded.
6. Copy through `| t` with keys added to every file in `locales/`.
7. Check keyboard path, focus ring, ARIA state, and RTL.
8. `npm run theme:check`, then verify at both `sm` and `lg`.

---

## 13. Known drift

Real inconsistencies in the tree — fix these when you're next in the area rather
than copying them:

- `/Users/davidpullen/Sites/weloveus/CLAUDE.md` documents **v1** (Release Theme,
  "no local build step", `base.css`, `--spacing-*`, Bodoni/Poppins). None of it
  applies to v2.
- `_components.scss` claims sections ship styles in `<style>` blocks. They don't
  — one partial per section is the rule.
- `sections/main-content.liquid` and `sections/main-404.liquid` do still carry
  inline `<style>` blocks; they should move into partials.
- `snippets/css-variables.liquid` computes `font_heading_bold` and
  `font_body_bold` but never emits them, and injects no font variables at all —
  families come from `_tokens.scss` and `snippets/fonts.liquid`. The Shopify
  font-picker bridge is unfinished.
- `--page-width` defaults to `100%` and `--page-gutter` to `0px` in tokens, so
  `.container` is a no-op until `settings.page_width` overrides it server-side.
