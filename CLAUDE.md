# atelier-store

Astro + React-islands storefront. Reads products / inventory / brands / orders
from **atelier-api**. Plain JavaScript (no TypeScript), ESM.

## Run

- `npm run dev` — dev server on **http://localhost:4321** (port pinned in
  `astro.config.mjs`, kept off the API's 3001 so both run together).
- `npm run build` — static build to `dist/`. Build runs page frontmatter, so any
  build-time `safeFetch` call executes; the API being down must NOT fail the
  build (see fetch helper below).
- `npm run lint` — ESLint over `.js/.jsx/.mjs` only.

## Conventions

- **API access goes through `src/lib/api.js`.** Never call `fetch` directly in a
  page or island.
  - `apiFetch(path, opts)` — throws `ApiError` (with `.status`) on network
    failure or non-2xx; message is already user-friendly.
  - `safeFetch(path, opts)` — never throws, returns `{ data, error }`. Use this
    in page frontmatter / islands so the template renders an error state instead
    of crashing. Because it swallows errors, a build with the API offline still
    succeeds (page shows the error state).
  - `ApiError` carries `.status` AND `.body` (the parsed JSON error body). For a
    422 the API sends `{ message, errors: [{ field, message }] }`; read
    `err.body?.errors` to show validation messages inline (see
    `OrderRequestForm.jsx`). `.message` is still the human-friendly fallback.
  - Base URL from `PUBLIC_API_BASE_URL` (falls back to `http://localhost:3001`).
    The `PUBLIC_` prefix is REQUIRED for the value to reach browser islands; a
    non-prefixed var is server-only in Astro.
