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
- **Layout**: `src/layouts/Layout.astro` wraps every page (skip link + Header +
  `<main id="main">` + Footer + global CSS). Props: `title`, `description`,
  optional `image` (og:image) and `type` (og:type). It emits canonical,
  Open Graph and Twitter tags built from `Astro.site` (see `SITE_URL` under Env)
  and keeps the `ALLOW_INDEXING` noindex behaviour.
  - **`bleed`** (default false) drops the `.container` wrapper AND `<main>`'s
    block padding (`.main-bleed` in tokens.css), handing the page the full width
    of `<main>` so it can paint edge-to-edge bands. A bleed page must supply its
    own `.container` inside each band — that is what keeps its content column
    aligned with the header wordmark and the footer. Users: `/` (hero, tile wall,
    espresso maisons band), `/products` (linen page-header band) and
    `/brands/[slug]` (banner + espresso related reading). Every other page keeps
    the centred container.
    - `.main-bleed + .site-footer` zeroes the footer's `margin-top`. That 6rem
      margin is right for a paper page ending in body copy, but on a bleed page
      it becomes a paper strip under the last band — and where that band is
      itself espresso (the brand page), a bright seam between two dark bands.
  - **Agentation** (dev always, deployment opt-in): the annotation toolbar
    renders just before `</body>` as
    `{(import.meta.env.DEV || import.meta.env.PUBLIC_AGENTATION === 'true') && <Agentation client:only="react" />}`.
    It was `import.meta.env.DEV` alone, which meant it could never appear on the
    Basic-Auth staging site — the one place reviewers actually look at the real
    build. `PUBLIC_AGENTATION=true` turns it on there; unset at public launch and
    Vite dead-codes the branch so shoppers get no widget. **BUILD TIME** (every
    page is `prerender = true`), so it belongs in the launch checklist beside
    `SITE_URL`/`ALLOW_INDEXING` and a change needs a rebuild, not a pm2 restart.
    `client:only` because the toolbar is a React portal into `document.body`
    with nothing to server-render. It is a **runtime `dependency`**, not a
    devDependency — it now ships in the production render path, so a deploy that
    ever runs `npm ci --omit=dev` would otherwise fail the build.
  - **Do not verify the toolbar's absence by filename.** The old note claimed
    `ls dist/client/_astro | grep -i agent` came back empty; it does, but only
    because Astro names the chunk after the package entry (`index.mjs` →
    `index.<hash>.js`). Astro collects `client:*` directives by **static template
    scan**, so the ~420 kB toolbar chunk is emitted into `dist/client/_astro/`
    even when the runtime branch is dead — it is simply never requested. Grep
    chunk *contents* (`grep -ril agentation dist`), and confirm no server chunk
    references `Agentation` (`grep -rl Agentation dist/server`) — that second
    check is the one that proves it never renders.
