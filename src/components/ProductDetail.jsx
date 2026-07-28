import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { addToCart } from '../lib/cart.js'
import { priceInfo, productTypeLabel, weaveBackground, isFabric } from '../lib/catalogue.js'

// Product detail island (US-018). Fetches GET /catalogue/products/:slug for live
// availability and (for approved trade users) trade pricing.
//
// The colourway is the thing actually bought — every SKU on this page belongs to
// a colourway, not the product — so selecting one drives the whole page: the
// hero image, the SKU shown, the stock state, and what "Add to cart" or
// "Request order" acts on. Selection defaults to the first in-stock colourway so
// the primary action is live on arrival.
//
// Purchase action by type:
//   finished good    -> Add to cart (quantity stepper)
//   fabric, in stock -> Request order (cut to order, priced by the back office)
//   fabric, no stock -> Request backorder, with the lead-time note
//
// Everything renders inside one component: the store's ESLint has no React
// plugin, so a JSX-only reference to a sub-component would trip no-unused-vars
// (see ProductLibrary.jsx, same constraint).

const SPEC_FIELDS = [
  { key: 'composition', label: 'Composition' },
  { key: 'width', label: 'Width' },
  { key: 'rubs', label: 'Rubs' },
  { key: 'application', label: 'Application' },
  { key: 'price_band', label: 'Price band' },
  { key: 'lead_time', label: 'Lead time' },
]

const MAX_QTY = 99

// The colourway a shopper should land on: the first one in stock, else the
// first one at all. Returns null for a product with no colourways.
function defaultColourway(colourways) {
  if (!colourways || colourways.length === 0) return null
  return colourways.find((colourway) => colourway.in_stock) || colourways[0]
}