- **React islands** live in `src/components/*.jsx`, imported into `.astro` and
  hydrated with a `client:*` directive (`client:load` for immediately
  interactive UI). Server-render guard: check `typeof window === 'undefined'`
  before touching `window`/`localStorage` (islands are SSR'd first).
- **Layout**: `src/layouts/Layout.astro` wraps every page (Header + Footer +
  global CSS). Pass `title` / `description` props.
- **Styling is placeholder-only**, all in `src/styles/global.css` — one obvious
  file, imported once by the layout. Keep markup semantic; real design is applied
  by hand later, so restyling must not require restructuring HTML.
- **Linting**: `.astro` files are NOT linted by ESLint (markup-first; Astro's own
  build does diagnostics). Keep real logic in `.js/.jsx` modules so it stays
  covered. JSX parses via espree's `ecmaFeatures.jsx` — no extra parser dep.

## Pages

- **`/products` (US-017)** — `src/pages/products.astro` renders `ProductLibrary.jsx`
  as a single `client:load` island. The island fetches the whole website
  catalogue once (`GET /catalogue/products?limit=100`; the catalogue is small,
  well under the API max) and **filters in memory** — instant, no page reload,
  no per-filter request. Filter options are derived from the fetched set
  (brand uses `brand.slug`/`brand.name`, `product_type` maps to friendly
  labels, other fields are raw strings). Price rule (FR-3): `price_hidden` OR
  missing `retail_price_cents` → "Login for trade pricing"; otherwise
  `Intl.NumberFormat` in the product's `currency`. Empty state shown when no
  product matches. Reuse the fetch-all-then-filter shape for any small
  filtered list; switch to server-side querystring filtering only if the set
  ever exceeds the API page cap.

- **`/products/[slug]` (US-018)** — `src/pages/products/[slug].astro` prerenders
  one route per website-visible product. `getStaticPaths` enumerates slugs with
  `safeFetch('/catalogue/products?limit=100')` (never throws → API offline just
  yields zero detail routes, build still succeeds). The live detail is a
  `client:load` island `ProductDetail.jsx` fetching `GET /catalogue/products/:slug`
  per request — necessary because availability and trade pricing are per-request
  (auth cookie). **Gotcha:** that endpoint wraps the product in an envelope
  `{ product: {...} }` (unlike the LIST endpoint which returns `{ products, meta }`);
  read `body.product`. Purchase action by type: finished good → Add to Cart;
  fabric with any in-stock colourway → Request Order; fabric all out of stock →
  Request Backorder + lead-time note. Request buttons link to
  `/order-request?product=<slug>[&backorder=1]` (form built in US-020). Price
  reuses the FR-3 rule plus trade: `trade_price_cents` present → show it;
  else `price_hidden`/null retail → "Login for trade pricing"; else retail.

- **`/cart`, `/checkout`, `/checkout/success` (US-019)** — the B2C card-checkout
  flow, all `client:load` islands reading the client cart. `/cart` (`Cart.jsx`)
  edits quantity / removes lines / shows subtotal. `/checkout` (`Checkout.jsx`)
  has a shipping-zone selector (the three fixed NZ zones: Auckland / North
  Island / South Island), fetches a **live** quote from
  `GET /shipping/quote?zone=&qty=`, shows the total, and "Pay by Card" POSTs
  `{ lines: [{ sku, qty }], zone }` to `POST /checkout/session` then
  `window.location.href = body.url` (redirect to Stripe). **No prices are sent**
  — the API re-resolves them. The cart is NOT cleared on redirect, so Stripe's
  `cancel_url` (`/cart`) returns to an intact cart. `/checkout/success`
  (`CheckoutSuccess.jsx`) reads `?session_id=` from the URL, verifies it via
  `GET /checkout/session/:id`, shows the deterministic order number
  (`WEB-<id>`), and only THEN clears the cart. Money is formatted with the
  shared `src/lib/money.js` `formatMoney(cents, currency)`.

- **`/order-request` (US-020)** — `src/pages/order-request.astro` renders
  `OrderRequestForm.jsx` as a single `client:load` island. Reached from a fabric
  product page as `/order-request?product=<slug>[&backorder=1]`. The island reads
  the query string (`window.location.search`, SSR-guarded), loads the product's
  colourways via `GET /catalogue/products/:slug` (colourway = SKU picker),
  prefills name/email from `GET /auth/me` (401 = guest, ignored), and POSTs
  `{ lines: [{ sku, qty_metres, cut_requirements }], contact: { name, email,
  phone }, accepted_lead_time }` to `POST /orders/request`. The **backorder**
  variant (`?backorder=1`) shows the lead-time note and an "I accept the quoted
  lead time" checkbox that is REQUIRED before submit (sets `accepted_lead_time`).
  Validation is two-layer: client checks (metres > 0, colourway chosen, email
  present, checkbox for backorder), then server 422 field errors mapped from
  `err.body.errors` field paths (`lines[0].qty_metres` → metres, `contact.email`
  → email) shown inline; other errors show form-level. Success replaces the form
  with the request number and "in touch within 24 hours".

- **`/login`, `/register`, `/trade-application` (US-021)** — each an Astro page
  wrapping a single `client:load` form island (`LoginForm.jsx`,
  `RegisterForm.jsx`, `TradeApplicationForm.jsx`). Login/register POST to
  `/auth/login` / `/auth/register`; on success the API sets the session cookie
  and the island does `window.location.href = '/'` (login honours a same-site
  `?redirect=` path — off-site/`//` values are rejected). Trade-application POSTs
  to `/auth/trade-application` and does NOT redirect — it shows a confirmation
  that approval is **manual** (role=trade, `trade_approved=false`; no self-serve
  approval endpoint exists). Errors surface inline from `ApiError.message` (the
  API sends friendly `{ error }` on 401/409); register/trade check
  `password.length >= 8` client-side to avoid the raw schema-400 message.
  **Auth helpers live in `src/lib/auth.js`**: `fetchCurrentUser()` (GET
  `/auth/me` → `user` or null, swallows 401), `logout()` (POST `/auth/logout`,
  never throws), `accountLabel(user)` (name or email). `/auth/me`,
  register and login all return a `{ user }` envelope — read `body.user`.
- **`/account`, `/order-lookup` (US-022)** — order history + status. `/account`
  (`Account.jsx`, `client:load`) resolves auth at runtime: `fetchCurrentUser()`;
  no user → `window.location.href = '/login?redirect=/account'` (satisfies the
  "unauthenticated → login" criterion), else `GET /orders/mine` → `{ orders }`
  listed newest-first. `/order-lookup` (`OrderLookupForm.jsx`) is PUBLIC — order
  number + email → `GET /orders/lookup?order_number=&email=`; a 404 (either key
  wrong) shows a friendly "no order matches" message, never an enumeration
  signal. Order rendering (status pill, line table, totals, invoice reference)
  is **shared** via `src/lib/orderView.jsx`: `statusBadge(status)` +
  `orderCard(order)` are plain FUNCTIONS returning JSX, CALLED normally
  (`orders.map((o) => orderCard(o))`) — NOT `<OrderCard/>`. A shared component
  used only in JSX would trip `no-unused-vars` (no React plugin); a called
  function counts as a use. Order money fields are integer cents rendered with
  `formatMoney`; totals rows omit when null (fabric requests are priced later by
  the back office, so subtotal/total sit at 0 and `xero_invoice_ref` is null
  until confirmation — the invoice row only appears once set).
- **Header account island** — `Header.astro` renders `AccountNav.jsx`
  (`client:load`) in place of the old static "Account" link. Because the store
  is a static build, login state is resolved at runtime: the island calls
  `fetchCurrentUser()` and shows the account name (link to `/account`) + a Log
  out button when signed in, else a Login link. It defaults to the Login link
  while `/auth/me` is in flight (guest is the common case, no layout jump). Log
  out calls `logout()` then reloads to `/` so every island re-reads state.

- **`/admin/orders` (US-023)** — back-office order queue, a single `client:load`
  island `AdminOrders.jsx`. Because this is a static build with no server-side
  guard, the island IS the access gate: `fetchCurrentUser()` on mount → no user
  redirects to `/login?redirect=/admin/orders`; a signed-in user whose `role` is
  neither `backoffice` nor `director` is redirected to `/` (no order data
  fetched, no broken page). Backoffice/director load `GET /admin/orders?status=`
  (a status `<select>` re-queries) and expand a row to edit line quantities
  (`PATCH /admin/orders/:id` `{ lines: [{ id, qty }] }`) and drive the lifecycle:
  Confirm (POST `/confirm` with `xero_invoice_ref`), Mark Paid (`/mark-paid`),
  Mark Shipped (`/ship`), Decline (`/decline`). Action buttons are shown per
  status (requested → Confirm/Decline/edit; confirmed → Mark Paid/Decline/edit;
  paid → Ship; shipped/declined → none), and the API's state machine is the real
  authority — an invalid transition returns 409 whose message is shown inline.
  The list re-loads after every mutation so status/totals/reservation stay
  accurate. `/auth/me` exposes `role` (from `PUBLIC_USER_COLUMNS`), so the role
  check needs no extra call. Reuses `statusBadge` from `orderView.jsx` and
  `formatMoney`.

### ESLint + JSX sub-components (constraint)

The store's flat config has **no React ESLint plugin**, so `no-unused-vars` does
NOT recognise a JSX-only reference (`<Swatch/>`) as using the `Swatch` binding —
defining a helper component used only in JSX fails lint. Keep each island a
SINGLE component (inline the sub-markup / lift child state up), the way
`ProductLibrary.jsx` and `ProductDetail.jsx` do. Plain helper functions called
normally (e.g. `priceInfo(product)`) are fine.

## Content collections (US-024)

Structured content lives in **Astro content collections** (content layer),
defined in **`src/content.config.js`** (`z` from `astro:content`, `glob` loader
from `astro/loaders`). Three collections, all CMS-friendly (flat frontmatter +
markdown body) so US-026's EmDash CMS can manage them and the markdown files are
the fallback baseline:

- **`brandPage`** (`src/content/brands/*.md`) — `brand` (API brand slug),
  `slideshow` (image URLs), `blurb`, `collectionCards` (`{ heading, description,
  link, featuredImage? }`). Body markdown is extended brand copy.
- **`post`** (`src/content/posts/*.md`) — `title`, `date` (coerced), `brands`
  (brand-slug tags), `hero?`. Body is the article. (Listing pages are US-025.)
- **`page`** (`src/content/pages/*.md`) — `title`; body is the page (story /
  contact, seeded in US-025; dir kept with `.gitkeep`).

**Query with `getCollection('brandPage')` / `render(entry)`** — build-time only,
so brand pages are fully STATIC (no islands). Entry `id` is the filename slug.

**`/brands` (`brands/index.astro`)** — API-driven grid of ALL houses via
`safeFetch('/catalogue/brands')` (→ `{ brands }`, offline renders error state),
each card links to `/brands/<slug>`.

**`/brands/[slug]` (`brands/[slug].astro`)** — `getStaticPaths` returns the
UNION of live API brand slugs and seeded `brandPage` slugs (so a seeded page
still builds with the API offline). Each route gets `{ brand, page, relatedPosts
}`: brand from the API (or null), `page` the matching `brandPage` entry (matched
by `entry.data.brand === slug`), `relatedPosts` = posts whose `brands` include
the slug. Renders slideshow header, blurb (`page.blurb ?? brand.story`),
collection cards, optional body, related posts. Brands without a content entry
degrade gracefully (empty slideshow, API story blurb, no cards). Related-post
links point at `/resources/<id>` (route built in US-025).

## Resources + company pages (US-025)

All static (content is build-time; no islands):

- **`/resources` (`resources/index.astro`)** — lists the `post` collection
  newest-first via `getCollection('post')` (grid of cards, hero + title + date;
  empty state when none). Cards link to `/resources/<post.id>`.
- **`/resources/[slug]` (`resources/[slug].astro`)** — one route per post;
  `getStaticPaths` maps `post.id` → `params.slug`, renders the markdown body with
  `render(post)` inside `.prose`, shows date and `brands` tags (each links to
  `/brands/<slug>`). Slug = entry `.id` = filename (matches the `/resources/<id>`
  links from brand pages).
- **`/story`, `/contact` (`story.astro`, `contact.astro`)** — each renders one
  `page`-collection entry looked up by id with `getEntry('page', 'story'|'contact')`
  then `render(entry)`. Falls back to an empty-state if the entry is missing.
  Seeded markdown: `src/content/pages/story.md`, `contact.md`.

Newsletters become posts (meeting decision) — no separate newsletter type; add a
`post` entry. Content styles (`.post-card`, `.post`, `.prose`, `.tag`,
`.content-page`) live in `global.css`.

## EmDash CMS (US-026)

EmDash (`emdash@0.29.0`, beta) is added as an Astro integration so editors can
manage journal posts without a deploy. It is **additive** — markdown collections
(above) remain the shipped baseline.

- **Server mode:** EmDash injects on-demand routes, so `astro.config.mjs` uses
  `output: 'server'` + `@astrojs/node`. **Every storefront page therefore MUST
  keep `export const prerender = true`** (first line of frontmatter) or it stops
  being static — new pages need it too. Only EmDash routes and the two
  `/resources` pages render on demand.
- **Config:** `emdash({ database: sqlite({ url: 'file:./data/emdash.db' }),
  storage: local({ directory: './data/uploads', ... }) })`. `data/` and
  `emdash-env.d.ts` are gitignored — local content is never committed.
- **Live collection:** `src/live.config.js` registers the `_emdash` loader.
- **Reads go through `src/lib/emdash.js`** (`listEmdashPosts` / `getEmdashPost`),
  which NEVER throw — an empty/absent CMS yields the markdown baseline, keeping
  builds offline-safe. `getEmDashCollection('posts')` → `{ entries }` (entry has
  `.slug` + `.data`); `getEmDashEntry('posts', slug)` → `{ entry, ... }` (unwrap
  `.entry`). Post fields live under `entry.data` (`title`, `excerpt`,
  `featured_image`, `content` (portableText), `publishedAt`).
- **`/resources`** merges markdown + published EmDash posts (markdown wins on
  slug); **`/resources/[slug]`** resolves markdown-first then EmDash, else 404.
  Both are `prerender = false`.
- **Admin:** http://localhost:4321/_emdash/admin (first run → `/setup`,
  passkey auth). Dev-only headless bootstrap + API token:
  `GET /_emdash/api/setup/dev-bypass?token=1`.
