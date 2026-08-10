import { useEffect, useState } from 'react'
import { REQUEST_EVENT, REQUEST_STORAGE_KEY, readRequestList, requestLineCount } from '../lib/requestList.js'

// Header indicator for the fabric request list — the cut-to-order sibling of
// CartIndicator. Same contract: read through src/lib/requestList.js (the single
// source of truth for the list shape) and listen to BOTH the native `storage`
// event (another tab) and our same-tab REQUEST_EVENT, since `storage` never
// fires in the tab that made the change.
//
// It renders NOTHING at zero. The 2026 header is drawn with exactly three icons
// (Figma 3376:24) and a fourth permanent one would not be that header; but a
// list a shopper has actually built has to be reachable from every page, or the
// cloths they chose are only findable by remembering a URL. Absent-when-empty
// keeps the drawn state exactly as drawn, and the badge follows the cart's own
// rule that an empty and a full list must not look identical.

export default function RequestIndicator() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const sync = () => setCount(requestLineCount(readRequestList()))
    sync()
    const onStorage = (event) => {
      if (event.key === REQUEST_STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(REQUEST_EVENT, sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(REQUEST_EVENT, sync)
    }
  }, [])

  if (count === 0) return null

  return (
    <a
      className="site-icon site-icon-request"
      href="/order-request"
      aria-label={count === 1 ? 'Request list — 1 cloth' : `Request list — ${count} cloths`}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="6" cy="6" r="3"></circle>
        <circle cx="6" cy="18" r="3"></circle>
        <path d="M20 4 8.12 15.88"></path>
        <path d="M14.47 14.48 20 20"></path>
        <path d="M8.12 8.12 12 12"></path>
      </svg>
      <span className="site-icon-count" aria-hidden="true">
        {count}
      </span>
    </a>
  )
}
