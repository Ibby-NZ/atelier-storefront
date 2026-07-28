import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { PRODUCT_TYPE_LABELS, toneList } from '../lib/catalogue.js'

// Back-office product + colourway admin island. Same access gate as
// AdminOrders.jsx / AdminBrands.jsx — the store is a static build, so this
// island is the guard: no user → /login, non-staff → '/'.
//
//   GET   /admin/products?brand_id=  → { products }  (ALL, incl. hidden)
//   GET   /admin/products/:id        → { product }   (+ colourways + inventory)
//   POST  /admin/products            → { product }
//   PATCH /admin/products/:id        → { product }
//   POST  /admin/products/:id/colourways → { colourway } (+ inventory row)
//   PATCH /admin/colourways/:id      → { colourway }
//
// Slug and product_type are generated/fixed at create time (the inventory unit
// is derived from product_type), so both are read-only in the edit form and the
// API rejects them in a PATCH body. SKUs are typed by hand; a duplicate comes
// back as a 409 whose message is shown inline. Prices are entered in dollars
// and sent as integer cents.
//
// Single component (store ESLint has no React plugin, so a JSX-only
// sub-component reference would trip no-unused-vars): all sub-markup is inlined
// and every draft lives in top-level state.

// Select options for the create form, derived from the shared label map so the
// two can never drift apart.
const PRODUCT_TYPES = Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Free-text spec columns — all nullable, blank input clears them.
const SPEC_FIELDS = [
  { key: 'composition', label: 'Composition' },
  { key: 'width', label: 'Width' },
  { key: 'rubs', label: 'Rubs' },
  { key: 'application', label: 'Application' },
  { key: 'price_band', label: 'Price band' },
  { key: 'lead_time', label: 'Lead time' },
]

const PRICE_FIELDS = [
  { key: 'retail_price_cents', label: 'Retail price' },
  { key: 'trade_price_cents', label: 'Trade price' },
]

const HEX_TONE_PATTERN = /^#[0-9a-fA-F]{6}$/

const NEW_PRODUCT = Object.freeze({
  brand_id: '',
  collection_id: '',
  product_type: 'fabric',
  name: '',
  currency: 'NZD',
  composition: '',
  width: '',
  rubs: '',
  application: '',
  price_band: '',
  lead_time: '',
  retail_price_cents: '',
  trade_price_cents: '',
  hi_res_asset_url: '',
  show_on_website: false,
})

const NEW_COLOURWAY = Object.freeze({
  name: '',
  sku: '',
  hex_tones: '',
  image_url: '',
})

function isBackoffice(user) {
  return user?.role === 'backoffice' || user?.role === 'director'
}

function blankToNull(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

// Prices are integer cents in the API; the form works in dollars.
function centsToDollars(cents) {
  return cents == null ? '' : (Number(cents) / 100).toFixed(2)
}

function parseDollars(value) {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return { ok: true, cents: null }
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, cents: null }
  return { ok: true, cents: Math.round(amount * 100) }
}

// hex_tones is a jsonb array; the form takes a comma-separated list so it stays
// a plain text input. Parsed (and rejected) client-side before the request.
function parseTones(value) {
  const parts = (value ?? '')
    .split(',')
    .map((tone) => tone.trim())
    .filter(Boolean)
  if (parts.length === 0) return { ok: true, tones: null }
  if (!parts.every((tone) => HEX_TONE_PATTERN.test(tone))) {
    return { ok: false, tones: null }
  }
  return { ok: true, tones: parts }
}

function tonesToText(hexTones) {
  return toneList(hexTones).join(', ')
}

function draftFromProduct(product) {
  const draft = {
    name: product.name ?? '',
    collection_id: product.collection_id == null ? '' : String(product.collection_id),
    currency: product.currency ?? '',
    hi_res_asset_url: product.hi_res_asset_url ?? '',
    show_on_website: Boolean(product.show_on_website),
  }
  for (const field of SPEC_FIELDS) draft[field.key] = product[field.key] ?? ''
  for (const field of PRICE_FIELDS) draft[field.key] = centsToDollars(product[field.key])
  return draft
}

