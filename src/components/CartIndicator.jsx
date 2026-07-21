import { useEffect, useState } from 'react'

// Small interactive island proving the @astrojs/react integration works.
// Reads the client-side cart (localStorage, populated later in US-019) and shows
// a live item count. Rendered with client:load in the header.
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
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <a className="cart-indicator" href="/cart">
      Cart <strong>({count})</strong>
    </a>
  )
}
