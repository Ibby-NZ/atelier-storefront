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
  // A value SAVED through the admin has none of those: the server-side
  // normalizeMediaValue() deletes `src` for provider "local" and the live
  // loader does not put it back, so the only address left is the storage key
  // (under `meta.storageKey`), which the media file route serves directly.
  // Without this rung every admin-saved image silently fell back to the
  // shipped art — text edits showed, image edits did not.
  const storageKey = value.meta?.storageKey ?? value.storageKey
  if (typeof storageKey === 'string' && storageKey) {
    return `/_emdash/api/media/file/${storageKey}`
  }
  return null
}

// The `houses` field is a comma-separated list of atelier-api brand slugs (the
// office types what the collection banners already ask for); an array is
// tolerated should the field ever become a multi-select.
const houseSlugs = (value) => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return raw.map((slug) => String(slug).trim().toLowerCase()).filter(Boolean)
}

// A `posts` entry in the shape lib/posts.js gives a markdown post, so the
// journal index, a post page and a brand page's related reading treat either
// source identically.
export const normalisePost = (entry) => {
  const data = entry?.data ?? {}
  return {
    id: entry?.slug ?? entry?.id ?? '',
    title: data.title ?? entry?.slug ?? 'Untitled',
    // The live loader folds the entry's publishedAt/createdAt into `data`.
    date: toDate(data.publishedAt ?? data.createdAt),
    hero: mediaUrl(data.featured_image),
    excerpt: data.excerpt ?? '',
    brands: houseSlugs(data.houses),
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
      .map(normalisePost)
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
    return result?.entry ? normalisePost(result.entry) : null
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

// --- Site sections (homepage bands) ----------------------------------------
// A `site_sections` entry, slug-keyed to a fixed section of the storefront
// (shop-by-type, home-manifesto, ...). Fields are all optional overrides; the
// page's shipped copy is the baseline they merge over (applySection).
export const normaliseSection = (entry) => {
  const data = entry?.data ?? {}
  const choice = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
  return Object.freeze({
    slug: entry?.slug ?? entry?.id ?? '',
    title: data.title ?? '',
    subtitle: data.subtitle ?? '',
    body: data.body ?? '',
    ctaLabel: data.cta_label ?? '',
    ctaHref: data.cta_href ?? '',
    image: mediaUrl(data.image),
    // Layout knobs. Free of fallback semantics — an empty choice IS the
    // designed default, so applySection passes them straight through.
    align: choice(data.align),
    scrim: choice(data.scrim),
    // The boolean field arrives as true/1 depending on the read path; anything
    // else (unset, '', 'false', 0) leaves the section visible.
    hidden: data.hidden === true || data.hidden === 1 || data.hidden === 'true',
  })
}

// Published site sections as a { slug: section } map. Empty object on any
// failure — a page merges over its shipped copy and renders identically.
export async function getSiteSections() {
  try {
    const { entries } = await getEmDashCollection('site_sections')
    return Object.fromEntries(entries.map((entry) => [entry.slug, normaliseSection(entry)]))
  } catch {
    return {}
  }
}

// Merge a CMS section over the copy shipped in the page. A field wins only
// when the editor actually filled it in — a blank string is "no override", so
// a section can replace just its image or just its title. Returns the fallback
// itself when the CMS has nothing, keeping the empty-CMS render byte-identical.
export const applySection = (fallback, section) => {
  if (!section) return fallback
  const pick = (value, base) =>
    typeof value === 'string' && value.trim() ? value : base
  return Object.freeze({
    title: pick(section.title, fallback.title),
    subtitle: pick(section.subtitle, fallback.subtitle ?? null),
    body: pick(section.body, fallback.body ?? null),
    cta: pick(section.ctaLabel, fallback.cta),
    href: pick(section.ctaHref, fallback.href),
    image: section.image || fallback.image || null,
    align: section.align || null,
    scrim: section.scrim || null,
    hidden: section.hidden === true,
  })
}

// The modifier classes a merged section earns from its layout knobs, for a
// band root's class:list. Only a real choice emits a class — the designed
// default (left / standard scrim) adds nothing, so an unknobbed page keeps its
// exact markup. The classes themselves live in direction-2026.css, which is
// where each band's CSS decides what "centre" or "soft" means for its figure.
export const bandClasses = (section) => {
  const classes = []
  const align = section?.align === 'center' ? 'centre' : section?.align
  if (align === 'centre' || align === 'right') classes.push(`band-align-${align}`)
  if (['soft', 'deep', 'none'].includes(section?.scrim)) classes.push(`band-scrim-${section.scrim}`)
  return classes
}

// --- Collection banners (homepage hero / featured art) ----------------------
// A `collection_banners` entry: commissioned photography for one collection,
// joined on the same `(house, collection)` pair key the page's shipped art
// registries use (collectionKey in lib/home.js). `key` is null when either
// half is missing, and the row is then ignored rather than guessed at.
export const normaliseBanner = (entry) => {
  const data = entry?.data ?? {}
  const house = typeof data.house === 'string' ? data.house.trim() : ''
  const collection = typeof data.collection === 'string' ? data.collection.trim() : ''
  return Object.freeze({
    key: house && collection ? `${house}/${collection}` : null,
    banner: mediaUrl(data.banner),
    portrait: mediaUrl(data.portrait),
  })
}

// Published collection banners. [] on any failure.
export async function listCollectionBanners() {
  try {
    const { entries } = await getEmDashCollection('collection_banners')
    return entries.map(normaliseBanner)
  } catch {
    return []
  }
}

// Overlay CMS banner art onto a shipped art registry: `{ pairKey: image }`
// where a CMS row's URL string wins over the committed ImageMetadata for the
// same collection (collectionArtwork in lib/home.js renders either). Rows
// without a key or without the requested frame (`banner` | `portrait`) are
// skipped, so a half-filled entry never blanks the shipped art.
export const overlayArtwork = (base, banners, field) => {
  const overlay = {}
  for (const row of banners ?? []) {
    if (row?.key && row[field]) overlay[row.key] = row[field]
  }
  return Object.freeze({ ...base, ...overlay })
}

// --- Pages (company / free-form pages) --------------------------------------
// A `pages` entry: title + Portable Text body. Slug is the public path — the
// fixed company pages (/contact, /privacy, /terms) look their own slug up and
// fall back to the markdown `page` collection, and [slug].astro serves any
// OTHER published entry at /<slug>, which is how the office adds a page
// without a deploy.
export const normalisePage = (entry) => {
  const data = entry?.data ?? {}
  return Object.freeze({
    slug: entry?.slug ?? entry?.id ?? '',
    title: data.title ?? '',
    content: Array.isArray(data.content) && data.content.length > 0 ? data.content : null,
    source: 'emdash',
  })
}

// A single published page by slug, or null. Same soft-failure rule as every
// reader here: an absent CMS yields the markdown/static baseline.
export async function getEmdashPage(slug) {
  try {
    const result = await getEmDashEntry('pages', slug)
    return result?.entry ? normalisePage(result.entry) : null
  } catch {
    return null
  }
}

// Every published CMS page, for site search (pages/search.astro). Same
// soft-failure rule: no CMS, no office pages in the results.
export async function listEmdashPages() {
  try {
    const { entries } = await getEmDashCollection('pages')
    return entries.map(normalisePage)
  } catch {
    return []
  }
}
