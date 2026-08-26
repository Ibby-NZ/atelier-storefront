// Import the markdown brand pages (src/content/brands/*.md) into the EmDash
// `brand_pages` collection, so the CMS becomes the working copy of every house
// page — which is the design intent: brand pages are CMS-WINS, the markdown
// stays the offline baseline shipped in the repo.
//
// Because CMS-wins means a bad import DOWNGRADES a live page, this errs on the
// side of refusing:
//   - a brand that already has a CMS entry is SKIPPED — an editor's page is
//     never replaced (delete the entry in the admin to re-import one);
//   - a body using markdown syntax the converter cannot carry losslessly is
//     skipped with a warning and that page stays on its markdown
//     (markdownToPortableText returns null rather than degrade — today all 36
//     bodies are plain paragraphs and convert cleanly);
//   - remote imagery (the atelier.co.nz slideshow/card photographs) is
//     downloaded into the CMS media library so the pages stop depending on the
//     old WordPress host; a failed download falls back to the remote URL,
//     which the site renders identically (mediaUrl accepts a plain string).
//
// Titles come from the live catalogue when the API is reachable
// (PUBLIC_API_BASE_URL from .env) — "C&C Milano", not "Cc Milano" — else the
// slug is title-cased and an editor can polish it in the admin.
//
// Usage (local):   EMDASH_TOKEN=<token> npm run import:brand-pages
// Usage (remote):  EMDASH_TOKEN=<token> node scripts/import-brand-pages.mjs https://atelier-storefront.disrupted.co.nz
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
// js-yaml arrives transitively (ESLint); the frontmatter uses folded scalars
// and nested lists that a hand-rolled parser would get subtly wrong. If an
// upgrade ever drops it: `npm i -D js-yaml`.
import yaml from 'js-yaml'
import { markdownToPortableText } from '../src/lib/markdownToPortableText.js'

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '')
const TOKEN = process.env.EMDASH_TOKEN
if (!TOKEN) {
  console.error('EMDASH_TOKEN is required (EmDash admin → API tokens).')
  process.exit(1)
}

const api = async (path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} → ${response.status}: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text)?.data
}

// --- Brand names from the live catalogue (best effort) ----------------------
const brandNames = {}
try {
  const apiBase = (process.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '')
  if (apiBase) {
    const response = await fetch(`${apiBase}/catalogue/brands`, { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      for (const brand of (await response.json()).brands ?? []) brandNames[brand.slug] = brand.name
    }
  }
} catch {
  // Offline is fine — titles fall back to the title-cased slug.
}
const titleFor = (slug) =>
  brandNames[slug] ??
  slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

// --- Media: download a remote photograph into the CMS library ---------------
const mediaIndex = new Map()
{
  let cursor
  do {
    const page = await api(`/_emdash/api/media?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    for (const item of page.items ?? []) {
      if (item.filename && !mediaIndex.has(item.filename)) mediaIndex.set(item.filename, item)
    }
    cursor = page.nextCursor ?? null
  } while (cursor)
}

// The value stored into an image field/sub-field. The save path keeps repeater
// sub-values VERBATIM (no server-side enrichment, unlike top-level image
// fields), so the storage key must be on the object we send or the site's
// mediaUrl() has nothing to resolve — a bare {provider, id} renders nothing.
const mediaValue = (item) => ({
  provider: 'local',
  id: item.id,
  filename: item.filename,
  meta: { storageKey: item.storageKey },
})

// Returns a MediaValue for the imported copy, or the original URL string when
// the download fails — either renders, the string just stays remote-hosted.
const importImage = async (url) => {
  const filename = decodeURIComponent(basename(new URL(url).pathname))
  const existing = mediaIndex.get(filename)
  if (existing) return mediaValue(existing)
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const body = new FormData()
    body.append('file', blob, filename)
    const { item } = await api('/_emdash/api/media', { method: 'POST', body })
    mediaIndex.set(filename, item)
    console.log(`  media ${filename} — imported`)
    return mediaValue(item)
  } catch (error) {
    console.warn(`  media ${filename} — download failed (${error.message}), keeping remote URL`)
    return url
  }
}

// --- The import --------------------------------------------------------------
const existing = new Set()
{
  let cursor
  do {
    const page = await api(`/_emdash/api/content/brand_pages?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    for (const item of page.items ?? []) existing.add(item.slug)
    cursor = page.nextCursor ?? null
  } while (cursor)
}

const dir = 'src/content/brands'
let created = 0
let skipped = 0
for (const file of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
  const raw = readFileSync(join(dir, file), 'utf8')
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    console.warn(`${file} — no frontmatter, skipped`)
    skipped += 1
    continue
  }
  const frontmatter = yaml.load(match[1])
  const slug = frontmatter?.brand
  if (!slug) {
    console.warn(`${file} — no brand slug, skipped`)
    skipped += 1
    continue
  }
  if (existing.has(slug)) {
    console.log(`${slug} — already in the CMS, skipped`)
    skipped += 1
    continue
  }

  const story = markdownToPortableText(match[2])
  if (match[2].trim() && !story) {
    console.warn(`${slug} — body uses syntax the converter cannot carry losslessly, skipped`)
    skipped += 1
    continue
  }

  const slideshow = []
  for (const url of frontmatter.slideshow ?? []) {
    slideshow.push({ image: await importImage(url) })
  }
  const cards = []
  for (const card of frontmatter.collectionCards ?? []) {
    cards.push({
      collection: card.collection ?? '',
      heading: card.heading ?? '',
      description: card.description ?? '',
      link: card.link ?? '',
      featured_image: card.featuredImage ? await importImage(card.featuredImage) : undefined,
    })
  }

  const { item } = await api('/_emdash/api/content/brand_pages', {
    method: 'POST',
    body: JSON.stringify({
      slug,
      status: 'draft',
      data: {
        title: titleFor(slug),
        blurb: frontmatter.blurb ?? '',
        ...(slideshow.length > 0 ? { slideshow } : {}),
        ...(cards.length > 0 ? { collection_cards: cards } : {}),
        ...(story ? { story } : {}),
      },
    }),
  })
  await api(`/_emdash/api/content/brand_pages/${item.id}/publish`, { method: 'POST' })
  console.log(`${slug} — imported`)
  created += 1
}

console.log(`Done: ${created} imported, ${skipped} skipped.`)
