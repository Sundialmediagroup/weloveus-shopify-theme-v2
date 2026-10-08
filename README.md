# WeLoveUs theme (v2)

Shopify theme for [weloveus.shop](https://weloveus.shop). Sources live in
`frontend/` and are built by Vite into `assets/theme.js` and `assets/theme.css`.
Design rules and conventions are in [DESIGN.md](DESIGN.md).

## Running locally

```bash
npm install
npm start
```

`npm start` runs two things side by side:

- **Vite** rebuilds `assets/theme.js` and `assets/theme.css` whenever a file in
  `frontend/` is saved.
- **`shopify theme dev`** syncs the theme to the store and serves a preview,
  usually at <http://127.0.0.1:9292> (the terminal prints the exact link).

Log in to Shopify and pick the store if asked. `Ctrl+C` stops both.

| Command | Does |
|---|---|
| `npm run dev` | Rebuild on save, without the preview |
| `npm run theme:dev` | Preview, without rebuilding |
| `npm run build` | One-off build |
| `npm run theme:check` | Lint the Liquid |
| `npm run theme:push` | Build, commit, push to Shopify and to git |

`assets/theme.js` and `assets/theme.css` are build output but committed, since
Shopify serves them as-is. When a merge conflicts in either, don't pick a side:
resolve the sources, run `npm run build`, and commit the rebuilt files.

## Essie chat

Essie is the shopping chat docked at the bottom of the page
(`snippets/essie-chat.liquid`, `frontend/scripts/essie-chat.js`). It talks to
the WeLoveUs agent in **e360-api**. Its address is set in Theme settings →
Essie chat → **API base URL**.

| Where | API base URL | Requests go to |
|---|---|---|
| Local | `http://127.0.0.1:8765` (automatic on the local preview) | `{base}/api/v1/web/weloveus/visitors`, `/chat` |
| Live | `/apps/weloveus` | `weloveus.shop/apps/weloveus/visitors`, `/chat` |

On the live site the browser never calls e360-api directly. Shopify's **app
proxy** forwards `weloveus.shop/apps/weloveus/*` to e360-api and signs each
request, which is how the API knows it came from the store and who is signed
in. The unsigned local routes don't exist in production.

Two switches hide Essie: the **Show Ask Essie chat** theme setting, and the
shop metafield `custom.essie_enabled` (Settings → Custom data → Shop), which
overrides the setting when false.

### Going live

Do these in order. Until the e360 side is done, the live setting must stay
off or Essie shows its error state.

**e360-api**

1. Deploy a release containing the WeLoveUs agent (v1.0.123 or later) to
   production. Pushing a `v*.*.*` tag deploys it.
2. Add the production secrets to AWS Secrets Manager:
   - `WELOVEUS_ANTHROPIC_API_KEY`
   - `SHOPIFY_WELOVEUS_CLIENT_ID`
   - `SHOPIFY_WELOVEUS_CLIENT_SECRET`
   - `SHOPIFY_WELOVEUS_GRANTED_CUSTOMER_SCOPES=read_customers,read_orders,read_products`
     — only once the app has been granted those scopes; it turns on order
     history.
3. In the Shopify Dev Dashboard app, set up the app proxy and release a new
   app version:
   - Prefix: `apps`
   - Subpath: `weloveus`
   - Proxy URL: `https://<production API host>/api/v1/web/weloveus/proxy`
4. Open <https://weloveus.shop/apps/weloveus/stream-check>. It should answer
   (not 404) and stream rather than arrive in one piece; if Shopify buffers it,
   Essie's replies will appear all at once instead of typing out.

**Theme**

5. Make sure `essie-chat.js` builds proxy URLs when the base URL is a site
   path (`/apps/weloveus/chat`) and keeps the `/api/v1/web/weloveus` prefix
   for a full local URL.
6. API base URL defaults to `/apps/weloveus`, so live and preview themes need
   no setting. The local preview (`127.0.0.1:9292`) ignores it and always
   calls e360-api at `http://127.0.0.1:8765`.
7. Push the theme and test as a guest and signed in: a reply streams, products
   show, add to cart works, and signing in or out starts a fresh chat.

## Analytics

The theme sends its own feature events (Essie, quick add, Shop the story,
search, wishlist) to GA4 through a custom pixel, and records each order's
sources and holdout groups as cart attributes. Conventions are in DESIGN.md §10 (JavaScript → Analytics);
the pixel to paste into Shopify admin → Settings → Customer events is
`frontend/pixels/ga4-custom-pixel.js`. Holdout percentages are under Theme
settings → Analytics & experiments; leave them at 0% when no test is running.

### Daily and weekly reports

`npm run report` writes two reports: `reports/daily/<date>.md` (yesterday,
against the same day a week before) and `reports/weekly/<year>-W<week>.md`
(last Monday–Sunday, against the week before); `-- daily` or `-- weekly` runs
one. Each has users (new and returning), sessions, orders, revenue,
conversion rate and average order value, which page features lead to
purchases (over 7 days for the daily, 28 for the weekly), and Essie: her
activity, the journey from opening her to buying, and how often shoppers who
message her go on to buy. It reads GA4 with
Google application default credentials, or the service account key named by
`GOOGLE_APPLICATION_CREDENTIALS` (Viewer on the property is enough), which
can go in a git-ignored `.env`.
`reports/` is git-ignored: this repo is public, so don't commit reports.

On Dave's Mac they run on a schedule: the daily at 12:00 every day, the weekly
at 12:00 on Mondays, through launchd (`~/Library/LaunchAgents/com.weloveus.report-*.plist`,
calling `analytics/run-report.sh`). Each run posts a notification and logs to
`reports/logs/`. Noon gives GA4 time to finish processing the day before.
A run missed while the Mac was asleep happens when it wakes.
