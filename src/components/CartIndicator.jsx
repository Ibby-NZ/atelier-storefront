import { useEffect, useState } from 'react'
import { CART_EVENT, STORAGE_KEY, cartCount } from '../lib/cart.js'

// Small interactive island in the header. Reads the client-side cart
// (localStorage) through src/lib/cart.js — the single source of truth for the
// cart shape — and shows a live item count. Updates from BOTH the native
// `storage` event (cart changed in another tab) and our same-tab `CART_EVENT`
// (Add to cart in this tab — US-018), since `storage` never fires in the tab
// that made the change.
//
// 2026 direction: the design draws a 24px cart icon (Figma 9346:1685) and no
// count, but an empty and a full cart must not look identical — the count rides
// as a small badge on the corner of the icon and is absent at zero, so the
// header still matches the mock for the state the mock was drawn in.

export default function CartIndicator() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(cartCount())
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setCount(cartCount())
    }
    const onCartChange = () => setCount(cartCount())
    window.addEventListener('storage', onStorage)
    window.addEventListener(CART_EVENT, onCartChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CART_EVENT, onCartChange)
    }
  }, [])

  return (
    <a
      className="site-icon site-icon-cart"
      href="/cart"
      aria-label={count === 1 ? 'Cart — 1 item' : `Cart — ${count} items`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          d="M20.9986 21.466L19.7763 9L5.13146 9.03684L4.0014 21.5028C3.97834 21.7698 4.24356 22 4.57797 22L20.422 21.9632C20.7564 21.9632 21.0217 21.733 20.9986 21.466Z"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 11V6.81441C16 4.70163 14.4325 3 12.5 3C10.5675 3 9 4.71305 9 6.81441V11"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {count > 0 && (
        <span className="site-icon-count" aria-hidden="true">
          {count}
        </span>
      )}
    </a>
  )
}
