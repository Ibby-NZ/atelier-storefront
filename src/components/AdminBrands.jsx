import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'

// Back-office brand + collection admin island. Same shape as AdminOrders.jsx:
// the store is a static build with no server-side guard, so this island IS the
// access gate — fetchCurrentUser() on mount, no user → /login, non-staff → '/'.
//
// Data comes from the admin catalogue endpoints (backoffice-only server-side):
//   GET   /admin/brands              → { brands }
//   POST  /admin/brands              → { brand }   (slug generated server-side)
//   PATCH /admin/brands/:id          → { brand }
//   GET   /admin/collections         → { collections } (brand_id + brand_name)
//   POST  /admin/collections         → { collection }
//   PATCH /admin/collections/:id     → { collection }
// Collections are loaded once and grouped client-side, so expanding a brand
// costs no extra request.
//
// Slugs are server-generated and immutable, so no slug input exists here; the
// API rejects a `slug` property outright (400). Duplicate names come back as a
// 409 whose message is shown inline.
//
// Single component (store ESLint has no React plugin, so a JSX-only
// sub-component reference would trip no-unused-vars). All sub-markup is inlined
// and every draft lives in top-level state.

// New brands default to international: that is the price-hiding side of FR-3,
// so an unticked box can never leak a wholesale price onto the public site.
const NEW_BRAND = Object.freeze({
  name: '',
  currency: 'NZD',
  country: '',
  story: '',
  is_international: true,
})

// Optional free-text columns: blank input means "clear it" (null), not ''.
const NULLABLE_BRAND_FIELDS = ['country', 'story']

function isBackoffice(user) {
  return user?.role === 'backoffice' || user?.role === 'director'
}

