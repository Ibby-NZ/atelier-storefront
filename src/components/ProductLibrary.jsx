import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'

// Product library island (US-017). Fetches the website-visible catalogue once
// from GET /catalogue/products, then filters in-memory so the grid updates
// instantly with no page reload. The catalogue is small (well under the API's
// max page size), so a single request backs every filter combination.
const PAGE_LIMIT = 100

// Filter definitions. `field` reads the value off a product; `type` picks how a
// product maps to an option. Order here is the order controls render in.
const FILTERS = [
  { key: 'brand', label: 'Brand', type: 'brand' },
  { key: 'product_type', label: 'Type', type: 'enum' },
  { key: 'application', label: 'Application', type: 'text' },
  { key: 'composition', label: 'Composition', type: 'text' },
  { key: 'width', label: 'Width', type: 'text' },
  { key: 'price_band', label: 'Price band', type: 'text' },
  { key: 'lead_time', label: 'Lead time', type: 'text' },
]

const PRODUCT_TYPE_LABELS = {
  fabric: 'Fabric',
  finished_good: 'Finished good',
}

const EMPTY_SELECTION = Object.freeze(
  FILTERS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {})
)

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

// Price/label rules (FR-3): a product with a hidden price (international brand)
// or simply no retail price gets the trade-pricing prompt; otherwise format the
// retail cents in the product's currency.
function priceLabel(product) {
  if (product.price_hidden || product.retail_price_cents == null) {
    return { text: 'Login for trade pricing', muted: true }
  }
  const amount = product.retail_price_cents / 100
  try {
    const text = new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: product.currency || 'NZD',
    }).format(amount)
    return { text, muted: false }
  } catch {
    return { text: `${amount.toFixed(2)} ${product.currency || 'NZD'}`, muted: false }
  }
}

function matchesFilters(product, selection) {
  return FILTERS.every((filter) => {
    const chosen = selection[filter.key]
    if (!chosen) return true
    return productValue(product, filter.key) === chosen
  })
}

export default function ProductLibrary() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [selection, setSelection] = useState(EMPTY_SELECTION)

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

  const visible = useMemo(
    () => products.filter((product) => matchesFilters(product, selection)),
    [products, selection]
  )

  const hasActiveFilters = FILTERS.some((f) => selection[f.key])

  const onFilterChange = (key, value) =>
    setSelection((prev) => ({ ...prev, [key]: value }))

  const clearFilters = () => setSelection(EMPTY_SELECTION)

  if (status === 'loading') {
    return <p className="products-status">Loading products…</p>
  }

  if (status === 'error') {
    return <p className="error-state">{error}</p>
  }

  return (
    <div className="product-library">
      <form className="filters" aria-label="Product filters" onSubmit={(e) => e.preventDefault()}>
        {optionSets.map(({ filter, options }) => (
          <label className="filter" key={filter.key}>
            <span>{filter.label}</span>
            <select
              value={selection[filter.key]}
              onChange={(e) => onFilterChange(filter.key, e.target.value)}
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
        {hasActiveFilters && (
          <button type="button" className="filter-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </form>

      <p className="products-count">
        {visible.length} {visible.length === 1 ? 'product' : 'products'}
      </p>

      {visible.length === 0 ? (
        <p className="products-empty">
          No products match these filters. Try clearing one or more filters.
        </p>
      ) : (
        <ul className="product-grid">
          {visible.map((product) => {
            const price = priceLabel(product)
            return (
              <li key={product.slug} className="product-card">
                <a href={`/products/${product.slug}`}>
                  <h2>{product.name}</h2>
                  <p className="product-brand">{product.brand?.name}</p>
                  <dl className="product-specs">
                    {product.composition && (
                      <div>
                        <dt>Composition</dt>
                        <dd>{product.composition}</dd>
                      </div>
                    )}
                    {product.width && (
                      <div>
                        <dt>Width</dt>
                        <dd>{product.width}</dd>
                      </div>
                    )}
                    {product.application && (
                      <div>
                        <dt>Application</dt>
                        <dd>{product.application}</dd>
                      </div>
                    )}
                  </dl>
                  <p className={price.muted ? 'product-price muted' : 'product-price'}>
                    {price.text}
                  </p>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
