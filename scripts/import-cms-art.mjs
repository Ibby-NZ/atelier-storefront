// Import the shipped homepage art into the EmDash CMS, so the office sees and
// controls in the admin exactly what the site ships: the three commissioned
// hero banners + the featured portrait become `collection_banners` entries,
// and the four art-directed band backgrounds are attached to their
// `site_sections` entries.
//
// Idempotent by design — run it as often as you like:
//   - a media file is matched by filename and never re-uploaded;
//   - a collection_banners entry only has its MISSING frames filled in;
//   - a site_sections entry with an image already set is left alone entirely,
//     so an editor's replacement photograph is never clobbered.
//
// Usage (local):   EMDASH_TOKEN=<token> node scripts/import-cms-art.mjs
// Usage (remote):  EMDASH_TOKEN=<token> node scripts/import-cms-art.mjs https://atelier-storefront.disrupted.co.nz
//
// The token is an EmDash API token (admin → API tokens, or the dev-bypass
// response locally). Run from the repo root — image paths are relative to it.
// Note the site_sections entries must exist first (`npm run seed:cms`).
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '')
const TOKEN = process.env.EMDASH_TOKEN
if (!TOKEN) {
  console.error('EMDASH_TOKEN is required (EmDash admin → API tokens).')
  process.exit(1)
}

// The shipped art, keyed to where it belongs. Mirrors the registries in
// src/pages/index.astro — if a banner is added there, add it here too.
const COLLECTION_BANNERS = [
  {
    slug: 'nature-s-opera',
    house: 'de-le-cuona',
    collection: 'nature-s-opera',
    banner: 'src/assets/img/natures-opera-hero-banner.jpg',
  },
  {
    slug: 'larsen-2024',
    house: 'larsen',
    collection: 'larsen-2024',
    banner: 'src/assets/img/larsen-hero-banner.jpg',
    portrait: 'src/assets/img/featured-collection-image.jpg',
  },
  {
    slug: 'manuel-canovas-2024',
    house: 'manuel-canovas',
    collection: 'manuel-canovas-2024',
    banner: 'src/assets/img/manuel-canovas-hero-banner.jpg',
  },
]

const SECTION_IMAGES = {
  'shop-by-type': 'src/assets/img/explore-type-bg.jpg',
  'shop-by-application': 'src/assets/img/explore-application-bg.jpg',
  'home-manifesto': 'src/assets/img/aterlier-about-bg.jpg',
  'home-houses': 'src/assets/img/design-brands-banner-bg.jpg',
}

const api = async (path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(options.body && typeof options.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // non-JSON body (e.g. an HTML error page) — reported below
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${response.status}: ${text.slice(0, 200)}`)
  }
  return json?.data ?? json
}

// All media once, filename → id. Paginates; the library is small.
const loadMediaIndex = async () => {
  const index = new Map()
  let cursor
  do {
    const page = await api(`/_emdash/api/media?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    for (const item of page.items ?? []) {
      if (item.filename && !index.has(item.filename)) index.set(item.filename, item.id)
    }
    cursor = page.nextCursor ?? null
  } while (cursor)
  return index
}

const mediaIndex = await loadMediaIndex()

const uploadOnce = async (filePath) => {
  const filename = basename(filePath)
  const existing = mediaIndex.get(filename)
  if (existing) {
    console.log(`media  ${filename} — already uploaded`)
    return existing
  }
  const body = new FormData()
  body.append('file', new Blob([readFileSync(filePath)], { type: 'image/jpeg' }), filename)
  const { item } = await api('/_emdash/api/media', { method: 'POST', body })
  mediaIndex.set(filename, item.id)
  console.log(`media  ${filename} — uploaded as ${item.id}`)
  return item.id
}

const listEntries = async (collection) => {
  const page = await api(`/_emdash/api/content/${collection}?limit=100`)
  return page.items ?? []
}

const publish = (collection, id) =>
  api(`/_emdash/api/content/${collection}/${id}/publish`, { method: 'POST' })

// --- collection_banners: create missing entries, fill missing frames --------
const bannerEntries = await listEntries('collection_banners')
for (const spec of COLLECTION_BANNERS) {
  const existing = bannerEntries.find((entry) => entry.slug === spec.slug)
  const wanted = {}
  for (const frame of ['banner', 'portrait']) {
    if (!spec[frame]) continue
    if (existing?.data?.[frame]) continue // an editor's frame is never replaced
    wanted[frame] = { provider: 'local', id: await uploadOnce(spec[frame]) }
  }

  if (existing && Object.keys(wanted).length === 0) {
    console.log(`banner ${spec.slug} — complete, skipped`)
    continue
  }

  if (existing) {
    await api(`/_emdash/api/content/collection_banners/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ data: { ...existing.data, ...wanted } }),
    })
    await publish('collection_banners', existing.id)
    console.log(`banner ${spec.slug} — filled ${Object.keys(wanted).join(', ')}`)
  } else {
    // Create only accepts drafts; publishing is its own endpoint.
    const { item } = await api('/_emdash/api/content/collection_banners', {
      method: 'POST',
      body: JSON.stringify({
        slug: spec.slug,
        status: 'draft',
        data: { house: spec.house, collection: spec.collection, ...wanted },
      }),
    })
    await publish('collection_banners', item.id)
    console.log(`banner ${spec.slug} — created`)
  }
}

// --- site_sections: attach the band background where none is set ------------
const sectionEntries = await listEntries('site_sections')
for (const [slug, filePath] of Object.entries(SECTION_IMAGES)) {
  const entry = sectionEntries.find((candidate) => candidate.slug === slug)
  if (!entry) {
    console.warn(`section ${slug} — MISSING (run \`npm run seed:cms\` first), skipped`)
    continue
  }
  if (entry.data?.image) {
    console.log(`section ${slug} — image already set, skipped`)
    continue
  }
  const mediaId = await uploadOnce(filePath)
  await api(`/_emdash/api/content/site_sections/${entry.id}`, {
    method: 'PUT',
    body: JSON.stringify({ data: { ...entry.data, image: { provider: 'local', id: mediaId } } }),
  })
  await publish('site_sections', entry.id)
  console.log(`section ${slug} — attached`)
}

console.log('Done.')
