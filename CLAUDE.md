# atelier-store

Astro + React-islands storefront. Reads products / inventory / brands / orders
from **atelier-api**. Plain JavaScript (no TypeScript), ESM.

## Run

- `npm run dev` — dev server on **http://localhost:4321** (port pinned in
  `astro.config.mjs`, kept off the API's 3001 so both run together).
  - **GOTCHA — every React island renders BLANK after a build.** `npm run build`
    and `astro dev` share `node_modules/.vite`, and the build re-optimises the
    deps with `NODE_ENV=production`. `react/jsx-dev-runtime` then resolves to
    `react-jsx-dev-runtime.production.js`, whose `exports.jsxDEV = void 0`, so
    the dev server serves islands that throw **`Uncaught TypeError: _jsxDEV is
    not a function`** on hydration. The SSR HTML is correct and the page looks
    fine in `curl` — React just empties every `<astro-island>` after it renders,
    so the login form, the header account/cart icons and the whole product
    library silently vanish, and it reads as a CSS or component bug.
    **Fix: `rm -rf node_modules/.vite` and restart the dev server.** Production
    is never affected (it compiles to `jsx`, not `jsxDEV` — `grep -rl jsxDEV
    dist/client/_astro` returns nothing), so do not go looking for it in a
    build.
- `npm run build` — static build to `dist/`. Build runs page frontmatter, so any
  build-time `safeFetch` call executes; the API being down must NOT fail the
  build (see fetch helper below).
- `npm run lint` — ESLint over `.js/.jsx/.mjs` only.
- `npm test` — `node --test "src/**/*.test.js"`. Node's built-in runner, **no
  test dependency**: the store ships no test framework and adding one for a
  handful of pure helpers is not worth the install. Only the pure modules under
  `src/lib/` are covered (no DOM, no fetch, no React) — anything needing a
  browser belongs in an end-to-end run against a live API, not here.

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
    `RequestList.jsx`). `.message` is still the human-friendly fallback.
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
    aligned with the header wordmark and the footer. Users: `/` (every band —
    the whole home is bands), `/login` (the sign-in photograph), `/products`
    (linen page-header band) and `/brands/[slug]` (banner + collection tile wall
    + related reading). Every other page keeps the centred container.
  - **`overlay`** (default false) floats the header over the page's FIRST band
    and reverses its type to bone — the 2026 direction's treatment for a screen
    that opens on a full-bleed photograph. It only makes sense together with
    `bleed` (a contained page has paper under the header), and the page owns the
    consequence: its opening band has to be tall enough to hold the header plus
    its own copy, which is why `.home-hero` is 88vh and `.house-banner` 78vh
    rather than the 74/58vh they were when the header sat above them. Users:
    `/` , `/login`, and `/brands/[slug]` **only when the house has banner
    photography** — a house with none renders the umber band variant, which is
    the page ground, so the header sits on it in the paper theme instead.
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
  - **Userback** (client feedback widget, added Aug 2026) sits beside it, gated
    on `PUBLIC_USERBACK_TOKEN` alone — no second flag: unset the token and the
    branch renders nothing and fetches nothing from Userback's CDN. It is the
    widget ACCESS token, designed to ship in public page source, hence the
    `PUBLIC_` prefix; the API key is a different value and does not belong here.
    It is Userback's own async loader snippet, not `@userback/widget`: the
    config goes on `window.Userback` (`access_token` + `widget_settings`) and
    the CDN script is appended after it and **self-initialises from that object
    as it boots** — there is no `Userback.init()` call to order against, which
    is why the settings must be assigned BEFORE the append. Nothing enters the
    bundle, nothing blocks paint, and a launch with no token contacts Userback
    not at all. **BUILD TIME** like `PUBLIC_AGENTATION`, so it joins the same
    launch checklist — and the token is committed in `.env.example`, so every
    environment that copies the template gets it (a staging box still needs its
    own `.env` updated and a rebuild).
    - **The launcher is lifted 76px** so it sits ABOVE the Agentation bubble
      instead of on top of it, and `widget_settings.position` is forced to `se`
      because "above Agentation" only means anything with both launchers in one
      corner. Measured in a browser: both park at `bottom: 1.25rem; right:
      1.25rem`, Agentation's collapsed bubble is 44px (top edge 64px) and
      Userback's is 48px, so they land exactly on each other — and Userback wins
      outright, z-index **2147483644** against Agentation's 100000, which is
      why the Agentation toolbar simply vanished. 76px clears it by 12px.
      - **The handle is `.userback-button` (add `.userback-button-se`), NOT the
        `.userback-button-container` Userback's own "overwriting CSS" page
        points at.** That wrapper is a zero-height full-width div that does not
        move the launcher at all; the button inside carries its own
        bottom/right. Scoping to `-se` means changing the placement in the
        Userback dashboard cannot leave a stray offset behind.
      - The lift is emitted ONLY when Agentation is also rendering — and it must
        be `<style is:inline>`: Astro extracts a plain `<style>` into the page's
        CSS bundle **regardless of the condition around it**, so a bundled rule
        would also lift the launcher on a build that has no Agentation under it.
        `!important` because Userback's own sheet sets the `bottom`.
  - **Do not verify the toolbar's absence by filename.** The old note claimed
    `ls dist/client/_astro | grep -i agent` came back empty; it does, but only
    because Astro names the chunk after the package entry (`index.mjs` →
    `index.<hash>.js`). Astro collects `client:*` directives by **static template
    scan**, so the ~420 kB toolbar chunk is emitted into `dist/client/_astro/`
    even when the runtime branch is dead — it is simply never requested. Grep
    chunk *contents* (`grep -ril agentation dist`), and confirm no server chunk
    references `Agentation` (`grep -rl Agentation dist/server`) — that second
    check is the one that proves it never renders.
