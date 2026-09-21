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
    its own copy. **Every photo hero is the full viewport now** — `--hero-height`
    (tokens.css, `100svh`), read by `.home-hero`, `.house-hero`,
    `.house-banner`, `.story-hero`, `.bespoke-hero` and `.auth-screen` alike,
    so no two heroes are sized differently (page feedback, Sept 2026:
    "consistent across the entire website"). Change it there, never per page.
    **On every width**: the phone/tablet caps the sheets used to carry (58vh,
    28rem, 32rem, 44rem …) are gone (mobile feedback, Sept 2026), and the
    journal's `.post-hero` drops its 4:5 ratio for the same figure under
    640px. The phone also runs a DEEPER scrim — `.photo-band` / `.tile`
    `--scrim-flat: 0.45` and `--scrim-deep: 0.4` under 640px in
    direction-2026.css, `.house-banner` 0.35 in editorial.css (it declares its
    own flat, so the shared rule cannot reach it) — because a 390px hero puts
    the copy on far less photograph. The CMS scrim knobs still win: they set
    the same properties with a class. Users:
    `/` , `/login`, `/story`, `/brands`, `/bespoke` and `/brands/[slug]` —
    every house now, since Sept 2026: a house with no banner photography of its
    own opens on the client's brands photograph rather than the umber band it
    used to get.
  - **`overlay="light"`** (Sept 2026) — the header still floats over the first
    band but keeps its paper-theme type, its light wordmark and takes no wash:
    for a LIGHT opening band (the shop and journal banners on bg/subtle). Plain
    `overlay` reverses everything for a photograph. `Header.astro` turns the
    string into `.site-header--overlay-light`.
  - **`<ClientRouter />` (Sept 2026)** — every same-site link is a client-side
    navigation, and the View Transition between pages is a CURTAIN, not a
    crossfade: the leaving page dims to the dark ground over 0.3s, the brown
    holds alone on screen, the arriving page comes up out of it over 0.35s
    (a 0.3s delay on the new snapshot is what keeps the two from ever sharing
    a frame). The brown is `::view-transition`'s own background, bound to
    `--color-bg-inverse`, never a literal. It replaced a crossfade with a 14px
    rise, which the client read as a double exposure. The rules are at the
    foot of `chrome.css`, `!important` because Astro injects its own default
    onto the same root pseudo-elements. **The load-bearing consequence:
    a bundled `<script>` runs ONCE per session, not once per page.** Every page
    script therefore listens for `astro:page-load` and tears down on
    `astro:before-swap` — the hero rotator (`CollectionHero.astro`), the drag
    rows (`DragScroll.astro`) and the headline reveal in `Layout.astro` all do.
    A new script that reads the DOM at module load will work on a hard refresh
    and silently do nothing after the first navigation; that is the bug to look
    for first.
  - **`FeaturedBand.astro`** — the featured-collection band (photograph 12px off
    one screen edge, copy on the container's column, the frame's 622 / 108 / 466
    split, drift). ONE component for `/` and `/brands`, and for whatever
    features a collection next; its rules live in `direction-2026.css` as
    `.feature-band`, not in a page sheet. `image` takes an imported asset (gets
    a srcset) or a plain URL string; `side` says which edge the picture runs to.
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
  - **Both widgets must be carried across a ClientRouter swap** (Sept 2026,
    the "toolbar in flow below the footer" report): each styles itself by
    appending `<style>`/`<link>` to `<head>` at runtime, Userback builds its
    launcher into `<body>`, and the swap keeps only what the incoming
    document also carries — so the FIRST client-side navigation stripped both
    sheets and the launcher, Agentation remounted as raw buttons under the
    footer and the Userback bubble vanished. A hard refresh never shows it,
    which is why it could not be reproduced on the old branch. The
    `astro:before-swap` inline script in `Layout.astro` moves the sheets into
    `event.newDocument.head` and the launcher into its body; Agentation's
    island remounts on its own. Any new third-party widget needs the same.
  - **Favicon** (September 2026): `public/favicon.svg` (+ `favicon.png` 96px
    for Safari, which still ignores svg icons, and `apple-touch-icon.png`
    180px), linked from the layout head. **The glyph is the ATELIER
    wordmark's own geometric "A"** — the three subpaths (two legs, crossbar)
    lifted verbatim from `Wordmark.astro`, so tab and header are one
    letterform. **As three `<path>`s, not one `d`**: the legs and crossbar
    overlap and wind against each other, so merged into one path the
    nonzero rule sums the overlaps to zero and punches holes at the apex and
    crossbar (the first render did exactly that). Tan on the dark ground, sized and coloured from the tile the
    client supplied on 17 Sep 2026 (`~/Downloads/Faveicon (3).jpg`, 120px).
    It shipped first as a Didot serif "A", umber on cream, then the same
    serif reversed; both were wrong — "looks different" — and the CRM still
    carries the serif on its grey. The PNGs are rendered from the SVG (a
    headless Chromium screenshot at 96 and 180 — macOS `sips` cannot rasterise
    SVG), so change the SVG and re-render both. `public/` did not exist before
    this — Astro copies it to `dist/client/` and `server.mjs` serves it with
    the rest.
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
    and, NEW with the product-detail frame, real buttons: `.action-fill` and
    `.action-outline` (direction-2026.css) — drawn as a filled tan primary and
    a hairline secondary, and since Sept 2026 ONE button: white at rest, the
    ramp's beige swept in on hover, umber label (`--button-ground` /
    `--button-ground-hover` / `--button-ink`, tokens.css; the client's "all
    buttons should be the same … white to beige"). The old "no button
    anywhere" rule described the pre-redraw frames only. **Every button family
    shares one hover (Sept 2026)**: `.action-fill` /
    `.action-outline` and the Maison `.btn` skins run a fill layer that sweeps
    in from the left and collapses away to the right (`::before`, its
    `transform-origin` flipping with the hover), and `.cta-underline`'s rule is
    a pseudo-element that draws off to the right and back in from the left
    (`cta-sweep`, 0.7s). `.btn-paper` is the one exception — it hovers to an
    outline of itself and a wipe cannot un-fill.
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
    `--container: 96rem` + `--gutter` (72px, the file's page margin; the
    section frame, header and footer included — the cap was lifted for a day
    in Sept 2026 chasing "a gap on the right" that was the scrollbar track,
    and is back at the client's request), radii `0`
    (`--r-sm/--r-md/--r-chip` are kept as names but all resolve to 0 — squared
    corners everywhere), and `.btn` — which since Sept 2026 is the SAME button
    as `.action-*` (white, umber, 16px Inter medium on 16/20 padding, beige on
    hover); the 48px tracked-uppercase outline it was, and the claret
    `.btn-primary`, are gone, and `.btn-primary` / `.btn-paper` / `.btn-danger`
    survive only as names for their call sites. `.link-cta` / `.link-cta-paper`
    remain the underlined uppercase text action.
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
      one white-to-beige button since Sept 2026; 16px Inter medium on 16/20
      padding),
      `.badge-ochre` / `.badge-light` (12px semibold
      label), `.photo-band` (+`-body/-row/-aside/-title/-title-sub`, a full-bleed
      background photograph with a bottom scrim and absolutely positioned copy)
      and `.tile-wall` / `.tile` (+`-body/-title`, the 2-up photo tiles at 12px
      off the page edge with a 12px gutter — the home's two shop banners AND
      the house page's collection grid, the same figure at the same size in
      both frames. The frames draw them 622×700; the client has them **30%
      shorter**, then 15% back up on desktop and 20% on tablet — 622×563.5,
      `aspect-ratio: 622 / 563.5`, `40 / 25.2` under 1024px — Sept 2026. One
      rule; every two-up wall on the site reads it).
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
    type scales (`--t-*` UI, `--d-*` display — the grotesk now, the serif is
    retired — and `--g-xl`/`--g-lg`, the 2026 display pair), the spacing scale
    (`--s1`…`--s10`), container widths,
    radii, shadows and durations. **Use the tokens; do not hardcode a hex.**
  - Type: **Helvena → Inter** display (`--font-grotesk`; the Figma carries no
    serif, and Fraunces went with the Sept 2026 token sync), **Inter** UI,
    **IBM Plex Mono** data (SKUs, money, dates), loaded from Google Fonts in
    `Layout.astro` with system fallbacks. Eyebrows are the `.badge-ochre`
    figure — 12px semibold — not the old 10–11px tracked uppercase. **Form
    labels are sentence case** (`.field > span`, `.field-group legend`,
    `.request-metres-label`: 14px Inter 500, no tracking — client, Sept 2026,
    "labels should not be uppercase", site-wide).
  - Discipline from the handoff, worth keeping: richness comes from photography,
    not chrome; **roughly one claret element per screen**; 1px `--line` hairlines
    instead of heavy cards; no zebra striping; shadows only as a whisper-soft
    hover lift; **brass is never a text colour** (2.7:1 on paper) — fine strokes
    and rules only; every monetary figure carries the muted italic
    `.indicative-note`; NZ spelling; no emoji.
  - A missing photograph renders the duotone **weave placeholder**
    (`.product-image-placeholder`, tones from `weaveBackground()`), not an empty
    box — a grid of unphotographed designs still reads as a collection.
  - **No reader-facing theme.** Which pages are dark is DRAWN, not chosen: `/`,
    `/brands`, `/bespoke` and `/contact` set Layout's `dark` (the inverse
    ground, `dark-surfaces.css`), `/story` paints its own, and everything else
    is the cream canvas. Breakpoints are the CRM's two: `max-width: 1024px` and
    `max-width: 640px`. `prefers-reduced-motion` disables every transform, zoom,
    sweep, drift and reveal on the site. **The document scrollbar is hidden**
    (`html { scrollbar-width: none }` + the WebKit twin, tokens.css): on a
    machine with classic scrollbars its track was a 15px column no photograph
    could run under, reported as a gap on the right of every page (Sept 2026).
    Scrolling itself is untouched.
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
  - `priceInfo(product, viewer, returnTo)` → `{ label, text, muted, indicative, retail, href }`.
    `href` is set on the GUEST no-price line only (`signInHref(returnTo)`): the
    detail page renders it as a real `cta-underline` link, because "Sign in for
    trade pricing" used to be drawn as an action that went nowhere (audit
    SF-B2C-02, Sept 2026). The library card CANNOT carry it — the price sits
    inside the card's own `<a>` — so there the copy is plain muted text, not the
    ghost-action underline it used to wear. **The detail island renders the
    price line as a blank of the same height (`aria-busy`) until the
    credentialed fetch settles** (`viewerReady`): the server has no cookie, so
    a trade shopper used to see the guest copy or retail paint first and the
    NZ$ figure replace it (audit SF-TR-02/04). The library grid needs no such
    guard — it renders nothing until the same `Promise.all` resolves.
    `noPriceCopyFor(viewer)` is exported for the cart, which used to hard-code
    "Price on request".
    FR-3 precedence: `trade_price_cents` (only ever sent to an approved trade
    user, so if it arrived, show it, with the visible retail struck through
    beside it) → `price_hidden` or no retail price → a `NO_PRICE_COPY` line
    **chosen by the viewer** → retail.
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
- **`src/lib/money.js` owns the money — the formatter AND `STORE_CURRENCY`, the
  one currency any customer is ever quoted.** Nothing on the storefront reads a
  currency off a product, a cart line or an order any more.
  - **There is no per-product currency.** `products.currency` is the SUPPLIER's
    — what Atelier pays a house, EUR for Pierre Frey, USD for Trend — and it
    describes NEITHER price column: `trade_price_cents` comes out of the pricing
    waterfall, which computes in NZ$ throughout, and `retail_price_cents` comes
    from the office, the seed, or the D365 merge, which only ever fills a price
    from a line whose currency IS New Zealand (the API's `src/legacy/merge.js`).
    Both are New Zealand cents whatever that column says. Reading it as the
    price's currency put **"US$429.00" on one card and "$129.00" on the next**
    in the same grid, for goods bought in one basket, in one Stripe charge, to
    one New Zealand address — and sent the same mismatch to Stripe's
    `price_data.currency`, a ~1.8x overcharge on a figure the card had shown in
    NZ$. It also published the wrong `priceCurrency` in the product page's
    JSON-LD, so the rich result advertised a NZ price as USD.
    The API no longer publishes the supplier currency on a public product at
    all: `currency` on the catalogue read models is the SELLING currency.
  - **`cartCurrency()` takes no argument and ignores `line.currency`.** A cart
    written before this fix is still in a real shopper's localStorage carrying
    `"currency":"USD"`; honouring it would keep printing US$ over NZ cents and
    keep suppressing the subtotal on a basket that was never mixed. The
    "Items in different currencies check out separately" note and the disabled
    Pay-now button it gated are gone with it — a basket cannot be mixed now.
  - **ONE SELLING REGION PER DEPLOYMENT — New Zealand**, and `STORE_CURRENCY` is
    a constant rather than an env var on purpose. The shipping tiers price only
    NZ zones, GST is 15% and one Stripe session settles in one currency, so a
    second region is a business change (a rate source, a rounding rule, a Stripe
    account that settles in it), not a formatting one — a env var here could
    only relabel NZ figures, not price them. `formatAmount` keeps its currency
    argument for LEGACY Dynamics invoices alone: an invoice already issued is a
    record of what was charged, not a price being quoted.
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
  overlay="light">` opening on a LIGHT banner — `.library-hero`, bg/subtle
  #efe6dc as the frame draws it (9457:5255), the ochre badge, the "Products"
  display headline in text/primary, the one line of copy on the right, the
  header floating inside the band in its PAPER theme (`overlay="light"`, Sept
  2026; the band was umber with reversed type before). `/resources` opens on
  the identical band and the identical 96px of air under it. Then the browse
  area — boxed 44px search, one closed **multi-select dropdown per facet**
  under the ochre 12px heads on hairlines ("Brands", "Category", "Price" — the
  labels are the frame's; Application, Composition, Size and Lead time render
  the same way, no boxed selects any more), the "Refine … Clear
  all" row CLOSING the 267px sidebar as the frame does (9457:5273; it used to
  open it), and surface-cream cards
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
  exceeds the API page cap. The sort/count row is KEPT even though the mock's
  dummy cards do not draw it — working merchandising is not dropped for a
  frame's placeholder content. The card's colourway dot strip and the
  "Indicative" note are GONE (client, Sept 2026); cards arrive with a
  staggered fade-and-rise (`card-in`, library.css).
  - **Cards are merchandising, not a spec table**: the list endpoint now carries
    `image_url`, `in_stock`, `colourway_count` and a capped `colourways`
    strip, so each card shows a photograph (or the weave-gradient placeholder)
    and a stock pill; the colourway dots are no longer drawn (the strip still
    feeds the placeholder). `weaveBackground()` builds the
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
    - **Every facet is a MULTI-select dropdown** (September 2026, Userback: the
      office wanted "Stroheim, Trend and Vervain", not one house at a time).
      One native `<details>` per filter — closed on arrival, the `<summary>` is
      the ochre head with a chevron and the number ticked, the checkbox rows
      open IN FLOW under it (the aside scrolls its own overflow, so an overlaid
      panel would be clipped; no open/close state is held). The selection is
      an **array per key**: OR within a facet, AND across facets, and
      `facetOptions` measures counts against the OTHER facets so a second house
      stays tickable. **Querystring = one repeated key per value**
      (`?brand=dedar&brand=zimmer`), never a delimiter — composition strings
      carry commas — so a single-value hand-off (`?brand=dedar` from the home
      and house pages) is just the one-element case. The shape lives in
      `src/lib/libraryFilters.js` (`readSelection` / `selectionParams` /
      `toggleValue`, tested); the island holds no string selections anywhere.
      The former `control: 'list' | 'select'` split is gone — one control, one
      options builder (`facetOptions`) for all eight.
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
    - **A facet with no options is dropped**, so Size does not ship as a
      dropdown of nothing while no product carries one. A selection arriving
      by deep link survives the drop — it still filters, and "Clear all" is
      its exit.
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
  - **Deviations from the mock, deliberate:** the count/sort row stays (working
    merchandising over dummy-frame fidelity). Width, which the mock drew as four
    values, is no longer a filter at all. The trade-gate panel sits on
    bg/subtle, a step darker than the cards.

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
    purchase note), the 24px price in text/muted with `/ m` for cloth, the
    Size control and **Colour as 32px discs** (`.detail-swatches`, the chosen
    one ringed, each painting its colourway's tones), hairline `.detail-specs`
    rows on border/subtle (last row unruled), the `Flax | PF-ATL-02` selected
    line and **equal-width actions** on a 12px gap — Add to quote / Add to
    cart plus "Request a sample" (a link to /contact; there is no sample
    endpoint on the storefront). Under the picture, a **thumbnail rail**
    (`.detail-thumbs`, 93px squares): one per colourway, its photograph where
    the CRM holds one and its weave otherwise — the seed holds no colourway
    photography, so the rail is all weave today. Rail and discs both call
    `chooseColourway`, so they never disagree. The band is the frame's
    622 / 562 split, the picture 12px off the left edge (Sept 2026, frame
    9422:4855) — and since Sept 2026 the band sits INSIDE the container on a
    72px gap with the copy centred on the picture's height, the primary action
    is latte (`--button-primary-ground`, pink/300, hovering pink/400) beside
    a white secondary, and there is no hi-res download link and no
    "Indicative" note. Below the band, **"Similar Products"** — the head
    centred, no action — is the brands row's figure (three or fewer tiles sit
    centred under the head — `.is-centred`, auto margins on the end tiles so
    an overflowing row still scrolls from its first tile; Sept 2026): up to
    twelve same-house
    round cards (the shop's `.product-grid-round` card, `SIMILAR_LIMIT`,
    self filtered out) in a row that runs off the right edge on the canvas
    ground, dragged. DragScroll binds page rows on `astro:page-load`, before
    the island has fetched, so the island fires `atelier-drag-scroll` once
    the row exists and DragScroll binds any unbound `[data-drag-scroll]` on
    that event (`data-drag-bound` marks the ones it has). The old "The range"
    swatch wall stays gone; the rail is its replacement, per the frame.
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
    `<Layout bleed overlay>`: full-viewport collection hero (`--hero-height`)
    **with the header floating inside it** → two shop banners → Brands row →
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
  - **The scrim is the file's hero scrim, and it is one figure site-wide.**
    `.photo-band::after` defaults to Figma 9379:2566 exactly — a flat 30% wash
    under a gradient clear to 53.83% and 20% at 84.76% — and every photo band
    carries it: the home rotator's slides, `/brands`, a house banner, `/story`,
    the manifesto and houses bands. The private overrides those bands used to
    run (`.house-banner` 0.5/0.08 + flat 0.2, `.home-manifesto` flat 0.58) are
    gone; a band that needs more or less asks through the CMS scrim knob
    (`band-scrim-soft/deep/none`, whose ladder sits around this default), never
    through a rule of its own. The site used to ship 0.62/0.12 — about twice
    the file — which is what the feedback was reacting to. `/login` keeps its
    own centred-form scrim (see its entry); it is not a `.photo-band`.
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
  is laid out like a Shopify checkout (Sept 2026): a Cart › Checkout › Secure
  payment step row, Contact + Delivery + Your reference on the left, and on the
  right a sticky stack (`.checkout-aside`) of **shipping method, the order
  summary, then Pay now directly under the total**. The summary (thumbnails with
  qty badges, subtotal / shipping / GST / total) folds into a native `<details>`
  "Show order summary" bar under 1025px; there the aside is `display: contents`,
  which hands its three blocks to the page grid so the summary bar stays at the
  top of a phone while the method and Pay now drop BELOW the form (only a grid
  child can be reordered — hence the wrapper that steps out of the way).
  **The whole page is one `<form>`**, so the button in the right-hand column
  still runs the left-hand column's native validation. **The three fixed NZ
  zones (Auckland / North Island / South Island) are ONE control: a `Region`
  `<select>` among the address fields**, each option carrying its own rate,
  quoted **live** and in parallel from `GET /shipping/quote?zone=&qty=` whenever
  the total qty changes. The shipping method on the right states the rate that
  region buys and is not a second chooser: two controls would be two answers to
  "where is this going", and the cheaper one would be the one the freight was
  charged at. **The store collects the customer's
  contact and delivery details itself** (Sept 2026): email, phone, name or
  business, address lines, city, postcode — country is not a field, delivery
  is NZ-only. A signed-in shopper's form starts from `GET /checkout/prefill`
  (account name/email, then the last card order's address and phone, then a
  trade application's business name / delivery address / phones); a guest, or
  any prefill failure, starts blank, and every field stays editable. The form
  is a real `<form>` so native `required` / `type=email` validation runs
  before submit; `src/lib/checkoutCustomer.js` (tested) owns the blank form,
  the prefill mapping and the `customer` body shape. **GST 15%** is shown as
  its own row on goods plus freight through `src/lib/gst.js`, a tested mirror
  of the API's `src/orders/gst.js` — change one, change both. "Pay now" POSTs
  `{ lines: [{ sku, qty }], zone, customer }` to `POST /checkout/session` then
  `window.location.href = body.url` (redirect to Stripe). **No prices are sent**
  — the API re-resolves them. The cart is NOT cleared on redirect, so Stripe's
  `cancel_url` (`/cart`) returns to an intact cart. Stripe's page asks for the
  card only — the API forwards the address and phone as the PaymentIntent's
  `shipping` and the email as `customer_email`, and the webhook persists them
  from session metadata. A failed `POST /checkout/session` surfaces the API's message
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
  - **Header**: one row — nav (Shop / Our Brands / Bespoke / Our Story /
    Journal) left, the wordmark absolutely centred, `Contact` + three 24px icons
    (search, account, cart) right; 32px above the row, 18px below, 24px between
    every item. **Below 1024px the nav and Contact leave the row for a
    full-screen menu** (Sept 2026): a two-line burger in the utilities folds
    into a cross; the menu is a fixed panel on the dark ground, CLIPPED not
    faded — closed it is `clip-path: inset(0 0 100% 0)`, opening runs to
    `inset(0)` so it is revealed downward, closing retracts it upward — with
    the links in the display face arriving on a stagger (`--i`), Account /
    Cart / Trade account under a hairline. Header.astro's script re-arms it on
    `astro:page-load`, locks scroll on `<html>`, closes on Escape, on any link,
    and before a page swap. **The burger is listed beside `.site-icon` in
    EVERY colour rule** (paper, overlay, dark, pinned, light — chrome.css and
    dark-surfaces.css), never `color: inherit`: the header element itself
    carries no colour, so an inherit drew it umber on the dark heroes and it
    vanished (mobile feedback, Sept 2026). **Under 1024px the row is two
    ends**: the wordmark `position: static; order: -1` on the LEFT at
    `--wordmark-width: 140px` (70% of the desktop 200), the icons and the
    burger on the right — the absolutely-centred mark sat under the icons
    once the nav had gone. The
    icons are inline SVG, not `<img>`, so `stroke="currentColor"` follows the
    theme. **The magnifier is a toggle, not a link** (Sept 2026): `.site-search`
    is a GET form to `/products` with a zero-width `?q=` input beside the
    icon; the script opens it (and focuses the field), submits it when there
    is text, closes it when there is not, and on Escape or a click elsewhere.
    The input joins every colour-only rule `.site-icon` is in, so it reads
    on every ground. A **fourth** icon, `RequestIndicator.jsx` (scissors, the fabric
    request list), sits before the cart and **renders nothing while the list is
    empty** — the drawn header keeps its three icons in the state the mock was
    drawn in, and a shopper who has actually built a request list can still
    reach it from every page instead of having to remember the URL. Same
    argument as the cart's count badge. Geometry is converted from the mock's
    1280px frame to the site's own `.container` (96rem / 72px) so the
    wordmark, the page bands and the footer stay on one column.
  - **Scroll behaviour (Sept 2026).** The bar slides away on the way down and
    slides back on the way up on the page's own ground — `--color-bg-inverse`
    on a `theme-dark` page, `--shell` otherwise — and is its natural self again
    at the top. A contained header is `position: sticky` and only needs the
    slide (`is-hidden`); a floating one goes `fixed` (`is-pinned`) once the page
    has scrolled past it, which also drops the wash and, on a light page,
    un-reverses its type and wordmark. Header.astro's script drives it (rAF-
    throttled scroll, 4px dead band, never hidden while the menu is open, torn
    down on `astro:before-swap`).
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
    direction's underline, not a colour swap — and since Sept 2026 that rule
    is a `::after` that DRAWS in from the left on hover (and off to the right
    on leaving), the same sweep every action makes; the current item holds it
    fully drawn. **There is no rule under the header** on any page (the
    `border-bottom` went, Sept 2026).
  - **`Wordmark.astro` is the logo export, INLINED.** Since the client's Aug
    2026 supply it is the HORIZONTAL lockup — geometric ATELIER caps over
    spaced TEXTILES caps, 636 × 141 (4.51:1) where the stacked mark of the
    August 2026 redraw was 130 × 51.93 (2.50:1). Hence the widths moved with
    it: **200px in the header** (~44px tall, still centred on the row rather
    than hanging from a fixed top) and **240px in the footer**. The `width`
    prop lands as `width: var(--wordmark-width, <width>)`, so a breakpoint
    resizes the mark by setting the property on the link around it (the
    header's 140px and the footer's 168px under the phone breakpoints) —
    an inline `style` cannot otherwise be overridden without `!important`.
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
    still render on `/contact`. **Under 640px the footer is a two-column
    grid** (mobile feedback, Sept 2026): the mark centred across both columns
    at 168px (70%), the two link columns under it, the social icons in the
    SECOND column under Terms & Conditions, the newsletter across the foot.
    `.site-footer-brand-col` and `.site-footer-links` go `display: contents`
    so the grid places their children directly — the markup is the desktop
    markup, ordered with `order`.
  - **Privacy Policy and Terms & Conditions** are the mock's last two links.
    `/privacy` and `/terms` render `page`-collection entries (CMS first), on
    the shop banner since Sept 2026 — see Resources + company pages. The
    footer links them unconditionally; the markdown ships placeholder copy.

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
redraw (Figma "Brands Page", 9379:3562), `<Layout bleed overlay dark>` — a
DARK page since Sept 2026: a full-viewport photo hero (`--hero-height`) on the
client's own photograph, `src/assets/img/brands-hero-bg.jpg` (2560 × 1348,
supplied Sept 2026 — it no longer shares the home's design-houses art), with
the home's design-houses COPY and the same CMS hook: `applySection` over the
`home-houses` site section, so copy or an image the office sets there is the
/brands hero too, and an empty CMS renders the shipped art and copy; image,
title and body only — the band's align/scrim knobs stay the home's), then the
**wall of house tiles** — with NO head over it since Sept 2026 (page
feedback: "remove this fully"; the frame's centred "Brands" headline and the
"Choose a house" head `/bespoke` borrowed from it are both gone, with
`.house-wall-head` — the hero names the page) — 3-up 371×497, photograph under a
flat 0.38 scrim with the maison's mark centred — the brand's `logo_url` PNG as
`img.house-card-logo` when the CRM has one, else the house NAME in the same
class — then the **featured-collection band**, which is
`components/FeaturedBand.astro`, THE SAME component the home closes on
(photograph 12px off the left screen edge, copy on the container's column, the
622 / 108 / 466 split, the drift): the first `featured_rank` collection that
carries a catalogue photograph, omitted when none does; the link goes through
`collectionHref`'s ladder. There is no `.house-feature` of its own any more —
"exactly like the featured collection section of the homepage" is a shared
component, not a copied figure. The wall renders **in the API's
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
  full-viewport `.photo-band` (`--hero-height`) with the header floating inside
  it (`<Layout bleed overlay>`), the country as a `.badge-light` above the name.
- **"Product Page" (9350:788)** — the house has NONE. The frame draws an umber
  `.house-band` here; since Sept 2026 the page does NOT — every house opens on
  the same full-viewport hero, on the client's brands photograph
  (`brands-hero-bg.jpg`) when it has none of its own (page feedback: "no hero
  banner"). The hero is the Story page's, exactly: badge + name at the foot on
  the left (no provenance line anywhere on the page since Sept 2026 — the
  "Italy" / "France · est. 1935" `.house-meta-line` under the headline was
  removed at the client's request, and `houseMeta` is no longer imported
  here), a flat 20%
  scrim (the frame's) under the foot gradient. Everything from the intro down
  is identical. **It is not a product-detail screen** — the tiles below it are
  still collections and the copy is still a house blurb; the frame name misleads.
  Fourteen of the seeded houses are represented-only with no imagery at all,
  so most of the directory renders on the fallback photograph.

Then, in both: the intro (`466fr / 204fr / 466fr`, the mock's two text
wrappers at either end of the column, the blurb pinned to track 1 and the body
to track 3 — **released to `grid-column: auto` under 1024px**, or the body
keeps forcing a third implicit column beside the blurb instead of stacking)
with the blurb as **24px Inter medium** over the body copy and the actions below it,
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
  TEXT columns now — the blurb on the left (heading/md: **24px** Inter medium,
  1.1, -1% — the frame 9379:2657 says 24, an earlier note here said 16), the
  body copy and the actions on the right, two 466px wrappers at either end of
  the column as three tracks (466 / 204 / 466) with 102px above and below,
  on the DARK ground (the page sets Layout `dark`, Sept 2026, and the intro
  names no colour of its own). `foundedYear()` lost its caller here (the
  homepage's featured band still renders `.house-facts`, which is why the
  figure survives in editorial.css). The design-count fetch stays — it still
  decides the "View all products" fallback action.

**404 rule:** `!brand && !apiDown && !emPage && !mdPage`. So an API 404 with an
editorial page still renders (preserving the old `getStaticPaths` UNION
behaviour), and an API outage renders whatever editorial exists — offline-safe.

**Precedence: EmDash WINS over markdown here**, and since September 2026 the
journal follows the same rule (`lib/posts.js`). Brand pages and posts were
handed to the CMS as the editor of record (that is the point of wiring them
through EmDash at all), while the markdown files stay the offline baseline
shipped in the repo. Posts used to be the other way round — markdown won on a
shared slug — which is how the shipped post was live on `/resources` while the
admin could not see it, and nothing an editor did could reach it;
`scripts/import-posts.mjs` moved it across (see US-025/US-026). Precedence is
per PAGE, not per field — the markdown entry is not even loaded when a CMS
page exists, so a page is never a confusing hybrid of both sources.

## Resources + company pages (US-025)

No islands; the journal pages render on demand (`prerender = false`) because
the CMS is queried live:

- **There is no `/search` page** (removed Sept 2026 at the client's request,
  a week after it was built: "this search icon should extend in the header
  itself"). The header's magnifier is a toggle that opens a field in the row
  and submits to `/products?q=` — see Site chrome. `search.astro`,
  `search.css`, `SearchResults.jsx` and `lib/search.js` are gone with their
  `robots.txt` disallow; `listEmdashPages` and `truncateWords` survive for
  their other callers.
- **`/resources` (`resources/index.astro`)** — opens on the shop page's banner
  (`.library-hero`, `<Layout bleed overlay="light">`, no italics — Sept 2026),
  then `listPosts()` from `src/lib/posts.js`: published EmDash `posts` UNION
  the markdown `post` collection, newest-first, **the CMS winning a slug both
  have** (editor of record; markdown is the offline baseline and is not even
  loaded for a slug the CMS has). Lead card + gallery, hero + title + date +
  standfirst; empty state when none. Cards link to `/resources/<post.id>`.
  Every card's picture sits in `.journal-card-frame` and zooms inside it on
  hover, exactly the lead card's one hover (page feedback, Sept 2026); the
  Maison border-to-brass hover went with it.
- **`/resources/[slug]` (`resources/[slug].astro`)** — `getEmdashPost(slug)`
  first (Portable Text body via `<PortableText>`, `houses` → the brand tags),
  else the markdown entry (`render(post)` inside `.prose`), else 404. **Rebuilt
  on the direction's figures, Sept 2026** (`<Layout bleed>`, the `.post-*`
  rules at the foot of editorial.css): a 16:9 `.photo-band` on the container
  with the headline at its foot (so the picture drifts like every other), a
  hairline meta row under it — breadcrumb, mono date, the `brands` tags as
  `.badge-ochre` links to `/brands/<slug>` showing the house NAME from the
  catalogue API (safeFetch — the slug stands in when it is down) — then the
  body on the 46rem narrow measure. `article.post` is two deep on purpose:
  global.css still pins `.post` to the old 41.25rem article measure and lands
  after every imported sheet. No serif, no drop cap, no brass rule.
- **`scripts/import-posts.mjs`** (`EMDASH_TOKEN=… node scripts/import-posts.mjs
  [base-url]`) moves the markdown posts into the CMS: frontmatter `date` →
  `publishedAt` (the journal keeps its order), `brands` → the comma-separated
  `houses` field, the hero downloaded into the media library, the body via
  `markdownToPortableText` (refuses rather than degrades). A slug already in
  the CMS is skipped, so re-runs are no-ops and an editor's post is never
  replaced. It shares `scripts/lib/emdash-client.mjs` with the brand-page
  import (Bearer fetch, cursor walker, media dedupe by filename). Run it
  against staging after the deploy that flips the precedence, or the imported
  post sits in the admin while the markdown one keeps rendering.
- **`/story` is no longer one of these** — the August 2026 redraw (Figma
  "Story Page", 9436:3043) made it a DARK page (the first; `/`, `/brands`,
  `/bespoke` and `/contact` followed in Sept 2026 through Layout's `dark`), fully
  art-directed in `story.astro` + `story.css`: photo hero ("Our Story" + the
  dictionary line), "Why Atelier" as the home's featured band
  (`FeaturedBand.astro`, picture LEFT), the "Sourced from the World's Design
  Capitals" band, the home's Brands row (`BrandsRow.astro`, the same sixteen
  tiles), "Inside the Atelier" as the same band (picture RIGHT, the supply list
  in its body slot), and the trade-showrooms band, the bands butted with no
  gap between them (Sept 2026: the old 50/50 splits with their raised copy
  panel, the 4-up strip and the 25 Aug gaps are all gone) — the showrooms'
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
  the markdown loading entirely, never a hybrid. `/contact` is two columns
  from the top (page feedback, Sept 2026): the display headline and intro,
  then the ways in — email and phone set large in the display face
  (`.contact-reach`), the three showrooms as surface tiles with the city as
  title (`.contact-showrooms`), and one closing line for hours and the
  social links — on the left; the enquiry form on its surface panel on the
  right, top-aligned with the headline. The hairline label/value rows it had
  ("too list style") are gone. Under 640px the tiles stack and the panel pads
  32/24 rather than 48 so the fields keep the container's own width.
  Seeded markdown:
  `src/content/pages/story.md`, `contact.md`, and — since Sept 2026, at the
  client's request — `privacy.md` and `terms.md` carrying LOREM IPSUM
  placeholders under numbered headings until the client's copy lands (the
  office can also supply either from the CMS, which wins). **`/terms` and
  `/privacy` open on the shop page's banner** (`<Layout bleed
  overlay="light">` + `.library-hero`, badge "Atelier Textiles") and set the
  copy on the container's full width (`.legal-page`, library.css — `.prose`
  released from the article measure, h2 in the display face).
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
- **`/resources`** merges published EmDash posts + markdown (**EmDash wins on
  slug**, via `lib/posts.js`); **`/resources/[slug]`** resolves EmDash first
  then markdown, else 404. Both are `prerender = false`. Same precedence as the
  brand pages — rationale in the US-024 section above. The `posts` collection
  carries one field beyond EmDash's default four: `houses`, a comma-separated
  list of atelier-api brand slugs (`normalisePost` → `brands`), the join the
  post page's house tags use. It is in the seed, so an existing database gets
  it from `npm run seed:cms:fields`, not from a restart.
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
- **The password tab is labelled "Reset Password".** It is an action, not a
  field, and a client scanning the nav looks for the verb (page feedback, Sept
  2026); the panel itself is still the change-password form.
- **The Account panel edits name and phone, and nothing else.** Two uncontrolled
  forms read on submit — `PATCH /auth/me` and `POST /auth/change-password` — with
  their state in the island, because no panel in `accountPanels.jsx` may hold a
  hook (`renderPanel` calls them conditionally). **Email is read-only on
  purpose**: it is the login identity and the collision rules live behind
  `PATCH /admin/users/:id`, so the row carries the sentence that says to ask the
  office rather than a disabled input, which reads as a field the page has
  broken. The change-password 401 is rewritten by `changePasswordError`
  (`src/lib/passwordReset.js`, which already owns the 12-character floor both
  password screens share): api.js turns every 401 into "Please log in to view
  this", and on a page you are demonstrably signed in to that reads as a session
  that has expired rather than as the wrong current password.
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

## Order cards, the request-list copy and the Terms of Trade link (Userback 15 Sep 2026)

- **`orderCard` (`src/lib/orderView.jsx`) names a line as the catalogue does** — brand eyebrow, `Design — Colour` linked to `/products/<slug>`, SKU + unit price (`per metre` / `each`) underneath — because the bare product name (`04620 ×5.6 —`) meant nothing to the client who ordered it (8367797). Fabric quantities print as metres, goods as `×n`.
- **The discount row is derived from `order.discount_pct` and `subtotal_cents`** (`discountCents`, goods only, same rounding as the API's `discountedTotalCents`) so a $700 subtotal above a $665 total no longer reads as an arithmetic error (8367809). The API exposes the percentage only; the reason stays in the back office.
- **`/order-request` no longer leads with "Cut to order"** (8367783): the eyebrow is "Fabric request" and the copy says nothing is charged and a quote follows — the per-line "Cut requirements" field keeps its name because it IS the cut instruction and the CRM labels it the same.
- **The request form takes a note for the quote and an optional delivery address** (8373461): `notes` → `orders.notes` (the client's own words, no longer a packed `Name | Email` line), `shipping_address` in the SAME shape the Stripe webhook writes, built by `requestAddressPayload` in `src/lib/requestList.js` — which sends nothing when the form names nowhere, because the prefilled country alone is not an address and would make every collected order look shipped. `state` is never asked for (NZ has none) and goes as null.
- **The trade application's "Terms of Trade" is a link to the office's PDF on atelier.co.nz** (`TERMS_OF_TRADE_URL`, 8367835), opened in a new tab with `stopPropagation` so the click does not also toggle the consent checkbox it sits inside. Not copied into the site: the office updates the document, not this form. `/[slug].astro` + an EmDash page would serve a web version with no code.

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
  not a full viewport behind it, so it is genuinely art-directed. That is why reordering the
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

## Dark surfaces (there is no dark MODE)

**The reader-facing dark/light toggle is gone** (page feedback, 1920×968 #8), and
with it `[data-theme]`, the `atelier_theme` key, the no-flash script in
`Layout.astro` and the `darkGround` prop. Do not reintroduce any of them.

What that toggle used to reveal is now simply how the site is drawn. The Figma
home page (9379:2565) is dark end to end — hero, banner wall, Brands row,
manifesto, featured collection — and the footer component is dark on every page
frame in the file. So `src/styles/dark-surfaces.css` (was `dark-mode.css`,
still imported LAST in `global.css`) has two scopes, deliberately different:

- **`.site-footer` rules are UNCONDITIONAL.** One footer component in the file,
  one dark treatment here, no page gate.
- **Everything else hangs off `body.theme-dark`** — the Layout **`dark`** prop.
  That is a page declaring itself drawn on the inverse ground. `/` and `/story`
  set it; `/products`, `/products/[slug]`, `/brands` and `/brands/[slug]` are
  cream in the Figma and do not.

It is still a CURATED set of overrides, not a token swap, and that is forced
rather than chosen: the palette reuses one value for two jobs (`color/bg/inverse`
is a dark BAND ground AND the primary TEXT colour on cream), so remapping tokens
would turn every heading invisible. Each surface gets its ground flipped to
`--dark-bg` and its type re-coloured onto the reversed families (`--bone` /
`--bone-soft` / `--bone-muted`), accents onto `--tan`, hairlines onto
`--umber-line`. No new hues.

- **THE cross-page gotcha survives the rename.** A section-class override is only
  safe ungated if that class exists on NO light page. Several product-detail
  figures are shared with un-themed islands — `.purchase-note`
  (CheckoutSuccess), `.request-note` / `.metres-unit` (RequestList),
  `.detail-selected` (Cart + RequestList), `.indicative-note` (every money
  page). Their rules stay behind `body.theme-dark` or they turn near-white on
  the light cart/checkout ground. Before adding an ungated rule, grep the class
  across `src/components`.
- **Some blocks are now DORMANT and are marked so in the sheet**: the
  product-detail rules only ever matched a dark product page, and the current
  Figma draws that page on cream. They are kept, not deleted — the classes are
  shared and the rules are correct the day a dark product page returns.
- **Story is no longer an inversion.** With no toggle there is nothing for it to
  invert against; it is simply a dark page, as it is drawn.

## 16 September 2026 feedback round

- **The house page's banner is the house's TILE photograph**: `houseArtwork`
  (lib/houses.js), the same chain `/brands` uses — the CRM's `image_url`, then
  the editorial slideshow, then a collection's picture, then a design's, then
  the client's brands photograph. The right-hand banner aside (the country a
  second time) is gone; the provenance line ("France · est. 1935") moved under
  the headline.
- **`brands.headline` + `brands.story` are the two CRM text fields on a house
  page.** The headline opens the left column (`.house-headline`), the story is
  the body copy — on the RIGHT for an ordinary house, under the headline for a
  bespoke one (whose right column is the enquiry form). The editorial blurb no
  longer falls back to `brand.story`; the two are different fields now.
- **The bespoke form's "What are you interested in?" lists the categories
  first and "All of the above" LAST** (the empty value is still the payload
  contract; "Not sure yet — anything" is gone).
- **The request list has no per-line "Cut requirements" box.** Cutting
  vocabulary belongs to the cutting system; `cut_requirements` still exists on
  the API and older orders still print theirs in the account.
- **"View in my account" lands ON the order**: `accountOrderHref(order_number)`
  is `/account#orders/<number>`; `sectionFromHash` reads the section off the
  first segment, `orderFromHash` the order, and Account scrolls the card
  (`orderCardId`) into view and marks it `.is-focused` once the Orders panel
  has rows. The account's Orders panel already renders every order in full
  (lines, totals, status) — that IS the customer's order detail; a guest has
  /order-lookup.

### The sample enquiry cart and the trade details form (16 Sep 2026)

- **"Request a sample" ADDS to a list; it no longer opens /contact.** `lib/sampleList.js`
  is the requestList.js shape (localStorage, one line per SKU, capped at 20, pure
  transforms tested), `SampleIndicator` is the header badge, and `/sample-request`
  (`SampleRequestList.jsx`) sends the lot as one `POST /samples/request` — contact
  prefilled from the session, guests welcome with an email. The API lands it as a
  `pending` sample request in the CRM and emails both sides; the list clears on
  success. **The page wears the direction** (page feedback, Sept 2026 — it opened
  on the Maison `.page-intro` with a 24rem boxed sidebar, "too condensed while
  the rest has a lot of white space"): `<Layout bleed overlay="light">` on the
  shop banner like the cart and checkout, then `.sample-request` — two EQUAL
  halves on the container: the cuttings as a hairline list (`.sample-line`:
  88px thumbnail, house `.badge-ochre`, 20px name, colourway + SKU, a ruled
  one-line note, underlined Remove) beside the details on `.sample-panel`,
  which is the contact page's surface panel to the pixel — no fieldset, no
  legend. Rules in commerce.css under "Sample request"; `/order-request` is
  still on the Maison figure and is the obvious next page to bring across.
- **A trade client edits their own application under Account → Account**
  (`tradeDetailsForm` in accountPanels.jsx, fields declared once in
  `lib/tradeDetails.js`): `GET`/`PATCH /account/trade-application`. The consent
  block is not offered — the API refuses it anyway. A 404 (a login the office
  created by hand) is said in words. Uncontrolled inputs keyed on `updated_at`,
  the details form's own idiom; a 422 prints under the field it names.
- **The portal takes the container's width** (`.account` had a 58rem cap, the
  order list 52rem) — "orders should take up more of the screen".
- **The worktree gotcha**: an Astro dev server whose `node_modules` is a symlink
  into another checkout serves no island — Vite refuses `@astrojs/react/dist/client.js`
  from outside the root and every `client:load` component silently fails to
  hydrate (the server-rendered HTML looks fine). Install real node_modules in a
  worktree before trusting a browser check.

## 16 September 2026, round two

- **An order card COLLAPSES.** `orderCard(order, { open })` is a native
  `<details>`: the summary carries number, kind, date, item count, total and
  status, and the lines and totals open under it. A client with dozens of orders
  scrolled past every line of every one of them. The order a hash link names
  (`#orders/<number>`) arrives expanded, and the guest lookup — one order, looked
  up on purpose — passes `open: true`.
- **Changing a password is its own account section** (`SECTION.PASSWORD`,
  `passwordPanel`), not a `<details>` buried under the account form. Every
  account has one, so the tab is never gated.
- **A collection tile ALWAYS links to its own grid**
  (`/products?brand=…&collection=…`). It used to fall back to the house page when
  `product_count` was 0 — the audit's SF-TR-01 reasoning — and that reasoning
  assumed the count was true. On the house page it cannot be: the page renders
  server-side and a server fetch carries no session cookie, so the count arrives
  gated, 0 for every trade-only house, and every tile bounced back to the page it
  was on. The grid is client-side, has the cookie, and explains its own gate.
  **Separately: no product in the seeded catalogue carries a `collection_id` at
  all**, so the grids are empty until the office assigns products to collections
  in the CRM (Catalogue → Products). The vendored snapshot has no product↔
  collection mapping to import — the product rows carry a `design`, and no design
  name matches any collection name.
