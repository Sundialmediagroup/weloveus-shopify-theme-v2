// Ask Essie — snippets/essie-chat.liquid.
//
// Talks to the e360 API at `apiBase` (Theme settings → Essie chat):
//   POST /visitors → a visitor token, kept in localStorage
//   POST /chat     → a Server-Sent Events stream, read with fetch() because
//                    EventSource can't POST
//
// Replies arrive as parts (text, reasoning, tool_call, tool_result). Text is
// rendered as light markdown; tool results become widgets — chips, product
// cards, cart summary, checkout button. Every value from the API reaches the
// DOM through textContent or a checked URL, never innerHTML, except text parts,
// which are HTML-escaped before the markdown pass.
//
// The transcript is saved to localStorage so the chat survives page changes.

const root = document.querySelector('[data-essie]');
const configEl = document.getElementById('essie-config');
const config = configEl ? decodeStrings(JSON.parse(configEl.textContent)) : null;

// Liquid's `t` filter HTML-escapes translations ("I'm" → "I&#39;m"), but these
// strings reach the DOM as text, so turn the entities back into characters.
// DOMParser documents are inert — nothing in them runs or loads.
function decodeStrings(value) {
  if (typeof value === 'string') {
    return value.includes('&')
      ? new DOMParser().parseFromString(value, 'text/html').documentElement.textContent
      : value;
  }
  if (Array.isArray(value)) return value.map(decodeStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeStrings(v)]));
  }
  return value;
}

const KEYS = {
  token: 'essie.visitorToken',
  conversation: 'essie.conversationId',
  transcript: 'essie.transcript',
  shopper: 'essie.shopper',
};
const MAX_SAVED_MESSAGES = 60;
const PROMPTS_DISMISSED = 'essie.promptsDismissed'; // sessionStorage
const PROMPTS_DELAY = 1500;
const brandsKey = id => `essie.brands.${id}`;

// ─── Storage ───────────────────────────────────────────────────────────────────

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode or storage full — chat still works for this page */ }
}

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function loadTranscript() {
  try { return JSON.parse(load(KEYS.transcript)) || []; } catch { return []; }
}

// Brand directory for one conversation: lower-cased name → url.
function loadBrands(id) {
  if (!id) return new Map();
  try { return new Map(Object.entries(JSON.parse(load(brandsKey(id))) || {})); } catch { return new Map(); }
}

function saveBrands(id, brands) {
  store(brandsKey(id), brands.size ? JSON.stringify(Object.fromEntries(brands)) : null);
}

// A chat belongs to whoever was signed in when it started. When that changes
// on this browser — sign in, sign out, another account — drop the saved chat
// before it is shown, rather than wait for the API's 409 on the next message.
// A saved chat with no recorded shopper predates this check, so it goes too.
function forgetPreviousShopper() {
  const shopper = config.customerId ? `customer:${config.customerId}` : 'guest';
  const previous = load(KEYS.shopper);

  if (previous !== shopper && (previous !== null || load(KEYS.conversation) || load(KEYS.transcript))) {
    const id = load(KEYS.conversation);
    if (id) store(brandsKey(id), null);
    store(KEYS.conversation, null);
    store(KEYS.transcript, null);
  }

  store(KEYS.shopper, shopper);
}

// ─── API ───────────────────────────────────────────────────────────────────────

const apiBase = (config?.apiBase || '').replace(/\/+$/, '');
const api = path => `${apiBase}/api/v1/web/weloveus${path}`;

let tokenRequest = null;

// One in-flight request at most, so opening and sending together don't mint two.
function visitorToken() {
  const saved = load(KEYS.token);
  if (saved) return Promise.resolve(saved);

  tokenRequest ||= fetch(api('/visitors'), { method: 'POST', headers: { Accept: 'application/json' } })
    .then(res => {
      if (!res.ok) throw new Error(`visitors ${res.status}`);
      return res.json();
    })
    .then(({ visitor_token }) => {
      if (!visitor_token) throw new Error('visitors: no token');
      store(KEYS.token, visitor_token);
      return visitor_token;
    })
    .finally(() => { tokenRequest = null; });

  return tokenRequest;
}

// randomUUID() needs a secure context; fall back to the same v4 layout.
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

function conversationId() {
  let id = load(KEYS.conversation);
  if (!id) {
    id = uuid();
    store(KEYS.conversation, id);
  }
  return id;
}