- **MCP server:** `POST /_emdash/api/mcp` (Streamable HTTP, `Authorization:
  Bearer <token>`) — see `README.md`.
- Beta rough edges + workarounds: `../tasks/emdash-blockers.md`.

## Cart

Client-side cart lives in `localStorage` under key `atelier_cart` (array of
`{ sku, name, qty, price_cents, currency }`). **Write path: `src/lib/cart.js`**
(`addToCart(item, qty)` merges by SKU, `readCart()`, `CART_EVENT`). Every write
dispatches a same-tab `atelier-cart-change` event (`CART_EVENT`) because the
native `storage` event only fires in OTHER tabs. `CartIndicator.jsx` listens to
BOTH `storage` and `CART_EVENT` so the header count updates instantly after an
Add to Cart in the same tab. Write helpers: `addToCart` (US-018), plus
`setCartQty(sku, qty)` (qty ≤ 0 removes), `removeFromCart(sku)`, `clearCart()`,
and read helpers `cartCount(items?)` / `cartSubtotalCents(items?)` (US-019). Any
island that mutates the cart MUST go through these so the header stays live. The
cart only ever holds finished goods (fabrics use the order-request flow).

## Env

Copy `.env.example` to `.env` (gitignored). Only `PUBLIC_API_BASE_URL` today.
