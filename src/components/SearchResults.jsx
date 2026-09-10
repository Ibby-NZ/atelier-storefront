import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { productClassLabel, weaveBackground } from '../lib/catalogue.js'
import { brandText, searchIndex } from '../lib/search.js'
import {
  isTradeGatedList,
  signInHref,
  TRADE_APPLICATION_PATH,
  TRADE_GATE_COPY,
} from '../lib/tradeGate.js'

// The half of site search that needs the API: designs, through the API's own
// `q` filter (CREDENTIALED, like the library — an approved trade account is
// shown the houses it may see, and `meta.trade_gated` names the gate for
// everyone else), and houses, the brand list matched here on name, country and
// story. The journal and page hits are server-rendered by pages/search.astro
// around this island; they come from the CMS, which the browser cannot query.
//
// One page of designs, then a hand-off to the library, which paginates and
// refines the same search.
const LIMIT = 24

export default function SearchResults({ query }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [tradeGated, setTradeGated] = useState(false)
  const [brands, setBrands] = useState([])

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch(`/catalogue/products?q=${encodeURIComponent(query)}&limit=${LIMIT}`),
      apiFetch('/catalogue/brands'),
    ])
      .then(([catalogue, houses]) => {
        if (!active) return
        const found = Array.isArray(catalogue?.products) ? catalogue.products : []
        setProducts(found)
        setTotal(Number(catalogue?.meta?.total) || found.length)
        setTradeGated(isTradeGatedList(catalogue))
        setBrands(searchIndex(Array.isArray(houses?.brands) ? houses.brands : [], query, brandText))
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Unable to search the collection.')
        setStatus('error')
      })
    return () => {
      active = false
    }
  }, [query])

  if (status === 'loading') {
    return <p className="products-status">Searching…</p>
  }

  if (status === 'error') {
    return <p className="error-state">{error}</p>
  }

  const libraryHref = `/products?q=${encodeURIComponent(query)}`

  return (
    <>
      <section className="search-section" aria-labelledby="search-designs">
        <div className="section-head">
          <h2 id="search-designs">
            Designs <span className="search-count">{total}</span>
          </h2>
          {total > 0 && <a href={libraryHref}>Refine in the library</a>}
        </div>

        {tradeGated && (
          <p className="search-gate">
            {TRADE_GATE_COPY.library.body}{' '}
            <a className="cta-underline" href={TRADE_APPLICATION_PATH}>
              {TRADE_GATE_COPY.library.apply}
            </a>{' '}
            <a className="cta-underline" href={signInHref(`/search?q=${encodeURIComponent(query)}`)}>
              {TRADE_GATE_COPY.library.signIn}
            </a>
          </p>
        )}

        {products.length === 0 ? (
          <p className="search-empty">No designs match “{query}”.</p>
        ) : (
          <ul className="product-grid product-grid-round">
            {products.map((product) => {
              const weave = weaveBackground(product.colourways?.[0]?.hex_tones)
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
                    </span>
                    <span className="product-card-body">
                      <span className="product-brand">{product.brand?.name}</span>
                      <h3>{product.name}</h3>
                      <span className="product-specs">
                        {[productClassLabel(product), product.composition, product.width]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}

        {total > products.length && (
          <p className="search-more">
            <a className="cta-underline" href={libraryHref}>
              See all {total} designs in the library
            </a>
          </p>
        )}
      </section>

      <section className="search-section" aria-labelledby="search-houses">
        <div className="section-head">
          <h2 id="search-houses">
            Houses <span className="search-count">{brands.length}</span>
          </h2>
        </div>
        {brands.length === 0 ? (
          <p className="search-empty">No houses match “{query}”.</p>
        ) : (
          <ul className="index-list">
            {brands.map((brand) => (
              <li key={brand.slug}>
                <a href={`/brands/${brand.slug}`}>
                  <span className="index-name">{brand.name}</span>
                  {brand.country && <span className="index-meta">{brand.country}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