// POSTs a message; on 401 re-issues the token, on 403/404 starts a new
// conversation — each retried once. A 409 `conversation_identity_changed`
// means the shopper signed in, out or as someone else since this chat began:
// the API won't continue it, and what's on screen may be the previous
// shopper's (orders included), so `onShopperChanged` wipes the transcript
// before the message goes out again on a new conversation.
async function postMessage(text, retried = {}, onShopperChanged = () => {}) {
  const body = { conversation_id: conversationId(), message: text };
  if (config.customerId) body.customer_id = config.customerId;

  const res = await fetch(api('/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Visitor-Token': await visitorToken(),
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401 && !retried.token) {
    store(KEYS.token, null);
    return postMessage(text, { ...retried, token: true }, onShopperChanged);
  }
  if ((res.status === 403 || res.status === 404) && !retried.conversation) {
    // Same chat on screen, new id on the server — the brands carry over.
    const brands = loadBrands(body.conversation_id);
    store(brandsKey(body.conversation_id), null);
    store(KEYS.conversation, null);
    saveBrands(conversationId(), brands);
    return postMessage(text, { ...retried, conversation: true }, onShopperChanged);
  }
  if (res.status === 409 && !retried.shopper) {
    const { error } = await res.json().catch(() => ({}));
    if (error === 'conversation_identity_changed') {
      // Unlike 403/404, nothing carries over — not even the brands.
      store(brandsKey(body.conversation_id), null);
      store(KEYS.conversation, null);
      onShopperChanged();
      return postMessage(text, { ...retried, shopper: true }, onShopperChanged);
    }
  }
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
  return res;
}

// Yields each `data:` frame of an SSE stream as parsed JSON.
async function* readEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = done ? '' : frames.pop();

      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (!data) continue;
        try { yield JSON.parse(data); } catch { /* skip a malformed frame */ }
      }
      if (done) return;
    }
  } finally {
    // Stopping early (on `done` or an error) releases the connection.
    reader.cancel().catch(() => {});
  }
}

// ─── Rendering helpers ─────────────────────────────────────────────────────────

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Only http(s) and same-site links/images get through.
function safeUrl(value) {
  const raw = typeof value === 'string' ? value : value?.url || value?.src;
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function money(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.amount != null) {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || undefined, {
        style: 'currency',
        currency: value.currency_code || value.currencyCode,
      }).format(Number(value.amount));
    } catch {
      return String(value.amount);
    }
  }
  return String(value);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Bold, italics and line breaks — on already-escaped text, so the only tags in
// the output are the ones added here.
function renderMarkdown(text) {
  return escapeHtml(text.trim())
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');
}

function textPart(text) {
  const bubble = el('div', 'essie__bubble');
  bubble.innerHTML = renderMarkdown(text);
  return bubble;
}

// Adds every brand a tool result names to `brands`. Returns true if any were new.
function collectBrands(data, brands) {
  if (!data || typeof data !== 'object') return false;
  let added = false;
  const add = (name, url) => {
    const href = safeUrl(url);
    const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!href || key.length < 2 || brands.get(key) === href) return;
    brands.set(key, href);
    added = true;
  };

  if (Array.isArray(data.items)) data.items.forEach(i => add(i?.metadata?.vendor, i?.metadata?.brand_url));
  if (Array.isArray(data.brands)) data.brands.forEach(b => add(b?.brand, b?.url));
  add(data.brand, data.brand_url);
  return added;
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Links the first mention of each known brand in `container`, walking text
// nodes so markup is never rewritten — a brand inside <strong> becomes a bold
// link. Whole words only, case-insensitive, longest names first.
function linkBrands(container, brands) {
  if (!brands.size) return;
  const names = [...brands.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  const linked = new Set();

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.parentElement.closest('a, code, pre, button')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let last = 0;

    for (const match of text.matchAll(pattern)) {
      const key = match[0].toLowerCase();
      if (linked.has(key) || !brands.has(key)) continue;
      linked.add(key);
      fragment.append(text.slice(last, match.index));
      const link = el('a', 'essie__brand-link', match[0]);
      link.href = brands.get(key);
      fragment.append(link);
      last = match.index + match[0].length;
    }

    if (last === 0) return;
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  });
}

function chips(replies) {
  const row = el('div', 'essie__chips');
  replies.slice(0, 3).forEach(reply => {
    const label = typeof reply === 'string' ? reply : reply?.label || reply?.text;
    if (!label) return;
    const chip = el('button', 'essie__chip', label);
    chip.type = 'button';
    chip.dataset.essieReply = label;
    row.append(chip);
  });
  return row.childElementCount ? row : null;
}

