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

## Cart

Client-side cart lives in `localStorage` under key `atelier_cart` (array of
`{ sku, qty, ... }`). `CartIndicator.jsx` reads it for the header count and
listens to the `storage` event. Cart write path arrives in US-019.

## Env

Copy `.env.example` to `.env` (gitignored). Only `PUBLIC_API_BASE_URL` today.
