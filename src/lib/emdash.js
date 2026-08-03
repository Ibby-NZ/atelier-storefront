// EmDash CMS read helpers (US-026). All access to the EmDash content store goes
// through here so pages stay offline-safe: if the CMS database is empty or
// unavailable (e.g. a CI build with no seeded content) these NEVER throw — they
// return an empty list / null, and the markdown collections remain the baseline.
//
// EmDash entries look like { id, slug, status, data: { title, excerpt,
// featured_image, content, publishedAt, createdAt, ... } }. We normalise them to
// the same shape the markdown `post` / `brandPage` collections use so a page can
// merge both.
import { getEmDashCollection, getEmDashEntry } from 'emdash'

const toDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// Media fields (image / file) hold an EmDash MediaValue object, not a string.
// The property carrying the URL is `src` — the live loader rewrites a bare
// storage key to `/_emdash/api/media/file/<key>` and leaves it there. `url` and
// `previewUrl` are checked too: `url` for hand-authored/seeded values and
// `previewUrl` for external providers whose asset is only addressable that way.
// Anything else (a bare id, an empty object) yields null so a page skips the
// image rather than rendering "[object Object]".
export const mediaUrl = (value) => {
  if (typeof value === 'string') return value || null
  if (!value || typeof value !== 'object') return null
  for (const key of ['url', 'src', 'previewUrl']) {
    if (typeof value[key] === 'string' && value[key]) return value[key]
  }
  return null
}

const normalise = (entry) => {
  const data = entry?.data ?? {}
  return {
    id: entry.slug ?? entry.id,
    title: data.title ?? entry.slug ?? 'Untitled',
    date: toDate(data.publishedAt ?? data.createdAt),
    hero: mediaUrl(data.featured_image),
    excerpt: data.excerpt ?? '',
    // Portable Text blocks for the body; render with <PortableText /> from
    // 'emdash/ui'. Null when the post has no body (excerpt is the fallback).
    content: Array.isArray(data.content) && data.content.length > 0 ? data.content : null,
    source: 'emdash',
  }
}

// Repeater rows are objects keyed by sub-field slug. Tolerate a bare value too
// (a row that is just the media object) so a hand-edited entry still renders.
const rowMedia = (row, key) => mediaUrl(row?.[key] ?? row)

// A `brand_pages` entry, flattened to the same field names the markdown
// `brandPage` collection uses (blurb / slideshow / collectionCards) so
// brands/[slug].astro can treat either source identically. `slug` is the join
// key: it must equal the atelier-api brand slug.
export const normaliseBrandPage = (entry) => {
  const data = entry?.data ?? {}
  const slideshowRows = Array.isArray(data.slideshow) ? data.slideshow : []
  const cardRows = Array.isArray(data.collection_cards) ? data.collection_cards : []
  return {
    slug: entry?.slug ?? entry?.id ?? '',
    name: data.title ?? entry?.slug ?? '',
    blurb: data.blurb ?? '',
    slideshow: slideshowRows.map((row) => rowMedia(row, 'image')).filter(Boolean),
    collectionCards: cardRows.map((row) => ({
      // The join key to a live catalogue collection (its slug within this
      // brand) — see lib/collections.js collectionTiles.
      collection: row?.collection ?? '',
      heading: row?.heading ?? '',
      description: row?.description ?? '',
      link: row?.link ?? '',
      featuredImage: rowMedia(row, 'featured_image'),
    })),
    story: Array.isArray(data.story) && data.story.length > 0 ? data.story : null,
    source: 'emdash',
  }
}

// Published posts managed in the EmDash admin, normalised and newest-first.
// Returns [] on any failure so callers can concat with the markdown baseline.
export async function listEmdashPosts() {
  try {
    const { entries } = await getEmDashCollection('posts')
    return entries
      .map(normalise)
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
  } catch {
    return []
  }
}

// A single published EmDash post by slug, or null if missing / on error.
// getEmDashEntry wraps the entry: { entry, isPreview, ... } (unlike
// getEmDashCollection, which returns { entries }), so unwrap `.entry` here.
export async function getEmdashPost(slug) {
  try {
    const result = await getEmDashEntry('posts', slug)
    return result?.entry ? normalise(result.entry) : null
  } catch {
    return null
  }
}

// Published brand pages. Returns [] when the collection is missing (a database
// seeded before `brand_pages` existed) so callers fall back to markdown.
export async function listEmdashBrandPages() {
  try {
    const { entries } = await getEmDashCollection('brand_pages')
    return entries.map(normaliseBrandPage)
  } catch {
    return []
  }
}

// A single published brand page by slug (= the API brand slug), or null.
export async function getEmdashBrandPage(slug) {
  try {
    const result = await getEmDashEntry('brand_pages', slug)
    return result?.entry ? normaliseBrandPage(result.entry) : null
  } catch {
    return null
  }
}
