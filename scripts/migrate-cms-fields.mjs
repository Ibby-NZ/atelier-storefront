// Bring an EXISTING EmDash database up to date with .emdash/seed.json's field
// definitions, without touching content.
//
// Why this exists: `emdash seed` with the default conflict mode skips every
// field of a collection that already exists, so a field added to the seed
// never reaches a database that has run before. The CLI's escape hatch
// (`--on-conflict update`) is worse: it also rewrites CONTENT entries from the
// seed — `--no-content` does not stop it (verified against 0.29.0) — which
// would clobber whatever editors have changed. So: fields via the schema API,
// content never touched.
//
// Idempotent — only fields missing from the live schema are created; existing
// fields are never modified (a label or option changed in the admin stays).
//
// Usage (local):   EMDASH_TOKEN=<token> npm run seed:cms:fields
// Usage (remote):  EMDASH_TOKEN=<token> node scripts/migrate-cms-fields.mjs https://atelier-storefront.disrupted.co.nz
import { readFileSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '')
const TOKEN = process.env.EMDASH_TOKEN
if (!TOKEN) {
  console.error('EMDASH_TOKEN is required (EmDash admin → API tokens).')
  process.exit(1)
}

const seed = JSON.parse(readFileSync('.emdash/seed.json', 'utf8'))

const api = async (path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${response.status}: ${text.slice(0, 200)}`)
  }
  const json = JSON.parse(text)
  return json?.data ?? json
}

for (const collection of seed.collections ?? []) {
  let live
  try {
    live = await api(`/_emdash/api/schema/collections/${collection.slug}/fields`)
  } catch {
    console.warn(`${collection.slug} — not in the live schema (run \`npm run seed:cms\` first), skipped`)
    continue
  }
  const liveFields = new Set((live.items ?? []).map((field) => field.slug))

  for (const field of collection.fields ?? []) {
    if (liveFields.has(field.slug)) continue
    await api(`/_emdash/api/schema/collections/${collection.slug}/fields`, {
      method: 'POST',
      body: JSON.stringify({
        slug: field.slug,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        searchable: field.searchable ?? false,
        description: field.description,
        validation: field.validation,
      }),
    })
    console.log(`${collection.slug}.${field.slug} — created (${field.type})`)
  }
}

console.log('Done.')
