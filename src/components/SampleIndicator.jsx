import { useEffect, useState } from 'react'
import { SAMPLE_EVENT, SAMPLE_PATH, SAMPLE_STORAGE_KEY, readSampleList, sampleLineCount } from '../lib/sampleList.js'

// The sample enquiry cart's header icon — the RequestIndicator shape: renders
// nothing until the list holds something.
export default function SampleIndicator() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const sync = () => setCount(sampleLineCount(readSampleList()))
    sync()
    const onStorage = (event) => {
      if (event.key === SAMPLE_STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(SAMPLE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SAMPLE_EVENT, sync)
    }
  }, [])

  if (count === 0) return null

  return (
    <a
      className="site-icon site-icon-sample"
      href={SAMPLE_PATH}
      aria-label={count === 1 ? 'Sample request — 1 cutting' : `Sample request — ${count} cuttings`}
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
        <rect x="4" y="3" width="16" height="18" rx="2"></rect>
        <path d="M8 3v4M12 3v4M16 3v4"></path>
        <path d="M8 13h8M8 17h5"></path>
      </svg>
      <span className="site-icon-count" aria-hidden="true">
        {count}
      </span>
    </a>
  )
}
