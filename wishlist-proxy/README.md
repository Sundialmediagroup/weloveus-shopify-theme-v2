# Wishlist proxy

A private Shopify app proxy that saves customer wishlists to the
`custom.wishlist` customer metafield, so they follow the customer across
browsers and devices. The theme reads the metafield directly in Liquid; this
function only handles writes.

```
storefront  ──POST /apps/wishlist──▶  Shopify (adds signed logged_in_customer_id)
                                          │
                                          ▼
                                 Vercel: api/wishlist.js ──▶ Admin API metafieldsSet
```

## One-time setup

1. **Metafield definition.** Shopify admin → Settings → Custom data → Customers →
   Add definition. Name: `Wishlist`, namespace and key: `custom.wishlist`,
   type: **Product → List of products**.

2. **Wishlist page.** Online Store → Pages → Add page. Title: `Your wishlist`,
   handle: `wishlist`, template: `page.wishlist`.

3. **App.** Create an app in the Shopify Dev Dashboard, owned by the same
   organisation as the store. Copy its client ID into `shopify.app.toml`.

4. **Deploy the function.** From this folder, run `vercel deploy --prod` and set these env vars
   (see `.env.example`): `SHOPIFY_SHOP`, `SHOPIFY_CLIENT_ID`,
   `SHOPIFY_CLIENT_SECRET`.

5. **Point the app at it.** Replace the `REPLACE_ME` URLs in `shopify.app.toml`
   with the Vercel domain, then `shopify app deploy` and install the app on the
   store. Scopes: `read_customers`, `write_customers`, `read_products`.

6. **Protected customer data.** If Admin API calls on `customer` come back with an
   access-denied error, turn on protected customer data access for the app
   (reason: app functionality) in its settings.

## Check it

Log in on the storefront and open `/apps/wishlist`. It should return
`{"ids":[...]}`. A `401 invalid_signature` means `SHOPIFY_CLIENT_SECRET` doesn't
match the app.
