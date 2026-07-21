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

### ESLint + JSX sub-components (constraint)

The store's flat config has **no React ESLint plugin**, so `no-unused-vars` does
NOT recognise a JSX-only reference (`<Swatch/>`) as using the `Swatch` binding —
defining a helper component used only in JSX fails lint. Keep each island a
SINGLE component (inline the sub-markup / lift child state up), the way
`ProductLibrary.jsx` and `ProductDetail.jsx` do. Plain helper functions called
normally (e.g. `priceInfo(product)`) are fine.

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