function draftFromColourway(colourway) {
  return {
    name: colourway.name ?? '',
    sku: colourway.sku ?? '',
    hex_tones: tonesToText(colourway.hex_tones),
    image_url: colourway.image_url ?? '',
  }
}

// Only changed fields are sent — the API 400s an empty PATCH body. Returns
// { patch } or { error } when a price/tone input cannot be parsed.
function productPatchFrom(product, draft) {
  const patch = {}
  const name = (draft.name ?? '').trim()
  if (name && name !== product.name) patch.name = name

  const currency = (draft.currency ?? '').trim().toUpperCase()
  if (currency && currency !== product.currency) patch.currency = currency

  const collectionId =
    draft.collection_id === '' ? null : Number(draft.collection_id)
  if (collectionId !== (product.collection_id ?? null)) patch.collection_id = collectionId

  for (const field of [...SPEC_FIELDS, { key: 'hi_res_asset_url' }]) {
    const next = blankToNull(draft[field.key])
    if (next !== (product[field.key] ?? null)) patch[field.key] = next
  }

  for (const field of PRICE_FIELDS) {
    const parsed = parseDollars(draft[field.key])
    if (!parsed.ok) return { error: `${field.label} must be a number, e.g. 129.50.` }
    if (parsed.cents !== (product[field.key] ?? null)) patch[field.key] = parsed.cents
  }

  const visible = Boolean(draft.show_on_website)
  if (visible !== Boolean(product.show_on_website)) patch.show_on_website = visible

  return { patch }
}

// Brand preselection from the brands page link (/admin/products?brand=<id>).
function initialBrandFilter() {
  if (typeof window === 'undefined') return ''
  const value = new URLSearchParams(window.location.search).get('brand')
  return value && /^\d+$/.test(value) ? value : ''
}