function productCards(items) {
  const row = el('div', 'essie__cards');
  items.forEach(item => {
    const href = safeUrl(item.deeplink);
    const card = el(href ? 'a' : 'div', 'essie__card');
    if (href) card.href = href;

    const src = safeUrl(item.image);
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      card.append(img);
    }
    if (item.metadata?.available === false) card.append(el('span', 'essie__badge', config.textSoldOut));

    const body = el('div', 'essie__card-body');
    if (item.metadata?.vendor) body.append(el('span', 'essie__card-vendor', item.metadata.vendor));
    body.append(el('span', 'essie__card-title', item.title || ''));
    if (item.subtitle) body.append(el('span', 'essie__card-price', item.subtitle));
    card.append(body);
    row.append(card);
  });
  return row;
}

function cartSummary(cart) {
  const box = el('div', 'essie__cart');
  const lines = cart?.lines || cart?.items || [];
  if (!lines.length) {
    box.append(el('p', 'essie__cart-meta', config.textCartEmpty));
    return box;
  }

  lines.forEach(line => {
    const row = el('div', 'essie__cart-line');
    const src = safeUrl(line.image);
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      row.append(img);
    } else {
      row.append(el('span'));
    }

    const info = el('div');
    info.append(el('div', null, line.title || ''));
    const meta = [line.variant, `${config.textQuantity} ${line.quantity ?? 1}`].filter(Boolean).join(' · ');
    info.append(el('div', 'essie__cart-meta', meta));
    row.append(info, el('span', null, money(line.line_total)));
    box.append(row);
  });

  const total = el('div', 'essie__cart-total');
  total.append(el('span', null, config.textSubtotal), el('span', null, money(cart.subtotal)));
  box.append(total);
  return box;
}

