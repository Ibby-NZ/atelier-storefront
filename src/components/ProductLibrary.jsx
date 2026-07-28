import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import {
  priceInfo,
  productTypeLabel,
  weaveBackground,
  PRODUCT_TYPE_LABELS,
} from '../lib/catalogue.js'

// Product library island (US-017). Fetches the website-visible catalogue once
// from GET /catalogue/products, then searches, filters and sorts in-memory so
// the grid updates instantly with no page reload. The catalogue is small (well
// under the API's max page size), so a single request backs every combination.
//
// The request is credentialed (see lib/api.js), so an approved trade user's
// cards carry trade_price_cents — the API is the gate, this island only renders
// whatever price it was given.
//
// One component only: the store ESLint has no React plugin, so a JSX-only
// sub-component reference would trip no-unused-vars.
const PAGE_LIMIT = 100

// Filter definitions. `type` picks how a product maps to an option. Order here
// is the order controls render in.
const FILTERS = [
  { key: 'brand', label: 'House', type: 'brand' },
  { key: 'product_type', label: 'Type', type: 'enum' },
  { key: 'application', label: 'Application', type: 'text' },
  { key: 'composition', label: 'Composition', type: 'text' },
  { key: 'width', label: 'Width', type: 'text' },
  { key: 'price_band', label: 'Price band', type: 'text' },
  { key: 'lead_time', label: 'Lead time', type: 'text' },
]

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

// A product's value for a given filter key. brand collapses to slug (the value)
// but keeps the name for the label; everything else is a plain string column.
function productValue(product, key) {
  if (key === 'brand') return product.brand?.slug || ''
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
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  // Lazy initialiser so the URL is parsed once, on the client, at mount.
  const [initial] = useState(readUrlState)
  const [selection, setSelection] = useState(initial.selection)
  const [query, setQuery] = useState(initial.query)
  const [sort, setSort] = useState(initial.sort)

  useEffect(() => {
    writeUrlState(selection, query, sort)
  }, [selection, query, sort])

  useEffect(() => {
    let active = true
    apiFetch(`/catalogue/products?limit=${PAGE_LIMIT}`)
      .then((body) => {
        if (!active) return
        setProducts(Array.isArray(body?.products) ? body.products : [])
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

  const optionSets = useMemo(
    () => FILTERS.map((filter) => ({ filter, options: optionsFor(products, filter) })),
    [products]
  )

  const needle = query.trim().toLowerCase()

  const visible = useMemo(() => {
    const matched = products.filter(
      (product) => matchesFilters(product, selection) && matchesQuery(product, needle)
    )
    // Sort a copy — never reorder state in place.
    return [...matched].sort((a, b) => compareProducts(a, b, sort))
  }, [products, selection, needle, sort])

  // Every filter currently narrowing the grid, as removable chips. Labels come
  // from the same option lists the selects use, so a chip always reads the way
  // the shopper chose it.
  const activeFacets = useMemo(
    () =>
      optionSets
        .filter(({ filter }) => selection[filter.key])
        .map(({ filter, options }) => ({
          key: filter.key,
          label: filter.label,
          value:
            options.find((option) => option.value === selection[filter.key])?.label ??
            selection[filter.key],
        })),
    [optionSets, selection]
  )

  const hasActiveFilters = activeFacets.length > 0 || needle !== ''

  const onFilterChange = (key, value) =>
    setSelection((prev) => ({ ...prev, [key]: value }))

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
      <form
        className="library-toolbar"
        aria-label="Search and filter products"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="library-search">
          <span className="sr-only">Search the library</span>
          <input
            type="search"
            value={query}
            placeholder="Search by name, house, composition or SKU"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="filters">
          {optionSets.map(({ filter, options }) => (
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

          <label className="filter library-sort">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {hasActiveFilters && (
        <div className="active-facets">
          {needle && (
            <span className="facet-chip">
              Search: {query.trim()}
              <button
                type="button"
                className="facet-chip-remove"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            </span>
          )}
          {activeFacets.map((facet) => (
            <span className="facet-chip" key={facet.key}>
              {facet.label}: {facet.value}
              <button
                type="button"
                className="facet-chip-remove"
                onClick={() => onFilterChange(facet.key, '')}
                aria-label={`Clear ${facet.label} filter`}
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" className="filter-clear" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      <p className="library-results products-count" aria-live="polite">
        {visible.length} {visible.length === 1 ? 'design' : 'designs'}
      </p>

      {visible.length === 0 ? (
        <p className="products-empty">
          Nothing matches that search. Try a broader term or clear a filter.
        </p>
      ) : (
        <ul className="product-grid">
          {visible.map((product) => {
            const price = priceInfo(product)
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
  )
}
