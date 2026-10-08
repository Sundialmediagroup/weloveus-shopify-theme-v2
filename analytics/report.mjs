// Analytics reports: the store's headline numbers, and which page features
// lead to sales. Reads GA4 through the Data API and writes Markdown to
// reports/daily/ and reports/weekly/ (git-ignored — this repo is public).
//
//   npm run report             both
//   npm run report -- daily    yesterday, against the same day a week before
//   npm run report -- weekly   last Monday–Sunday, against the week before
//
// Credentials: Google application default credentials, or a service account
// key named by GOOGLE_APPLICATION_CREDENTIALS. The account needs Viewer on the
// WeLoveUs GA4 property, nothing more.
//
// Features use a longer window than the headline — 7 days for the daily, 28
// for the weekly — since a day or a week holds too few orders to compare them.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BetaAnalyticsDataClient, v1alpha } from '@google-analytics/data'

const PROPERTY = `properties/${process.env.GA4_PROPERTY_ID || '515827714'}`

// Fewer purchases than this and a rate is shown but flagged as too few to compare.
const MIN_PURCHASES = 5

const data = new BetaAnalyticsDataClient()
const alpha = new v1alpha.AlphaAnalyticsDataClient()

// ─── Dates ─────────────────────────────────────────────────────────────────────

const ymd = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-')

function shift(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const range = (start, end) => ({ startDate: ymd(start), endDate: ymd(end) })

// ISO week, e.g. 2026-W40, of the week starting on `monday`.
function isoWeek(monday) {
  const thursday = shift(monday, 3)
  const jan1 = new Date(thursday.getFullYear(), 0, 1)
  const week = Math.floor((thursday - jan1) / 86400000 / 7) + 1
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}

const today = new Date()
today.setHours(12, 0, 0, 0)
const yesterday = shift(today, -1)
const lastSunday = shift(today, -(today.getDay() || 7))
const lastMonday = shift(lastSunday, -6)

const PERIODS = {
  daily: {
    title: 'daily',
    now: range(yesterday, yesterday),
    before: range(shift(yesterday, -7), shift(yesterday, -7)),
    columns: ['Yesterday', 'Same day last week'],
    features: { window: range(shift(yesterday, -6), yesterday), days: 7 },
    file: `reports/daily/${ymd(yesterday)}.md`,
  },
  weekly: {
    title: 'weekly',
    now: range(lastMonday, lastSunday),
    before: range(shift(lastMonday, -7), shift(lastSunday, -7)),
    columns: ['This week', 'Last week'],
    features: { window: range(shift(lastSunday, -27), lastSunday), days: 28 },
    file: `reports/weekly/${isoWeek(lastMonday)}.md`,
  },
}

// ─── Queries ───────────────────────────────────────────────────────────────────

async function totals(dateRange) {
  const [res] = await data.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    metrics: ['totalUsers', 'newUsers', 'sessions', 'transactions', 'purchaseRevenue'].map(name => ({ name })),
  })
  const [users, newUsers, sessions, orders, revenue] = (res.rows?.[0]?.metricValues || []).map(v => Number(v.value) || 0)
  return {
    users,
    newUsers,
    returningUsers: await returningUsers(dateRange),
    sessions,
    orders,
    revenue,
    conversion: sessions ? orders / sessions : 0,
    aov: orders ? revenue / orders : 0,
  }
}

// Returning users come from the newVsReturning dimension; total minus new
// would count visitors whose first visit fell outside GA4's view.
async function returningUsers(dateRange) {
  const [res] = await data.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'totalUsers' }],
  })
  const row = res.rows?.find(r => r.dimensionValues[0].value === 'returning')
  return Number(row?.metricValues[0].value) || 0
}

// Users through each event in turn, optionally broken down by a dimension of
// the first step. Returns { [value]: [users at each step] }, `all` for the total.
async function funnel(events, dateRange, breakdown) {
  const [res] = await alpha.runFunnelReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    funnel: {
      steps: events.map(eventName => ({ name: eventName, filterExpression: { funnelEventFilter: { eventName } } })),
    },
    ...(breakdown ? { funnelBreakdown: { breakdownDimension: { name: breakdown }, limit: 15 } } : {}),
  })

  const out = {}
  for (const row of res.funnelTable?.rows || []) {
    const [stepName, value = { value: 'all' }] = row.dimensionValues
    const index = Number(stepName.value.split('.')[0]) - 1
    const key = value.value === 'RESERVED_TOTAL' ? 'all' : value.value
    out[key] ||= events.map(() => 0)
    out[key][index] = Number(row.metricValues[0].value) || 0
  }
  return out
}

