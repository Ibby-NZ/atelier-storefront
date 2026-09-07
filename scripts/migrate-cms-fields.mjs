// Bring an EXISTING EmDash database up to date with .emdash/seed.json without
// touching editor content:
//   - a collection missing from the live schema is created, with its fields;
//   - a field missing from an existing collection is added;
//   - a seed content entry (the fixed-slug site_sections rows) whose slug does
//     not exist yet is created and published.
// Nothing that already exists is modified — an editor's label, option, image
// or copy stays exactly as they left it.
//
// Why this exists: EmDash auto-seeds only a BRAND-NEW database (its startup
// check is "zero collections and setup not done"), and `emdash seed` skips
// every field of a collection that already exists. So a collection or field
// added to the seed never reaches a database that has run before. Staging is
// the standing example: its Collection Banners collection sat empty (nothing
// for the office to attach a hero frame to) and a field added after its
// collections were made is missing until this script adds it.
// The CLI's escape hatch (`--on-conflict update`) is worse: it also rewrites
// CONTENT entries from the seed — `--no-content` does not stop it (verified
// against 0.29.0) — clobbering whatever editors have changed. And the CLI
// needs a shell on the box, which staging does not offer. So: schema and
// missing entries over the HTTP API, editor content never touched.
//
// Idempotent — a second run reports nothing to do.
//
// Usage (local):   EMDASH_TOKEN=<token> npm run seed:cms:fields
// Usage (remote):  EMDASH_TOKEN=<token> node scripts/migrate-cms-fields.mjs https://atelier-storefront.disrupted.co.nz
// Then `npm run import:cms-art` (same token + URL) attaches the shipped art.
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

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })

// --- Schema: collections and their fields -----------------------------------
const liveCollections = new Set(
  ((await api('/_emdash/api/schema/collections')).items ?? []).map((collection) => collection.slug)
)

for (const collection of seed.collections ?? []) {
  if (!liveCollections.has(collection.slug)) {
    // Same shape the seed CLI writes (source "seed" so the admin files it with
    // the others). Fields are their own endpoint, below.
    await post('/_emdash/api/schema/collections', {
      slug: collection.slug,
      label: collection.label,
      labelSingular: collection.labelSingular,
      description: collection.description,
      icon: collection.icon,
      supports: collection.supports,
      urlPattern: collection.urlPattern,
      hasSeo: collection.hasSeo,
      source: 'seed',
    })
    console.log(`${collection.slug} — collection created`)
  }

  const live = await api(`/_emdash/api/schema/collections/${collection.slug}/fields`)
  const liveFields = new Set((live.items ?? []).map((field) => field.slug))

  for (const [index, field] of (collection.fields ?? []).entries()) {
    if (liveFields.has(field.slug)) continue
    // `sortOrder` keeps the seed's field order on a freshly created collection;
    // a field added to an existing one lands after the live ones either way.
    await post(`/_emdash/api/schema/collections/${collection.slug}/fields`, {
      slug: field.slug,
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      unique: field.unique ?? false,
      searchable: field.searchable ?? false,
      validation: field.validation ?? null,
      sortOrder: index,
    })
    console.log(`${collection.slug}.${field.slug} — field created (${field.type})`)
  }
}

// --- Content: the seed's own entries, where the slug does not exist yet ------
// Only what .emdash/seed.json's `content` block names (today: the five
// site_sections whose slugs the homepage joins on). An existing slug is left
// alone whatever its content — this never overwrites an edit.
for (const [collectionSlug, entries] of Object.entries(seed.content ?? {})) {
  const live = await api(`/_emdash/api/content/${collectionSlug}?limit=100`)
  const liveSlugs = new Set((live.items ?? []).map((entry) => entry.slug))

  for (const entry of entries) {
    if (liveSlugs.has(entry.slug)) continue
    // Create only accepts drafts; publishing is its own endpoint.
    const { item } = await post(`/_emdash/api/content/${collectionSlug}`, {
      slug: entry.slug,
      status: 'draft',
      data: entry.data ?? {},
    })
    if (entry.status === 'published') {
      await post(`/_emdash/api/content/${collectionSlug}/${item.id}/publish`, {})
    }
    console.log(`${collectionSlug}/${entry.slug} — entry created (${entry.status ?? 'draft'})`)
  }
}

console.log('Done.')
