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
    throw new ApiError(messageFromBody(body, response.status), response.status)
  }

  return body
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