// Events and users for each of `names`. Returns { [name]: { events, users } }.
async function eventCounts(dateRange, names) {
  const [res] = await data.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: names } } },
  })
  const out = Object.fromEntries(names.map(name => [name, { events: 0, users: 0 }]))
  for (const row of res.rows || []) {
    const [events, users] = row.metricValues.map(v => Number(v.value) || 0)
    out[row.dimensionValues[0].value] = { events, users }
  }
  return out
}

// ─── Essie ─────────────────────────────────────────────────────────────────────
//
// Essie's events come from the theme (frontend/scripts/essie-chat.js) through
// the custom pixel. Her cart is her own (a Storefront API cart), so her adds
// show as essie_action, not add_to_cart; checkout and purchase are Shopify's.

const ESSIE_EVENTS = [
  'essie_open', 'essie_message', 'essie_products_shown', 'essie_action',
  'essie_cart_view', 'essie_checkout', 'essie_sign_in', 'essie_new_chat', 'essie_error',
]

const ESSIE_FUNNEL = ['essie_open', 'essie_message', 'essie_products_shown', 'essie_checkout', 'purchase']

async function essie(period) {
  const [now, before, journey, anyPurchase] = await Promise.all([
    eventCounts(period.now, ESSIE_EVENTS),
    eventCounts(period.before, ESSIE_EVENTS),
    funnel(ESSIE_FUNNEL, period.features.window),
    // Bought at all after talking to her, through her checkout or the store's.
    funnel(['essie_message', 'purchase'], period.features.window),
  ])
  return { now, before, journey: journey.all, anyPurchase: anyPurchase.all }
}

// ─── Formatting ────────────────────────────────────────────────────────────────

const int = n => Math.round(n).toLocaleString('en-US')
const usd = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n, digits = 2) => `${(n * 100).toFixed(digits)}%`
const rate = (part, whole, digits) => (whole ? pct(part / whole, digits) : '—')

function change(now, before) {
  if (!before) return '—'
  const delta = (now - before) / before
  const arrow = delta > 0.005 ? '▲' : delta < -0.005 ? '▼' : '•'
  return `${arrow} ${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`
}

function table(head, rows) {
  const line = cells => `| ${cells.join(' | ')} |`
  return [line(head), line(head.map((_, i) => (i ? '---:' : '---'))), ...rows.map(line)].join('\n')
}

const label = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const span = r => (r.startDate === r.endDate ? label(r.startDate) : `${label(r.startDate)} – ${label(r.endDate)}`)

