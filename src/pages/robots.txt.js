export const prerender = true

// Defining /robots.txt here (not in public/) makes EmDash skip its injected
// robots.txt route, which advertises `Allow: /` — wrong while the site is a
// staging deployment. Prerendered, so the build emits dist/client/robots.txt
// and server.mjs can serve it without auth (crawlers must be able to read it).
//
// ALLOW_INDEXING is read at BUILD time. Leave it unset while staging; at real
// launch set ALLOW_INDEXING=true (build + runtime env — it also controls the
// noindex meta tag in Layout.astro and the X-Robots-Tag header in server.mjs).
const allowIndexing = import.meta.env.ALLOW_INDEXING === 'true'

const STAGING_POLICY = ['User-agent: *', 'Disallow: /', ''].join('\n')

const PUBLIC_POLICY = [
  'User-agent: *',
  'Allow: /',
  '',
  '# CMS admin + API',
  'Disallow: /_emdash/',
  '',
].join('\n')

export function GET() {
  return new Response(allowIndexing ? PUBLIC_POLICY : STAGING_POLICY, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
