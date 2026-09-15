import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, apiDownload, ApiError } from '../lib/api.js'
import { fetchCurrentUser, logout, accountLabel } from '../lib/auth.js'
import { isApprovedTrade, tradeStatusNote } from '../lib/account.js'
import { accountSections, orderCardId, orderFromHash, sectionFromHash, SECTION } from '../lib/accountSections.js'
import { orderCard } from '../lib/orderView.jsx'
import { reorderPlan, toRequestLines, toCartLines } from '../lib/reorder.js'
import { replaceRequestList } from '../lib/requestList.js'
import { newPasswordError, changePasswordError } from '../lib/passwordReset.js'
import { addToCart, setCartQty } from '../lib/cart.js'
import {
  dashboardPanel,
  samplesPanel,
  invoicesPanel,
  priceListsPanel,
  detailsPanel,
  panelLoading,
  panelError,
  panelEmpty,
  pendingLinkNotice,
  moreControl,
} from '../lib/accountPanels.jsx'

// The account portal (US-022, extended for approved trade clients).
//
// The store is a static build, so everything here is resolved at runtime:
//   1. GET /auth/me — no user (401) → /login?redirect=/account.
//   2. For an APPROVED TRADE account only, GET /account/summary — the dashboard
//      digest, and the authority on whether the login has been matched to a
//      Dynamics customer. That match is what samples and invoices hang off; a
//      customer login never calls it and never sees those panels.
//   3. Each panel fetches its own data the first time it is opened, and caches
//      it. Loading five panels for a visitor who came to check their last order
//      would make the page slow for the common case.
//
// ONE PAGE, NOT FIVE ROUTES. Every storefront page is prerendered, so five
// account URLs would be five identical static shells whose content is fetched at
// runtime anyway. The open section lives in the URL HASH instead — shareable,
// back-button-safe, and no new routing. Nothing here is an authorisation
// decision: the API scopes every response to the session, so the nav is
// presentation only and a tampered one reveals nothing.
//
// REORDER rebuilds the basket rather than re-submitting. A fabric order has to
// go back through the back office's stock and shading check (FR-5) and a
// finished good through Stripe, so the lines refill the request list and the
// cart and the shopper reviews and submits as normal.
//
// Trade applicants are still told where their application stands: approval is
// manual and silent, so without the note an approved account is
// indistinguishable from a pending one.
//
// Log out lives on the Account panel, not in the header — the 2026 chrome
// (Figma 3376:24) gives the header a single 24px icon with no room for a button.
//
// Single component by design (the store ESLint has no React plugin, so a
// JSX-only sub-component reference would trip no-unused-vars). Panel markup
// lives in ../lib/accountPanels.jsx as plain functions called normally.

const EMPTY_PANEL = { status: 'idle', data: null, error: null, page: 0 }

// How many rows a panel asks for at a time. Matches the API default; a client
// with ten years of invoices pages through with "Show more".
const PANEL_PAGE_SIZE = 20

// Which endpoint backs each panel, and which key in the response holds the rows
// (needed so a second page can be appended to the first). The dashboard and
// details panels are drawn from state that is already loaded, so they have none.
const PANEL_SPECS = {
  [SECTION.ORDERS]: { path: '/orders/mine', rows: 'orders' },
  [SECTION.SAMPLES]: { path: '/account/samples', rows: 'samples' },
  [SECTION.INVOICES]: { path: '/account/invoices', rows: 'invoices' },
  // The price-list index is one row per house — 41 at most, and unpaged by the
  // API — so it is fetched once and never grows.
  [SECTION.PRICE_LISTS]: { path: '/account/price-lists', rows: 'brands' },
}

