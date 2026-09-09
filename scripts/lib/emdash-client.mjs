// The EmDash HTTP client the import scripts share: a Bearer-authenticated
// fetch that unwraps `{ data }`, a cursor walker, and a "download this remote
// photograph into the media library" step. Local or remote — the base URL is
// the one argument every script takes, the token comes from EMDASH_TOKEN
// (admin → API tokens). Not a general SDK: only what the scripts actually call.
import { basename } from 'node:path'

export function emdashClient({ base, token }) {
  const BASE = base.replace(/\/$/, '')

  const api = async (path, options = {}) => {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`${options.method ?? 'GET'} ${path} → ${response.status}: ${text.slice(0, 200)}`)
    }
    return JSON.parse(text)?.data
  }

  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })

  // Every item behind a cursor-paginated list endpoint.
  const listAll = async (path) => {
    const items = []
    let cursor
    do {
      const page = await api(`${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      items.push(...(page.items ?? []))
      cursor = page.nextCursor ?? null
    } while (cursor)
    return items
  }

  // The value stored into an image field/sub-field. The save path keeps
  // repeater sub-values VERBATIM (no server-side enrichment, unlike top-level
  // image fields), so the storage key must be on the object we send or the
  // site's mediaUrl() has nothing to resolve — a bare {provider, id} renders
  // nothing.
  const mediaValue = (item) => ({
    provider: 'local',
    id: item.id,
    filename: item.filename,
    meta: { storageKey: item.storageKey },
  })

  // Media library by filename, loaded once on first use — that is how the
  // import dedupes: a photograph already uploaded is reused, never re-sent.
  let mediaIndex = null
  const loadMediaIndex = async () => {
    if (mediaIndex) return mediaIndex
    mediaIndex = new Map()
    for (const item of await listAll('/_emdash/api/media')) {
      if (item.filename && !mediaIndex.has(item.filename)) mediaIndex.set(item.filename, item)
    }
    return mediaIndex
  }

  // Returns a MediaValue for the imported copy, or the original URL string when
  // the download fails — either renders, the string just stays remote-hosted.
  const importImage = async (url) => {
    const index = await loadMediaIndex()
    const filename = decodeURIComponent(basename(new URL(url).pathname))
    const existing = index.get(filename)
    if (existing) return mediaValue(existing)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const body = new FormData()
      body.append('file', blob, filename)
      const { item } = await api('/_emdash/api/media', { method: 'POST', body })
      index.set(filename, item)
      console.log(`  media ${filename} — imported`)
      return mediaValue(item)
    } catch (error) {
      console.warn(`  media ${filename} — download failed (${error.message}), keeping remote URL`)
      return url
    }
  }

  return { api, post, listAll, importImage }
}

// Frontmatter + body of a markdown file, or null when it has no frontmatter.
export const splitFrontmatter = (raw) => {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  return match ? { frontmatter: match[1], body: match[2] } : null
}