function essieMarkdown({ now, before, journey, anyPurchase }, period, site) {
  if (!now.essie_open.events && !before.essie_open.events && !journey?.[0]) {
    return `## Essie

No Essie activity in ${span(period.now)} — she isn't live yet, or the custom
pixel isn't forwarding her events.`
  }

  const count = name => [int(now[name].events), int(before[name].events), change(now[name].events, before[name].events)]
  const per = (a, b) => (b ? (a / b).toFixed(1) : '—')
  const activity = [
    ['Shoppers who opened her', int(now.essie_open.users), int(before.essie_open.users), change(now.essie_open.users, before.essie_open.users)],
    ['Opens', ...count('essie_open')],
    ['Messages sent', ...count('essie_message')],
    ['Messages per shopper', per(now.essie_message.events, now.essie_message.users), per(before.essie_message.events, before.essie_message.users), '—'],
    ['Product suggestions shown', ...count('essie_products_shown')],
    ['Cart actions', ...count('essie_action')],
    ['Checkouts from her cart', ...count('essie_checkout')],
    ['Sign-in taps', ...count('essie_sign_in')],
    ['New chats started', ...count('essie_new_chat')],
    ['Errors', ...count('essie_error')],
    ['Error rate (per message)', rate(now.essie_error.events, now.essie_message.events, 1), rate(before.essie_error.events, before.essie_message.events, 1), '—'],
  ]

  const steps = ['Opened Essie', 'Sent a message', 'Saw products', 'Checked out from her cart', 'Purchased']
  const j = journey || steps.map(() => 0)
  const journeyRows = steps.map((name, i) => [name, int(j[i]), i ? rate(j[i], j[i - 1], 0) : '—', rate(j[i], j[0], 1)])

  const [talked = 0, bought = 0] = anyPurchase || []
  const siteRate = site?.[0] ? site[2] / site[0] : 0
  const essieRate = talked ? bought / talked : 0

  return `## Essie

${table(['Activity', ...period.columns, 'Change'], activity)}

### Journey

${span(period.features.window)} (${period.features.days} days). Shoppers through each step in order.

${table(['Step', 'Shoppers', 'From previous step', 'From opening'], journeyRows)}

${talked
  ? `- ${int(bought)} of ${int(talked)} shoppers who messaged her bought something afterwards (${rate(bought, talked)}), through her checkout or the store's${siteRate ? `, against ${pct(siteRate)} for all visitors (${(essieRate / siteRate).toFixed(1)}×)` : ''}.${bought < MIN_PURCHASES ? ' Too few purchases to compare yet.' : ''}`
  : '- Nobody messaged her in this window.'}`
}

// ─── Report ────────────────────────────────────────────────────────────────────

async function report(period) {
  const [now, before, sections, site, chat] = await Promise.all([
    totals(period.now),
    totals(period.before),
    funnel(['section_click', 'add_to_cart', 'purchase'], period.features.window, 'customEvent:section_type'),
    funnel(['session_start', 'add_to_cart', 'purchase'], period.features.window),
    essie(period),
  ])

  const headline = [
    ['Unique users', int(now.users), int(before.users), change(now.users, before.users)],
    ['New users', int(now.newUsers), int(before.newUsers), change(now.newUsers, before.newUsers)],
    ['Returning users', int(now.returningUsers), int(before.returningUsers), change(now.returningUsers, before.returningUsers)],
    ['Sessions', int(now.sessions), int(before.sessions), change(now.sessions, before.sessions)],
    ['Orders', int(now.orders), int(before.orders), change(now.orders, before.orders)],
    ['Revenue', usd(now.revenue), usd(before.revenue), change(now.revenue, before.revenue)],
    ['Conversion rate', pct(now.conversion), pct(before.conversion), change(now.conversion, before.conversion)],
    ['Average order value', usd(now.aov), usd(before.aov), change(now.aov, before.aov)],
  ]

  const sectionRow = (name, [users, carts, purchases]) => [
    name,
    int(users),
    `${int(carts)} (${rate(carts, users, 0)})`,
    int(purchases),
    purchases < MIN_PURCHASES ? `${rate(purchases, users)} *` : `**${rate(purchases, users)}**`,
  ]

  const sectionRows = Object.entries(sections)
    .filter(([key]) => key !== 'all')
    // Best rate first, with sections too small to judge at the bottom.
    .sort(([, a], [, b]) => (b[2] >= MIN_PURCHASES) - (a[2] >= MIN_PURCHASES)
      || b[2] / (b[0] || 1) - a[2] / (a[0] || 1))
    .map(([key, counts]) => sectionRow(key, counts))

  const best = Object.entries(sections)
    .filter(([key, [, , purchases]]) => key !== 'all' && purchases >= MIN_PURCHASES)
    .sort(([, a], [, b]) => b[2] / b[0] - a[2] / a[0])[0]

  const lift = sections.all && site.all?.[0] && site.all[2]
    ? (sections.all[2] / sections.all[0]) / (site.all[2] / site.all[0])
    : 0

  const essieSection = essieMarkdown(chat, period, site.all)

  const markdown = `# WeLoveUs ${period.title} report

${span(period.now)}, compared with ${span(period.before)}. Source: GA4.

## Headline

${table(['Metric', ...period.columns, 'Change'], headline)}

Conversion rate is orders ÷ sessions. GA4 only counts visitors who accept
analytics cookies, so orders and revenue run below Shopify's; use the trend,
and Shopify for the totals.

## Features that lead to sales

${span(period.features.window)} (${period.features.days} days). Shoppers who clicked a feature on a page,
then added to cart, then bought.

${table(['Feature', 'Shoppers who clicked', 'Added to cart', 'Purchased', 'Purchase rate'], [
  ...sectionRows,
  sectionRow('_Any feature_', sections.all || [0, 0, 0]),
  sectionRow('_All visitors_', site.all || [0, 0, 0]),
])}

\\* Fewer than ${MIN_PURCHASES} purchases — too few to compare.

${[
  lift ? `- Shoppers who click a feature buy at **${lift.toFixed(1)}×** the site's rate. They were likelier buyers to begin with, so this is a link, not proof the features cause the sales.` : '',
  best ? `- Best converting feature with enough orders to judge: **${best[0]}**.` : '- No feature has enough purchases yet to name a winner.',
].filter(Boolean).join('\n')}

${essieSection}
`

  await mkdir(dirname(period.file), { recursive: true })
  await writeFile(period.file, markdown)
  console.log(markdown)
  console.error(`Written to ${period.file}`)
}

const which = process.argv[2]
if (which && !PERIODS[which]) {
  console.error(`Unknown report "${which}". Use daily or weekly, or nothing for both.`)
  process.exit(1)
}
for (const name of which ? [which] : Object.keys(PERIODS)) await report(PERIODS[name])
