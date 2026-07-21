import { useEffect, useState } from 'react'
import { CART_EVENT } from '../lib/cart.js'

// Small interactive island in the header. Reads the client-side cart
// (localStorage) and shows a live item count. Updates from BOTH the native
// `storage` event (cart changed in another tab) and our same-tab `CART_EVENT`
// (Add to Cart in this tab — US-018), since `storage` never fires in the tab
// that made the change.
const STORAGE_KEY = 'atelier_cart'

function readCount() {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const items = JSON.parse(raw)
    if (!Array.isArray(items)) return 0
    return items.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0)
  } catch {
    return 0
  }
}

export default function CartIndicator() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(readCount())
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setCount(readCount())
    }
    const onCartChange = () => setCount(readCount())
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
