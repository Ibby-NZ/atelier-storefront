// EmDash CMS read helpers (US-026). All access to the EmDash content store goes
// through here so pages stay offline-safe: if the CMS database is empty or
// unavailable (e.g. a CI build with no seeded content) these NEVER throw — they
// return an empty list / null, and the markdown collections remain the baseline.
//
// EmDash entries look like { id, slug, status, data: { title, excerpt,
// featured_image, content, publishedAt, createdAt, ... } }. We normalise them to
// the same shape the markdown `post` collection uses so a page can merge both.
import { getEmDashCollection, getEmDashEntry } from 'emdash'

const toDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// featured_image is an EmDash image field (an object) or null; only surface a
// usable string URL, otherwise skip the hero rather than render an object.
const heroUrl = (image) => {
  if (typeof image === 'string') return image
  if (image && typeof image === 'object' && typeof image.url === 'string') {
    return image.url
  }
  return null
}

const normalise = (entry) => {
  const data = entry?.data ?? {}
  return {
    id: entry.slug ?? entry.id,
    title: data.title ?? entry.slug ?? 'Untitled',
    date: toDate(data.publishedAt ?? data.createdAt),
    hero: heroUrl(data.featured_image),
    excerpt: data.excerpt ?? '',
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