- **Styling** is the hand-built Atelier design system. The direction is the
  **Maison redesign** (`~/Documents/atelier-platform-demo/Atelier-storefront redesign (1).zip`
  → `design_handoff_maison_redesign/`: Home, Product Library, Product Detail,
  Brand, plus shared Header and Footer as `.dc.html` prototypes). It supersedes
  the earlier platform handoff (`design_handoff_atelier_platform/`), which is
  still the reference for anything the Maison set does not cover (cart, checkout,
  auth, journal, contact). Plain CSS, no framework, no build step beyond Astro.
  - **Maison globals, adopted in `tokens.css`/`primitives.css`** — these are the
    reason the whole site reads as one design rather than four redesigned pages:
    `--container: 96rem` + `--gutter: 3rem` (the mocks' `max-width:96rem;
    padding:0 3rem` section frame, header and footer included), radii `0`
    (`--r-sm/--r-md/--r-chip` are kept as names but all resolve to 0 — squared
    corners everywhere), and `.btn` = 48px (`.btn-lg` 50px), uppercase Inter 600
    13px / .12em, outlined ink inverting to ink-on-paper on hover, or filled
    claret. `.btn-paper` is the on-photograph variant; `.link-cta` /
    `.link-cta-paper` the underlined uppercase text action beside it.
  - **Shared Maison figures live in `primitives.css`**, because more than one
    screen uses each: `.brass-rule` (the 34px opener), `.eyebrow-brass` /
    `.eyebrow-wide` (.26em tracking), `.bleed-hero` (+`-body/-eyebrow/-lede/-cta`,
    a full-bleed background image with a bottom scrim and absolutely positioned
    copy), `.band-dark` (+`-head/-link`, espresso band), `.index-list` /
    `.index-name` / `.index-meta` (hairline rows, restyled automatically inside
    `.band-dark`), `.scrim-tile` (+`-label`) and `.spec-rows` (label left, mono
    value right). Reach for these before writing a new block.
  - `src/styles/global.css` is the **only** file the layout imports; it is just
    the `@import` manifest, in cascade order:
    `tokens` → `primitives` → `chrome` → `home` → `library` → `product` →
    `commerce` → `admin` → `editorial`. Add a new area as its own file and
    import it here rather than growing one giant sheet.
  - `tokens.css` holds the palette (`--paper --surface --surface-deep --ink
    --ink-soft --muted --muted-soft --line --accent --accent-soft --brass
    --sage --clay`),
    the type scale (`--t-*` UI, `--d-*` display), the spacing scale
    (`--s1`…`--s10`), container widths, radii, shadows and durations. **Use the
    tokens; do not hardcode a hex.**
  - Type: **Fraunces** display, **Inter** UI, **IBM Plex Mono** data (SKUs,
    money, dates), loaded from Google Fonts in `Layout.astro` with system
    fallbacks. Eyebrows are uppercase 10–11px `--muted` with wide tracking.
  - Discipline from the handoff, worth keeping: richness comes from photography,
    not chrome; **roughly one claret element per screen**; 1px `--line` hairlines
    instead of heavy cards; no zebra striping; shadows only as a whisper-soft
    hover lift; **brass is never a text colour** (2.7:1 on paper) — fine strokes
    and rules only; every monetary figure carries the muted italic
    `.indicative-note`; NZ spelling; no emoji.
  - A missing photograph renders the duotone **weave placeholder**
    (`.product-image-placeholder`, tones from `weaveBackground()`), not an empty
    box — a grid of unphotographed designs still reads as a collection.
  - Ships **light-only** by design (warm-paper brand identity). Breakpoints are
    the CRM's two: `max-width: 1024px` and `max-width: 640px`.
    `prefers-reduced-motion` disables every transform/zoom.
  - Keep markup semantic and class-driven: the CSS is the only thing styling the
    site, so a restyle must not require restructuring HTML. New markup needs its
    class added to the relevant stylesheet.
- **Linting**: `.astro` files are NOT linted by ESLint (markup-first; Astro's own
  build does diagnostics). Keep real logic in `.js/.jsx` modules so it stays
  covered. JSX parses via espree's `ecmaFeatures.jsx` — no extra parser dep.

## Shared view helpers

- **`src/lib/catalogue.js`** is the single place the catalogue display rules
  live, so the library grid, the product detail island and the homepage cannot
  drift apart. Pure functions, no fetching, no DOM.
  - `priceInfo(product)` → `{ label, text, muted, indicative, retail }`. FR-3
    precedence: `trade_price_cents` (only ever sent to an approved trade user, so
    if it arrived, show it, with the visible retail struck through beside it) →
    `price_hidden` or no retail price → "Sign in for trade pricing" → retail.
    **`trade_price_cents` is NZD cents**, while `products.currency` is the
    supplier's currency and belongs to `retail_price_cents` — formatting the
    trade figure with the product currency rendered NZ money as "US$187.76".
    `TRADE_CURRENCY` is the constant; do not pass `product.currency` there.
    `indicative: true` drives the small muted "Indicative" annotation the design
    system puts beside every monetary figure.
  - `weaveBackground(hexTones)` builds the duotone weave placeholder from a
    colourway's tones (texture layer first — it is semi-transparent and sits on
    top). Returns `undefined` when there are no tones, so the caller falls back
    to the plain CSS placeholder.
  - `toneList`, `productTypeLabel`, `isFabric`.
- `src/lib/money.js` `formatMoney(cents, currency)` stays the only money
  formatter.
- **`src/lib/houses.js`** — house presentation for the Maison screens.
  `foundedYear(brand)` parses "Founded 1935" / "Established 2006" out of
  `brand.story` (the API has no founded column and inventing a date table would
  contradict the client's own copy); `houseMeta(brand)` builds
  `"France · est. 1935"`, degrading to the country alone; `countWord(n)` spells
  counts to twelve for the redesign's headings ("Six *colourways*", "Three
  *collections*") and falls back to digits past that.

## Pages

- **`/products` (US-017)** — `src/pages/products.astro` renders `ProductLibrary.jsx`
  as a single `client:load` island. The island fetches the whole website
  catalogue once (`GET /catalogue/products?limit=100`; the catalogue is small,
  well under the API max) and **searches, filters and sorts in memory** —
  instant, no page reload, no per-request round trip. Filter options are derived
  from the fetched set (brand uses `brand.slug`/`brand.name`, `product_type` maps
  to friendly labels, other fields are raw strings). Reuse the
  fetch-all-then-filter shape for any small filtered list; switch to the API's
  server-side `q`/`sort`/filter params (they all exist) only if the set ever
  exceeds the API page cap.
  - **Cards are merchandising, not a spec table**: the list endpoint now carries
    `image_url`, `in_stock`, `colourway_count` and a capped `colourways`
    strip, so each card shows a photograph (or the weave-gradient placeholder),
    a stock pill and its colourway dots. `weaveBackground()` builds the
    placeholder from the colourway's `hex_tones` — texture layer FIRST, it is
    semi-transparent and sits on top.
  - **Search** matches product name, house name, composition, application and
    every colourway name/SKU — the same fields the API's `q` matches, so
    switching to server-side search changes nothing a shopper can see.
  - **Sort** is `name` | `price_asc` | `price_desc` | `in_stock`. Price sorting
    uses `sortablePrice()`, which reads the price the shopper is actually shown
    (trade if present, else visible retail, else null-sorts-last) — never sort on
    a figure FR-3 hides.
  - **The view is deep-linkable**: `readUrlState()`/`writeUrlState()` sync
    filters + `q` + `sort` with the querystring, so `/products?brand=dedar` is
    shareable and is how the homepage and brand pages hand off into the library.
    `replaceState`, not `pushState` — every keystroke would otherwise become a
    history entry.
  - Price rendering is the shared `priceInfo()` in **`src/lib/catalogue.js`**
    (see below); the island never re-implements FR-3.
  - **Maison layout** (design: "Maison Library" in the Maison redesign handoff).
    The page is `<Layout bleed>`: a full-bleed linen `.library-head` band, then
    `.container.library-shell` around the island. The island itself is the
    two-column grid — `16rem` sticky refine sidebar + results column — because
    the facets and the grid share every piece of state.
    - `FILTERS` gained a **`control`** field: `list` renders as a click-to-toggle
      facet row with a live count (House, Type), `select` as an underline
      dropdown under "More filters" (Application, Composition, Width, Price
      band, Lead time). The URL keys and the filter semantics are unchanged, so
      every existing deep link still resolves.
    - `facetOptions()` counts each list option against the search term and every
      **other** filter, never the facet's own selection — so picking a house does
      not collapse the House list to one row, while the counts still track what
      is on screen. An option that can no longer yield a result is dropped unless
      it is the selected one (which must stay clickable to switch off).
    - Facet rows are toggles (`onFacetToggle`): clicking the active row clears
      it. The old removable `.facet-chip` row is gone — the sidebar shows active
      state directly (claret text + claret dot), so chips were duplicate UI.
    - Below 1024px the sidebar collapses behind a `.library-filters-toggle`
      button (`filtersOpen` state, `aria-expanded`/`aria-controls`); above it the
      CSS shows the sidebar regardless, so the state is inert there.
  - **`.product-card` is the library's alone.** It used to be shared with the
    homepage, so the Maison treatment was scoped under `.product-library` over an
    untouched base block. The Maison homepage leads with editorial bands instead
    of a product grid, so that split is gone: the base rules in `library.css`
    *are* the Maison card (4/5 crop, squared, brass brand eyebrow, 20px swatches,
    hover = border + shadow with **no** lift or zoom).
  - **Deviations from the mock, deliberate:** Width stays in "More filters" even
    though the mock lists only four selects — dropping it would silently remove a
    working filter. Sidebar eyebrows and the card brand eyebrow are **brass**, per
    the Maison token list — note this knowingly breaks the older "brass is never a
    text colour" rule and is below WCAG AA at 11px.

- **`/products/[slug]` (US-018)** — `src/pages/products/[slug].astro` is
  `prerender = false`. It had `getStaticPaths` enumerating website-visible
  slugs; that was deleted when staff gained product create/edit at runtime
  (`/admin/products`), because a prerendered route set 404s every new slug until
  the next deploy. **This is the one template every product renders through** —
  one route, one component, all fields filled from the API response, so a product
  never needs a page of its own and a sparse product omits a field rather than
  rendering a gap. The live detail is a `client:load` island `ProductDetail.jsx`
  fetching `GET /catalogue/products/:slug` per request — necessary because
  availability and trade pricing are per-request (auth cookie). **Gotcha:** that
  endpoint wraps the product in an envelope `{ product: {...} }` (unlike the LIST
  endpoint which returns `{ products, meta }`); read `body.product`.
  - **The frontmatter fetches the product too** (it briefly did not, and that is
    what this paragraph used to say). Server-side resolution is what gives each
    product a real `<title>`, a description (`productSummary` in
    `src/lib/catalogue.js`, built from the same spec fields the page shows), an
    `og:image`, JSON-LD, and a genuine **404** — without it every product shared
    one title and an unknown slug answered 200 with a blank page. It uses
    `apiFetch` (not `safeFetch`) for the same reason `/brands/[slug]` does: a 404
    means "no such product" and must 404, while any other failure means the API is
    unreachable *from the server* and must NOT 404 a product that exists — the
    island retries from the browser, which may well reach it.
  - **The fetched product is passed to the island as `initialProduct` — a SEED,
    not a replacement for its fetch.** The server request carries no auth cookie,
    so it can never hold trade pricing, and stock moves; the island still fetches
    unconditionally. Seeding it means the page server-renders the real product
    instead of "Loading product…", and a failed refresh keeps the working page
    rather than replacing it with an error. Server and client both first render
    from `initialProduct`, so hydration matches. **No trade figure is ever baked
    into this HTML**, and the JSON-LD `offers` block appears only where a retail
    price is actually public (FR-3) — present on a house product, absent on an
    international one.
  - **The colourway is the unit of purchase** — every SKU belongs to a colourway,
    not to the product — so selection drives the whole page: hero image,
    displayed SKU, stock state, and what the primary action acts on. Selection
    defaults to the first in-stock colourway (else the first listed) so the CTA is
    live on arrival. Both the thumbnail strip and the colourway grid set it.
  - Purchase action by type: finished good → Add to cart (with a quantity
    stepper), enabled only when the **selected** colourway is in stock; fabric
    with any in-stock colourway → Request order; fabric all out of stock →
    Request backorder + lead-time note. Request buttons link to
    `/order-request?product=<slug>&sku=<selected>[&backorder=1]` — the form
    preselects that SKU.
  - Add to cart stores the selected colourway's SKU, name and image (see Cart).
  - Price rendering is the shared `priceInfo()` in `src/lib/catalogue.js`.
  - **Maison layout** (design: "Maison Product"): `1.15fr / 1fr` with a 4.5rem
    gutter; a squared 4/5 hero over 64px thumbnails; on the right a brass rule, a
    single brass `Fabric · {House}` eyebrow (the house is no longer a second line
    under the title), the display name with its **last word in italic**
    (`splitDisplayName` — a one-word name stays upright, since italicising the
    whole thing reads as a different product), the selected colourway, the claret
    mono price with `/ metre` for cloth, the action row (`Request order` +
    underlined `Request a cutting`) and the spec sheet as shared `.spec-rows`.
    The range repeats below under a brass "The range" eyebrow and a spelled-out
    count ("Six *colourways*", `countWord()`).
  - **The hero crossfade needs no second `<img>`**: `previousHero` is a ref
    written in an effect (after paint), so during the render that changes the
    hero it still holds the outgoing image — painted as `.detail-hero-frame`'s
    background while the incoming `<img>` (keyed by src, so React remounts it)
    fades in over the top. Reading the ref in render is deliberate; writing it
    there would break under StrictMode's double render.

- **`/` (home)** — merchandising, built at build time from the live catalogue
  via `safeFetch` (never throws → the API being down yields empty sections and a
  successful build, which is the rule for every storefront page). The build-time
  fetch is anonymous, so **no trade pricing is ever baked into the homepage** —
  trade figures only appear on the live islands.
  - **Maison section order** (design: "Redesign A Maison"), `<Layout bleed>`:
    full-bleed 74vh collection hero → four-tile category wall → collection story
    (two columns) → espresso maisons index → journal. The old product grids
    ("Ready to ship", "The cloth") are gone: the Maison home is editorial, and
    the library is where designs are browsed.
  - **Three seasonal constants are hand-edited, by design**: `HERO`, `STORY` and
    `CATEGORIES` in the frontmatter, alongside `Header.astro`'s `FEATURE` and
    announcement copy. There is no CMS field behind a season yet, and those five
    places are the whole list. Every `href` is a real route with a real filter key
    (`/products?product_type=fabric`, `?application=Wallcovering`,
    `?brand=atelier-textiles-nz`) that `ProductLibrary` reads from the URL, so no
    tile can land on an empty grid.
  - **Photography is claimed, not just picked.** `claimImage(predicate)` tracks
    which `image_url`s are already spoken for, so the hero, the story and the four
    tiles get six *different* photographs; without it a 48-row catalogue lands the
    same image in every block, which looks like the design from a distance and
    nothing like it up close. Hero and story claim first (the design names them).
  - The maisons band lists the twelve international houses we hold the **most
    designs** from, counted off the already-fetched catalogue (48 rows against a
    100 limit, so the counts are exact) — alphabetical order buried Pierre Frey
    and Rubelli below houses with one design each.
  - `est. YYYY` beside a house comes from `foundedYear()` in `src/lib/houses.js`,
    which reads the year out of the house's **own story text** ("Founded 1935…").
    Only 3 of 27 stories state one; the rest show their country alone, which is
    what the design degrades to. A hardcoded date table was rejected: it would
    drift from, and could contradict, the client's own copy.

- **`/404`** — `src/pages/404.astro`, static, routes back to the library, contact
  and order lookup.

- **`/cart`, `/checkout`, `/checkout/success` (US-019)** — the B2C card-checkout
  flow, all `client:load` islands reading the client cart. `/cart` (`Cart.jsx`)
  edits quantity / removes lines / shows subtotal. `/checkout` (`Checkout.jsx`)
  has a shipping-zone selector (the three fixed NZ zones: Auckland / North
  Island / South Island), fetches a **live** quote from
  `GET /shipping/quote?zone=&qty=`, shows the total, and "Pay by Card" POSTs
  `{ lines: [{ sku, qty }], zone }` to `POST /checkout/session` then
  `window.location.href = body.url` (redirect to Stripe). **No prices are sent**
  — the API re-resolves them. The cart is NOT cleared on redirect, so Stripe's
  `cancel_url` (`/cart`) returns to an intact cart. **The store collects no
  delivery details itself** — Stripe collects the NZ shipping address and phone
  on its own page (`shipping_address_collection` / `phone_number_collection`,
  set API-side) and the webhook persists them onto the order; the checkout page
  just says so. A failed `POST /checkout/session` surfaces the API's message
  inline, which for the common case names the SKU and how many remain in stock.
  `/checkout/success`
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

- **Site chrome (Maison)** — `Header.astro` / `Footer.astro` / `chrome.css`,
  built from `MaisonHeader.dc.html` and `MaisonFooter.dc.html`. The header is
  an espresso announcement bar over a paper row: inline ATELIER TEXTILES
  wordmark left, uppercase nav centre, Search + AccountNav + CartIndicator
  right. The footer is an espresso band using the dark-ground tokens
  (`--brass-light` for links, `--line-dark` for its one hairline).
  - **The mega-menu is deliberately not a React island.** `src/lib/mega-menu.js`
    is a DOM controller imported by a `<script>` in `Header.astro`. Its columns
    are real links that must be in the served HTML for crawlers and no-JS
    visitors, and an island would have moved them into a client bundle. The
    logic lives in `lib/` rather than inline so ESLint still covers it (`.astro`
    files are not linted).
  - **The trigger is an `<a href="/products">`, not a `<button>`** — with JS off
    or on a touch device it still navigates, so nothing calls `preventDefault`;
    opening the panel is purely additive. Below 1025px the panel is
    `display: none` and `initMegaMenu` returns before binding, so the trigger is
    an ordinary link and `aria-expanded` never lies.
  - The panel is `position: absolute` against `.site-header`. **Nothing between
    the header and the panel may be positioned** or the full-width overlay
    collapses to the nav item.
  - Nav labels are the design's, not the routes': The Houses → `/brands`,
    Journal → `/resources`, The Maison → `/story`. There is no Home item — the
    wordmark is the way home. Mega-menu destinations use only filter keys
    `ProductLibrary` actually reads (`product_type`, `application`), so no entry
    can land on an empty grid.
  - The announcement copy and the mega-menu feature card ("Carrousel — Pierre
    Frey") are **hardcoded seasonal merchandising** with no CMS field behind
    them; they are the two places in the chrome needing a hand edit each season.
  - Footer departs from the mock with four link columns rather than three:
    Showrooms, phone, email and social are real `src/lib/site.js` details that
    postdate the mock, and dropping them to match it would lose content.

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
  `formatMoney`. An expanded card also shows the **delivery address and phone**
  Stripe collected (`order.shipping_address` / `order.contact_phone`, flattened
  by the plain `addressLines()` helper — a called function, not a JSX
  sub-component, per the ESLint constraint below). Request-kind orders carry
  neither, so the block is simply absent.

- **`/admin`, `/admin/brands`, `/admin/products` — catalogue admin** — staff
  create/edit brands, collections, products and colourways against the
  backoffice-only `/admin/{brands,collections,products,colourways}` JSON
  endpoints. `/admin/index.astro` is a static, island-free hub (three links, no
  data); `AdminBrands.jsx` and `AdminProducts.jsx` copy the `AdminOrders.jsx`
  gate verbatim (`fetchCurrentUser()` → no user `/login?redirect=…`, non-staff
  → `/`) — the island IS the guard, the hub page holds nothing worth guarding.
  `AccountNav.jsx` shows an extra **Admin** link for `backoffice`/`director`;
  that is a convenience shortcut, NOT access control.
  - **Slugs are server-generated and immutable**, so no slug input exists and
    PATCH bodies must not carry one (the API 400s it). Same for `product_type`
    (the inventory unit is derived from it) — both render read-only in the edit
    form.
  - **PATCH sends only changed fields.** The API 400s an empty PATCH body, so an
    empty diff is a client-side no-op ("No changes to save."), never a request.
    Blank text inputs become `null` (clear the column), not `''`.
  - Money is entered in **dollars** and sent as integer cents
    (`Math.round(Number(v) * 100)`); `hex_tones` is a comma-separated
    `#RRGGBB` text input parsed and validated client-side into a jsonb array.
  - SKUs are typed by hand (no generator); a duplicate returns 409 and the
    message renders inline. Creating a colourway auto-creates its inventory row
    at qty 0 server-side — **stock levels are not editable here**, that stays in
    the AdminJS `/panel`.
  - Shared view helpers (`toneList`, `PRODUCT_TYPE_LABELS`) come from
    `src/lib/catalogue.js`, not re-declared per island.

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

**Query with `getCollection('brandPage')` / `render(entry)`** — the content
layer is available at request time too, so these queries work on the on-demand
brand pages below. Entry `id` is the filename slug.

**`/brands` (`brands/index.astro`)** — API-driven grid of ALL houses via
`safeFetch('/catalogue/brands')` (→ `{ brands }`, offline renders error state),
each card links to `/brands/<slug>`. **`prerender = false`** so a brand created
in `/admin/brands` appears without a rebuild; safeFetch still never throws, so
an API outage renders the error state rather than a 500 — and the build no
longer calls the API at all.

**`/brands/[slug]` (`brands/[slug].astro`)** — **`prerender = false`**;
`getStaticPaths` is gone. Resolved per request from three sources:
- **Brand** via `apiFetch` — deliberately NOT `safeFetch`, because the two
  failure modes need different handling. `ApiError.status === 404` means "no
  such brand"; anything else sets `apiDown`. That distinction is the whole
  point: an outage must never turn a real brand into a 404.
- **Editorial**: `getEmdashBrandPage(slug)` first, then the markdown `brandPage`
  entry (`entry.data.brand === slug`) — **only when the CMS has nothing**.
- `relatedPosts` (posts whose `brands` include the slug) moved from
  `getStaticPaths` to request time, logic unchanged.

Derivation chain: `name = brand?.name ?? emPage?.name ?? mdPage?.id ?? slug`;
blurb falls back CMS → markdown → `brand.story`; slideshow/cards CMS → markdown
→ empty. Body copy is the CMS `story` rendered with `<PortableText>` from
`emdash/ui`, or the markdown body via `render()`. Related-post links point at
`/resources/<id>`.

**Maison layout** (design: "Maison Brand"), `<Layout bleed>`: full-bleed 58vh
banner (`slideshow[0]`, else the weave) with an eyebrow of
`The Maisons · {country} · est. {year}` → `1.3fr / 1fr` intro, the blurb set as a
Fraunces lede over the body copy with an outlined `Shop {name}` beside the facts
list → 4/5 collection tiles with scrim labels and a description under each →
espresso related-reading band using the shared `.index-list`.
- `slideshow[1..]` is no longer rendered as a scrolling gallery (the design has
  one banner). Nothing is lost on the seeded page: the collection cards carry the
  same three images as their `featuredImage`.
- The **facts list** is `Founded` / `Made in` / `Designs held` / `Held at
  Atelier`, not the mock's rows. Founded comes from `foundedYear()` (the story
  text, see home above) and is omitted when the story states none; `Designs held`
  is `meta.total` from a `safeFetch` of `/catalogue/products?brand=<slug>&limit=1`
  — a safeFetch because this page must render with the API down and the brand may
  be editorial-only. The mock's "Archive: 25,000+ documents" is Pierre Frey copy
  with no field behind it, so it is not invented for every house.

