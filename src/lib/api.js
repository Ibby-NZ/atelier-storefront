// Shared fetch helper for talking to atelier-api.
//
// One place for the base URL and error handling so pages/islands never build
// raw fetch calls. Non-200 responses and network failures surface as an
// ApiError carrying a user-friendly message; callers can either catch it or use
// safeFetch to get a plain { data, error } result for rendering an error state.

const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3001'

const GENERIC_MESSAGE =
  'We could not load this right now. Please refresh or try again shortly.'

const NETWORK_MESSAGE =
  'We could not reach the store service. Check your connection and try again.'

export class ApiError extends Error {
  constructor(message, status = 0, cause) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    // Parsed JSON error body, when the API returned one. Lets callers read
    // structured detail such as field-level validation errors (422 responses
    // carry `{ message, errors: [{ field, message }] }`).
    this.body = null
    if (cause) this.cause = cause
  }
}

// Build a friendly message, preferring an { error/message } field the API sent.
function messageFromBody(body, status) {
  if (body && typeof body === 'object') {
    const detail = body.message || body.error
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  if (status === 404) return 'We could not find what you were looking for.'
  if (status === 401 || status === 403) {
    return 'Please log in to view this.'
  }
  return GENERIC_MESSAGE
}

async function parseBody(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

// Throws ApiError on network failure or non-2xx. Returns parsed JSON otherwise.
export async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path}`

  let response
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    })
  } catch (cause) {
    throw new ApiError(NETWORK_MESSAGE, 0, cause)
  }

  const body = await parseBody(response)

  if (!response.ok) {
    const error = new ApiError(messageFromBody(body, response.status), response.status)
    error.body = body
    throw error
  }

  return body
}

// A file download from an authenticated endpoint, as a Blob plus the filename
// the server asked for.
//
// It goes through fetch rather than a plain <a href> ON PURPOSE. The session
// cookie is SameSite=Lax, which means a top-level GET navigation DOES carry it —
// so a bare link would work, and so would one on somebody else's page,
// triggering a credentialed download of a client's price list under their
// session. Fetching keeps the request script-initiated and therefore
// CORS-checked against the API's closed origin allowlist.
//
// Throws ApiError exactly as apiFetch does, so a 401/403/404 renders as a
// message rather than saving an error page to the client's Downloads folder.
export async function apiDownload(path, fallbackFilename = 'download') {
  const url = `${API_BASE_URL}${path}`

  let response
  try {
    response = await fetch(url, { credentials: 'include' })
  } catch (cause) {
    throw new ApiError(NETWORK_MESSAGE, 0, cause)
  }

  if (!response.ok) {
    const body = await parseBody(response)
    const error = new ApiError(messageFromBody(body, response.status), response.status)
    error.body = body
    throw error
  }

  return {
    blob: await response.blob(),
    filename: filenameFrom(response.headers.get('content-disposition'), fallbackFilename),
  }
}

// `attachment; filename="atelier-trade-prices-pierre-frey.csv"`. Anything that
// does not match falls back — the header is server-set, but a caller should
// never end up saving a file named from a parse accident.
function filenameFrom(header, fallback) {
  const match = /filename="([^"]+)"/.exec(header || '')
  return match ? match[1] : fallback
}

// Never throws — returns { data, error }. Use in page frontmatter/islands so the
// template can render an error state instead of crashing the whole page.
export async function safeFetch(path, options = {}) {
  try {
    const data = await apiFetch(path, options)
    return { data, error: null }
  } catch (err) {
    const message = err instanceof ApiError ? err.message : GENERIC_MESSAGE
    return { data: null, error: message }
  }
}

export { API_BASE_URL }
