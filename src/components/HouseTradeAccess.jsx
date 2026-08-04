import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import {
  TRADE_APPLICATION_PATH,
  TRADE_GATE_COPY,
  houseDesignsHref,
  isTradeGatedList,
  signInHref,
} from '../lib/tradeGate.js'

// The trade note on a represented house's page (/brands/[slug]) — the one part
// of that page that has to know WHO is reading.
//
// Everything else on the house page is server-rendered, and that is right: the
// name, the country, the story and the editorial are public. But Astro's
// frontmatter fetch carries no browser cookie, so the design count it gets back
// is always the ANONYMOUS one — zero for every maison Atelier represents. Left
// server-side, the note therefore told an approved trade customer, signed in,
// to "apply for a trade account", and the page offered them no route at all into
// the designs they were entitled to: "Designs held" was dropped, "View all
// products" was hidden and the collection tiles never rendered, all off that
// same zero.
//
// So this small island decides the note in the browser, where the cookie is:
//   - entitled  -> "your account is approved" + a link into the house's grid
//   - otherwise -> the apply / sign-in note, unchanged
//
// It asks the SAME endpoint the grid does (`?brand=&limit=1`) and reads
// `meta.trade_gated`, rather than reading /auth/me and re-deriving the rule —
// the API owns who is entitled, and a second copy of that rule here would be one
// more thing to keep in step with `canSeeTradeCatalogue`. limit=1 because only
// the meta is wanted.
//
// Astro server-renders `client:load` islands, so the guest note is in the HTML
// for a crawler and for a visitor without JavaScript — which is the correct
// default, and the same posture as AccountNav's guest-first render.
//
// Single component by design: the store ESLint has no React plugin, so a
// JSX-only sub-component reference would trip no-unused-vars.

export default function HouseTradeAccess({ brandSlug }) {
  // null = not resolved yet (render the guest note, which is also the SSR
  // output); true = this shopper is through the gate.
  const [entitled, setEntitled] = useState(false)

  useEffect(() => {
    let active = true
    apiFetch(`/catalogue/products?brand=${encodeURIComponent(brandSlug)}&limit=1`)
      .then((body) => {
        // A response with no meta at all (an older API) reads as gated, so the
        // note stays as it renders on the server rather than promising access.
        if (active) setEntitled(!isTradeGatedList(body))
      })
      // An outage must not turn the note into an error state — it is context,
      // not the page. Staying on the guest copy is the honest degradation.
      .catch(() => {
        if (active) setEntitled(false)
      })
    return () => {
      active = false
    }
  }, [brandSlug])

  if (entitled) {
    return (
      <div className="house-trade">
        <p className="house-trade-head">{TRADE_GATE_COPY.houseEntitled.heading}</p>
        <p className="house-trade-body">{TRADE_GATE_COPY.houseEntitled.body}</p>
        <div className="house-actions">
          <a className="cta-underline" href={houseDesignsHref(brandSlug)}>
            {TRADE_GATE_COPY.houseEntitled.browse}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="house-trade">
      <p className="house-trade-head">{TRADE_GATE_COPY.house.heading}</p>
      <p className="house-trade-body">{TRADE_GATE_COPY.house.body}</p>
      <div className="house-actions">
        <a className="cta-underline" href={TRADE_APPLICATION_PATH}>
          {TRADE_GATE_COPY.house.apply}
        </a>
        <a className="cta-underline" href={signInHref(`/brands/${brandSlug}`)}>
          {TRADE_GATE_COPY.house.signIn}
        </a>
      </div>
    </div>
  )
}