**404 rule:** `!brand && !apiDown && !emPage && !mdPage`. So an API 404 with an
editorial page still renders (preserving the old `getStaticPaths` UNION
behaviour), and an API outage renders whatever editorial exists — offline-safe.

**Precedence: EmDash WINS over markdown here**, deliberately diverging from
`/resources`, where markdown wins. Brand pages were handed to the CMS as the
editor of record (that is the point of wiring them through EmDash at all), while
the markdown files stay the offline baseline shipped in the repo; posts are the
other way round because the markdown journal is the curated, reviewed set.
Precedence is per PAGE, not per field — the markdown entry is not even loaded
when a CMS page exists, so a page is never a confusing hybrid of both sources.

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
manage journal posts and brand pages without a deploy. It is **additive** —
markdown collections (above) remain the shipped baseline.

- **Server mode:** EmDash injects on-demand routes, so `astro.config.mjs` uses
  `output: 'server'` + `@astrojs/node`. **Every storefront page therefore MUST
  keep `export const prerender = true`** (first line of frontmatter) or it stops
  being static — new pages need it too. The ONLY pages that render on demand are
  `/brands`, `/brands/[slug]`, `/products/[slug]`, `/resources`,
  `/resources/[slug]` (plus EmDash's own routes). Anything else appearing in the
  on-demand set is a silent-SSR regression: `npm run build` prints the
  prerendered routes, and `find dist/client -name '*.html'` is the check.
- **Config:** `emdash({ database: sqlite({ url: 'file:./data/emdash.db' }),
  storage: local({ directory: './data/uploads', ... }) })`. `data/` and
  `emdash-env.d.ts` are gitignored — local content is never committed.
- **Live collection:** `src/live.config.js` registers the `_emdash` loader.
- **Schema lives in `.emdash/seed.json`** (committed), applied with
  `npm run seed:cms` (`emdash seed --database ./data/emdash.db --uploads-dir
  ./data/uploads` — the CLI defaults `./data.db` / `./uploads` are wrong for
  this repo, so never run bare `npx emdash seed`). Idempotent; on an existing DB
  expect `Collections: 1 created, 2 skipped`. Astro reads the file into a
  virtual module at startup, so **restart the dev server after editing it**.
  - **CAVEAT: a user seed SHADOWS the built-in default, it does not extend it.**
    `virtual:emdash/seed` sets `seed = userSeed` whenever `.emdash/seed.json`
    exists, so the `posts` and `pages` definitions in our seed are load-bearing
    verbatim copies of `node_modules/emdash/dist/default-*.mjs` — delete them and
    a fresh environment gets no Posts/Pages collection at all. Re-diff on every
    EmDash upgrade.
  - Repeater sub-fields go under **`validation.subFields`**, not a top-level
    `subFields` key (`{ slug, label, type, required? }`, where `type` may be
    `image`). Collection and field slugs must match `^[a-z][a-z0-9_]*$` —
    underscores, never hyphens (hence `brand_pages`, `collection_cards`).
- **Reads go through `src/lib/emdash.js`** (`listEmdashPosts` / `getEmdashPost` /
  `listEmdashBrandPages` / `getEmdashBrandPage`), which NEVER throw — an
  empty/absent CMS yields the markdown baseline, keeping builds offline-safe.
  `getEmDashCollection(name)` → `{ entries }` (entry has `.slug` + `.data`);
  `getEmDashEntry(name, slug)` → `{ entry, ... }` (unwrap `.entry`). Post fields
  live under `entry.data` (`title`, `excerpt`, `featured_image`, `content`
  (portableText), `publishedAt`); brand-page fields are `title`, `blurb`,
  `slideshow`, `collection_cards`, `story`, normalised by `normaliseBrandPage`
  to the same names the markdown `brandPage` collection uses.
- **Media URL gotcha:** an image/file field holds a MediaValue OBJECT and the
  property carrying the URL is **`.src`**, not `.url` — the live loader rewrites
  a bare storage key to `/_emdash/api/media/file/<key>` and leaves it in `.src`.
  `mediaUrl(value)` checks `url ?? src ?? previewUrl` and returns null for
  anything else. The old `heroUrl` checked only `.url`, so **every EmDash post's
  featured image was being silently dropped**; `mediaUrl` replaced it and fixed
  that as well as powering the brand-page slideshow.
- **Portable Text** bodies render with `import { PortableText } from 'emdash/ui'`
  → `<PortableText value={blocks} />`. `/resources/[slug]` uses it for a CMS
  post's `content`; before that it fell back to the excerpt and dropped the body.
- **`/resources`** merges markdown + published EmDash posts (markdown wins on
  slug); **`/resources/[slug]`** resolves markdown-first then EmDash, else 404.
  Both are `prerender = false`. **Brand pages invert that precedence** (EmDash
  wins) — rationale in the US-024 section above.
- **`brand_pages` entry slug MUST equal the atelier-api brand slug** — that is
  the only key joining CMS editorial to the live catalogue brand.
- **Admin:** http://localhost:4321/_emdash/admin (first run → `/setup`,
  passkey auth). Dev-only headless bootstrap + API token:
  `GET /_emdash/api/setup/dev-bypass?token=1`.