export default function Account() {
  const [state, setState] = useState({ status: 'loading', user: null, summary: null })
  const [section, setSection] = useState(SECTION.DASHBOARD)
  const [panels, setPanels] = useState({})
  const [loggingOut, setLoggingOut] = useState(false)
  const [reordering, setReordering] = useState(null)
  const [requestingCopy, setRequestingCopy] = useState(null)
  const [requestedCopies, setRequestedCopies] = useState([])
  const [downloading, setDownloading] = useState(null)
  // The two forms on the Account panel. `status` is idle | saving | saved; the
  // panel holds no hooks, so their state lives here like every other panel's.
  const [detailsState, setDetailsState] = useState({ status: 'idle', error: '' })
  const [passwordState, setPasswordState] = useState({ status: 'idle', error: '' })

  const sections = accountSections(state.summary)

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    await logout()
    // Full reload so every island (header account icon, cart, request list)
    // re-reads its state.
    if (typeof window !== 'undefined') window.location.href = '/'
  }, [])

  // --- Boot ---------------------------------------------------------------
  useEffect(() => {
    let active = true

    async function load() {
      const user = await fetchCurrentUser()
      if (!active) return
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login?redirect=/account'
        }
        return
      }
      // A break-glass session (../lib/breakGlass.js) has no API cookie, so every
      // call below could only fail. Say so, instead of rendering a page of
      // network errors that reads as "your account is gone".
      if (user.offline) {
        setState({ status: 'offline', user, summary: null })
        return
      }

      let summary = null
      if (isApprovedTrade(user)) {
        try {
          summary = await apiFetch('/account/summary')
        } catch {
          // The portal still works without the digest — web orders are scoped by
          // user id, not by the Dynamics link — so a failure here degrades to
          // the customer view rather than blocking the page.
          summary = null
        }
      }
      if (!active) return
      setState({ status: 'ready', user, summary })
    }

    load()
    // Back after Log out can restore this page from the bfcache, signed-in
    // state and all, without running anything — the one way a signed-out
    // browser still shows /account (audit SF-TR-03). A restored page re-asks.
    const recheck = (event) => {
      if (event.persisted) load()
    }
    window.addEventListener('pageshow', recheck)
    return () => {
      active = false
      window.removeEventListener('pageshow', recheck)
    }
  }, [])

  // The hash decides the open section, and is kept in step with it so a panel
  // is shareable and Back moves between panels.
  useEffect(() => {
    if (state.status !== 'ready' || typeof window === 'undefined') return undefined
    const available = accountSections(state.summary)
    const apply = () => setSection(sectionFromHash(window.location.hash, available))
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [state.status, state.summary])

  // `#orders/<number>` (the checkout confirmation's link) lands ON that order:
  // once the Orders panel has rows, scroll its card into view and mark it. Runs
  // again if the hash changes while the panel is open.
  const [focusedOrder, setFocusedOrder] = useState(null)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const apply = () => setFocusedOrder(orderFromHash(window.location.hash))
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])
  const ordersLoaded = panels[SECTION.ORDERS]?.data?.orders?.length ?? 0
  useEffect(() => {
    if (!focusedOrder || section !== SECTION.ORDERS || ordersLoaded === 0) return
    if (typeof document === 'undefined') return
    const card = document.getElementById(orderCardId(focusedOrder))
    if (card) card.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [focusedOrder, section, ordersLoaded])

  const openSection = useCallback((id) => {
    setSection(id)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${id}`)
    }
  }, [])

  // --- Per-panel loading ---------------------------------------------------
  const panel = panels[section] ?? EMPTY_PANEL

  // Which (section, page) pairs have already been asked for.
  //
  // A REF, NOT `panels` IN THE DEPENDENCY ARRAY. That is not a style choice —
  // an effect that both writes `panels` and depends on it tears itself down:
  // the `setPanels({ status: 'loading' })` on the first run changes the
  // dependency, React runs the cleanup (`active = false`) before the fetch
  // resolves, and the re-run then sees a panel already in `panels` and returns
  // early. Every panel sits on "Loading…" for ever, and nothing in the pure-
  // module test suite can see it. Deduping through a ref keeps the effect
  // depending only on what should actually re-trigger it.
  const requestedRef = useRef(new Set())

  const loadPanel = useCallback((id, page) => {
    const spec = PANEL_SPECS[id]
    if (!spec) return
    const token = `${id}:${page}`
    if (requestedRef.current.has(token)) return
    requestedRef.current.add(token)

    setPanels((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? EMPTY_PANEL),
        status: page === 1 ? 'loading' : 'ready',
        loadingMore: page > 1,
        error: null,
      },
    }))

    apiFetch(`${spec.path}?page=${page}&limit=${PANEL_PAGE_SIZE}`)
      .then((data) => {
        setPanels((current) => {
          const previous = current[id]
          // Page 2+ APPENDS to what is already on screen — a "load more" that
          // replaced the list would scroll the client back to the top and lose
          // the rows they were reading.
          const rows =
            page > 1 && previous?.data
              ? [...(previous.data[spec.rows] ?? []), ...(data[spec.rows] ?? [])]
              : (data[spec.rows] ?? [])
          return {
            ...current,
            [id]: {
              status: 'ready',
              loadingMore: false,
              data: { ...data, [spec.rows]: rows },
              error: null,
              page,
            },
          }
        })
      })
      .catch((err) => {
        // Let the page be retried: a failed page must not be remembered as
        // fetched, or the button would do nothing for ever after one blip.
        requestedRef.current.delete(token)
        setPanels((current) => ({
          ...current,
          [id]: {
            ...(current[id] ?? EMPTY_PANEL),
            status: current[id]?.data ? 'ready' : 'error',
            loadingMore: false,
            error: err instanceof ApiError ? err.message : 'Could not load this.',
          },
        }))
      })
  }, [])

  useEffect(() => {
    if (state.status !== 'ready') return
    const available = accountSections(state.summary)
    const meta = available.find((entry) => entry.id === section)
    // A panel waiting on the back office to link the account has nothing to
    // fetch — asking would 200 with an empty list and lose the reason.
    if (!meta || meta.state === 'pending-link') return
    loadPanel(section, 1)
  }, [section, state.status, state.summary, loadPanel])

  const handleLoadMore = useCallback(
    (id, nextPage) => loadPanel(id, nextPage),
    [loadPanel]
  )

  // --- Actions -------------------------------------------------------------
  const handleReorder = useCallback((order) => {
    const plan = reorderPlan(order)
    if (!plan.destination) return
    setReordering(order.order_number)
    // Replace, not merge: "order this again" means THIS order, and merging into
    // whatever was left over from last week would quietly change what the
    // shopper is about to submit. That has to hold for BOTH baskets — addToCart
    // accumulates by SKU, so pressing the button twice would otherwise double
    // every finished-good quantity while the fabric half stayed correct.
    if (plan.fabric > 0) replaceRequestList(toRequestLines(order))
    for (const line of toCartLines(order)) {
      addToCart(line, line.qty)
      setCartQty(line.sku, line.qty)
    }
    if (typeof window !== 'undefined') window.location.href = plan.destination
  }, [])

  const handleRequestCopy = useCallback(async (invoice) => {
    setRequestingCopy(invoice.id)
    try {
      await apiFetch(`/account/invoices/${invoice.id}/copy-request`, { method: 'POST' })
      setRequestedCopies((current) => [...current, invoice.id])
    } catch {
      // Deliberately quiet: the request is a convenience, the client still has
      // the invoice number in front of them, and an alert would be the loudest
      // thing on a page of records.
    } finally {
      setRequestingCopy(null)
    }
  }, [])

  // Name and phone only. Email is the login identity and stays with the office
  // (see the panel), so it is not in the body even though the API would ignore
  // it — sending a field the client cannot change is a promise the screen does
  // not keep.
  const handleSaveDetails = useCallback(async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setDetailsState({ status: 'saving', error: '' })
    try {
      const body = await apiFetch('/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          phone: String(form.get('phone') ?? '').trim(),
        }),
      })
      // The greeting and the order-request prefill both read state.user, so the
      // page has to take the saved row rather than leave the old name on screen.
      if (body?.user) setState((current) => ({ ...current, user: body.user }))
      setDetailsState({ status: 'saved', error: '' })
    } catch (err) {
      setDetailsState({
        status: 'idle',
        error: err instanceof ApiError ? err.message : 'We could not save your details.',
      })
    }
  }, [])

  const handleChangePassword = useCallback(async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const password = String(fields.get('new_password') ?? '')
    // The floor and the confirmation are checked here so the common mistakes
    // answer instantly and never spend an attempt against the auth rate limit.
    const problem = newPasswordError(password, String(fields.get('confirm_password') ?? ''))
    if (problem) {
      setPasswordState({ status: 'idle', error: problem })
      return
    }
    setPasswordState({ status: 'saving', error: '' })
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: String(fields.get('current_password') ?? ''),
          new_password: password,
        }),
      })
      form.reset()
      setPasswordState({ status: 'saved', error: '' })
    } catch (err) {
      setPasswordState({
        status: 'idle',
        error: changePasswordError(err instanceof ApiError ? err : null),
      })
    }
  }, [])

  const handleDownload = useCallback(async (brand) => {
    setDownloading(brand.slug)
    try {
      const { blob, filename } = await apiDownload(
        `/account/price-lists/${encodeURIComponent(brand.slug)}/export.csv`,
        `atelier-trade-prices-${brand.slug}.csv`
      )
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Revoking immediately can race the save in some browsers.
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
    } catch {
      // Same posture as the copy request.
    } finally {
      setDownloading(null)
    }
  }, [])

  // --- Render --------------------------------------------------------------
  if (state.status === 'loading') {
    return <p className="products-status">Loading your account…</p>
  }

  if (state.status === 'offline') {
    return (
      <div className="account">
        <div className="account-head">
          {/* The label is the email, not accountLabel(): the display name for a
              break-glass session already reads "Offline access". */}
          <p className="account-greeting">Offline access — {state.user.email}</p>
          <button
            type="button"
            className="account-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
        <p className="products-status">
          The store service is not responding, so this is a local session: your orders, samples,
          invoices and the cart are unavailable until it is back. Browsing the collections still
          works — every product page is served from this site.
        </p>
        <a className="btn btn-primary" href="/products">
          Browse products
        </a>
      </div>
    )
  }

  const note = tradeStatusNote(state.user)

  return (
    <div className="account">
      <div className="account-head">
        <p className="account-greeting">Signed in as {accountLabel(state.user)}</p>
      </div>

      {note ? (
        <div className={`account-trade account-trade-${note.tone}`}>
          <p className="account-trade-label">{note.label}</p>
          <p className="account-trade-text">{note.text}</p>
        </div>
      ) : null}

      <nav className="account-nav" aria-label="Account sections">
        {sections.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`account-nav-item${section === entry.id ? ' is-current' : ''}`}
            aria-current={section === entry.id ? 'page' : undefined}
            onClick={() => openSection(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <section className="account-panel" aria-live="polite">
        {renderPanel({
          section,
          sections,
          panel,
          state,
          handlers: {
            onSection: openSection,
            onReorder: handleReorder,
            onRequestCopy: handleRequestCopy,
            onDownload: handleDownload,
            onLogout: handleLogout,
            onLoadMore: handleLoadMore,
            onSaveDetails: handleSaveDetails,
            onChangePassword: handleChangePassword,
          },
          flags: {
            focusedOrder,
            loggingOut,
            reordering,
            requestingCopy,
            requestedCopies,
            downloading,
            detailsState,
            passwordState,
          },
        })}
      </section>
    </div>
  )
}

// Plain function, not a component — same reason as the panels themselves.
function renderPanel({ section, sections, panel, state, handlers, flags }) {
  const meta = sections.find((entry) => entry.id === section)

  if (meta?.state === 'pending-link') {
    return pendingLinkNotice(meta.pending)
  }

  if (section === SECTION.DASHBOARD) {
    return dashboardPanel({
      summary: state.summary,
      user: state.user,
      onSection: handlers.onSection,
    })
  }

  if (section === SECTION.DETAILS) {
    return detailsPanel({
      user: state.user,
      summary: state.summary,
      onLogout: handlers.onLogout,
      loggingOut: flags.loggingOut,
      onSaveDetails: handlers.onSaveDetails,
      onChangePassword: handlers.onChangePassword,
      detailsState: flags.detailsState,
      passwordState: flags.passwordState,
    })
  }

  if (panel.status === 'loading' || panel.status === 'idle') {
    return panelLoading(meta?.label?.toLowerCase() ?? 'details')
  }
  if (panel.status === 'error') {
    return panelError(panel.error)
  }

  // Whether there is another page behind this one, and the control that asks
  // for it. `meta.total` is the whole history, so a footer promising "681 in
  // total" beside twenty rows has to come with a way to reach the rest.
  const more = (rows) =>
    moreControl({
      shown: rows.length,
      total: panel.data?.meta?.total ?? rows.length,
      loading: panel.loadingMore === true,
      onMore: () => handlers.onLoadMore(section, (panel.page ?? 1) + 1),
    })

  if (section === SECTION.ORDERS) {
    const orders = panel.data?.orders ?? []
    if (orders.length === 0) return panelEmpty(meta?.empty ?? 'Nothing here yet.')
    return (
      <>
        <div className="order-list">
          {orders.map((order) => (
            <div
              className={`account-order${flags.focusedOrder === order.order_number ? ' is-focused' : ''}`}
              id={orderCardId(order.order_number)}
              key={order.order_number}
            >
              {orderCard(order)}
              {reorderPlan(order).destination ? (
                <div className="account-order-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={flags.reordering === order.order_number}
                    onClick={() => handlers.onReorder(order)}
                  >
                    {flags.reordering === order.order_number ? 'Preparing…' : 'Order this again'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {more(orders)}
      </>
    )
  }

  if (section === SECTION.SAMPLES) {
    const samples = panel.data?.samples ?? []
    if (samples.length === 0) return panelEmpty(meta?.empty ?? 'Nothing here yet.')
    return (
      <>
        {samplesPanel({ samples })}
        {more(samples)}
      </>
    )
  }

  if (section === SECTION.INVOICES) {
    const invoices = panel.data?.invoices ?? []
    if (invoices.length === 0) return panelEmpty(meta?.empty ?? 'Nothing here yet.')
    return (
      <>
        {invoicesPanel({
          invoices,
          onRequestCopy: handlers.onRequestCopy,
          requesting: flags.requestingCopy,
          requested: flags.requestedCopies,
        })}
        {more(invoices)}
      </>
    )
  }

  if (section === SECTION.PRICE_LISTS) {
    const brands = panel.data?.brands ?? []
    if (brands.length === 0) return panelEmpty(meta?.empty ?? 'Nothing here yet.')
    return priceListsPanel({
      brands,
      onDownload: handlers.onDownload,
      downloading: flags.downloading,
    })
  }

  return null
}