function blankToNull(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function draftFromBrand(brand) {
  return {
    name: brand.name ?? '',
    currency: brand.currency ?? '',
    country: brand.country ?? '',
    story: brand.story ?? '',
    is_international: Boolean(brand.is_international),
  }
}

// Only changed fields are sent: the API 400s an empty PATCH body, and sending
// unchanged values would overwrite concurrent edits for no reason.
function brandPatchFrom(brand, draft) {
  const patch = {}
  const name = (draft.name ?? '').trim()
  if (name && name !== brand.name) patch.name = name

  const currency = (draft.currency ?? '').trim().toUpperCase()
  if (currency && currency !== brand.currency) patch.currency = currency

  for (const key of NULLABLE_BRAND_FIELDS) {
    const next = blankToNull(draft[key])
    if (next !== (brand[key] ?? null)) patch[key] = next
  }

  const international = Boolean(draft.is_international)
  if (international !== Boolean(brand.is_international)) {
    patch.is_international = international
  }
  return patch
}

export default function AdminBrands() {
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [brands, setBrands] = useState([])
  const [collections, setCollections] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [brandDraft, setBrandDraft] = useState(NEW_BRAND)
  const [collectionDrafts, setCollectionDrafts] = useState({}) // id -> name
  const [newCollection, setNewCollection] = useState('')
  const [newBrand, setNewBrand] = useState(NEW_BRAND)
  const [showNewBrand, setShowNewBrand] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  // Throws (ApiError) on failure — callers decide whether that is a fatal load
  // error or an inline action error.
  async function reload() {
    const [brandBody, collectionBody] = await Promise.all([
      apiFetch('/admin/brands'),
      apiFetch('/admin/collections'),
    ])
    setBrands(brandBody?.brands ?? [])
    setCollections(collectionBody?.collections ?? [])
  }

  useEffect(() => {
    let active = true
    async function init() {
      const user = await fetchCurrentUser()
      if (!active) return
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login?redirect=/admin/brands'
        }
        return
      }
      if (!isBackoffice(user)) {
        if (typeof window !== 'undefined') window.location.href = '/'
        return
      }
      try {
        await reload()
        if (!active) return
        setPhase('ready')
      } catch (err) {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Could not load brands.')
        setPhase('error')
      }
    }
    init()
    return () => {
      active = false
    }
  }, [])

  // Run a mutation, then re-read both lists so slugs/collections stay accurate.
  // Returns true on success so callers can reset their own form state.
  async function runAction(fn, successNotice = '') {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await fn()
      await reload()
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

  function toggleExpand(brand) {
    setActionError('')
    setNotice('')
    if (expandedId === brand.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(brand.id)
    setBrandDraft(draftFromBrand(brand))
    const drafts = {}
    for (const collection of collections) {
      if (collection.brand_id === brand.id) drafts[collection.id] = collection.name
    }
    setCollectionDrafts(drafts)
    setNewCollection('')
  }

  async function createBrand(event) {
    event.preventDefault()
    const name = newBrand.name.trim()
    const currency = newBrand.currency.trim().toUpperCase()
    if (!name) {
      setActionError('Give the brand a name.')
      return
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setActionError('Currency must be a three-letter code, e.g. NZD.')
      return
    }
    const body = {
      name,
      currency,
      country: blankToNull(newBrand.country),
      story: blankToNull(newBrand.story),
      is_international: Boolean(newBrand.is_international),
    }
    const ok = await runAction(
      () =>
        apiFetch('/admin/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      `Created ${name}.`
    )
    if (ok) {
      setNewBrand(NEW_BRAND)
      setShowNewBrand(false)
    }
  }

  function saveBrand(brand) {
    const patch = brandPatchFrom(brand, brandDraft)
    if (Object.keys(patch).length === 0) {
      setActionError('')
      setNotice('No changes to save.')
      return
    }
    runAction(
      () =>
        apiFetch(`/admin/brands/${brand.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      'Brand saved.'
    )
  }

  function saveCollection(collection) {
    const name = (collectionDrafts[collection.id] ?? '').trim()
    if (!name) {
      setActionError('A collection needs a name.')
      return
    }
    if (name === collection.name) {
      setActionError('')
      setNotice('No changes to save.')
      return
    }
    runAction(
      () =>
        apiFetch(`/admin/collections/${collection.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }),
      'Collection renamed.'
    )
  }

  async function addCollection(brand) {
    const name = newCollection.trim()
    if (!name) {
      setActionError('A collection needs a name.')
      return
    }
    const ok = await runAction(
      () =>
        apiFetch('/admin/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_id: brand.id, name }),
        }),
      `Added ${name}.`
    )
    if (ok) setNewCollection('')
  }

  if (phase === 'loading') {
    return <p className="products-status">Loading brands…</p>
  }

  if (phase === 'error') {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    )
  }

  return (
    <div className="admin-brands">
      <div className="admin-toolbar">
        <p className="admin-count">
          {brands.length} brand{brands.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setShowNewBrand((open) => !open)
            setActionError('')
            setNotice('')
          }}
        >
          {showNewBrand ? 'Cancel' : 'New brand'}
        </button>
      </div>

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {notice && <p className="admin-notice">{notice}</p>}

      {showNewBrand && (
        <form className="admin-form" onSubmit={createBrand}>
          <h2>New brand</h2>
          <div className="admin-form-grid">
            <label className="field">
              <span>Name *</span>
              <input
                type="text"
                value={newBrand.name}
                required
                disabled={busy}
                onChange={(e) =>
                  setNewBrand((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <span className="field-hint">
                The web address is generated from the name and cannot be changed later.
              </span>
            </label>
            <label className="field">
              <span>Currency *</span>
              <input
                type="text"
                value={newBrand.currency}
                maxLength={3}
                required
                disabled={busy}
                onChange={(e) =>
                  setNewBrand((prev) => ({ ...prev, currency: e.target.value }))
                }
              />
              <span className="field-hint">Three-letter code, e.g. NZD, EUR, GBP.</span>
            </label>
            <label className="field">
              <span>Country</span>
              <input
                type="text"
                value={newBrand.country}
                disabled={busy}
                onChange={(e) =>
                  setNewBrand((prev) => ({ ...prev, country: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="field">
            <span>Story</span>
            <textarea
              rows={4}
              value={newBrand.story}
              disabled={busy}
              onChange={(e) =>
                setNewBrand((prev) => ({ ...prev, story: e.target.value }))
              }
            />
          </label>
          <label className="field field-checkbox">
            <input
              type="checkbox"
              checked={newBrand.is_international}
              disabled={busy}
              onChange={(e) =>
                setNewBrand((prev) => ({ ...prev, is_international: e.target.checked }))
              }
            />
            <span>
              International house
              <span className="field-hint">
                {' '}
                — retail prices stay hidden on the public site.
              </span>
            </span>
          </label>
          <div className="admin-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Create brand
            </button>
          </div>
        </form>
      )}

      {brands.length === 0 ? (
        <p className="products-empty">No brands yet.</p>
      ) : (
        <ul className="admin-list">
          {brands.map((brand) => {
            const expanded = expandedId === brand.id
            const brandCollections = collections.filter((c) => c.brand_id === brand.id)
            return (
              <li key={brand.id} className="admin-item">
                <button
                  type="button"
                  className="admin-item-head"
                  aria-expanded={expanded}
                  onClick={() => toggleExpand(brand)}
                >
                  <span className="admin-item-title">{brand.name}</span>
                  <span className="admin-muted">/{brand.slug}</span>
                  <span className="admin-muted admin-item-spacer">
                    {brand.country || '—'}
                  </span>
                  <span className="admin-muted">{brand.currency}</span>
                  <span className="admin-muted">
                    {brand.is_international ? 'International' : 'Domestic'}
                  </span>
                  <span className="admin-muted">
                    {brandCollections.length} collection
                    {brandCollections.length === 1 ? '' : 's'}
                  </span>
                </button>

                {expanded && (
                  <div className="admin-item-detail">
                    <div className="admin-form-grid">
                      <label className="field">
                        <span>Name</span>
                        <input
                          type="text"
                          value={brandDraft.name}
                          disabled={busy}
                          onChange={(e) =>
                            setBrandDraft((prev) => ({ ...prev, name: e.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Currency</span>
                        <input
                          type="text"
                          value={brandDraft.currency}
                          maxLength={3}
                          disabled={busy}
                          onChange={(e) =>
                            setBrandDraft((prev) => ({
                              ...prev,
                              currency: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Country</span>
                        <input
                          type="text"
                          value={brandDraft.country}
                          disabled={busy}
                          onChange={(e) =>
                            setBrandDraft((prev) => ({
                              ...prev,
                              country: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Story</span>
                      <textarea
                        rows={4}
                        value={brandDraft.story}
                        disabled={busy}
                        onChange={(e) =>
                          setBrandDraft((prev) => ({ ...prev, story: e.target.value }))
                        }
                      />
                    </label>
                    <label className="field field-checkbox">
                      <input
                        type="checkbox"
                        checked={brandDraft.is_international}
                        disabled={busy}
                        onChange={(e) =>
                          setBrandDraft((prev) => ({
                            ...prev,
                            is_international: e.target.checked,
                          }))
                        }
                      />
                      <span>International house</span>
                    </label>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => saveBrand(brand)}
                      >
                        Save brand
                      </button>
                      <a className="btn" href={`/admin/products?brand=${brand.id}`}>
                        Products in this brand
                      </a>
                    </div>

                    <h3 className="admin-subhead">Collections</h3>
                    {brandCollections.length === 0 ? (
                      <p className="admin-muted">No collections for this brand yet.</p>
                    ) : (
                      <ul className="admin-sublist">
                        {brandCollections.map((collection) => (
                          <li key={collection.id} className="admin-row-form">
                            <input
                              type="text"
                              value={collectionDrafts[collection.id] ?? ''}
                              disabled={busy}
                              onChange={(e) =>
                                setCollectionDrafts((prev) => ({
                                  ...prev,
                                  [collection.id]: e.target.value,
                                }))
                              }
                            />
                            <span className="admin-muted">/{collection.slug}</span>
                            <button
                              type="button"
                              className="btn"
                              disabled={busy}
                              onClick={() => saveCollection(collection)}
                            >
                              Rename
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="admin-row-form">
                      <input
                        type="text"
                        placeholder="New collection name"
                        value={newCollection}
                        disabled={busy}
                        onChange={(e) => setNewCollection(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => addCollection(brand)}
                      >
                        Add collection
                      </button>
                    </div>
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