- **MCP server:** `POST /_emdash/api/mcp` (Streamable HTTP, `Authorization:
  Bearer <token>`) — see `README.md`.
- Beta rough edges + workarounds: `tasks/emdash-blockers.md`.

## Cart

Client-side cart lives in `localStorage` under key `atelier_cart` (array of
`{ sku, name, qty, price_cents, currency }` plus the optional merchandising
fields `colourway`, `brand`, `slug`, `image_url` — added so a cart row can show a
thumbnail, the house, the colourway and a link back to the product). Every
merchandising field is optional: a cart written before they existed still renders,
just without the thumbnail or link. **Write path: `src/lib/cart.js`**
(`addToCart(item, qty)` merges by SKU, `readCart()`, `CART_EVENT`). Every write
dispatches a same-tab `atelier-cart-change` event (`CART_EVENT`) because the
native `storage` event only fires in OTHER tabs. `CartIndicator.jsx` listens to
BOTH `storage` and `CART_EVENT` so the header count updates instantly after an
Add to cart in the same tab; it counts through the shared `cartCount()` and
compares against the exported `STORAGE_KEY` rather than re-implementing either. Write helpers: `addToCart` (US-018), plus
`setCartQty(sku, qty)` (qty ≤ 0 removes), `removeFromCart(sku)`, `clearCart()`,
and read helpers `cartCount(items?)` / `cartSubtotalCents(items?)` (US-019). Any
island that mutates the cart MUST go through these so the header stays live. The
cart only ever holds finished goods (fabrics use the order-request flow).

