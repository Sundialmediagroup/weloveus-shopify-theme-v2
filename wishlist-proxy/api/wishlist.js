// App proxy endpoint behind https://<store>/apps/wishlist.
//
// Shopify forwards the storefront request here with a signed query string that
// includes `logged_in_customer_id`. The signature is the only thing that makes
// the customer ID trustworthy. The request body is not signed, so it only ever
// says *what* to do; *whose* wishlist it is comes from the signed ID alone.
//
//   GET  → { ids: [...] }
//   POST { action: 'add' | 'remove', product_id } → { ids: [...] }
//
// Storage: the `custom.wishlist` customer metafield, list.product_reference,
// newest first. The theme reads the same metafield in Liquid.

import crypto from 'node:crypto';

const {
  SHOPIFY_SHOP,            // e.g. weloveus.myshopify.com
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,   // also the key Shopify signs proxy requests with
  SHOPIFY_ADMIN_TOKEN,     // optional: a static Admin API token, skips client credentials
  SHOPIFY_API_VERSION = '2026-07',
} = process.env;

const NAMESPACE = 'custom';
const KEY = 'wishlist';
const MAX_ITEMS = 100;
const MAX_SIGNATURE_AGE = 5 * 60; // seconds

// ─── Signature ─────────────────────────────────────────────────────────────────

// https://shopify.dev/docs/apps/build/online-store/display-dynamic-data#calculate-a-digital-signature
function verifySignature(searchParams) {
  const signature = searchParams.get('signature');
  if (!signature) return false;

  const grouped = {};
  for (const [key, value] of searchParams) {
    if (key === 'signature') continue;
    (grouped[key] ||= []).push(value);
  }

  const message = Object.keys(grouped)
    .map(key => `${key}=${grouped[key].join(',')}`)
    .sort()
    .join('');

  const expected = crypto
    .createHmac('sha256', SHOPIFY_CLIENT_SECRET)
    .update(message)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  const age = Math.abs(Date.now() / 1000 - Number(searchParams.get('timestamp')));
  return age <= MAX_SIGNATURE_AGE;
}

// ─── Admin API ─────────────────────────────────────────────────────────────────

let cachedToken = null; // { value, expiresAt }

// Dev Dashboard apps installed on a store the app's organisation owns can use
// the client credentials grant; the token lasts 24h, so it is cached per
// instance and refreshed a minute early.
async function accessToken() {
  if (SHOPIFY_ADMIN_TOKEN) return SHOPIFY_ADMIN_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const res = await fetch(`https://${SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

async function admin(query, variables) {
  const res = await fetch(`https://${SHOPIFY_SHOP}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': await accessToken(),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Admin API error: ${res.status} ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

const productGid = id => `gid://shopify/Product/${id}`;
const numericId = gid => gid.split('/').pop();

async function readWishlist(customerGid) {
  const data = await admin(
    `query ($id: ID!) {
      customer(id: $id) {
        metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value }
      }
    }`,
    { id: customerGid },
  );
  const value = data.customer?.metafield?.value;
  return value ? JSON.parse(value) : [];
}

// Drops products that no longer exist. A list reference metafield rejects the
// whole write if any entry is dangling, so one deleted product would otherwise
// lock the customer out of changing their wishlist at all.
async function existingOnly(gids) {
  if (gids.length === 0) return gids;
  const data = await admin(
    `query ($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id } } }`,
    { ids: gids },
  );
  const live = new Set(data.nodes.filter(Boolean).map(n => n.id));
  return gids.filter(gid => live.has(gid));
}

async function writeWishlist(customerGid, gids) {
  if (gids.length === 0) {
    const data = await admin(
      `mutation ($m: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $m) { userErrors { field message } }
      }`,
      { m: [{ ownerId: customerGid, namespace: NAMESPACE, key: KEY }] },
    );
    assertNoUserErrors(data.metafieldsDelete.userErrors);
    return;
  }

  const data = await admin(
    `mutation ($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) { userErrors { field message code } }
    }`,
    {
      m: [{
        ownerId: customerGid,
        namespace: NAMESPACE,
        key: KEY,
        type: 'list.product_reference',
        value: JSON.stringify(gids),
      }],
    },
  );
  assertNoUserErrors(data.metafieldsSet.userErrors);
}

function assertNoUserErrors(errors) {
  if (errors?.length) throw new Error(`Metafield write rejected: ${JSON.stringify(errors)}`);
}

// ─── Handler ───────────────────────────────────────────────────────────────────

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, 'https://proxy.local');

  if (!verifySignature(searchParams)) return send(res, 401, { error: 'invalid_signature' });
  if (searchParams.get('shop') !== SHOPIFY_SHOP) return send(res, 403, { error: 'wrong_shop' });

  const customerId = searchParams.get('logged_in_customer_id');
  if (!customerId) return send(res, 401, { error: 'not_logged_in' });

  const customerGid = `gid://shopify/Customer/${customerId}`;

  try {
    let gids = await readWishlist(customerGid);

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { action } = body;
      const productId = String(body.product_id ?? '');

      if (!/^\d+$/.test(productId) || !['add', 'remove'].includes(action)) {
        return send(res, 400, { error: 'bad_request' });
      }

      const gid = productGid(productId);
      const without = gids.filter(g => g !== gid);

      if (action === 'add') {
        if (without.length >= MAX_ITEMS) return send(res, 422, { error: 'wishlist_full', max: MAX_ITEMS });
        gids = await existingOnly([gid, ...without]);
      } else {
        gids = await existingOnly(without);
      }

      await writeWishlist(customerGid, gids);
    } else if (req.method !== 'GET') {
      return send(res, 405, { error: 'method_not_allowed' });
    }

    return send(res, 200, { ids: gids.map(numericId) });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'server_error' });
  }
}
