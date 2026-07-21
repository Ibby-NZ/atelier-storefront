import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { addToCart } from '../lib/cart.js'

// Product detail island (US-018). Fetches GET /catalogue/products/:slug for live
// availability and (for approved trade users) trade pricing, then renders specs,
// colourway swatches with per-colourway availability, the hi-res download link,
// and the correct purchase action for the product type:
//   finished good   -> Add to Cart
//   fabric, in stock -> Request Order
//   fabric, no stock -> Request Backorder (with lead-time note)
//
// Everything renders inside one component: the store's ESLint has no React
// plugin, so a JSX-only reference to a sub-component would trip no-unused-vars
// (see ProductLibrary.jsx, same constraint).

const PRODUCT_TYPE_LABELS = {
  fabric: 'Fabric',
  finished_good: 'Finished good',
}

const SPEC_FIELDS = [
  { key: 'composition', label: 'Composition' },
  { key: 'width', label: 'Width' },
  { key: 'rubs', label: 'Rubs' },
  { key: 'application', label: 'Application' },
  { key: 'price_band', label: 'Price band' },
  { key: 'lead_time', label: 'Lead time' },
]

function formatMoney(cents, currency) {
  const amount = Number(cents) / 100
  try {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency || 'NZD',
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || 'NZD'}`
  }
}

// Price display (FR-3): approved trade users get trade_price_cents; a hidden or
// missing public price shows the trade-pricing prompt; otherwise retail.
function priceInfo(product) {
  if (product.trade_price_cents != null) {
    return { label: 'Trade price', text: formatMoney(product.trade_price_cents, product.currency), muted: false }
  }
  if (product.price_hidden || product.retail_price_cents == null) {
    return { label: '', text: 'Login for trade pricing', muted: true }
  }
  return { label: '', text: formatMoney(product.retail_price_cents, product.currency), muted: false }
}

// hex_tones is stored as jsonb — normalise to a list of hex strings for chips.
function toneList(hexTones) {
  return Array.isArray(hexTones) ? hexTones.filter((t) => typeof t === 'string') : []
}

export default function ProductDetail({ slug }) {
  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch(`/catalogue/products/${encodeURIComponent(slug)}`)
      .then((body) => {
        if (!active) return
        // Detail endpoint wraps the product in an envelope: { product: {...} }.
        setProduct(body?.product ?? null)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Unable to load this product.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [slug])

  const anyInStock = useMemo(
    () => (product?.colourways || []).some((c) => c.in_stock),
    [product]
  )

  if (status === 'loading') {
    return <p className="products-status">Loading product…</p>
  }
  if (status === 'error') {
    return <p className="error-state">{error}</p>
  }
  if (!product) {
    return <p className="products-empty">This product is not available.</p>
  }

  const price = priceInfo(product)
  const heroImage = product.colourways?.find((c) => c.image_url)?.image_url || null
  const specs = SPEC_FIELDS.filter((field) => product[field.key] != null && product[field.key] !== '')
  const isFinishedGood = product.product_type === 'finished_good'
  const primarySku = product.colourways?.[0]?.sku
  const requestHref = `/order-request?product=${encodeURIComponent(product.slug)}`

  const onAddToCart = () => {
    addToCart(
      {
        sku: primarySku,
        name: product.name,
        price_cents: product.retail_price_cents ?? null,
        currency: product.currency,
      },
      1
    )
    setAdded(true)
  }

  return (
    <article className="product-detail">
      <nav className="detail-breadcrumb">
        <a href="/products">← All products</a>
      </nav>

      <div className="detail-grid">
        <div className="detail-media">
          {heroImage ? (
            <img className="detail-hero" src={heroImage} alt={product.name} />
          ) : (
            <div className="detail-hero detail-hero-placeholder" aria-hidden="true" />
          )}
          {product.hi_res_asset_url && (
            <a className="detail-hires" href={product.hi_res_asset_url} download>
              Download hi-res image
            </a>
          )}
        </div>

        <div className="detail-info">
          <p className="detail-type">{PRODUCT_TYPE_LABELS[product.product_type] || product.product_type}</p>
          <h1 className="detail-name">{product.name}</h1>
          <p className="detail-brand">{product.brand?.name}</p>

          <p className={price.muted ? 'detail-price muted' : 'detail-price'}>
            {price.label && <span className="detail-price-label">{price.label}: </span>}
            {price.text}
          </p>

          <div className="purchase">
            {isFinishedGood ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onAddToCart}
                  disabled={!anyInStock || !primarySku}
                >
                  Add to Cart
                </button>
                {!anyInStock && <p className="purchase-note">Currently out of stock.</p>}
                {added && anyInStock && <p className="purchase-added">Added to your cart.</p>}
              </>
            ) : anyInStock ? (
              <>
                <a className="btn btn-primary" href={requestHref}>
                  Request Order
                </a>
                <p className="purchase-note">
                  Fabric is cut to order. We verify stock and batch shading before invoicing.
                </p>
              </>
            ) : (
              <>
                <a className="btn btn-primary" href={`${requestHref}&backorder=1`}>
                  Request Backorder
                </a>
                <p className="purchase-note">
                  Out of stock.{' '}
                  {product.lead_time
                    ? `Estimated lead time: ${product.lead_time}.`
                    : 'Lead time confirmed on request.'}
                </p>
              </>
            )}
          </div>

          {specs.length > 0 && (
            <dl className="detail-specs">
              {specs.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{String(product[field.key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <section className="detail-colourways">
        <h2>Colourways</h2>
        {product.colourways?.length ? (
          <ul className="swatch-grid">
            {product.colourways.map((colourway) => (
              <li key={colourway.sku} className={colourway.in_stock ? 'swatch' : 'swatch swatch-out'}>
                {colourway.image_url ? (
                  <img className="swatch-image" src={colourway.image_url} alt={colourway.name} loading="lazy" />
                ) : (
                  <span className="swatch-tones" aria-hidden="true">
                    {toneList(colourway.hex_tones).map((tone, index) => (
                      <span key={`${tone}-${index}`} className="swatch-tone" style={{ background: tone }} />
                    ))}
                  </span>
                )}
                <span className="swatch-name">{colourway.name}</span>
                <span className={colourway.in_stock ? 'swatch-stock in' : 'swatch-stock out'}>
                  {colourway.in_stock ? 'In stock' : 'Out of stock'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="products-empty">No colourways listed for this product.</p>
        )}
      </section>
    </article>
  )
}
