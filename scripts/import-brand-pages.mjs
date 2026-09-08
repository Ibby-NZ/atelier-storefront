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
import { join } from 'node:path'
// js-yaml arrives transitively (ESLint); the frontmatter uses folded scalars
// and nested lists that a hand-rolled parser would get subtly wrong. If an
// upgrade ever drops it: `npm i -D js-yaml`.
import yaml from 'js-yaml'
import { markdownToPortableText } from '../src/lib/markdownToPortableText.js'
import { emdashClient, splitFrontmatter } from './lib/emdash-client.mjs'

const TOKEN = process.env.EMDASH_TOKEN
if (!TOKEN) {
  console.error('EMDASH_TOKEN is required (EmDash admin → API tokens).')
  process.exit(1)
}
const { post, listAll, importImage } = emdashClient({
  base: process.argv[2] ?? 'http://localhost:4321',
  token: TOKEN,
})

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

// --- The import --------------------------------------------------------------
const existing = new Set((await listAll('/_emdash/api/content/brand_pages')).map((item) => item.slug))

const dir = 'src/content/brands'
let created = 0
let skipped = 0
for (const file of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
  const parts = splitFrontmatter(readFileSync(join(dir, file), 'utf8'))
  if (!parts) {
    console.warn(`${file} — no frontmatter, skipped`)
    skipped += 1
    continue
  }
  const frontmatter = yaml.load(parts.frontmatter)
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

  const story = markdownToPortableText(parts.body)
  if (parts.body.trim() && !story) {
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

  const { item } = await post('/_emdash/api/content/brand_pages', {
    slug,
    status: 'draft',
    data: {
      title: titleFor(slug),
      blurb: frontmatter.blurb ?? '',
      ...(slideshow.length > 0 ? { slideshow } : {}),
      ...(cards.length > 0 ? { collection_cards: cards } : {}),
      ...(story ? { story } : {}),
    },
  })
  await post(`/_emdash/api/content/brand_pages/${item.id}/publish`, {})
  console.log(`${slug} — imported`)
  created += 1
}

console.log(`Done: ${created} imported, ${skipped} skipped.`)