## Staging gate (server.mjs)

The deployment at atelier-storefront.disrupted.co.nz is staging: whole site
sits behind HTTP Basic Auth and is blocked from search indexing.

- `npm start` runs **`server.mjs`** (Express), not the adapter entry — the
  node adapter is in **`middleware` mode** (`astro.config.mjs`). Reason: in
  standalone mode prerendered pages are served as static files *before* any
  Astro middleware, so an app-level gate can't cover them. Consequence:
  `astro preview` is unavailable; `astro dev` is ungated (local only).
- `SITE_AUTH_USER` / `SITE_AUTH_PASS` (runtime env, `.env` via dotenv):
  Basic Auth credentials. Comparison is a single timing-safe check over
  `user:pass`. Unset (and no `SITE_AUTH_DISABLED=true`) → the server still
  boots but answers **503 with the reason** on every path, exemptions included.
  It deliberately does NOT exit: under pm2 that is a crash loop, and the
  operator sees only a bare 502 from the proxy. 503-while-up is equally closed
  and says why in the browser.
- **Deploy needs `npm ci` and a rebuild**, not just `git pull` + restart:
  `express`/`dotenv` are runtime dependencies, and a `dist/` left over from the
  standalone build makes the adapter try to bind the port itself (harmless
  `EADDRINUSE` noise — Express wins the port — but the build is stale).
  Cloudflare fronts the site and EmDash's robots route sets `max-age=31536000`,
  so **purge the cache** or the old `Allow: /` survives the deploy for a year.
