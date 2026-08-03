import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import {
  priceInfo,
  productTypeLabel,
  weaveBackground,
  PRODUCT_TYPE_LABELS,
} from '../lib/catalogue.js'

// Product library island (US-017), Maison direction (design: "Maison Library").
// Fetches the website-visible catalogue once from GET /catalogue/products, then
// searches, filters and sorts in-memory so the grid updates instantly with no
// page reload. The catalogue is small (well under the API's max page size), so
// a single request backs every combination.
//
// The request is credentialed (see lib/api.js), so an approved trade user's
// cards carry trade_price_cents — the API is the gate, this island only renders
// whatever price it was given. It ALSO resolves the viewer (GET /auth/me) in the
// same round trip, because the copy shown where there is no visible price
// depends on who is asking (priceInfo's second argument); the two are fetched
// together so the grid never paints "Sign in for trade pricing" at someone who
// already is.
//
// Layout: a sticky refine sidebar (search, House / Type facet lists, the
// remaining filters as underline selects) beside the results column. Sidebar
// and grid share every piece of state, so they are one island — and one
// component only: the store ESLint has no React plugin, so a JSX-only
// sub-component reference would trip no-unused-vars.
const PAGE_LIMIT = 100

// Filter definitions. `type` picks how a product maps to an option; `control`
// picks how it renders — `list` is a click-to-toggle facet list with live
// counts in the sidebar, `select` is an underline dropdown under "More
// filters". Order here is the order controls render in.
const FILTERS = [
  { key: 'brand', label: 'House', type: 'brand', control: 'list' },
  // Value is the collection SLUG (the brand-page tiles deep-link with it).
  // Slugs are unique per brand, not globally — matching on the slug alone
  // mirrors the API's `collection` filter, whose documented posture is "pair
  // it with brand"; the tiles always do. Most products carry no collection
  // (membership is staff-assigned in the CRM), and facetLists drops an empty
  // facet, so this list simply doesn't render until collections are in use.
  { key: 'collection', label: 'Collection', type: 'collection', control: 'list' },
  { key: 'product_type', label: 'Type', type: 'enum', control: 'list' },
  { key: 'application', label: 'Application', type: 'text', control: 'select' },
  { key: 'composition', label: 'Composition', type: 'text', control: 'select' },
  { key: 'width', label: 'Width', type: 'text', control: 'select' },
  { key: 'price_band', label: 'Price band', type: 'text', control: 'select' },
  { key: 'lead_time', label: 'Lead time', type: 'text', control: 'select' },
]

const LIST_FILTERS = FILTERS.filter((filter) => filter.control === 'list')
const SELECT_FILTERS = FILTERS.filter((filter) => filter.control === 'select')

const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price_asc', label: 'Price (low to high)' },
  { value: 'price_desc', label: 'Price (high to low)' },
  { value: 'in_stock', label: 'In stock first' },
]

const EMPTY_SELECTION = Object.freeze(
  FILTERS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})
)

const SORT_VALUES = SORTS.map((option) => option.value)

// The grid is deep-linkable: /products?brand=dedar&product_type=fabric&q=velvet
// is a shareable, bookmarkable view, and it is how the homepage and brand pages
// hand off into the library. Islands are server-rendered before hydration, so
// every window access is guarded.
function readUrlState() {
  const empty = { selection: EMPTY_SELECTION, query: '', sort: 'name' }
  if (typeof window === 'undefined') return empty

  const params = new URLSearchParams(window.location.search)
  const selection = FILTERS.reduce(
    (acc, filter) => ({ ...acc, [filter.key]: params.get(filter.key) || '' }),
    {}
  )
  const sort = params.get('sort')
  return {
    selection,
    query: params.get('q') || '',
    sort: SORT_VALUES.includes(sort) ? sort : 'name',
  }
}