export default function ProductDetail({ slug }) {
  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [selectedSku, setSelectedSku] = useState(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(0) // how many were just added, 0 = nothing

  useEffect(() => {
    let active = true
    apiFetch(`/catalogue/products/${encodeURIComponent(slug)}`)
      .then((body) => {
        if (!active) return
        // Detail endpoint wraps the product in an envelope: { product: {...} }.
        const loaded = body?.product ?? null
        setProduct(loaded)
        setSelectedSku(defaultColourway(loaded?.colourways)?.sku ?? null)
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

  const colourways = useMemo(() => product?.colourways ?? [], [product])

  const selected = useMemo(
    () => colourways.find((colourway) => colourway.sku === selectedSku) ?? null,
    [colourways, selectedSku]
  )

  const anyInStock = useMemo(
    () => colourways.some((colourway) => colourway.in_stock),
    [colourways]
  )

  // Changing colourway invalidates the "added to cart" confirmation — it refers
  // to a specific SKU.
  const chooseColourway = (sku) => {
    setSelectedSku(sku)
    setAdded(0)
  }

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
  const fabric = isFabric(product)
  const specs = SPEC_FIELDS.filter(
    (field) => product[field.key] != null && product[field.key] !== ''
  )

  // Hero follows the selection, then any imaged colourway, then the hi-res asset.
  const heroImage =
    selected?.image_url ||
    colourways.find((colourway) => colourway.image_url)?.image_url ||
    product.hi_res_asset_url ||
    null
  const heroWeave = weaveBackground(selected?.hex_tones ?? colourways[0]?.hex_tones)

  // Fabrics are requested per colourway, so carry the selection to the form.
  const requestHref = `/order-request?product=${encodeURIComponent(product.slug)}${
    selected ? `&sku=${encodeURIComponent(selected.sku)}` : ''
  }`

  const canAddToCart = !fabric && Boolean(selected?.in_stock)

  const onAddToCart = () => {
    if (!canAddToCart) return
    addToCart(
      {
        sku: selected.sku,
        name: product.name,
        colourway: selected.name,
        brand: product.brand?.name ?? null,
        slug: product.slug,
        image_url: selected.image_url ?? product.hi_res_asset_url ?? null,
        price_cents: product.retail_price_cents ?? null,
        currency: product.currency,
      },
      qty
    )
    setAdded(qty)
  }

  return (
    <article className="product-detail">
      <nav className="detail-breadcrumb">
        <a href="/products">← The Library</a>
        {product.brand?.slug && (
          <>
            {' · '}
            <a href={`/brands/${product.brand.slug}`}>{product.brand.name}</a>
          </>
        )}
      </nav>

      <div className="detail-grid">
        <div className="detail-media">
          <div className="detail-gallery">
            {heroImage ? (
              <img
                className="detail-hero"
                src={heroImage}
                alt={selected ? `${product.name} — ${selected.name}` : product.name}
              />
            ) : (
              <div
                className="detail-hero detail-hero-placeholder"
                style={heroWeave ? { background: heroWeave } : undefined}
                aria-hidden="true"
              />
            )}

            {colourways.length > 1 && (
              <div className="detail-thumbs" role="group" aria-label="Colourways">
                {colourways.map((colourway) => (
                  <button
                    key={colourway.sku}
                    type="button"
                    className={
                      colourway.sku === selectedSku
                        ? 'detail-thumb is-selected'
                        : 'detail-thumb'
                    }
                    aria-pressed={colourway.sku === selectedSku}
                    onClick={() => chooseColourway(colourway.sku)}
                    title={colourway.name}
                    style={
                      colourway.image_url
                        ? { backgroundImage: `url(${colourway.image_url})` }
                        : { background: weaveBackground(colourway.hex_tones) }
                    }
                  >
                    <span className="sr-only">{colourway.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {product.hi_res_asset_url && (
            <a className="detail-hires" href={product.hi_res_asset_url} download>
              Download hi-res image
            </a>
          )}
        </div>

        <div className="detail-info">
          <p className="detail-type">{productTypeLabel(product.product_type)}</p>
          <h1 className="detail-name">{product.name}</h1>
          <p className="detail-brand">{product.brand?.name}</p>

          {selected && (
            <p className="detail-colourway-name">
              {selected.name}
              <span className="detail-selected-sku">{selected.sku}</span>
            </p>
          )}

          <p className={price.muted ? 'detail-price muted' : 'detail-price'}>
            {price.label && <span className="detail-price-label">{price.label} </span>}
            {price.text}
            {price.retail && <s className="detail-price-retail">{price.retail}</s>}
            {price.indicative && <span className="indicative-note">Indicative</span>}
          </p>

          <div className="purchase">
            {!fabric ? (
              <>
                <div className="qty-field">
                  <span className="sr-only" id={`qty-label-${product.slug}`}>
                    Quantity
                  </span>
                  <button
                    type="button"
                    className="qty-stepper"
                    onClick={() => setQty((current) => Math.max(1, current - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="qty-value" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    className="qty-stepper"
                    onClick={() => setQty((current) => Math.min(MAX_QTY, current + 1))}
                    disabled={qty >= MAX_QTY}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onAddToCart}
                  disabled={!canAddToCart}
                >
                  Add to cart
                </button>

                {!selected && <p className="purchase-note">No colourway is listed to buy.</p>}
                {selected && !selected.in_stock && (
                  <p className="purchase-note">
                    {selected.name} is out of stock.
                    {anyInStock ? ' Choose another colourway above.' : ''}
                  </p>
                )}
                {added > 0 && (
                  <p className="purchase-added">
                    {added} × {selected?.name} added to your cart.{' '}
                    <a href="/cart">View cart</a>
                  </p>
                )}
              </>
            ) : anyInStock ? (
              <>
                <a className="btn btn-primary" href={requestHref}>
                  Request order
                </a>
                <p className="purchase-note">
                  Cut to order by the metre. We confirm stock and batch shading before
                  invoicing.
                </p>
              </>
            ) : (
              <>
                <a className="btn btn-primary" href={`${requestHref}&backorder=1`}>
                  Request backorder
                </a>
                <p className="purchase-note">
                  Currently out of stock.{' '}
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
        {colourways.length ? (
          <ul className="swatch-grid">
            {colourways.map((colourway) => {
              const classes = ['swatch']
              if (!colourway.in_stock) classes.push('swatch-out')
              if (colourway.sku === selectedSku) classes.push('is-selected')
              const weave = weaveBackground(colourway.hex_tones)
              return (
                <li key={colourway.sku} className={classes.join(' ')}>
                  <button type="button" onClick={() => chooseColourway(colourway.sku)}>
                    {colourway.image_url ? (
                      <img
                        className="swatch-image"
                        src={colourway.image_url}
                        alt={colourway.name}
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="swatch-tones"
                        style={weave ? { background: weave } : undefined}
                        aria-hidden="true"
                      />
                    )}
                    <span className="swatch-name">{colourway.name}</span>
                    <span className="detail-selected-sku">{colourway.sku}</span>
                    <span className={colourway.in_stock ? 'swatch-stock in' : 'swatch-stock out'}>
                      {colourway.in_stock ? 'In stock' : 'Out of stock'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="products-empty">No colourways listed for this product.</p>
        )}
      </section>
    </article>
  )
}