- Gate exemptions: `/robots.txt` (crawlers must read the Disallow) and
  `/_emdash/api/*` — EmDash enforces its own auth there (Bearer token for MCP,
  passkey session for admin API) and a Basic gate would clash with the
  `Authorization` header those clients send. Note this leaves EmDash media
  files (`/_emdash/api/media/file/...`) publicly fetchable by URL.
- **Exemption matching is path-normalisation sensitive** — two bypasses were
  found and fixed while building it, so do not "simplify" it back:
  match on `new URL(req.url).pathname`, never `req.path` (Express keeps `..`
  segments, so `/_emdash/api/../../resources` looked exempt and Astro then
  served `/resources`), and refuse to exempt any URL containing `%2f`/`%5c`
  (`express.static` decodes them, so `/_emdash/api/..%2f..%2f_astro/app.js`
  cleared the prefix check and served a file outside the exempt subtree).
  Both fail closed. Re-test both vectors if the exemption list changes.
- **Noindex is three layers, one flag**: `ALLOW_INDEXING` (unset = staging).
  `src/pages/robots.txt.js` (prerendered; defining it in `src/pages/` makes
  EmDash skip its injected `Allow: /` robots route), noindex meta in
  `Layout.astro`, `X-Robots-Tag` header in `server.mjs`. robots.txt + meta are
  baked at **build** time — launch needs the flag in build AND runtime env,
  then a rebuild. EmDash's injected `/sitemap.xml` stays behind the auth gate.

## Env

Copy `.env.example` to `.env` (gitignored): `PUBLIC_API_BASE_URL`, `SITE_URL`,
plus the staging-gate vars above.

`SITE_URL` is the public origin of the deployment. `astro.config.mjs` reads it
with Vite's `loadEnv` (`import.meta.env` is NOT available in a config file) and
passes it to Astro's `site`, which `Layout.astro` uses for `<link
rel="canonical">` and `og:url`. It is **build time**: unset, those URLs bake as
`http://localhost:4321`, so it belongs on the launch checklist beside
`ALLOW_INDEXING` — set both in the build env and rebuild.