// Tool result payload → widget, or null. Order matters; `data.note` is for
// the model and is never shown.
function toolResult(data) {
  if (!data || typeof data !== 'object') return null;

  switch (data.type) {
    case 'quick_replies':
      return Array.isArray(data.replies) ? chips(data.replies) : null;
    case 'checkout': {
      const href = safeUrl(data.url);
      if (!href) return null;
      const link = el('a', 'essie__checkout', data.label || 'Checkout');
      link.href = href;
      return link;
    }
    case 'cart':
      return cartSummary(data.cart);
    case 'action_result': {
      const ok = data.status === 'success';
      const line = el('p', `essie__status${ok ? ' essie__status--success' : ''}`);
      line.textContent = `${ok ? '✓ ' : ''}${data.label || ''}`;
      return data.label ? line : null;
    }
  }
  if (Array.isArray(data.items) && data.items.length) return productCards(data.items);
  return null;
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

function initEssie() {
  const pill = root.querySelector('[data-essie-open]');
  const list = root.querySelector('[data-essie-messages]');
  const form = root.querySelector('[data-essie-form]');
  const input = root.querySelector('[data-essie-input]');
  const send = root.querySelector('[data-essie-send]');
  const newChat = root.querySelector('[data-essie-new]');

  forgetPreviousShopper();

  let transcript = loadTranscript();
  let busy = false;
  let rendered = false;
  let brands = loadBrands(load(KEYS.conversation));

  // Brand links go on Essie's text only, never on widgets or the shopper's words.
  const linkMessage = node => node
    .querySelectorAll(':scope > .essie__bubble')
    .forEach(bubble => linkBrands(bubble, brands));

  // Shown whenever Essie is working but no text is streaming. Hidden from
  // screen readers; the log's aria-busy covers the wait.
  const thinking = el('div', 'essie__thinking');
  const dots = el('span', 'essie__dots');
  const thinkingLabel = el('span', 'essie__thinking-label');
  dots.append(el('i'), el('i'), el('i'));
  thinking.append(dots, thinkingLabel);
  thinking.setAttribute('aria-hidden', 'true');

  const isOpen = () => root.hasAttribute('data-open');

  function save() {
    transcript = transcript.slice(-MAX_SAVED_MESSAGES);
    store(KEYS.transcript, JSON.stringify(transcript));
  }

  // Follow new content only if the shopper hasn't scrolled up to read.
  function scrollToEnd(force = false) {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (force || nearBottom) list.scrollTop = list.scrollHeight;
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    newChat.disabled = value;
    list.setAttribute('aria-busy', String(value));
    list.querySelectorAll('.essie__chip').forEach(chip => { chip.disabled = value; });
  }

  function messageEl(role) {
    const node = el('div', `essie__msg essie__msg--${role}`);
    // The indicator stays last, below whatever is still arriving.
    list.insertBefore(node, thinking.isConnected ? thinking : null);
    return node;
  }

  function showThinking(label = '') {
    thinkingLabel.textContent = label;
    if (!thinking.isConnected) list.append(thinking);
    scrollToEnd();
  }

  const hideThinking = () => thinking.remove();

  // Suggestions are only offered for the latest turn.
  function clearChips() {
    list.querySelectorAll('.essie__chips').forEach(row => row.remove());
  }

  function renderGreeting() {
    const msg = messageEl('assistant');
    msg.append(textPart(config.greeting));
    const row = chips(config.starters);
    if (row) msg.append(row);
  }

  function renderSaved(message, isLast) {
    const msg = messageEl(message.role);
    message.parts.forEach(part => {
      if (part.type === 'text') msg.append(textPart(part.text));
      else if (part.data?.type !== 'quick_replies' || isLast) {
        const widget = toolResult(part.data);
        if (widget) msg.append(widget);
      }
    });
    if (message.role === 'assistant') linkMessage(msg);
  }

  function renderAll() {
    list.replaceChildren();
    if (!transcript.length) renderGreeting();
    transcript.forEach((m, i) => renderSaved(m, i === transcript.length - 1));
    scrollToEnd(true);
  }

  function showError(text, canRetry = true) {
    const msg = messageEl('assistant');
    const box = el('div', 'essie__error');
    box.append(el('span', null, config.textError));
    if (canRetry) {
      const retry = el('button', 'essie__chip', config.textRetry);
      retry.type = 'button';
      retry.addEventListener('click', () => {
        if (busy) return;
        msg.remove();
        reply(text);
      });
      box.append(retry);
    }
    msg.append(box);
    scrollToEnd(true);
  }

  // Streams one assistant reply into the list, then saves it.
  async function reply(text) {
    setBusy(true);
    showThinking();

    // part_id → { index, type, node, text, data }
    const parts = new Map();
    const messages = [];
    let current = null;

    const startMessage = () => {
      current = { node: messageEl('assistant'), parts: [], linked: false };
      messages.push(current);
    };

    // Keep parts in part_index order, whatever order they arrive in.
    const place = (part, node) => {
      part.node = node;
      const after = part.message.parts.find(p => p.index > part.index && p.node?.isConnected);
      part.message.node.insertBefore(node, after?.node || null);
    };

    try {
      const res = await postMessage(text, {}, () => {
        brands = new Map();
        transcript = [{ role: 'user', parts: [{ type: 'text', text }] }];
        save();
        renderAll();
        showThinking();
      });

      for await (const event of readEvents(res)) {
        switch (event.event) {
          case 'message_start':
            startMessage();
            break;

          case 'part_start': {
            if (!current) startMessage();
            const part = {
              id: event.part_id,
              index: event.part_index ?? 0,
              type: event.part_type,
              message: current,
              text: '',
            };
            parts.set(part.id, part);
            current.parts.push(part);
            if (part.type === 'text') place(part, textPart(''));
            // "Looking…" until the tool's result is in.
            if (part.type === 'tool_call') showThinking(config.textLooking);
            break;
          }

          case 'part_delta': {
            const part = parts.get(event.part_id);
            if (part?.type !== 'text') break;
            part.text += event.delta || '';
            part.node.innerHTML = renderMarkdown(part.text);
            if (part.text.trim()) hideThinking();
            break;
          }

          case 'part_complete': {
            const part = parts.get(event.part_id);
            if (!part) break;
            if (part.type === 'tool_result') {
              part.data = event.data;
              if (collectBrands(event.data, brands)) saveBrands(conversationId(), brands);
              const widget = toolResult(event.data);
              if (widget) place(part, widget);
            }
            // More may follow; `done` or the end of the stream clears this.
            if (part.type === 'text' || part.type === 'tool_result') showThinking();
            break;
          }

          case 'message_complete':
            if (current && !current.linked) {
              linkMessage(current.node);
              current.linked = true;
            }
            break;

          case 'error':
            throw Object.assign(new Error(event.message || 'stream error'), {
              recoverable: event.recoverable !== false,
            });
        }
        scrollToEnd();
        if (event.event === 'done') break;
      }

      // A stream that ended without message_complete still gets its links.
      messages.filter(m => !m.linked).forEach(m => linkMessage(m.node));

      // Save what was shown, in the order it was shown.
      messages.forEach(message => {
        const saved = message.parts
          .sort((a, b) => a.index - b.index)
          .flatMap(p => {
            if (p.type === 'text' && p.text.trim()) return [{ type: 'text', text: p.text }];
            if (p.type === 'tool_result' && p.node) return [{ type: 'result', data: p.data }];
            return [];
          });
        if (saved.length) transcript.push({ role: 'assistant', parts: saved });
      });
      save();
    } catch (err) {
      console.warn('[essie]', err);
      messages.forEach(m => m.node.remove());
      showError(text, err.recoverable !== false);
    } finally {
      hideThinking();
      setBusy(false);
      scrollToEnd();
    }
  }

  function submit(text) {
    text = text.trim();
    if (!text || busy) return;

    clearChips();
    transcript.push({ role: 'user', parts: [{ type: 'text', text }] });
    save();
    messageEl('user').append(textPart(text));
    scrollToEnd(true);
    reply(text);
  }

  // Product-page suggestions. Offered once, a moment after load, until the
  // shopper opens Essie or dismisses them (dismissal lasts the visit). After
  // that, hovering the closed bar still brings them up.
  const tray = root.querySelector('[data-essie-prompts]');
  const promptState = { auto: false, done: false, hover: false, leaveTimer: 0 };

  // Height is animated to a number, so keep it in step with the content,
  // which rewraps as the shell changes width.
  if (tray) {
    const inner = tray.firstElementChild;
    const measure = () => tray.style.setProperty('--essie-prompts-height', `${inner.offsetHeight}px`);
    new ResizeObserver(measure).observe(inner);
    measure();
  }

  function syncPrompts() {
    if (!tray) return;
    const show = !isOpen() && (promptState.auto || promptState.hover);
    root.toggleAttribute('data-prompts', show);
    tray.inert = !show;
  }

  // Opening Essie or dismissing: the automatic offer is over for this page.
  function hidePrompts() {
    promptState.done = true;
    promptState.auto = false;
    promptState.hover = false;
    clearTimeout(promptState.leaveTimer);
    syncPrompts();
  }

  function initPrompts() {
    const prompts = config.productPrompts;
    if (!tray || !prompts?.length) return;

    const row = tray.querySelector('[data-essie-prompts-list]');
    prompts.forEach(({ label, message }) => {
      const chip = el('button', 'essie__chip', label);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        open();
        submit(message || label);
      });
      row.append(chip);
    });

    tray.querySelector('[data-essie-prompts-dismiss]').addEventListener('click', () => {
      hidePrompts();
      try { sessionStorage.setItem(PROMPTS_DISMISSED, '1'); } catch { /* this page only */ }
      pill.focus({ preventScroll: true });
    });

    // Mouse only — on touch, a tap opens Essie. Leaving waits a beat so a
    // pointer drifting off the edge doesn't snap the tray shut.
    root.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || isOpen()) return;
      clearTimeout(promptState.leaveTimer);
      promptState.hover = true;
      syncPrompts();
    });
    root.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(promptState.leaveTimer);
      promptState.leaveTimer = setTimeout(() => {
        promptState.hover = false;
        syncPrompts();
      }, 300);
    });

    let dismissed = false;
    try { dismissed = Boolean(sessionStorage.getItem(PROMPTS_DISMISSED)); } catch { /* show them */ }
    if (dismissed) return;
    setTimeout(() => {
      if (isOpen() || promptState.done) return;
      promptState.auto = true;
      syncPrompts();
    }, PROMPTS_DELAY);
  }

  function open() {
    hidePrompts();
    root.setAttribute('data-open', '');
    pill.setAttribute('aria-expanded', 'true');
    form.inert = false;
    // Built once; a reply still streaming while the panel was closed carries on.
    if (!rendered) renderAll();
    rendered = true;
    visitorToken().catch(() => { /* retried when the first message is sent */ });
    input.focus({ preventScroll: true });
  }

  function close() {
    root.removeAttribute('data-open');
    pill.setAttribute('aria-expanded', 'false');
    // Typing is only possible while open; the pill takes clicks and focus.
    form.inert = true;
    pill.focus({ preventScroll: true });
  }

  pill.addEventListener('click', open);
  root.querySelector('[data-essie-close]').addEventListener('click', close);

  document.addEventListener('keydown', e => {
    // Leave Escape to an open modal <dialog> (e.g. the account modal).
    if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) close();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value;
    if (busy || !text.trim()) return;
    input.value = '';
    submit(text);
  });

  list.addEventListener('click', e => {
    const chip = e.target.closest('[data-essie-reply]');
    if (chip) submit(chip.dataset.essieReply);
  });

  newChat.addEventListener('click', () => {
    if (busy) return;
    const id = load(KEYS.conversation);
    if (id) store(brandsKey(id), null);
    brands = new Map();
    store(KEYS.conversation, null);
    transcript = [];
    save();
    renderAll();
    input.focus();
  });

  initPrompts();
}

if (root && config?.apiBase) initEssie();