// Mirror the current view back into the address bar. replaceState, not
// pushState: every keystroke in the search box would otherwise become a history
// entry the back button has to walk through.
function writeUrlState(selection, query, sort) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  for (const filter of FILTERS) {
    if (selection[filter.key]) params.set(filter.key, selection[filter.key])
  }
  if (query.trim()) params.set('q', query.trim())
  if (sort !== 'name') params.set('sort', sort)
  const search = params.toString()
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}`
  )
}

// A product's value for a given filter key. brand and collection collapse to
// their slug (the value) but keep the name for the label; everything else is a
// plain string column.
function productValue(product, key) {
  if (key === 'brand') return product.brand?.slug || ''
  if (key === 'collection') return product.collection?.slug || ''
  return product[key] == null ? '' : String(product[key])
}

// Build the option list for one filter from the full product set. Each option
// is { value, label }; brand shows the name, product_type a friendly label,
// text fields use the raw value. Sorted, de-duplicated, blanks dropped.
function optionsFor(products, filter) {
  const seen = new Map()
  for (const product of products) {
    const value = productValue(product, filter.key)
    if (!value || seen.has(value)) continue
    let label = value
    if (filter.type === 'brand') label = product.brand?.name || value
    else if (filter.type === 'collection') label = product.collection?.name || value
    else if (filter.type === 'enum') label = PRODUCT_TYPE_LABELS[value] || value
    seen.set(value, label)
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function matchesFilters(product, selection) {
  return FILTERS.every((filter) => {
    const chosen = selection[filter.key]
    if (!chosen) return true
    return productValue(product, filter.key) === chosen
  })
}

// Free-text search over the fields a shopper would actually type: the product
// and house name, composition, application, and every colourway name/SKU.
// Mirrors the API's `q` filter, so moving to server-side search later changes
// nothing a shopper can see.
function matchesQuery(product, needle) {
  if (!needle) return true
  const haystack = [
    product.name,
    product.brand?.name,
    product.composition,
    product.application,
    ...(product.colourways || []).flatMap((colourway) => [colourway.name, colourway.sku]),
  ]
  return haystack.some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(needle)
  )
}

// Options + live counts for one sidebar facet list. The count is measured
// against the search term and every OTHER filter, never the facet's own
// selection — so picking "Pierre Frey" does not collapse the House list to a
// single row, while the counts still track what is actually on screen.
// An option that can no longer yield a result is dropped unless it is the one
// currently selected (which must stay clickable to switch it off).
function facetOptions(products, filter, selection, needle) {
  const others = FILTERS.filter((other) => other.key !== filter.key)
  const counts = new Map()
  for (const product of products) {
    const matches =
      others.every(
        (other) =>
          !selection[other.key] ||
          productValue(product, other.key) === selection[other.key]
      ) && matchesQuery(product, needle)
    if (!matches) continue
    const value = productValue(product, filter.key)
    if (!value) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return optionsFor(products, filter)
    .map((option) => ({ ...option, count: counts.get(option.value) || 0 }))
    .filter((option) => option.count > 0 || option.value === selection[filter.key])
}

// The price a shopper may actually see, for sorting. A hidden or absent price
// sorts last in both directions — never order on a figure we are not showing.
function sortablePrice(product) {
  if (product.trade_price_cents != null) return product.trade_price_cents
  if (!product.price_hidden && product.retail_price_cents != null) {
    return product.retail_price_cents
  }
  return null
}

function compareProducts(a, b, sort) {
  if (sort === 'in_stock' && a.in_stock !== b.in_stock) {
    return a.in_stock ? -1 : 1
  }
  if (sort === 'price_asc' || sort === 'price_desc') {
    const left = sortablePrice(a)
    const right = sortablePrice(b)
    if (left == null && right != null) return 1
    if (left != null && right == null) return -1
    if (left != null && right != null && left !== right) {
      return sort === 'price_asc' ? left - right : right - left
    }
  }
  return a.name.localeCompare(b.name)
}

export default function ProductLibrary() {
  const [products, setProducts] = useState([])
  // The signed-in user, or null. Only ever selects price COPY — the API decides
  // which prices this shopper is allowed to receive.
  const [viewer, setViewer] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  // Lazy initialiser so the URL is parsed once, on the client, at mount.
  const [initial] = useState(readUrlState)
  const [selection, setSelection] = useState(initial.selection)
  const [query, setQuery] = useState(initial.query)
  const [sort, setSort] = useState(initial.sort)
  // Narrow viewports collapse the sidebar behind a toggle; above 1024px the CSS
  // shows it regardless, so this state is inert there.
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    writeUrlState(selection, query, sort)
  }, [selection, query, sort])

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch(`/catalogue/products?limit=${PAGE_LIMIT}`),
      // Never rejects (fetchCurrentUser swallows ApiError); the extra guard is
      // for genuinely unexpected failures, which must not take the grid down —
      // not knowing the viewer only costs a line of copy.
      fetchCurrentUser().catch(() => null),
    ])
      .then(([body, user]) => {
        if (!active) return
        setProducts(Array.isArray(body?.products) ? body.products : [])
        setViewer(user)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Unable to load products.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  const needle = query.trim().toLowerCase()

  // Facet lists recompute with the search term and the other selections; the
  // dropdown options stay drawn from the whole catalogue so a shopper can
  // always widen a choice from any state. A group with nothing left to offer is
  // dropped entirely rather than rendering a heading over an empty rule.
  const facetLists = useMemo(
    () =>
      LIST_FILTERS.map((filter) => ({
        filter,
        options: facetOptions(products, filter, selection, needle),
      })).filter(({ options }) => options.length > 0),
    [products, selection, needle]
  )

  const selectSets = useMemo(
    () => SELECT_FILTERS.map((filter) => ({ filter, options: optionsFor(products, filter) })),
    [products]
  )

  const visible = useMemo(() => {
    const matched = products.filter(
      (product) => matchesFilters(product, selection) && matchesQuery(product, needle)
    )
    // Sort a copy — never reorder state in place.
    return [...matched].sort((a, b) => compareProducts(a, b, sort))
  }, [products, selection, needle, sort])

  const activeCount =
    FILTERS.filter((filter) => selection[filter.key]).length + (needle ? 1 : 0)
  const hasActiveFilters = activeCount > 0

  const onFilterChange = (key, value) =>
    setSelection((prev) => ({ ...prev, [key]: value }))

  // Facet rows are toggles: clicking the active one clears it.
  const onFacetToggle = (key, value) =>
    setSelection((prev) => ({ ...prev, [key]: prev[key] === value ? '' : value }))

  const clearFilters = () => {
    setSelection(EMPTY_SELECTION)
    setQuery('')
  }

  if (status === 'loading') {
    return <p className="products-status">Loading the library…</p>
  }

  if (status === 'error') {
    return <p className="error-state">{error}</p>
  }

  return (
    <div className="product-library">
      <button
        type="button"
        className="library-filters-toggle"
        aria-expanded={filtersOpen}
        aria-controls="library-refine"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        {filtersOpen ? 'Hide refine' : 'Refine'}
        {hasActiveFilters && <span className="library-filters-badge">{activeCount}</span>}
      </button>

      <aside
        id="library-refine"
        className={filtersOpen ? 'library-aside is-open' : 'library-aside'}
        aria-label="Refine the library"
      >
        <label className="library-search">
          <span className="library-eyebrow">Search</span>
          <span className="library-search-field">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9.6 9.6 13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              placeholder="Name, house, composition, SKU…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>

        <div className="library-refine-row">
          <p className="library-eyebrow is-muted">Refine</p>
          {hasActiveFilters && (
            <button type="button" className="library-clear" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>

        {facetLists.map(({ filter, options }) => (
          <div className="library-facet" key={filter.key}>
            <p className="library-eyebrow" id={`facet-${filter.key}`}>
              {filter.label}
            </p>
            <ul className="library-facet-list" aria-labelledby={`facet-${filter.key}`}>
              {options.map((option) => {
                const active = selection[filter.key] === option.value
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={active ? 'library-facet-row is-active' : 'library-facet-row'}
                      aria-pressed={active}
                      onClick={() => onFacetToggle(filter.key, option.value)}
                    >
                      <span className="library-facet-name">
                        <span className="library-facet-dot" aria-hidden="true" />
                        <span className="library-facet-text">{option.label}</span>
                      </span>
                      <span className="library-facet-count">{option.count}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <div className="library-facet library-more">
          <p className="library-eyebrow">More filters</p>
          {selectSets.map(({ filter, options }) => (
            <label className="filter" key={filter.key}>
              <span>{filter.label}</span>
              <select
                value={selection[filter.key]}
                onChange={(event) => onFilterChange(filter.key, event.target.value)}
              >
                <option value="">All</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </aside>

      <div className="library-main">
        <div className="library-main-head">
          <p className="library-count" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'design' : 'designs'}
          </p>
          <label className="library-sort">
            <span className="library-eyebrow">Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="library-empty">
            Nothing matches those filters.{' '}
            <button type="button" className="library-clear" onClick={clearFilters}>
              Clear all
            </button>
          </p>
        ) : (
          <ul className="product-grid">
            {visible.map((product) => {
              const price = priceInfo(product, viewer)
              const weave = weaveBackground(product.colourways?.[0]?.hex_tones)
              const shown = product.colourways || []
              const extra = (product.colourway_count || 0) - shown.length
              return (
                <li key={product.slug} className="product-card">
                  <a href={`/products/${product.slug}`}>
                    <span className="product-media">
                      {product.image_url ? (
                        <img
                          className="product-image"
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="product-image-placeholder"
                          style={weave ? { background: weave } : undefined}
                          aria-hidden="true"
                        />
                      )}
                      <span className={product.in_stock ? 'product-stock in' : 'product-stock out'}>
                        {product.in_stock ? 'In stock' : 'Made to order'}
                      </span>
                    </span>

                    <span className="product-card-body">
                      <span className="product-brand">{product.brand?.name}</span>
                      <h2>{product.name}</h2>

                      {shown.length > 0 && (
                        <span className="product-swatches" aria-hidden="true">
                          {shown.map((colourway) => (
                            <span
                              key={colourway.sku}
                              className="product-swatch-dot"
                              style={{
                                background:
                                  weaveBackground(colourway.hex_tones) || 'var(--surface-deep)',
                              }}
                              title={colourway.name}
                            />
                          ))}
                          {extra > 0 && <span className="product-swatch-dot is-more">+{extra}</span>}
                        </span>
                      )}

                      <span className="sr-only">
                        {product.colourway_count} colourway
                        {product.colourway_count === 1 ? '' : 's'}
                      </span>

                      <span className="product-specs">
                        {[productTypeLabel(product.product_type), product.composition, product.width]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>

                      <span className={price.muted ? 'product-price muted' : 'product-price'}>
                        {price.label && <span className="detail-price-label">{price.label} </span>}
                        {price.text}
                        {price.indicative && <span className="indicative-note">Indicative</span>}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