- **Styling** is the hand-built Atelier design system, and it runs **TWO
  directions at once**. Which one a screen wears is not a matter of taste — it
  is which handoff has drawn that screen.
  - **2026 / Figma** (file `6iMAmsNk2HkmhfuqAimM5P`, "Atelier"), since the
    **August 2026 redraw**: the SITE CHROME, `/` , `/products` (9379:2732),
    `/products/[slug]` (9422:4321), `/brands` (9379:3562), `/brands/[slug]`
    (9379:2647), `/story` (9436:3043) and `/login` (9350:361). Grotesk display
    type, `--shell` cream ground (#f9f4ed since the redraw), `--umber` dark
    bands (#18100c), `--ochre` accent (#8b6746), the underlined text action —
    and, NEW with the product-detail frame, real buttons: the filled tan
    `.action-fill` and hairline `.action-outline` (direction-2026.css). The
    old "no button anywhere" rule described the pre-redraw frames only.
  - **Maison redesign** (`~/Documents/atelier-platform-demo/Atelier-storefront redesign (1).zip`
    → `design_handoff_maison_redesign/`): now historical — the library, the
    product detail and the brands index moved to the 2026 frames above. Its
    vocabulary (`primitives.css`) still dresses what nothing has redrawn.
  - **The earlier platform handoff** (`design_handoff_atelier_platform/`) still
    covers everything neither set has drawn: cart, checkout, the trade
    application, the journal, contact, account.

  Plain CSS, no framework, no build step beyond Astro.
  - **The chrome follows the NEWEST direction, and page bodies catch up screen
    by screen.** That is the rule that keeps this coherent: the header and
    footer are the one thing every page shares, so they wear the 2026 design,
    and a Maison page renders under it until it too is redesigned. The reverse —
    two chromes on one site — was considered and rejected.
  - `--font-grotesk` leads with Helvena, the licensed face the Figma sets, and
    falls back to Inter — which is what the mock's letterforms read as and is
    already loaded, so no new font is fetched. Dropping the licensed file into
    the stack is the only change needed to switch.
  - **Maison globals, adopted in `tokens.css`/`primitives.css`** — these are the
    reason the whole site reads as one design rather than four redesigned pages:
    `--container: 96rem` + `--gutter: 3rem` (the mocks' `max-width:96rem;
    padding:0 3rem` section frame, header and footer included), radii `0`
    (`--r-sm/--r-md/--r-chip` are kept as names but all resolve to 0 — squared
    corners everywhere), and `.btn` = 48px (`.btn-lg` 50px), uppercase Inter 600
    13px / .12em, outlined ink inverting to ink-on-paper on hover, or filled
    claret. `.btn-paper` is the on-photograph variant; `.link-cta` /
    `.link-cta-paper` the underlined uppercase text action beside it.
  - **Each direction has ONE vocabulary sheet, and they must not be mixed.**
    - **Maison → `primitives.css`**: `.brass-rule` (the 34px opener),
      `.eyebrow-brass` / `.eyebrow-wide` (.26em tracking), `.band-dark`
      (+`-head/-link`, espresso band), `.index-list` / `.index-name` /
      `.index-meta` (hairline rows, restyled automatically inside `.band-dark`),
      `.scrim-tile` (+`-label`) and `.spec-rows` (label left, mono value right).
      (`.bleed-hero` was here; it went when the house page stopped using it and
      left it with no callers.)
    - **2026 → `direction-2026.css`**: `.cta-underline` (+`-lg` / `-light`),
      `.action-fill` / `.action-outline` (the August 2026 redraw's buttons —
      filled `--tan`, hairline outline; 16px Inter medium on 16/20 padding),
      `.badge-ochre` / `.badge-light` (12px semibold
      label), `.photo-band` (+`-body/-row/-aside/-title/-title-sub`, a full-bleed
      background photograph with a bottom scrim and absolutely positioned copy)
      and `.tile-wall` / `.tile` (+`-body/-title`, the 2-up 626×700 photo tiles
      at 8px off the page edge with a 12px gutter — the home's two shop banners
      AND the house page's collection grid, the same figure at the same size in
      both frames).
    - **Do not promote a figure across.** They share the shell (`.container`,
      the tokens file, the reset) and nothing else, so a figure moved into
      `primitives.css` restyles pages nobody redesigned.
  - `src/styles/global.css` is the **only** file the layout imports; it is just
    the `@import` manifest, in cascade order:
    `tokens` → `primitives` → `direction-2026` → `chrome` → `home` → `library` →
    `product` → `commerce` → `auth` → `editorial` → `houses`. Add a new area as
    its own file and import it here rather than growing one giant sheet.
  - `tokens.css` holds BOTH palettes — Maison (`--paper --surface
    --surface-deep --ink --ink-soft --muted --muted-soft --line --accent
    --accent-soft --brass --sage --clay`) and 2026 (`--shell --umber
    --umber-soft --bone --ochre --gold`, plus the rule/muted families
    `--shell-line-soft/-line/-line-strong --shell-muted --umber-line
    --bone-soft --bone-muted`, each of which is the Figma's own
    `color/border/*` and `color/text/muted` resolved against its ground) — the
    type scales (`--t-*` UI, `--d-*` Fraunces display, `--g-xl`/`--g-lg` the
    2026 grotesk display), the spacing scale (`--s1`…`--s10`), container widths,
    radii, shadows and durations. **Use the tokens; do not hardcode a hex.**
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
  - `priceInfo(product, viewer)` → `{ label, text, muted, indicative, retail }`.
    FR-3 precedence: `trade_price_cents` (only ever sent to an approved trade
    user, so if it arrived, show it, with the visible retail struck through
    beside it) → `price_hidden` or no retail price → a `NO_PRICE_COPY` line
    **chosen by the viewer** → retail.
    **`trade_price_cents` is NZD cents**, while `products.currency` is the
    supplier's currency and belongs to `retail_price_cents` — formatting the
    trade figure with the product currency rendered NZ money as "US$187.76".
    `TRADE_CURRENCY` is the constant; do not pass `product.currency` there.
    `indicative: true` drives the small muted "Indicative" annotation the design
    system puts beside every monetary figure.
  - **`viewer` is the `/auth/me` user (or null) and only ever picks COPY** — it
    never derives a figure the API response did not carry, so it cannot leak a
    price. It exists because most of the catalogue has no visible price (every
    international house hides retail, and only fabrics carry a trade figure), so
    the no-price line is what most cards actually show: "Sign in for trade
    pricing" is right for a guest and wrong for everyone else. On the seeded
    catalogue an **approved** trade account was being told to sign in on 32 of
    48 products. Lines: guest → sign in; `role='trade'` not yet approved →
    "Trade pricing once approved"; anyone else signed in (customer, staff, or an
    approved trade user looking at a product with no trade figure) → "Price on
    request". Guarded by `src/lib/catalogue.test.js`.
  - **`src/lib/account.js`** (pure, no fetching — `src/lib/auth.js` owns the
    request) turns that user into `tradeStatus(user)` → `none|pending|approved`,
    `isApprovedTrade(user)` and `tradeStatusNote(user)`. Approval is manual and
    the API sends no notification, so the account page renders the note: without
    it a pending trade account is indistinguishable from an approved one, since
    both simply see no trade prices.
  - **Both product islands resolve the viewer in the same `Promise.all` as the
    product fetch**, not in a second effect — a later `setViewer` would repaint
    the price block after first paint. `ProductDetail` starts `viewer` at null
    because the server render has no cookie, so anything else fails hydration.
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
  *collections*") and falls back to digits past that. `houseMeta` is now
  `/brands`'s alone — the homepage's maisons band went with the redesign. It
  also carries what `/brands` puts "in focus": `featuredHouses()`,
  `houseArtwork()` and `FOCUS_SLOTS` (see `## Featured`), guarded by
  `src/lib/houses.test.js`.
- **`src/lib/home.js`** — the homepage's own rules (`collectionHref`,
  `pickCollections`, `bandPhotographs`, `brandDesignCounts`, `houseLabel`),
  guarded by
  `src/lib/home.test.js`. See the `/` section under Pages for what each one is
  protecting.

### The trade gate (`src/lib/tradeGate.js`)

`brands.trade_only` (API-side, defaulting CLOSED) decides **which houses'
designs a viewer may see at all**. A signed-out visitor browses only the house's
own workroom, `atelier-textiles-nz`; every maison Atelier represents is reserved
for approved trade — and for **staff**, who have to be able to check the live
storefront.

- **It is NOT the trade PRICING gate.** `priceInfo()`/`trade_price_cents` is
  approved trade ALONE (staff never receive it) and decides what a figure says;
  this gate decides whether a design is on the site, and staff DO pass it. A
  shopper can be past one and not the other, so **neither may be derived from
  the other** — read the API's own answer in both cases.
- **The gate is silent unless it is named**, which is the only reason this
  module exists: a gated grid just looks small, and every represented house's
  page reads as though Atelier held nothing from it. `TRADE_GATE_COPY`
  (`library` / `design` / `house`) is the one voice all four surfaces speak in,
  plus `TRADE_GATE_PAGE` for the 403's head tags.
- `isTradeGateError(err)` — a **403** carrying `body.trade_only === true`.
  Duck-typed on `.status`/`.body` so the module never imports `lib/api.js`; a
  404 stays a 404 and an outage stays an outage (inviting someone to apply for a
  trade account to fix a typo would be worse than either).
- `isTradeGatedList(body)` — `meta.trade_gated === true` on
  `GET /catalogue/products`. **Strict**, so an older API or an unparsed body
  reads as "not gated": announcing a gate that is not there is worse than
  silence, and silence is what the surfaces already did.
- `signInHref(path)` — `/login?redirect=…` under LoginForm's own acceptance rule
  (same-site absolute path, `//` refused), so the link can never be one that
  island would then throw away.
- Pure — no DOM, no fetch, no React; the `.astro` pages import it in frontmatter
  and the islands in the browser. Guarded by `src/lib/tradeGate.test.js`,
  which also asserts no gate copy offers the standard account the storefront no
  longer has.

Where it surfaces:
- **`/products`** — `ProductLibrary.jsx` reads `meta.trade_gated` off the same
  response it already keeps `products` from and renders `.library-gate` above
  the grid. Never shown to an entitled viewer: the API sets the flag false for
  them.
- **`/products/[slug]`** — a THIRD frontmatter outcome beside 404 and `apiDown`.
  The page answers **403** and hands `tradeGated` to the island; a genuine 404
  still 404s and an outage still falls through to the island untouched.
- **`ProductDetail.jsx`** gained a `gated` status and **owns the panel**, which
  is why the island is still mounted on a gated page. The frontmatter fetch is
  anonymous (Astro's server fetch carries no browser cookie), so "gated" there
  means "gated for a guest"; the island's credentialed refetch is the one that
  can disagree, and when it succeeds the shopper must end up on the product. A
  second copy of the panel in the `.astro` would still be sitting above it.
  A 403 from the island's own fetch renders the panel, never `.error-state`.
- **`/brands/[slug]`** — `brand.trade_only` alone (no viewer test: this page has
  no viewer) renders `.house-trade`. Without it a represented house shows no
  design count and no "View all products", and reads as a house we hold nothing
  from. An entitled shopper sees the note too, so it is worded as how the house
  is held, not as a refusal. (The collection tiles are no longer part of that
  list — they render off `/catalogue/collections`, which the gate does not
  touch, so a gated house still shows its wall.)
- **`/brands`** — its counts and its "in focus" photography come from an
  anonymous product list, i.e. the public subset. Nothing prints a nought (both
  were already `> 0`-guarded). The strip is the office's `featured_rank` choice
  now (see `## Featured`), so the gate no longer decides WHICH houses are in it —
  only whether each one has a photograph, and most do not, which is why an
  unphotographed house paints the weave ground rather than being dropped. The
  heading still counts what is actually in the strip, so a one- or two-house
  choice reads as an edit — hence the singular/plural.

## Pages

- **`/products` (US-017)** — `src/pages/products.astro` renders `ProductLibrary.jsx`
  as a single `client:load` island. **2026 direction since the August 2026
  redraw** (Figma "Products Page", 9379:2732): the page is `<Layout bleed
  overlay>` opening on an umber hero band (the "Explore" badge, the
  "Collections" display headline, the one line of copy on the right, the header
  floating inside the band), then the browse area — boxed 44px search, "Refine"
  row with an always-present "Clear all", facet lists under ochre 12px heads on
  hairlines ("Brands", "Category", "Price" — the labels are the frame's), boxed selects for
  the rest (no "More filters" group heading any more), and surface-cream cards
  (photo, in-stock chip on the photograph, ochre house badge, 20px Inter-medium
  name, muted spec line, and a price line that doubles as the underlined
  "Sign in for trade pricing" ghost action when there is no visible figure).
  **Client-side pagination**: `CARDS_PER_PAGE` (12, the mock's 3×4 grid) slices
  the filtered list; the row under the grid is page numbers on hairline
  dividers with prev/next arrows, and any filter/search/sort change resets to
  page 1. The island still fetches the whole website
  catalogue once (`GET /catalogue/products?limit=100`; the catalogue is small,
  well under the API max) and **searches, filters and sorts in memory** —
  instant, no page reload, no per-request round trip. Filter options are derived
  from the fetched set (brand uses `brand.slug`/`brand.name`, `product_type` maps
  to friendly labels, other fields are raw strings). Reuse the
  fetch-all-then-filter shape for any small filtered list; switch to the API's
  server-side `q`/`sort`/filter params (they all exist) only if the set ever
  exceeds the API page cap. The colourway swatch strip and the sort/count row
  are KEPT even though the mock's dummy cards do not draw them — working
  merchandising is not dropped for a frame's placeholder content.
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
  - **Layout**: the island is the two-column grid — `16rem` sticky refine
    sidebar + results column — because the facets and the grid share every
    piece of state.
    - `FILTERS` carries a **`control`** field: `list` renders as a
      click-to-toggle facet row with a live count (Brands, Collections,
      Category, Price), `select` as a boxed dropdown with its own ochre head
      (Application, Composition, Size, Lead time).
    - **There is no Type facet and no Width select** (September 2026, the
      office's call): one question about what a thing is, not two, and width
      stays on the card's spec line. `?product_type=` and `?width=` deep links
      no longer filter. A finished good with no category still reads "Finished
      good" on its card — `productClassLabel` is untouched.
    - **Price is a derived facet, not the `price_band` column.** `type: 'price'`
      bands the figure the card shows (`visiblePriceCents` → `priceBandFor`,
      both in `lib/catalogue.js`, tested): "Under $100", "$100–$200",
      "$201–$300", … — the office's bands, so band 1 is closed at both ends and
      every later one starts at the previous ceiling plus one. URL key `price`,
      token `201-300`. Options sort by amount, not label. A product with no
      visible price has no band, so the facet disappears where every price is
      hidden. `products.price_band` ("NZ$486 / m", one string per product) was
      a select that offered one row per product; it is no longer read here.
    - **Both builders drop a control with no options.** `facetLists` always did;
      `selectSets` did not, which is why Size shipped as a dropdown offering
      only "All" while no product carried one. Options come from the whole
      catalogue, so an empty set means the field is unused across it and the
      control could never do anything. A selection arriving by deep link
      survives the drop — it still filters, and "Clear all" is its exit.
    - **`labels` belongs to the FILTER, not to the `enum` kind.** While Type was
      the only enum facet, `optionsFor` reached straight for
      `PRODUCT_TYPE_LABELS`; a second enum would have been labelled with the
      first one's map — which, since it misses on every key, renders each value
      raw while looking like it is labelling nothing at all. Each enum filter now
      names its own map and the lookup is `filter.labels?.[value] || value`.
    - **`category` is the merchandising axis and it is NOT `product_type`.**
      `product_type` (`fabric | finished_good`) exists to decide whether stock is
      counted in metres or in units; a cushion and a throw are both finished
      goods, which is true and useless on a card. The API's vocabulary is nine
      values (`CATEGORIES` in its `scripts/lib/price-template.js`, backed by
      identical CHECKs on three columns). Most of the catalogue is uncategorised
      and `facetLists` drops an empty facet, so the list does not render until
      the office has filled some in — exactly how Collections behaves.
    - **`productClassLabel()` prints the category OR the type, never both.** For
      every fabric they are the same word, so the pair reads "Fabric · Fabric";
      where they differ the category is the specific half. It backs the card
      spec line, the detail eyebrow and the Similar strip, so the three cannot
      disagree about what a design is.
    - **`categoryLabel()` falls back to the RAW value, never to blank.** The
      storefront and the API deploy separately, so this build can be behind the
      vocabulary — and a blank facet row is unclickable, with a count that reads
      as belonging to the row above it.
    - **`collection`** filters on `product.collection?.slug` (label from
      `.name`) — the key the brand-page collection tiles deep-link with
      (`/products?brand=&collection=`). Slugs are unique per brand, not
      globally, so the slug-only match mirrors the API's documented "pair it
      with brand" posture; the tiles always pass both. Most products carry no
      collection (membership is staff-assigned in the CRM) and `facetLists`
      drops an empty facet, so the list only appears once collections are in
      use.
    - `facetOptions()` counts each list option against the search term and every
      **other** filter, never the facet's own selection — so picking a house does
      not collapse the House list to one row, while the counts still track what
      is on screen. An option that can no longer yield a result is dropped unless
      it is the selected one (which must stay clickable to switch off).
    - Facet rows are toggles (`onFacetToggle`): clicking the active row clears
      it; active state is ochre text.
    - Below 1024px the sidebar collapses behind a `.library-filters-toggle`
      button (`filtersOpen` state, `aria-expanded`/`aria-controls`); above it the
      CSS shows the sidebar regardless, so the state is inert there.
  - **`.product-card` is the library's alone** (the home leads with editorial
    bands), and since the redraw it is ALSO borrowed by the product detail's
    "Similar" strip — the base rules in `library.css` are the 2026 card. Two
    Maison base figures still underlie it in primitives.css and are overridden
    per property (`.product-stock`'s pill dot/border, `.product-brand`'s
    uppercase) — check both before restyling either base.
  - **Deviations from the mock, deliberate:** the swatch strip and the
    count/sort row stay (working merchandising over dummy-frame fidelity).
    Width, which the mock drew as four values, is no longer a filter at all.

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
    stepper), enabled only when the **selected** colourway is in stock; fabric →
    **Add to request** (a typed metres field, `.metres-field`, because metres are
    decimal and a − / + stepper is the wrong control). An out-of-stock colourway
    is still added — the button reads "Add to backorder request" and the
    lead-time note stays — because the backorder acceptance is asked once on the
    request page, over the whole list, not per product. Fabric no longer links
    out to a one-product form: it writes to the request list
    (`src/lib/requestList.js`) exactly as a finished good writes to the cart.
  - Add to cart stores the selected colourway's SKU, name and image (see Cart).
    Add to request stores the same plus the colourway's `in_stock` and the
    product's `lead_time` (see Request list).
  - Price rendering is the shared `priceInfo()` in `src/lib/catalogue.js`.
  - **2026 layout** (design: "Individual Product Page", 9422:4321): one
    edge-to-edge surface-cream band (`.detail-band`, the page is `bleed`) —
    photograph left in a subtle hairline, and on the right the ochre
    `Fabric | House` badge (the house links to its page), the grotesk display
    name, the lede (the fabric flow's explainer, moved up from the old
    purchase note), the 24px price with `/ m` for cloth, the Size/Colour
    controls, hairline `.detail-specs` rows (last row unruled), the
    `Flax | PF-ATL-02` selected line and the action buttons. Below the band, a
    **"Similar" strip** — up to four same-house cards fetched by the island
    (`?brand=<slug>&limit=5`, self filtered out), reusing the library's
    `.product-card`, with "View all" into the house's grid. The old "The
    range" swatch wall is gone with the thumbnails.
  - **The hero crossfade needs no second `<img>`**: `previousHero` is a ref
    written in an effect (after paint), so during the render that changes the
    hero it still holds the outgoing image — painted as `.detail-hero-frame`'s
    background while the incoming `<img>` (keyed by src, so React remounts it)
    fades in over the top. Reading the ref in render is deliberate; writing it
    there would break under StrictMode's double render.

- **`/` (home)** — merchandising, rendered ON DEMAND (`prerender = false`) from
  the live catalogue via `safeFetch` (never throws → the API being down yields
  empty sections, which is the rule for every storefront page). On demand since
  the EmDash revamp: the section texts and banner images are CMS-editable (the
  `site_sections` / `collection_banners` collections — see the EmDash section)
  and an edit must show without a rebuild. Every CMS read degrades to the copy
  shipped in the page, so an empty or absent CMS renders the file as written.
  The fetch is anonymous, so **no trade pricing is ever on the homepage** —
  trade figures only appear on the live islands.
  - **Section order** (design: Figma "Atelier Home page", node 7307:617),
    `<Layout bleed overlay>`: full-bleed 88vh collection hero **with the header
    floating inside it** → two shop banners → latest-collections scroller →
    umber "Atelier" manifesto → featured collection → design-houses band. This
    REPLACED the earlier Maison home (tile wall / collection story / maisons
    index / journal), so the maisons band and the journal grid are gone from
    this page; `/brands` is the houses index and `/resources` the journal.
  - **The hero rotates through the featured collections** — one slide each,
    crossfading (`components/CollectionHero.astro` + `.home-hero-*` in
    `home.css`). Things that are load-bearing there:
    - **Each slide carries its OWN scrim** and `.home-hero.photo-band::after` is
      switched off. A slide mid-fade sits at fractional opacity, which makes it
      a stacking context, which drops its `z-index: 1` copy back under a
      band-level scrim — the headline would dim on every rotation.
    - **Rotation is progressive enhancement.** The first slide is `is-active` in
      the HTML, so with no JavaScript the hero is the single-photograph band it
      was before. Off slides are `inert` + `aria-hidden`, so their "View
      collection" link is never a tab stop off-screen. Auto-advance is skipped
      under `prefers-reduced-motion` (the bars still work), and pauses on
      hover / focus / hidden tab.
    - One `<h1>` (visually hidden, on the band) and an `<h2>` per slide: a
      rotating `<h1>` would name whichever collection happened to be showing as
      the subject of the whole page, and three would leave three in the document.
    - `houseLabel()` (lib/home.js) drops the house line when the collection name
      already starts with it — two of the three featured collections are
      "&lt;house&gt; &lt;year&gt;", so "Larsen / Larsen 2024" is the common case,
      not an edge one. Only a PREFIX counts: "India Mahdavi's True Velvet
      Collection" still needs "Pierre Frey" over it.
  - **Art-directed photography ships in `src/assets/img`** (imported, hashed and
    resized by `astro:assets` — NOT `public/`, which this repo does not have).
    The hero's three banners, both shop banners, the featured collection's
    portrait, the manifesto band and the design-houses band are the client's
    commissioned art, and a band the catalogue fills at random cannot be
    art-directed. **Every band on this page is art-directed now** — nothing here
    still draws a photograph from the catalogue. `<Image>` where
    there is an `<img>` to place (hero slides, featured portrait — these get a
    srcset), `getImage({ format: 'webp' })` where the picture is a CSS
    background (the tiles, the manifesto band, the houses band, `/login`).
    The shipped art is the FALLBACK rung since the EmDash revamp: an image
    uploaded against the matching `site_sections` entry replaces a band's
    background, and a `collection_banners` entry overlays the hero/portrait
    registries (`overlayArtwork` in `lib/emdash.js`) — a CMS value is a plain
    URL string, which `collectionArtwork()` renders like a catalogue
    photograph (no build-time srcset; the trade-off for no-deploy edits).
  - The bands are built from the SHARED 2026 figures, not from home-only
    classes: `.photo-band` for the hero / manifesto / houses bands and
    `.tile-wall` + `.tile` for the two shop banners (`direction-2026.css`).
    `home.css` is now only this page's geometry — its heights, the collections
    scroller and the featured split.
  - **The home is merchandised out of `GET /catalogue/collections`, not out of
    the product grid.** Every collection the mock names — Nature's Opera,
    Giverny, Mazan, Cappuccino, Feuillage, Larsen 2024 — is a real row of that
    endpoint carrying its own name, description and house, so the hero, the row
    and the featured band are one collection each and the copy is the client's,
    not invented. **The CHOICE is live too** — `featured_rank`, set by the office
    in the CRM (see `## Featured` at the foot of this file). The frontmatter's
    `FEATURED_COLLECTIONS`, `FEATURED_SLUG` and `LATEST_SLUGS` slug arrays are
    gone; what is left hand-edited is the three blocks of static copy (`BANNERS`,
    `MANIFESTO`, `HOUSES`) and the two art registries, which say which
    photograph belongs to which collection rather than what to feature. The
    sections with no art of their own are still omitted rather than rendering an
    empty frame.
  - **The featured band carries a fact list** (`.house-facts`, the house page's
    own figure reused): House, Origin, Designs held. `product_count` is
    deliberately NOT one of them — collection membership is staff-assigned in
    the CRM and the seed assigns none, so it is 0 for every collection and would
    read as "nothing in it". Designs held from the HOUSE is the honest figure,
    and it is where "Explore collection" lands anyway (`collectionHref`'s second
    rung). A fact with nothing behind it is dropped, never shown empty.
  - **Rules live in `src/lib/home.js`** (pure + tested, mirrors
    `lib/catalogue.js`): `collectionHref()` — the three-rung ladder a tile
    follows so it never lands on an empty grid (collection filter → the house's
    grid → the house's page; de Le Cuona and No.9 Thompson are both on the third
    rung on the seeded catalogue and are both named by the design);
    `featuredCollections()`/`collectionKey()`/`collectionArtwork()`/
    `pickFeature()` (see `## Featured`); `pickCollections()` — the row it is
    handed, de-duplicated on the `(house, collection)` pair and topped up from
    the rest of the catalogue so it still shows four tiles when the office has
    featured three, never repeating one the hero or featured band already holds;
    `brandDesignCounts()`; `houseLabel()` (the hero's house line, see above).
    `bandPhotographs()` is still exported and tested but **has no caller left** —
    the manifesto band was the last one, and it takes committed art now. Keep it
    or delete it, but do not describe it as live.
  - **The manifesto band takes committed art** (`src/assets/img/aterlier-about-bg.jpg`,
    through `getImage()` because it is a CSS background). It used to be the one
    band still fed by `bandPhotographs()` — collection interiors first, product
    shots only to top up, because most product photography in the catalogue is a
    finished good on white linen that disappears under a scrim and takes the copy
    with it. Committed art removes that gamble, and the band no longer changes
    when the catalogue does.
  - The scrims run deeper than the mock's (`.photo-band::after` 0.62,
    `.home-manifesto::after` 0.58 flat). Those values were set when the bands
    took whatever the catalogue held; every band is art-directed now, so they can
    be lifted per band if a chosen photograph reads as buried — which is exactly
    what `/login` did, see its own entry.
  - **There is no outage state on this page.** It used to render "The catalogue
    is unavailable right now" when both `products` and `collections` came back
    empty; that block is gone (with `.home-outage`). Every band the API feeds
    already omits itself when it has nothing, and the art-directed bands, the
    hero photographs and the copy all still render with the API down — so the
    page reads as finished, and an apology under a complete-looking home read as
    a bug rather than as an outage.
  - **Both shop banners link to `/products`**, not to a pre-filtered grid: "by
    type" and "by application" name the library's own two facet dimensions, and
    picking a value would promise one thing and show another.

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
  (`WEB-<id>`), and then clears the cart. **A failed verify also clears it,
  unless the API answered 404.** Stripe redirects to this page only after taking
  the money, so a verify that fails because our own API did not answer (network
  error, 5xx, 503 with cards off) says nothing about the payment — and a full
  cart left there is one the shopper can be walked back into buying a second
  time. 404 is the single answer that means Stripe DISOWNED the session (a
  hand-made or stale `?session_id=`), and the cart is kept for exactly that
  unvouched case so a crafted link cannot empty a real basket. The rule is
  `shouldClearCartAfterFailedVerify` in `src/lib/cart.js`, tested in
  `src/lib/cart.test.js`; the error screen changes with it, offering "continue
  shopping" and a do-not-pay-again note where the cart was cleared, and "back to
  cart" only where it survived. Money is formatted with the shared
  `src/lib/money.js` `formatMoney(cents, currency)`.

- **`/order-request` (US-020) is a CART, not a form** — `order-request.astro`
  renders `RequestList.jsx` as a single `client:load` island. It used to be one
  form per product, so a shopper wanting three cloths filed three separate
  requests and the back office reconciled three orders by hand; the product page
  now adds to the request list and this page reviews and sends the whole list as
  the multi-line `POST /orders/request` the API has always accepted. Per line:
  metres, cut requirements, remove; plus contact details, and one submit.
  - POSTs `{ lines: [{ sku, qty_metres, cut_requirements }], contact: { name,
    email, phone }, accepted_lead_time }`. Prefills name/email from
    `GET /auth/me` (401 = guest, ignored).
  - **The legacy deep link still works.** `?product=<slug>[&sku=][&backorder=1]`
    adds that colourway (the named SKU, else the first in stock, else the first
    listed) to the list on arrival, then `history.replaceState`s the query away
    so a refresh cannot add it twice. A `useRef` guard covers StrictMode's
    double effect — merge-by-SKU sums metres, so a second add would silently
    double the cut.
  - **Every line is re-fetched on arrival** (`GET /catalogue/products/:slug` per
    distinct slug, in parallel, folded back through `applyProductRefresh`).
    Stock state decides whether the lead-time acceptance is required, and a list
    built last week must not answer with last week's stock. A **404** marks the
    line `unavailable` and blocks submit with "remove this line"; **any other
    failure leaves the line alone** — an unreachable API is not evidence a
    product was deleted.
  - The "I accept the quoted lead time" checkbox appears when ANY line is out of
    stock, and is required before submit. It also appears when the API says so:
    `in_stock` is a boolean, so a colourway with 2m left reads "in stock" and is
    still short for a 40m cut — the 422 for that carries no field path, so the
    handler matches /lead time/i on the message and reveals the checkbox rather
    than leaving the shopper to re-press a button that will fail again.
  - Validation is two-layer: client checks (every line's metres > 0, no
    unavailable line, email present, checkbox when needed), then server 422
    field errors mapped from `err.body.errors` — `lines[N].qty_metres` is mapped
    back to line N **of this list's own order**, which is what was posted, and
    `contact.email` to the email field. Success replaces the page with the
    request number (`REQ-` or `BO-`), then **clears the list** — leaving it
    behind invites a second identical request on the next visit.

- **`/login`, `/trade-application` (US-021)** — each an Astro page wrapping a
  single `client:load` form island (`LoginForm.jsx`, `TradeApplicationForm.jsx`).
  - **There is no customer registration.** `/register` and `RegisterForm.jsx`
    were deleted: the client has no standard-customer account product and does
    not want one, so a **trade application is the only way to make an account**
    — and, since the trade gate below, the only way to see the represented
    houses at all. `POST /auth/register` still exists API-side and is still what
    the trade application builds on; nothing in this repo calls it. Both the
    sign-in fine print and the application's own closing line used to point at
    `/register`; neither does, and `.auth-alt` (commerce.css / primitives.css)
    is left with no callers. Guest checkout and guest order lookup never
    depended on an account and are unaffected.
  - **`/login` is the 2026 direction** (design: Figma "Sign in Page 2", node
    9350:361), `<Layout bleed overlay>` + `src/styles/auth.css`: a full-bleed
    interior photograph under a flat 50% scrim, the header floating over it, and
    one 371px column centred in the frame — "Welcome", the role note, two
    outlined transparent inputs, the underlined `Sign in`. The mock labels both
    fields with placeholders alone; each keeps a real `sr-only` `<label>`
    because a placeholder disappears the moment someone types. The mock also
    omits the route to the trade application, which cannot simply go (a
    signed-out visitor can reach it from nowhere else), so it sits under the
    action as fine print rather than as a second action.
    - **The photograph is committed art** (`src/assets/img/sign-in-bg.jpg`,
      through `getImage()` because it is a CSS background). It used to be live
      catalogue data — a hand-picked collection slug with `bandPhotographs()`
      behind it — and the fallback is what killed that: the form sits in the
      MIDDLE of the frame, and on the dense floral the chooser once landed, the
      input rules and bone placeholders camouflaged against the pattern rather
      than merely losing contrast, so the fields read as absent. A committed
      image has no fallback to go wrong and the page no longer needs the API to
      look right. **The scrim came back up with it** (`.auth-screen::after`, now
      0.32 radial over a 0.26 flat, was 0.45/0.55): the deep values existed to
      survive whatever the catalogue handed over, and on one already-dark
      art-directed interior they only buried it.
    - Figma draws a SECOND sign-in ("Sign in Page 1", 9350:316: a 622px photo
      left, the form right on cream). It was not built — the client picked
      Page 2. Page 1 is the obvious model if `/trade-application` is ever
      brought into the direction; it is still on the Maison `.auth-form` in
      `commerce.css`, since inventing it in a language the Figma never drew it
      in would be guessing.
  - **`/forgot-password` and `/reset-password`** wear the same screen
    (`auth-screen`, the committed photograph) around `ForgotPasswordForm.jsx`
    and `ResetPasswordForm.jsx`; "Forgot your password?" sits under the sign-in
    action. Forgot POSTs `/auth/forgot-password` and shows the API's one
    sentence back — it is the same sentence for a known and an unknown address,
    so the screen never claims a mail is on its way. Reset lands from the
    emailed link with `?token=`, read client-side (`readResetToken`, the page is
    prerendered), asks for the password twice, holds it to the API's 12-character
    floor before posting (`newPasswordError`, `src/lib/passwordReset.js`, tested)
    and POSTs `/auth/reset-password`; success is a "Sign in" link, because the
    API mints no session on a reset. A link without a token, or one the API
    refuses (400: unknown, spent, expired), points back at `/forgot-password`.
    Staff never land here — the API sends backoffice/director links to the CRM.
  - Login POSTs to
  `/auth/login`; on success the API sets the session cookie
  and the island does `window.location.href = '/'` (login honours a same-site
  `?redirect=` path — off-site/`//` values are rejected; `signInHref()` in
  `lib/tradeGate.js` builds those links under the same rule). Trade-application
  POSTs to `/auth/trade-application` and does NOT redirect — it shows a
  confirmation that approval is **manual** (role=trade, `trade_approved=false`;
  no self-serve approval endpoint exists). Errors surface inline from
  `ApiError.message` (the API sends friendly `{ error }` on 401/409); the trade
  form checks `password.length >= 8` client-side to avoid the raw schema-400
  message.
  **Auth helpers live in `src/lib/auth.js`**: `fetchCurrentUser()` (GET
  `/auth/me` → `user` or null, swallows 401), `logout()` (POST `/auth/logout`,
  never throws), `accountLabel(user)` (name or email). `/auth/me`
  and login both return a `{ user }` envelope — read `body.user`.
- **`/account`, `/order-lookup` (US-022)** — `/account` is now the multi-panel
  trade client portal; **see the "Account portal" section below for how it is
  built**, and treat that as the source of record. What still holds here:
  `Account.jsx` (`client:load`) resolves auth at runtime with
  `fetchCurrentUser()`, and no user → `window.location.href =
  '/login?redirect=/account'` (satisfies the "unauthenticated → login"
  criterion). It renders `tradeStatusNote(user)` (see `src/lib/account.js`)
  under the greeting — **this is the only place a trade applicant learns
  anything**: approval is a manual flag flip in the CRM with no email, and until
  this existed a pending account and an approved one looked identical from the
  storefront. Orders are one panel among six now (paged via `GET
  /orders/mine?page=&limit=`, not a single unbounded list), and **log out lives
  inside the Account panel**, not beside the greeting. `/order-lookup`
  (`OrderLookupForm.jsx`) is PUBLIC — order
  number + email → `GET /orders/lookup?order_number=&email=`; a 404 (either key
  wrong) shows a friendly "no order matches" message, never an enumeration
  signal. Order rendering (status pill, line table, totals, invoice reference)
  is **shared** via `src/lib/orderView.jsx`: `statusBadge(status)` +
  `orderCard(order)` are plain FUNCTIONS returning JSX, CALLED normally
  (`orders.map((o) => orderCard(o))`) — NOT `<OrderCard/>`. A shared component
  used only in JSX would trip `no-unused-vars` (no React plugin); a called
  function counts as a use. Order money fields are integer cents rendered with
  `formatMoney`; an order whose TOTAL IS ZERO shows "Priced on confirmation"
  instead of money (`hasQuotedTotal` in `src/lib/reorder.js`) — a fabric request
  is created with every money column at 0 and nothing ever fills them in, so
  printing them verbatim put "$0.00" on every fabric order ever placed. The test
  is the total, not the status: the zeros survive confirmation, payment and
  shipping.
- **Header account island** — `Header.astro` renders `AccountNav.jsx`
  (`client:load`). Because the store is a static build, login state is resolved
  at runtime: the island calls `fetchCurrentUser()` and renders the design's
  24px account icon pointing at `/account` when signed in and `/login` when not,
  with the name carried in `aria-label` rather than on screen. It renders the
  guest destination while `/auth/me` is in flight — guest is the common case and
  both states are the same 24px box, so nothing moves either way.
  - **Log out moved to `/account`** — specifically into the portal's **Account
    panel** (`detailsPanel` in `src/lib/accountPanels.jsx`). The 2026 header is
    an icon row with no room for a name or a button, so that panel is now the
    only place a session can be ended — if it ever loses the button, a signed-in
    visitor is stuck.

- **Site chrome (2026)** — `Header.astro` / `Footer.astro` / `Wordmark.astro` /
  `chrome.css`, built from the Figma Header (3376:24, Theme=Light at 3376:4) and
  the footer at 7307:930, both drawn identically on all four frames.
  - **Header**: one row — nav (Products / Brands / Story / Journal) left, the
    wordmark absolutely centred, `Contact` + three 24px icons (search, account,
    cart) right; 32px above the row, 18px below, 24px between every item. The
    icons are inline SVG, not `<img>`, so `stroke="currentColor"` follows the
    theme. A **fourth** icon, `RequestIndicator.jsx` (scissors, the fabric
    request list), sits before the cart and **renders nothing while the list is
    empty** — the drawn header keeps its three icons in the state the mock was
    drawn in, and a shopper who has actually built a request list can still
    reach it from every page instead of having to remember the URL. Same
    argument as the cart's count badge. Geometry is converted from the mock's 1280px frame to the site's own
    `.container` (96rem / 3rem) so the wordmark, the page bands and the footer
    stay on one column.
  - **Two themes, one markup.** `.site-header--overlay` (from `Layout`'s
    `overlay` prop) makes the header `position: absolute` over the page's first
    band and reverses its type to `--bone`. `absolute`, NOT `fixed`: the mock's
    header scrolls away with the hero, and a fixed bar would sit over the tiles
    below. **Nothing between `<body>` and the header may be positioned** or the
    overlay collapses onto the page ground.
  - **The announcement bar and the mega-menu are gone**, with
    `src/lib/mega-menu.js`. The Figma has neither, and the mega-menu's job (by
    type / by application / the houses) is the library's own facet sidebar. Two
    of the site's three hardcoded seasonal-copy blocks went with them, and the
    home's slug arrays went with `featured_rank` (see `## Featured`), so no
    screen picks a collection by hardcoded slug any more.
  - **Nav labels are the design's**: Story → `/story`, Journal → `/resources`
    (Brands and Products match their routes). There is no Home item — the
    wordmark is the way home. The current section is marked with the
    direction's underline, not a colour swap.
  - **`Wordmark.astro` is the logo export, INLINED.** Since the client's Aug
    2026 supply it is the HORIZONTAL lockup — geometric ATELIER caps over
    spaced TEXTILES caps, 636 × 141 (4.51:1) where the stacked mark of the
    August 2026 redraw was 130 × 51.93 (2.50:1). Hence the widths moved with
    it: **200px in the header** (~44px tall, still centred on the row rather
    than hanging from a fixed top) and **240px in the footer**.
    - **It is TWO-TONE, so it no longer rides on `currentColor`.** The ATELIER
      row fills from `--wordmark-accent` and the TEXTILES row from
      `--wordmark-ink`; tokens.css declares the light-ground pair on `:root`
      and the reversed pair as `--wordmark-accent-rev` / `--wordmark-ink-rev`.
      A dark surface re-declares the pair **on the header or footer element,
      not on the mark** — custom properties inherit, so one two-line block
      covers every copy inside it. Three do so: `.site-header--overlay` +
      `.theme-dark .site-header` (chrome.css), and the dark-mode footer +
      dark-ground header (dark-mode.css). Callers pass only `width`.
      These are the mark's own brand values, and the one deliberate exception
      to "use the tokens": the logo does not re-tint with the palette, it
      swaps between the two colourways the client supplied.
    - The client supplied it as two files, a light-ground and a dark-ground
      colourway. They are the SAME artwork — identical path data, index-for-
      index identical fill order, differing only in the two hexes — which is
      why this is one copy of the geometry with the colourway lifted into CSS
      rather than two inlined marks.
    - **Run it through SVGO on the way in** (precision 2, `removeViewBox`
      off, `removeDimensions` on). This component is inlined in the header AND
      the footer of every page, so it pays twice per document: the previous
      mark shipped its raw 6-decimal Figma export and was 47.6 kB, which was
      ~86% of every page's HTML (404.html: 109 kB raw / 41 kB gzipped). The
      current one is 4.7 kB and the same page is 21 kB / 7 kB.
    - SVGO strips `role="img"` — put it back. `aria-label` alone on a bare
      `<svg>` is not reliably exposed by older VoiceOver, and that label is the
      only text inside the header's home link.
  - **Footer** (August 2026 redraw, master 9434:7202 family): a recessed cream
    band (`--shell-subtle` #f0e3d3) — the wordmark over the Facebook/Instagram
    icons on the left, two columns of 14px muted links (Products/Brands/Our
    Story/Journal; Trade Account/Contact/Privacy/Terms), and the newsletter
    block (18px head, boxed email input, underlined "Join us"). **The
    newsletter has no service behind it** (newsletters are journal posts), so
    the form lands on /contact rather than pretending to subscribe. The
    showroom addresses, phone and email are still in `src/lib/site.js` and
    still render on `/contact`.
  - **Privacy Policy and Terms & Conditions** are the mock's last two links and
    the only two with no content behind them. `/privacy` and `/terms` exist and
    render `page`-collection entries the way `/story` does, and the footer
    renders each link **only when its markdown exists** (`getCollection('page')`,
    not `getEntry` — a miss is the expected state here, and `getEntry` logs a
    "not found" line on every page of every build). Writing placeholder legal
    copy would be worse than shipping none.

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

**`/brands` (`brands/index.astro`)** — 2026 direction since the August 2026
redraw (Figma "Brands Page", 9379:3562), `<Layout bleed overlay>`: a 74vh
photo hero (the SAME commissioned photograph and copy as the home's
design-houses band — the mock reuses the art, so the page reuses
`design-brands-banner-bg.jpg` AND the same CMS entry: `applySection` over the
`home-houses` site section, so an image or copy the office sets there is the
/brands hero too, and an empty CMS renders the shipped art and copy; image,
title and body only — the band's align/scrim knobs stay the home's), then the
**wall of house tiles** (3-up
371×497, photograph under a flat 0.38 scrim with the maison's mark centred —
the brand's `logo_url` PNG as `img.house-card-logo` when the CRM has
one, else the house NAME in the same class), then the **featured-collection band**
(`--shell-subtle`, photograph left / "Featured collection" badge + name +
description + "Explore collection" right — the first `featured_rank`
collection that carries a catalogue photograph, omitted when none does; the
link goes through `collectionHref`'s ladder). The wall renders **in the API's
own order** — featured houses lead it; the old "in focus" strip and the
alphabetical directory rows are gone, as are `houseMeta` on cards and the
espresso sourcing band. Still `safeFetch('/catalogue/brands')` and
**`prerender = false`** so a brand created in `/admin/brands` appears without
a rebuild; imagery resolves editorial (EmDash over markdown) → the house's own
catalogue photography → the weave, exactly as before.

**`/brands/[slug]` (`brands/[slug].astro`)** — **`prerender = false`**;
`getStaticPaths` is gone. Resolved per request from three sources:
- **Brand** via `apiFetch` — deliberately NOT `safeFetch`, because the two
  failure modes need different handling. `ApiError.status === 404` means "no
  such brand"; anything else sets `apiDown`. That distinction is the whole
  point: an outage must never turn a real brand into a 404.
- **Editorial**: `getEmdashBrandPage(slug)` first, then the markdown `brandPage`
  entry (`entry.data.brand === slug`) — **only when the CMS has nothing**.

Derivation chain: `name = brand?.name ?? emPage?.name ?? mdPage?.id ?? slug`;
blurb falls back CMS → markdown → `brand.story`; slideshow/cards CMS → markdown
→ empty. Body copy is the CMS `story` rendered with `<PortableText>` from
`emdash/ui`, or the markdown body via `render()`. Related-post links point at
`/resources/<id>`.

**2026 layout — ONE route renders BOTH of the Figma's house frames**, because
they are the same page drawn twice:
- **"Brand Page" (9350:479)** — the house HAS banner photography: a full-bleed
  78vh `.photo-band` with the header floating inside it (`<Layout bleed
  overlay>`), the country as a `.badge-light` above the name.
- **"Product Page" (9350:788)** — the house has NONE: the banner is replaced by
  an umber `.house-band`, and the header sits on it in its paper theme (no
  `overlay`) because the band is the page ground. Everything from the intro down
  is identical. **It is not a product-detail screen** — the tiles below it are
  still collections and the copy is still a house blurb; the frame name misleads.
  This is the variant most of the directory actually renders: fourteen of the
  seeded houses are represented-only with no imagery at all.

Then, in both: the intro (`466fr / 371fr`, the mock's two columns) with the
blurb as **24px Inter medium** over the body copy and the actions below it,
beside the facts rows → the full-bleed `.tile-wall` of collection tiles (2-up,
name + `View collection`) → the related-reading band.
- **Type note:** there is no Fraunces anywhere on these two frames. The blurb is
  `.house-lede` (24px Inter 500, umber), NOT a serif lede, and the facts are
  `.house-facts` (12px Inter 600, muted label left / umber value right, black
  hairline per row) — deliberately not `primitives.css`'s `.spec-rows`, which is
  the Maison figure with mono values on a greige rule.
- **Actions, underlined text** (`.cta-underline`): `Visit website` — the house's
  own site (`brand.website_url`, staff-set in the CRM's Houses & collections
  screen), opened in a new tab, no URL on file → no action. It replaced
  `Shop {name}` (client decision, page feedback Aug 2026) and is the ONLY action
  the redrawn "Brand Page" frame (9379:2647) carries: the collection wall below
  is how that frame gets a shopper to the grid. `View all products` →
  `/products?brand=<slug>` survives as the FALLBACK for a house with no
  collections to tile — `tiles.length === 0 && designCount > 0`, so it never
  duplicates the wall and never lands on an empty grid.
- **Tiles carry a season label and no description.** The mock puts a small light
  label, the name and `View collection` on the photograph, and nothing under it.
  The label is the half of the CRM's collection name that follows a pipe —
  "Chilgrove Collection | Spring 2024" is drawn as *Spring 2024* over *Chilgrove
  Collection* (`splitCollectionName`, first pipe only; most collections have
  none and simply get no label). `.tile-heading` groups the two so `.tile-body`'s
  own gap stays between the name and the action. `collectionTiles()` still
  returns `description` (the CMS card / API text) — it is simply not rendered
  here, and is there for whatever renders a collection next.
- **There is no related-reading band.** The page ends at the collection tiles,
  as the Figma does. The umber "Related reading" list of journal posts tagged
  with the house was removed in September 2026 at the client's request; the
  markdown posts and their `brands` tag remain for `/resources`.
- **The collection tiles are driven by the live catalogue, decorated by
  editorial** (`collectionTiles` in `src/lib/collections.js`, pure + tested):
  `safeFetch('/catalogue/collections?brand=')` supplies the tiles. **There is no
  product gate on the section any more** (client decision, 5 Aug 2026 — the wall
  is what the Figma brand page IS, so a house with collections and no wall reads
  as a house we hold nothing from). EVERY live collection tiles whenever the API
  returns any; a house with none renders no section at all, heading included —
  which is what the fourteen represented-only houses (Alpaka, Armani Casa, Le
  Crin, … — houses Atelier represents but holds nothing from) render: umber
  band, facts list, `Visit website`, stop.
  - **The superseded rule** was brand-level (`brandHasProducts` = the facts
    list's `designCount > 0`, from the manuel-canovas feedback and the 4 Aug 2026
    roster). It was never per collection — memberships are mostly unassigned in
    the CRM and a per-collection `product_count > 0` gate hid whole houses.
    Dropping it changes three pages: de Le Cuona, No.9 Thompson and Loro Piana
    have collections but no products, so their tiles now land on the house's own
    (empty) library filter — "0 designs / Nothing matches those filters",
    with `Clear all` as the way out. For a **trade-gated** house the same link
    lands on the library's gate note instead, which is the better answer than
    the silence it replaced.
  - A stocked collection links `/products?brand=&collection=`; a memberless one
    falls back to `/products?brand=`. Tile copy/photo precedence:
    EmDash/markdown card (matched by its `collection` slug field, else by
    heading == collection name case-insensitive) → the API collection's own
    `description`/`image_url` (seeded from the atelier.co.nz snapshot,
    CRM-editable) → name over the weave. An unmatched card renders nothing —
    editorial cannot invent a shop destination; `card.link` is legacy/unused
    here.
- `slideshow[1..]` is no longer rendered as a scrolling gallery (the design has
  one banner). Nothing is lost on the seeded page: the collection cards carry the
  same three images as their `featuredImage`.
- **The facts list is GONE** (August 2026 redraw, 9379:2647): the intro is two
  TEXT columns now — the blurb on the left (16px Inter medium), the body copy
  and the actions on the right. `foundedYear()` lost its caller here (the
  homepage's featured band still renders `.house-facts`, which is why the
  figure survives in editorial.css). The design-count fetch stays — it still
  decides the "View all products" fallback action.

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
- **`/story` is no longer one of these** — the August 2026 redraw (Figma
  "Story Page", 9436:3043) made it the direction's one DARK page, fully
  art-directed in `story.astro` + `story.css`: photo hero ("Our Story" + the
  dictionary line), the "Why Atelier" split, the "Sourced from the World's
  Design Capitals" band, a 4-up strip of house tiles (build-time fetch, the
  brands wall's `.house-card` with its label reversed), the "Inside the
  Atelier" split with the supply list, and the trade-showrooms band — whose
  addresses and hours come from `src/lib/site.js`, never retyped. The copy is
  the frame's own and lives in the page (the home's precedent);
  `src/content/pages/story.md` remains as a baseline nothing renders. The five
  photographs ship as `src/assets/img/story-*.jpg` (exported from the frame's
  own placed images) through `getImage`.
- **`/contact`, `/privacy`, `/terms`** (`contact.astro`,
  `privacy.astro`, `terms.astro`) — on demand since the CMS pages wiring: each
  resolves the EmDash `pages` entry of its own slug FIRST (title + Portable
  Text via `getEmdashPage` / `<PortableText>`), then the markdown
  `page`-collection entry (`getEntry('page', <id>)` + `render`), then the
  empty state. Page-level precedence like the brand pages — a CMS entry stops
  the markdown loading entirely, never a hybrid. Seeded markdown:
  `src/content/pages/story.md`, `contact.md`. **`privacy.md` and `terms.md` are
  NOT seeded** — the footer only links them once they exist (see Site chrome),
  and inventing legal copy would be worse than shipping none; the office can
  now also supply either from the CMS instead.
- **`/[slug]` (catch-all, `[slug].astro`)** — any OTHER published EmDash
  `pages` entry renders at `/<its slug>`, which is how the office ADDS a page
  without a deploy. Astro gives every real route priority over the catch-all,
  so a CMS entry can never shadow /products, /cart or the rest; an unknown
  slug 404s with the /resources/[slug] status + body pattern.

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
  `/` (home — CMS-editable sections),
  `/brands`, `/brands/[slug]`, `/products/[slug]`, `/resources`,
  `/resources/[slug]`, `/contact`, `/privacy`, `/terms` and the `[slug]`
  catch-all for office-created pages (plus EmDash's own routes). Anything else appearing in the
  on-demand set is a silent-SSR regression: `npm run build` prints the
  prerendered routes, and `find dist/client -name '*.html'` is the check.
- **Config:** `emdash({ database: sqlite({ url: 'file:./data/emdash.db' }),
  storage: local({ directory: './data/uploads', ... }) })`. `data/` and
  `emdash-env.d.ts` are gitignored — local content is never committed.
- **Passkeys need `SITE_URL` set at RUN time behind a proxy.** No `siteUrl` is
  passed to `emdash()`, so its origin resolution is
  `config.siteUrl → process.env.EMDASH_SITE_URL → process.env.SITE_URL →
  url.origin`. With Cloudflare/nginx terminating TLS, that last fallback is the
  *internal* `http://<host>` while the browser signs `https://<host>`, so
  `verifyRegistrationResponse` throws `Invalid origin: … not in […]` and the
  admin shows the generic **"Failed to verify admin setup"**. The real error is
  only in the process log (`[SETUP_VERIFY_ERROR]`). Note the two lifecycles:
  Astro's `site` reads `SITE_URL` at build time (canonical/og:url), EmDash reads
  `process.env` at run time and **caches it**, so a passkey fix is `.env` +
  restart, while canonical URLs additionally need a rebuild. Registration
  succeeding but verification failing points at the scheme specifically — a
  wrong *host* would have made the browser refuse `credentials.create()` first.
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
- **Homepage sections and banner art live in TWO further collections** (the
  EmDash revamp, Aug 2026), both read by `/`:
  - **`site_sections`** — one entry per art-directed band, the entry slug FIXED
    per section: `shop-by-type`, `shop-by-application`, `latest-collections`,
    `home-manifesto`, `home-houses`. Fields `title` / `subtitle` / `body` /
    `cta_label` / `cta_href` / `image`. Merge rule (`applySection` in
    `lib/emdash.js`): a field the editor filled wins, a BLANK field falls back
    to the copy shipped in `index.astro` — so an entry can override just an
    image or just a title, and an empty CMS renders the page byte-identical.
    `cta_href` is a plain string, not a `url` field, so relative paths work.
    - **Layout knobs** (`align` select left/centre/right, `scrim` select
      standard/soft/deep/none, `hidden` boolean): designed VARIANTS, not free
      positioning. `bandClasses()` in lib/emdash.js turns a non-default choice
      into a `band-align-*` / `band-scrim-*` class on the band root; what each
      class means per band lives at the foot of `direction-2026.css` (the
      scrim stops are CSS custom properties with the designed values as
      fallbacks). `hidden` removes the section from the page while the entry
      keeps its content. The default choices emit NOTHING, so an unknobbed
      page keeps its exact markup. A soft/none scrim can put bone copy on a
      pale photograph — the field description warns, the office decides.
  - **`collection_banners`** — commissioned photography per featured
    collection: `house` + `collection` (the API slugs, the same pair key as
    `collectionKey()` in lib/home.js) plus `banner` (full-bleed hero frame)
    and `portrait` (featured-band frame). `overlayArtwork` lays these over the
    shipped `HERO_ART` / `FEATURE_ART` registries, CMS winning — which is how
    the office hands a newly featured collection its hero art without a
    deploy. A half-keyed row is ignored, never guessed at.
  - **`npm run seed:cms` also seeds the five `site_sections` ENTRIES** (the
    seed's `content` block, published, carrying the page's shipped copy) so
    editors edit rather than create-with-a-magic-slug. Existing entries are
    skipped on re-seed (`onConflict: skip`), never overwritten. Note the
    seed's content block only applies via the CLI or the sync script below —
    the startup auto-seed creates collections, not entries.
  - **Nothing ADDED to the seed reaches an existing database on its own.**
    EmDash's startup auto-seed runs ONLY on a brand-new database (its gate is
    "zero collections and setup not done"), and the seed CLI skips every
    field of a collection that already exists. Staging (checked 8 Sep 2026
    over the content API) is the standing example of where that leaves the
    office: `site_sections` was there and they had uploaded the four band
    photographs through the admin themselves, but `collection_banners` sat
    EMPTY — a hero frame needs an entry keyed by house + collection slug that
    nobody had made — so the hero and featured band fell back to the shipped
    art, and the /brands hero had no CMS hook at all (it has one now). The
    CLI's `--on-conflict update` escape hatch is worse: it also rewrites
    CONTENT from the seed (`--no-content` does not stop it — verified on
    0.29.0, editor edits get clobbered). **Never run `--on-conflict update`
    against a database with editor content.** The upgrade path is
    `npm run seed:cms:fields` (`scripts/migrate-cms-fields.mjs`), which works
    over the HTTP API so it reaches staging (no shell there): it creates the
    collections missing from the live schema (with their fields), the fields
    missing from an existing collection, and the seed's content entries whose
    slug does not exist yet; it modifies nothing that exists and is idempotent.
    Same `EMDASH_TOKEN` + base-URL convention as the art import, which is the
    step after it. Verified locally by deleting both collections and re-running
    the pair: the admin gets them back with the five entries, and the art
    import attaches the shipped photography to them. The token needs the
    scopes both scripts hit — schema read + manage, content read + create +
    edit + publish, media read + upload — a token short of one fails with
    `INSUFFICIENT_SCOPE` naming it; and the proxy must let the Bearer header
    through (see the staging gate section).
  - **`npm run import:cms-art`** (`scripts/import-cms-art.mjs`) uploads the
    SHIPPED art into the CMS media library and attaches it: the three hero
    banners + featured portrait become `collection_banners` entries, and the
    four band backgrounds land on their `site_sections` entries. Idempotent —
    media dedupes by filename, an editor's own image is never replaced. Needs
    `EMDASH_TOKEN` (admin → API tokens; dev-bypass locally) and takes the
    site's base URL as its one argument for a remote run. Run `seed:cms`
    first (the section entries must exist).
- **The `pages` collection is a live surface**: `/contact`, `/privacy` and
  `/terms` resolve their own entry first, and the `[slug]` catch-all serves
  every other published entry at `/<slug>` — see Resources + company pages
  (US-025) above.
- **`npm run import:brand-pages`** (`scripts/import-brand-pages.mjs`) moves the
  36 markdown brand pages into the CMS as `brand_pages` entries — blurb,
  slideshow, cards, and the body converted to Portable Text
  (`src/lib/markdownToPortableText.js`, pure + tested: paragraphs only, and it
  REFUSES a body using richer syntax rather than flattening it, so a page is
  never imported degraded). Remote atelier.co.nz photographs are downloaded
  into the media library; a failed download keeps the URL string, which
  renders the same. A brand already in the CMS is always skipped — an
  editor's page is never replaced (delete the entry in the admin to
  re-import). **Repeater image sub-values are stored VERBATIM by the save
  path** (no server-side enrichment, unlike top-level image fields), so the
  script stores the full MediaValue with `meta.storageKey` — a bare
  `{provider, id}` in a repeater row renders nothing.
- **`brand_pages` entry slug MUST equal the atelier-api brand slug** — that is
  the only key joining CMS editorial to the live catalogue brand. A
  `collection_cards` row's **`collection` sub-field joins the same way at the
  collection level**: it must equal the collection's slug (shown as its "web
  address" in the CRM's Houses & collections screen). The card then decorates
  the live tile (image + description) on `/brands/[slug]`; the tile's existence
  and link are the API's (see `lib/collections.js`). `link` remains only as the
  pre-join legacy field.
- **Admin:** http://localhost:4321/_emdash/admin (first run → `/setup`,
  passkey auth). Dev-only headless bootstrap + API token:
  `GET /_emdash/api/setup/dev-bypass?token=1`.
- **MCP server:** `POST /_emdash/api/mcp` (Streamable HTTP, `Authorization:
  Bearer <token>`) — see `README.md`.
- Beta rough edges + workarounds: `tasks/emdash-blockers.md`.

## Account portal (`/account`)

- One prerendered page, one island (`Account.jsx`), **six panels behind the URL
  HASH** — not six routes. Every page here is `prerender = true`, so separate
  account URLs would be six identical static shells whose content is fetched at
  runtime regardless; the hash is shareable, back-button-safe and needs no
  routing. `src/lib/accountSections.js` decides which panels exist,
  `src/lib/accountPanels.jsx` draws them (plain functions called normally, the
  `orderView.jsx` convention — the store ESLint has no React plugin, so a
  JSX-only sub-component reference trips `no-unused-vars`).
- **Panels are lazy and cached per section.** Loading orders + samples +
  invoices + price lists for a visitor who came to check their last order would
  make the common case slow.
- **The nav is presentation, never authorisation.** The API scopes every
  response to the session, so a tampered nav reveals nothing — but the link
  state it reads comes from `GET /account/summary` and nowhere else. Do not
  derive it from the user object or cache it: a client-derived value would make
  the nav an access decision taken in the browser.
- **Three audiences, none of which may look broken.** A plain customer sees
  Overview / Orders / Account and never calls `/account/summary`. An approved
  trade account **not yet linked** to its Dynamics customer sees the trade
  panels marked `pending-link` with an explanation — "0 invoices" would be a lie
  by omission, since the record exists and the back office simply has not
  matched the login to it yet. A linked one sees everything.
- **Reorder rebuilds the basket; it never re-submits** (`src/lib/reorder.js`).
  Fabric lines refill the request list, finished goods refill the cart, and a
  mixed order fills both and lands on `/order-request`. A server-side "place it
  again" would skip the back office's stock and shading check (FR-5) — the one
  step the fabric flow exists for — and would re-reserve metres with nobody
  looking. Rebuilt lines carry `in_stock: false` deliberately: what was in stock
  then says nothing about now, and false is the safe direction (it shows the
  lead-time checkbox; the opposite mistake is a 422 at submit).
- **`hasQuotedTotal` decides whether an order shows money at all.**
  `createOrderRequest` writes zero into every money column and nothing ever
  fills them in — the amount is set by hand in Xero at confirmation — so an
  unpriced order reads "Priced on confirmation". Keyed on the **total being
  zero, not on the status**: the zeros survive confirmation, payment and
  shipping, which are exactly the orders a client opens.
- `formatMoney` takes CENTS, `formatAmount` takes a DECIMAL — legacy Dynamics
  invoice totals are `numeric` in the invoice's own currency (and arrive as
  strings), so passing one to `formatMoney` divides a real invoice by a hundred.
- The CSV download goes through `apiDownload` (fetch + Blob), **not** a bare
  `<a href>`. The session cookie is `SameSite=Lax`, so a plain link WOULD
  authenticate — which is the problem: any third-party page could then trigger a
  credentialed download of a client's price list. Fetching keeps it
  script-initiated and CORS-checked.
- Every panel inherits the break-glass branch: an offline session has no API
  cookie, so the whole portal says so rather than rendering a stack of 401s.
- Pure logic is covered by `accountSections.test.js` and `reorder.test.js`; the
  panels and the island need a live API and belong in an end-to-end run.
- **The island's effects are the untested surface, and it has already bitten.**
  The first version of the per-panel fetch listed `panels` — the state it writes
  — in its own dependency array, so React ran the cleanup and discarded the
  result before it arrived and every panel sat on "Loading…" for ever. `npm test`
  is `node --test` over pure modules only, so nothing in the suite could see it.
  Dedupe through a ref (`requestedRef`), never by depending on the state the
  effect sets, and read any new effect here twice.

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
cart only ever holds finished goods (fabrics use the request list below).

## Request list (cut-to-order fabric)

The cart's sibling, in `localStorage` under `atelier_request_list`, written only
through **`src/lib/requestList.js`**. Line shape reuses the cart's vocabulary so
one set of markup and CSS renders both — `{ sku, slug, name, brand, colourway,
image_url }` — plus `in_stock`, `lead_time`, `metres`, `cut_requirements` and a
refresh-set `unavailable`.

- **Why not just use the cart.** Fabric is decimal metres, carries per-line cut
  requirements, has no price until the back office quotes one, and ends in
  `POST /orders/request` rather than a Stripe payment. Folded into the cart, a
  metre would have to pretend to be a unit and a priceless line would have to
  pretend to cost 0 — and `cartSubtotalCents` would total a number that means
  nothing. Everything else mirrors cart.js deliberately: array in localStorage,
  merge-by-SKU on add, immutable updates, and a same-tab `REQUEST_EVENT`
  (`atelier-request-change`) because the native `storage` event only fires in
  OTHER tabs. `RequestIndicator.jsx` listens to both.
- **The list transforms are pure functions over an array** (`mergeRequestLine`,
  `withRequestMetres`, `withRequestNote`, `withoutRequestLine`,
  `applyProductRefresh`, `toRequestPayloadLines`, `hasBackorderLine`…), with the
  storage wrappers as two lines each on top. That is what makes them testable in
  Node with no DOM — `src/lib/requestList.test.js`, 16 tests. Add logic there,
  not in the island.
- **`normaliseMetres` rounds to 2dp**: `0.1 + 0.2` is `0.30000000000000004` and
  unrounded that is what gets POSTed. It also clamps to `MAX_METRES` (999) and
  returns 0 for anything unusable, leaving the caller to decide whether 0 means
  "reject" (an edit) or "fall back to 1" (an add).
- **`withRequestMetres` does NOT remove at zero** — this is the one place it
  deliberately diverges from the cart's `setCartQty`. Editing an inline metres
  field means passing through `''` and `'0.'` on the way to `'0.5'`, and
  treating those as a delete makes the line vanish under the cursor. Removal is
  the explicit Remove button. The island pairs this with a per-SKU **draft**
  string: every keystroke updates the draft, only a usable figure commits to
  storage, and blur drops the draft so the field snaps back to what was actually
  saved.
- **Unknown stock reads as made-to-order, not as in stock** (`in_stock:
  item.in_stock === true`). That is the safe direction: it shows a lead-time
  checkbox that may not be needed, where the opposite mistake is a 422 at submit.
- A repeat add **refreshes the cloth and keeps the shopper's inputs** — name,
  image and stock come from the new add, metres are summed, and the cut
  requirements already typed against that SKU survive.

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
  **On staging this exemption is moot**: RunCloud's nginx (openresty) puts its
  own Basic Auth in front of EVERY path, `/_emdash/api/*` and `/_emdash/admin`
  included (`WWW-Authenticate: Basic realm="Authorization Required"`, 8 Sep
  2026). HTTP carries one `Authorization` header, and EmDash resolves a user
  ONLY from `Authorization: Bearer` or the passkey `astro-session` cookie, so
  `seed:cms:fields` / `import:cms-art` run against the public URL die with the
  proxy's 401 before EmDash sees the token. Either exempt `/_emdash/api/` from
  the proxy's Basic Auth (or switch it off for the minutes the scripts run), or
  run them on the box against `http://127.0.0.1:<pm2 port>`.
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

## Break-glass (offline) sign-in

An emergency, API-independent login for the account area: `src/lib/breakGlass.js`
(+ `sha256.js`, `breakGlassConfig.js`), reached from `LoginForm` only after a
live attempt failed unreachably (`isApiUnreachable`: ApiError status 0 or ≥ 500).
A 401 stays a 401 — a wrong password is not an outage.

- **Weigh it before enabling it, and it ships disabled.** These pages are
  prerendered, so with the API down the site still browses completely; what
  breaks (cart, checkout, orders, trade pricing) is exactly what a local session
  cannot fake. All this buys is a labelled account shell instead of a bounce to
  `/login`. **If the goal is "let staff in when everything is down", the right
  tool is the `SITE_AUTH_USER`/`SITE_AUTH_PASS` gate in `server.mjs`** — it is
  already API-independent and its credential never reaches the browser bundle.
  The same feature is far more useful in atelier-crm, whose demo screens run off
  local data.
- **It authenticates nothing**: no API cookie, so `/orders/mine` and every other
  endpoint still refuse it. `readOfflineUser` (`src/lib/auth.js`) draws it as
  `role: 'customer'`, `trade_approved: false` — entitled to nothing, so no trade
  price is ever shown that the API would not serve.
- **Off unless configured**: `PUBLIC_BREAKGLASS_EMAIL` +
  `PUBLIC_BREAKGLASS_PASSWORD_SHA256`, both required. Astro inlines them, so a
  change needs a **rebuild** — and the digest ships **publicly in the bundle of
  a public site**. One unsalted SHA-256 is not a password KDF: the passphrase
  MUST be long and random. Rotate by changing the var and rebuilding; live
  sessions die because `readBreakGlassSession` re-checks the stored email.
- **Not `crypto.subtle`** — WebCrypto is secure-context only, so on a plain-http
  box it is `undefined` and the emergency login would fail where it is most
  needed. Hence the hand-rolled `sha256.js`, which also runs under `node --test`.
- Session is **sessionStorage** (dies with the tab), 12 h expiry, consulted by
  `fetchCurrentUser` only when the API produced no user. `Account.jsx` renders a
  dedicated `offline` state (it skips `/orders/mine`, which could only fail),
  and `src/lib/api.js` refuses every non-GET to a non-`/auth/*` path with
  `OFFLINE_WRITE_MESSAGE` — a shopper must never think an order went through.
  `logout()` drops the local session **first**, which is also what lets its own
  request past that guard.
- Guarded by `src/lib/breakGlass.test.js` (16 tests, pure). Verified in a real
  browser against the built site with the API blocked: wrong passphrase stays on
  `/login`, right one signs in, `/account` shows the offline state, a POST is
  refused locally while a GET still goes to the network, log out clears it.

## Env

Copy `.env.example` to `.env` (gitignored): `PUBLIC_API_BASE_URL`, `SITE_URL`,
plus the staging-gate vars above, the optional break-glass pair, and the two
feedback-widget switches (`PUBLIC_AGENTATION`, `PUBLIC_USERBACK_TOKEN`) — both
build-time, both on the launch checklist.

`SITE_URL` is the public origin of the deployment. `astro.config.mjs` reads it
with Vite's `loadEnv` (`import.meta.env` is NOT available in a config file) and
passes it to Astro's `site`, which `Layout.astro` uses for `<link
rel="canonical">` and `og:url`. It is **build time**: unset, those URLs bake as
`http://localhost:4321`, so it belongs on the launch checklist beside
`ALLOW_INDEXING` — set both in the build env and rebuild.

## Foundations

- `.github/workflows/ci.yml` runs this repo's three gates (`npm run lint`,
  `npm test`, `npm run build`) on every pull request into `august-6th-updates`.
  `permissions: contents: read`, so the job token cannot push, tag or write to
  `main`. **No typecheck step — there is no TypeScript here**; a template that
  adds one is wrong.
- **Node 22 in CI, and the floor is real: `npm test` is `node --test
  "src/**/*.test.js"`, and glob patterns in the built-in runner need Node >= 21.**
  On an older runtime it matches no files and reports a green run over zero
  tests — a passing CI that has tested nothing.
- The build needs no API and no database. That is what `safeFetch` in
  `src/lib/api.js` is for, and EmDash's SQLite state under `data/` is gitignored
  and created on demand — a clean checkout builds.

## Featured

What the storefront features is the office's decision, held in `featured_rank`
on `brands` and `collections` and edited in the CRM. Every public catalogue
response carries the column and is already ordered by it
(`featured_rank ASC NULLS LAST`, then the endpoint's own name/id tail), so a
screen filters and slices — it never re-derives a choice.

- **The database owns the ORDER; the page owns the COMPOSITION.** The API hands
  over one ranked list. That the home's first three are the hero and what is left
  leads the "Latest collections" row is decided in `src/pages/index.astro`, and is
  deliberately not encoded in the schema — there is no slot or section column to
  read.
- **`featuredCollections()` (`src/lib/home.js`) re-sorts, and that is not
  redundant.** `featured_rank` carries no unique index on purpose, so two rows
  may share a rank; the tie breaks on the order the API gave. A filter alone
  would pass an unordered list through silently. A rank that is not a positive
  integer reads as "not featured" rather than sorting ahead of rank 1.
- **Everything featured is keyed on the `(house, collection)` PAIR**
  (`collectionKey()`), never the slug alone: `collections_brand_id_slug_unique`
  is per house, so two maisons may both hold a "2024". That applies to the art
  registries and to de-duplicating the row, and it is the same posture the API's
  reorder endpoints take.
- **The artwork fallback chain is three rungs and never borrows**
  (`collectionArtwork()`): the art commissioned for THIS collection, keyed by its
  pair → the collection's own catalogue photograph → no photograph, and the
  caller paints its designed ground (`.home-hero-slide.is-plain`, the umber band
  `/brands/[slug]` gives a house with no banner imagery). It never falls back to
  another collection's picture — a hero captioned "Nature's Opera" over Larsen's
  interior is worse than a plain band — and never emits an `<img>` with nothing
  behind it.
- **An art registry is not a merchandising choice.** `HERO_ART` and `FEATURE_ART`
  in the homepage frontmatter say which commissioned photograph belongs to which
  collection. The office can reorder, add and drop featured collections without
  anyone editing them; a featured collection with no entry is normal.
- **The featured band shows the collection its portrait was shot for**
  (`pickFeature()`), not the top-ranked one — its frame is 40vw beside the copy,
  not 88vh behind it, so it is genuinely art-directed. That is why reordering the
  hero does not move the band, and it is what keeps today's page identical: the
  portrait belongs to Larsen 2024, which the office has at rank 2. It falls back
  to the first featured collection with a photograph of its own, and the band is
  omitted when nothing featured has a picture at all.
- **A page whose whole composition is API-driven needs an outage state again.**
  The home used to survive a build-time outage because its slugs, names and art
  were hardcoded; now nothing featured means no hero, and the page is `overlay`,
  so a collapsed hero would leave the header's bone type on the cream tile wall.
  `CollectionHero` therefore renders an umber `is-empty` band carrying the site's
  own headline. `safeFetch` still means the build itself always succeeds.
- **The storefront asymmetry is real and the CRM says so.** The home is
  `prerender = true`, so a featured *collection* changes at the next site build,
  while `/brands` is `prerender = false` and a featured *house* appears
  immediately.
- **The rule itself lives once, in `src/lib/featured.js`** (`featuredRank`,
  `featuredByRank`). `featuredCollections()` and `featuredHouses()` are named
  wrappers over it, because both surfaces read the same column and a correction
  to what counts as a rank must not land on only one of them.
- **`/brands`'s "in focus" strip is `featuredHouses()`** (`src/lib/houses.js`),
  and it REPLACED a derived guess — international, ranked by designs held, then
  by name. That guess was unchangeable by the office and the trade gate had
  already flattened it: every represented house reads 0 designs to an anonymous
  visitor, so its count tie-break was inert and the order fell through to
  alphabetical. `FOCUS_SLOTS` (3) is the design's row; a fourth featured house
  is still one section down in the directory, which stays alphabetical
  (`localeCompare`, so "de Le Cuona" files under D).
- **A house's chain is `houseArtwork()` and it has the same three rungs**: the
  editorial photograph published for THIS house (EmDash winning over the
  markdown baseline, resolved by the page exactly as `/brands/[slug]` does) →
  a design of this house's own from the catalogue → the shared `.weave` ground,
  the stand-in the house page's collection tiles already use. It reads each map
  at this house's slug and at no other key, so it can never caption another
  maison's interior with this house's name.
- **An unphotographed featured house is KEPT, not dropped.** The strip used to
  exclude a house with no picture ("a grey rectangle beside a photograph"); once
  the office chooses the list, excluding one silently deletes its choice from the
  page — and under the trade gate, no photograph is the normal case rather than
  the edge one. The weave tones rotate across the three cards (`houses.css`), for
  the same reason the product grid rotates them.
- **Nothing featured omits the strip, and that is the whole outage state here.**
  `/brands` is not `overlay` and its directory, header and sourcing band render
  without it, so — unlike the home's hero — no empty-band variant is needed. An
  API outage still renders the page's own error line.

## Dark mode

A header toggle flips the 2026 marketing surfaces to a warm near-black. It is a
**curated set of overrides (`src/styles/dark-mode.css`, imported LAST in
`global.css`), NOT a global token swap** — and that is forced, not a choice: the
palette reuses one colour for two jobs (`--umber` is a dark BAND ground AND the
primary TEXT colour on cream), so remapping the tokens would turn every heading
invisible. Each surface the Aug-2026 page feedback named gets its ground flipped
to `--dark-bg` (#19100c; `--dark-raised` #241813 lifts a card/input) and its type
re-coloured onto the direction's own reversed families (`--bone`/`--bone-soft`/
`--bone-muted`), accents onto `--tan`, hairlines onto `--umber-line`. Dark mode
introduces no new text/accent hue — only the two grounds and one lightened error
(`--clay-bright`, because `--clay` drops under AA on the dark band).

- **The toggle is plain markup, not an island** (`Header.astro`): the sun/moon
  glyph is chosen purely by CSS off `:root[data-theme]`, so there is no hydration
  flash and no React. A no-flash `is:inline` script in `Layout.astro` applies the
  saved theme (and the matching `theme-color`) to `<html>` BEFORE first paint;
  persisted in `localStorage` under **`atelier_theme`**, and a `storage` listener
  syncs other tabs the way `CartIndicator`/`RequestIndicator` do. Dark is
  **explicit opt-in** (never `prefers-color-scheme`) — the warm-paper identity is
  the default.
- **`[data-theme="dark"]` is set on `<html>`; participation is gated by
  `body.has-dark-ground`** (the Layout **`darkGround`** prop). This is the
  load-bearing distinction:
  - The **footer darkens on every page** (ungated) — a dark footer reads as
    intentional under any body, and it means the toggle always does something
    visible.
  - The **non-overlay header and the `<main>` ground darken ONLY under
    `has-dark-ground`**, so the un-redesigned Maison pages (cart, checkout,
    account, contact, journal, order flows, admin, …) keep their light bodies and
    are never left with a dark header/ground over light content. Overlay headers
    (home/products/brands-banner/story/login float bone type on a photograph) are
    never touched.
  - `darkGround` is set on `products.astro`, `brands/index.astro`,
    `brands/[slug].astro` and `products/[slug].astro` (the last two
    `={!notFound}`, so a 404/gate body renders on the light ground). NOT on the
    home (its bands are full-bleed, so `<main>` never shows) or story.
- **THE cross-page gotcha: a section-class override is only safe ungated if that
  class exists on NO un-themed page.** Several product-detail figures are
  explicitly SHARED with un-themed islands — `.purchase-note` (CheckoutSuccess),
  `.request-note`/`.metres-unit` (RequestList), `.detail-selected`/
  `.detail-selected-sku` (Cart + RequestList), and `.indicative-note` (every
  money page). Their dark rules are gated on `has-dark-ground` or they turn
  near-white on the light cart/checkout/order-request ground. `.field-error` and
  the invalid-input state are gated for the same reason. Before adding an ungated
  `[data-theme="dark"] .foo` rule, grep `.foo` across `src/components` — if a
  non-`darkGround` page uses it, gate it.
- **`color-scheme: dark` is itself gated** on `has-dark-ground` — set on `:root`
  alone it flipped native select popups / spinners / autofill dark on the light
  un-themed pages too.
- **Story is the inversion.** It is the direction's one dark-by-default page, so
  in dark mode its `.story-split-body` and `.story-brands` flip the OTHER way —
  to the cream `--shell` ground with umber type (the feedback's "light mode
  here"). Its photo bands (hero, sourced, showrooms) stay as drawn.
- Guarded by the three CI gates (lint/test/build); the visual layer has no unit
  coverage (same as every island) and belongs in an end-to-end pass.
