// Production entry (`npm start`). Wraps the Astro build (@astrojs/node in
// `middleware` mode) in an Express app so the WHOLE site — prerendered pages
// and static assets included — sits behind one HTTP Basic Auth gate. Astro
// middleware cannot do this: in standalone mode prerendered pages are served
// as static files before app middleware runs. `astro dev` bypasses this file.
import 'dotenv/config'
import { timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { handler as ssrHandler } from './dist/server/entry.mjs'

const siteUser = process.env.SITE_AUTH_USER
const sitePass = process.env.SITE_AUTH_PASS
const authDisabled = process.env.SITE_AUTH_DISABLED === 'true'
const allowIndexing = process.env.ALLOW_INDEXING === 'true'

// Missing credentials must never mean "serve the site unprotected", but they
// must not mean "exit" either: under pm2 that is a crash loop, and the operator
// sees only a bare 502 from the proxy with the real reason buried in pm2 logs.
// Instead the process stays up and answers everything with an explanatory 503 —
// still closed, but self-diagnosing in the browser.
const misconfigured = !authDisabled && (!siteUser || !sitePass)

const MISCONFIG_MESSAGE =
  'Storefront is not configured: SITE_AUTH_USER and SITE_AUTH_PASS must both '
  + 'be set (see .env.example). Nothing is served until they are. To run '
  + 'publicly on purpose, set SITE_AUTH_DISABLED=true.'

if (misconfigured) console.error(MISCONFIG_MESSAGE)

// Paths that skip the Basic Auth gate:
// - /robots.txt must stay readable so crawlers see "Disallow: /".
// - /_emdash/api/* enforces its own auth (Bearer token for the MCP endpoint,
//   passkey session for the admin API); a Basic gate would clash with the
//   Authorization header those clients send.
const EXEMPT_PREFIXES = ['/_emdash/api/']
const EXEMPT_PATHS = new Set(['/robots.txt'])

// An encoded path separator makes the exemption unsound: express.static decodes
// %2f, so `/_emdash/api/..%2f..%2f_astro/app.js` would clear an exempt-prefix
// check and then be served from outside the exempt subtree. Nothing legitimate
// needs one, so treat it as never-exempt.
const ENCODED_SEPARATOR = /%2f|%5c/i

// Match on the WHATWG-normalised pathname, NOT req.path: Express leaves dot
// segments in place, so a raw `/_emdash/api/../../resources` would look exempt
// while Astro (which builds a Request from req.url) resolves and serves
// `/resources`. `new URL()` collapses `..` — including its percent-encoded
// spellings — giving the gate the same view of the path the handler has.
// Unparseable URL → not exempt (fail closed).
const exemptTarget = (rawUrl) => {
  if (ENCODED_SEPARATOR.test(rawUrl)) return null
  try {
    return new URL(rawUrl, 'http://localhost').pathname
  } catch {
    return null
  }
}

const isExempt = (rawUrl) => {
  const path = exemptTarget(rawUrl)
  if (path === null) return false
  return EXEMPT_PATHS.has(path) || EXEMPT_PREFIXES.some((p) => path.startsWith(p))
}

// Single timing-safe comparison over "user:pass" so a matching username alone
// is not observable.
const credentialsMatch = (header) => {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return false
  const given = Buffer.from(header.slice(6), 'base64')
  const expected = Buffer.from(`${siteUser}:${sitePass}`, 'utf8')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const clientDir = fileURLToPath(new URL('./dist/client/', import.meta.url))
const app = express()
app.disable('x-powered-by')

if (!allowIndexing) {
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })
}

if (misconfigured) {
  // Registered before the static and SSR handlers, so nothing is ever served.
  app.use((_req, res) => {
    res.status(503).type('text/plain').send(MISCONFIG_MESSAGE)
  })
} else if (!authDisabled) {
  app.use((req, res, next) => {
    if (isExempt(req.url) || credentialsMatch(req.headers.authorization)) {
      return next()
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Atelier staging", charset="UTF-8"')
    res.status(401).type('text/plain').send('Authentication required')
  })
}

app.use('/', express.static(clientDir))
app.use(ssrHandler)

const port = Number(process.env.PORT) || 3041
const server = app.listen(port)

server.on('listening', () => {
  console.log(
    `atelier-store on :${port} `
    + `(auth ${misconfigured ? 'MISCONFIGURED — serving 503' : authDisabled ? 'DISABLED' : 'on'}, `
    + `indexing ${allowIndexing ? 'allowed' : 'blocked'})`
  )
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use — another storefront process is probably `
      + `still running. Stop it (e.g. \`fuser -k ${port}/tcp\`) or set PORT to a `
      + 'different value.'
    )
  } else {
    console.error(err)
  }
  process.exit(1)
})