export default function AdminProducts() {
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [brands, setBrands] = useState([])
  const [collections, setCollections] = useState([])
  const [products, setProducts] = useState([])
  const [brandFilter, setBrandFilter] = useState(initialBrandFilter)
  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailPhase, setDetailPhase] = useState('idle') // idle | loading | ready
  const [productDraft, setProductDraft] = useState({})
  const [colourwayDrafts, setColourwayDrafts] = useState({}) // id -> draft
  const [newColourway, setNewColourway] = useState(NEW_COLOURWAY)
  const [newProduct, setNewProduct] = useState(NEW_PRODUCT)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  // Throws (ApiError) — the caller decides fatal vs inline.
  async function loadProducts(brandId) {
    const query = brandId ? `?brand_id=${encodeURIComponent(brandId)}` : ''
    const body = await apiFetch(`/admin/products${query}`)
    setProducts(body?.products ?? [])
  }

  async function loadDetail(productId) {
    const body = await apiFetch(`/admin/products/${productId}`)
    const product = body?.product ?? null
    setDetail(product)
    if (product) {
      setProductDraft(draftFromProduct(product))
      const drafts = {}
      for (const colourway of product.colourways ?? []) {
        drafts[colourway.id] = draftFromColourway(colourway)
      }
      setColourwayDrafts(drafts)
    }
  }

  useEffect(() => {
    let active = true
    async function init() {
      const user = await fetchCurrentUser()
      if (!active) return
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login?redirect=/admin/products'
        }
        return
      }
      if (!isBackoffice(user)) {
        if (typeof window !== 'undefined') window.location.href = '/'
        return
      }
      try {
        const [brandBody, collectionBody] = await Promise.all([
          apiFetch('/admin/brands'),
          apiFetch('/admin/collections'),
        ])
        if (!active) return
        setBrands(brandBody?.brands ?? [])
        setCollections(collectionBody?.collections ?? [])
        await loadProducts(brandFilter)
        if (!active) return
        setPhase('ready')
      } catch (err) {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Could not load products.')
        setPhase('error')
      }
    }
    init()
    return () => {
      active = false
    }
    // Mount-only on purpose: brandFilter is read once for the initial load and
    // every later change goes through handleBrandChange, which reloads the list
    // without re-running the auth gate.
  }, [])

  // Run a mutation, then re-read the list (and the open detail) so slugs,
  // colourway counts and inventory stay accurate.
  async function runAction(fn, successNotice = '') {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await fn()
      await loadProducts(brandFilter)
      if (expandedId) await loadDetail(expandedId)
      if (successNotice) setNotice(successNotice)
      return true
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'That change could not be saved.'
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleBrandChange(event) {
    const next = event.target.value
    setBrandFilter(next)
    setExpandedId(null)
    setDetail(null)
    setActionError('')
    setNotice('')
    try {
      await loadProducts(next)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not load products.'
      )
    }
  }

  async function toggleExpand(product) {
    setActionError('')
    setNotice('')
    if (expandedId === product.id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(product.id)
    setDetail(null)
    setNewColourway(NEW_COLOURWAY)
    setDetailPhase('loading')
    try {
      await loadDetail(product.id)
      setDetailPhase('ready')
    } catch (err) {
      setDetailPhase('ready')
      setActionError(
        err instanceof ApiError ? err.message : 'Could not load this product.'
      )
    }
  }

  function collectionsForBrand(brandId) {
    if (!brandId) return []
    return collections.filter((c) => String(c.brand_id) === String(brandId))
  }

  async function createProduct(event) {
    event.preventDefault()
    const name = newProduct.name.trim()
    const currency = newProduct.currency.trim().toUpperCase()
    if (!newProduct.brand_id) {
      setActionError('Choose a brand.')
      return
    }
    if (!name) {
      setActionError('Give the product a name.')
      return
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setActionError('Currency must be a three-letter code, e.g. NZD.')
      return
    }
    const body = {
      brand_id: Number(newProduct.brand_id),
      product_type: newProduct.product_type,
      name,
      currency,
      show_on_website: Boolean(newProduct.show_on_website),
      hi_res_asset_url: blankToNull(newProduct.hi_res_asset_url),
    }
    if (newProduct.collection_id) body.collection_id = Number(newProduct.collection_id)
    for (const field of SPEC_FIELDS) body[field.key] = blankToNull(newProduct[field.key])
    for (const field of PRICE_FIELDS) {
      const parsed = parseDollars(newProduct[field.key])
      if (!parsed.ok) {
        setActionError(`${field.label} must be a number, e.g. 129.50.`)
        return
      }
      body[field.key] = parsed.cents
    }

    const ok = await runAction(
      () =>
        apiFetch('/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      `Created ${name}. Add its colourways next.`
    )
    if (ok) {
      setNewProduct(NEW_PRODUCT)
      setShowNewProduct(false)
    }
  }

  function saveProduct(product) {
    const { patch, error: parseError } = productPatchFrom(product, productDraft)
    if (parseError) {
      setActionError(parseError)
      return
    }
    if (Object.keys(patch).length === 0) {
      setActionError('')
      setNotice('No changes to save.')
      return
    }
    runAction(
      () =>
        apiFetch(`/admin/products/${product.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      'Product saved.'
    )
  }

  function saveColourway(colourway) {
    const draft = colourwayDrafts[colourway.id] ?? {}
    const name = (draft.name ?? '').trim()
    const sku = (draft.sku ?? '').trim()
    if (!name || !sku) {
      setActionError('A colourway needs both a name and a SKU.')
      return
    }
    const tones = parseTones(draft.hex_tones)
    if (!tones.ok) {
      setActionError('Tones must be comma-separated hex codes, e.g. #AABBCC, #112233.')
      return
    }
    const patch = {}
    if (name !== colourway.name) patch.name = name
    if (sku !== colourway.sku) patch.sku = sku
    const imageUrl = blankToNull(draft.image_url)
    if (imageUrl !== (colourway.image_url ?? null)) patch.image_url = imageUrl
    if (tonesToText(tones.tones) !== tonesToText(colourway.hex_tones)) {
      patch.hex_tones = tones.tones
    }
    if (Object.keys(patch).length === 0) {
      setActionError('')
      setNotice('No changes to save.')
      return
    }
    runAction(
      () =>
        apiFetch(`/admin/colourways/${colourway.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      'Colourway saved.'
    )
  }

  async function addColourway(product) {
    const name = newColourway.name.trim()
    const sku = newColourway.sku.trim()
    if (!name || !sku) {
      setActionError('A colourway needs both a name and a SKU.')
      return
    }
    const tones = parseTones(newColourway.hex_tones)
    if (!tones.ok) {
      setActionError('Tones must be comma-separated hex codes, e.g. #AABBCC, #112233.')
      return
    }
    const ok = await runAction(
      () =>
        apiFetch(`/admin/products/${product.id}/colourways`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            sku,
            hex_tones: tones.tones,
            image_url: blankToNull(newColourway.image_url),
          }),
        }),
      `Added ${name}. Its stock row starts at zero.`
    )
    if (ok) setNewColourway(NEW_COLOURWAY)
  }

  if (phase === 'loading') {
    return <p className="products-status">Loading products…</p>
  }

  if (phase === 'error') {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    )
  }

  const newProductCollections = collectionsForBrand(newProduct.brand_id)
  const detailCollections = detail ? collectionsForBrand(detail.brand_id) : []

  return (
    <div className="admin-products">
      <div className="admin-toolbar">
        <label className="field admin-filter">
          <span>Filter by brand</span>
          <select value={brandFilter} onChange={handleBrandChange} disabled={busy}>
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-count">
          {products.length} product{products.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setShowNewProduct((open) => !open)
            setActionError('')
            setNotice('')
          }}
        >
          {showNewProduct ? 'Cancel' : 'New product'}
        </button>
      </div>

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {notice && <p className="admin-notice">{notice}</p>}

      {showNewProduct && (
        <form className="admin-form" onSubmit={createProduct}>
          <h2>New product</h2>
          <div className="admin-form-grid">
            <label className="field">
              <span>Brand *</span>
              <select
                value={newProduct.brand_id}
                required
                disabled={busy}
                onChange={(e) => {
                  const brandId = e.target.value
                  const brand = brands.find((b) => String(b.id) === brandId)
                  setNewProduct((prev) => ({
                    ...prev,
                    brand_id: brandId,
                    // Collections belong to a brand — a stale pick would 422.
                    collection_id: '',
                    currency: brand?.currency ?? prev.currency,
                  }))
                }}
              >
                <option value="">Choose a brand…</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Type *</span>
              <select
                value={newProduct.product_type}
                disabled={busy}
                onChange={(e) =>
                  setNewProduct((prev) => ({ ...prev, product_type: e.target.value }))
                }
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Cannot be changed later — the stock unit (metres or units) comes from it.
              </span>
            </label>
            <label className="field">
              <span>Collection</span>
              <select
                value={newProduct.collection_id}
                disabled={busy || !newProduct.brand_id}
                onChange={(e) =>
                  setNewProduct((prev) => ({ ...prev, collection_id: e.target.value }))
                }
              >
                <option value="">No collection</option>
                {newProductCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Name *</span>
              <input
                type="text"
                value={newProduct.name}
                required
                disabled={busy}
                onChange={(e) =>
                  setNewProduct((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <span className="field-hint">
                The web address is generated from it and cannot be changed later.
              </span>
            </label>
            <label className="field">
              <span>Currency *</span>
              <input
                type="text"
                value={newProduct.currency}
                maxLength={3}
                required
                disabled={busy}
                onChange={(e) =>
                  setNewProduct((prev) => ({ ...prev, currency: e.target.value }))
                }
              />
            </label>
            {SPEC_FIELDS.map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}</span>
                <input
                  type="text"
                  value={newProduct[field.key]}
                  disabled={busy}
                  onChange={(e) =>
                    setNewProduct((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              </label>
            ))}
            {PRICE_FIELDS.map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newProduct[field.key]}
                  disabled={busy}
                  onChange={(e) =>
                    setNewProduct((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
                <span className="field-hint">In dollars, left blank for none.</span>
              </label>
            ))}
            <label className="field">
              <span>Hi-res asset URL</span>
              <input
                type="text"
                value={newProduct.hi_res_asset_url}
                disabled={busy}
                onChange={(e) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    hi_res_asset_url: e.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="field field-checkbox">
            <input
              type="checkbox"
              checked={newProduct.show_on_website}
              disabled={busy}
              onChange={(e) =>
                setNewProduct((prev) => ({ ...prev, show_on_website: e.target.checked }))
              }
            />
            <span>Show on the website</span>
          </label>
          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Create product
            </button>
          </div>
        </form>
      )}

      {products.length === 0 ? (
        <p className="products-empty">No products match this filter.</p>
      ) : (
        <ul className="admin-list">
          {products.map((product) => {
            const expanded = expandedId === product.id
            return (
              <li key={product.id} className="admin-item">
                <button
                  type="button"
                  className="admin-item-head"
                  aria-expanded={expanded}
                  onClick={() => toggleExpand(product)}
                >
                  <span className="admin-item-title">{product.name}</span>
                  <span className="admin-muted admin-item-spacer">
                    {product.brand_name}
                    {product.collection_name ? ` · ${product.collection_name}` : ''}
                  </span>
                  <span className="admin-muted">
                    {PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type}
                  </span>
                  <span className="admin-muted">
                    {product.colourway_count} colourway
                    {product.colourway_count === 1 ? '' : 's'}
                  </span>
                  <span className="admin-muted">
                    {product.show_on_website ? 'Live' : 'Hidden'}
                  </span>
                </button>

                {expanded && detailPhase === 'loading' && (
                  <div className="admin-item-detail">
                    <p className="products-status">Loading product…</p>
                  </div>
                )}

                {expanded && detail && detail.id === product.id && (
                  <div className="admin-item-detail">
                    <div className="admin-form-grid">
                      <label className="field">
                        <span>Name</span>
                        <input
                          type="text"
                          value={productDraft.name ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            setProductDraft((prev) => ({ ...prev, name: e.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Web address</span>
                        <input type="text" value={detail.slug ?? ''} readOnly disabled />
                        <span className="field-hint">Fixed once created.</span>
                      </label>
                      <label className="field">
                        <span>Type</span>
                        <input
                          type="text"
                          value={
                            PRODUCT_TYPE_LABELS[detail.product_type] ?? detail.product_type
                          }
                          readOnly
                          disabled
                        />
                        <span className="field-hint">Fixed once created.</span>
                      </label>
                      <label className="field">
                        <span>Collection</span>
                        <select
                          value={productDraft.collection_id ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            setProductDraft((prev) => ({
                              ...prev,
                              collection_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">No collection</option>
                          {detailCollections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {collection.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Currency</span>
                        <input
                          type="text"
                          value={productDraft.currency ?? ''}
                          maxLength={3}
                          disabled={busy}
                          onChange={(e) =>
                            setProductDraft((prev) => ({
                              ...prev,
                              currency: e.target.value,
                            }))
                          }
                        />
                      </label>
                      {SPEC_FIELDS.map((field) => (
                        <label className="field" key={field.key}>
                          <span>{field.label}</span>
                          <input
                            type="text"
                            value={productDraft[field.key] ?? ''}
                            disabled={busy}
                            onChange={(e) =>
                              setProductDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                      {PRICE_FIELDS.map((field) => (
                        <label className="field" key={field.key}>
                          <span>{field.label}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={productDraft[field.key] ?? ''}
                            disabled={busy}
                            onChange={(e) =>
                              setProductDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                      <label className="field">
                        <span>Hi-res asset URL</span>
                        <input
                          type="text"
                          value={productDraft.hi_res_asset_url ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            setProductDraft((prev) => ({
                              ...prev,
                              hi_res_asset_url: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label className="field field-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(productDraft.show_on_website)}
                        disabled={busy}
                        onChange={(e) =>
                          setProductDraft((prev) => ({
                            ...prev,
                            show_on_website: e.target.checked,
                          }))
                        }
                      />
                      <span>Show on the website</span>
                    </label>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => saveProduct(detail)}
                      >
                        Save product
                      </button>
                      {detail.show_on_website && (
                        <a className="btn" href={`/products/${detail.slug}`}>
                          View on site
                        </a>
                      )}
                    </div>

                    <h3 className="admin-subhead">Colourways</h3>
                    {(detail.colourways ?? []).length === 0 ? (
                      <p className="admin-muted">
                        No colourways yet — a product needs at least one to be orderable.
                      </p>
                    ) : (
                      <table className="admin-lines">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>SKU</th>
                            <th>Tones</th>
                            <th>Image URL</th>
                            <th>Stock</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {(detail.colourways ?? []).map((colourway) => {
                            const draft = colourwayDrafts[colourway.id] ?? {}
                            return (
                              <tr key={colourway.id}>
                                <td>
                                  <input
                                    type="text"
                                    value={draft.name ?? ''}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setColourwayDrafts((prev) => ({
                                        ...prev,
                                        [colourway.id]: {
                                          ...prev[colourway.id],
                                          name: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={draft.sku ?? ''}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setColourwayDrafts((prev) => ({
                                        ...prev,
                                        [colourway.id]: {
                                          ...prev[colourway.id],
                                          sku: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </td>
                                <td>
                                  <span className="admin-tones">
                                    {toneList(colourway.hex_tones).map((tone, index) => (
                                      <span
                                        key={`${tone}-${index}`}
                                        className="admin-tone-chip"
                                        style={{ background: tone }}
                                        title={tone}
                                      />
                                    ))}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="#AABBCC, #112233"
                                    value={draft.hex_tones ?? ''}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setColourwayDrafts((prev) => ({
                                        ...prev,
                                        [colourway.id]: {
                                          ...prev[colourway.id],
                                          hex_tones: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    value={draft.image_url ?? ''}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setColourwayDrafts((prev) => ({
                                        ...prev,
                                        [colourway.id]: {
                                          ...prev[colourway.id],
                                          image_url: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </td>
                                <td className="admin-muted">
                                  {colourway.inventory
                                    ? `${Number(
                                        colourway.inventory.qty_available
                                      )} avail · ${Number(
                                        colourway.inventory.qty_reserved
                                      )} reserved ${colourway.inventory.unit}`
                                    : 'No stock row'}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn"
                                    disabled={busy}
                                    onClick={() => saveColourway(colourway)}
                                  >
                                    Save
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}

                    <div className="admin-row-form">
                      <input
                        type="text"
                        placeholder="Colourway name"
                        value={newColourway.name}
                        disabled={busy}
                        onChange={(e) =>
                          setNewColourway((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="SKU"
                        value={newColourway.sku}
                        disabled={busy}
                        onChange={(e) =>
                          setNewColourway((prev) => ({ ...prev, sku: e.target.value }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="#AABBCC, #112233"
                        value={newColourway.hex_tones}
                        disabled={busy}
                        onChange={(e) =>
                          setNewColourway((prev) => ({
                            ...prev,
                            hex_tones: e.target.value,
                          }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="Image URL"
                        value={newColourway.image_url}
                        disabled={busy}
                        onChange={(e) =>
                          setNewColourway((prev) => ({
                            ...prev,
                            image_url: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => addColourway(detail)}
                      >
                        Add colourway
                      </button>
                    </div>
                    <p className="admin-muted">
                      Stock levels are edited in the raw admin panel (/panel); a new
                      colourway starts at zero.
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
