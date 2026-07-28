import { useEffect, useState } from 'react'
import { CART_EVENT, STORAGE_KEY, cartCount } from '../lib/cart.js'

// Small interactive island in the header. Reads the client-side cart
// (localStorage) through src/lib/cart.js — the single source of truth for the
// cart shape — and shows a live item count. Updates from BOTH the native
// `storage` event (cart changed in another tab) and our same-tab `CART_EVENT`
// (Add to cart in this tab — US-018), since `storage` never fires in the tab
// that made the change.

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
    <a className="cart-indicator" href="/cart">
      Cart <strong>({count})</strong>
    </a>
  )
}
