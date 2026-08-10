// Homepage view helpers (design: Figma "Atelier Home page", node 7307:617).
//
// The 2026 home is merchandised out of the live COLLECTIONS endpoint rather
// than the product grid: the hero, the "Latest collections" row and the
// featured band are one collection each. WHICH collections is seasonal — a
// slug list in the page frontmatter, the same hand-edit convention as the
// header's announcement copy — so the two rules that must not drift with it
// live here: how a collection resolves to a shop destination, and how the
// seasonal list is topped up when a slug no longer exists.
//
// Pure functions, no fetching, no DOM — mirrors lib/catalogue.js.

/**
 * Products held per house, keyed by brand slug.
 *
 * The homepage fetches the whole website-visible catalogue anyway (48 rows
 * against a 100 limit, so the counts are exact), and every collection tile
 * needs to know whether its house has anything to show before it can pick a
 * destination.
 *
 * @param {Array<{ brand?: { slug?: string } }>} products
 * @returns {Record<string, number>}
 */
import { featuredByRank } from './featured.js'

export function brandDesignCounts(products = []) {
  return products.reduce((counts, product) => {
    const slug = product?.brand?.slug
    return slug ? { ...counts, [slug]: (counts[slug] ?? 0) + 1 } : counts
  }, {})
}

/**
 * Where a collection tile goes.
 *
 * Same rule as `collectionTiles()` in lib/collections.js, with one more rung on
 * the ladder because the homepage is not scoped to a house that is known to
 * hold stock:
 *   1. products assigned to the collection → the library filtered to it;
 *   2. else the house holds website-visible products → the house's full grid;
 *   3. else the house's own page, which renders from the API (or its editorial)
 *      whether or not anything is in stock.
 * A tile must never land on an empty grid: collection membership is assigned by
 * staff in the CRM and most of the catalogue has none yet, so rung 2 is the
 * common path and rung 3 catches the houses we hold no designs from.
 *
 * @param {{ slug: string, product_count?: number, brand?: { slug?: string } }} collection
 * @param {number} [brandCount]  designs held from the collection's house
 * @returns {string}
 */
export function collectionHref(collection, brandCount = 0) {
  const brandSlug = collection?.brand?.slug
  if (!brandSlug) return '/products'
  const brandHref = `/products?brand=${encodeURIComponent(brandSlug)}`
  if (Number(collection?.product_count) > 0) {
    return `${brandHref}&collection=${encodeURIComponent(collection.slug)}`
  }
  if (Number(brandCount) > 0) return brandHref
  return `/brands/${encodeURIComponent(brandSlug)}`
}

/**
 * One collection looked up by slug, or null.
 *
 * Returns null rather than throwing so a seasonal slug that has been renamed in
 * the CRM degrades to the section being omitted — the storefront must build and
 * render whatever the API happens to be serving.
 *
 * @param {Array<{ slug: string }>} collections
 * @param {string} slug
 */
export function collectionBySlug(collections = [], slug) {
  return collections.find((collection) => collection?.slug === slug) ?? null
}

/**
 * The house line above a collection's name, or null when it would repeat it.
 *
 * The hero stacks the house over the collection ("de Le Cuona" / "Nature's
 * Opera"), which reads as one thought — unless the house is already the first
 * word of the collection, and then it reads as a stutter: "Larsen / Larsen
 * 2024", "Manuel Canovas / Manuel Canovas 2024". Two of the three collections
 * the client features are named that way, so this is the common case rather
 * than an edge one.
 *
 * Only a PREFIX counts. A house named anywhere else in the title is doing
 * different work ("India Mahdavi's True Velvet Collection" is a Pierre Frey
 * collection, and dropping the house there would leave the tile unattributed).
 *
 * @param {string|null|undefined} collectionName
 * @param {string|null|undefined} houseName
 * @returns {string|null}
 */
export function houseLabel(collectionName, houseName) {
  const house = String(houseName ?? '').trim()
  if (!house) return null
  const name = String(collectionName ?? '')
    .trim()
    .toLowerCase()
  return name.startsWith(house.toLowerCase()) ? null : house
}

/**
 * Photographs for the bands that carry no collection of their own — the two
 * shop banners and the two dark bands.
 *
 * COLLECTION photography first, product photography only to top up. The
 * collection rows are commissioned interiors, which is what the design sets its
 * bands on; most of the product photography in the catalogue is a finished good
 * shot on white linen, which disappears under a scrim and takes the copy on top
 * of it with it. Anything already on the page is excluded, and no two bands get
 * the same picture: four bands drawn from one small catalogue otherwise land on
 * the same photograph four times, which looks like the design from a distance
 * and nothing like it up close.
 *
 * Deterministic — catalogue order, no sampling. The homepage is built at build
 * time and has to produce the same picture on every build.
 *
 * @param {{
 *   collections?: Array<{ image_url?: string|null }>,
 *   products?: Array<{ image_url?: string|null }>,
 *   claimed?: Array<string|null|undefined>,
 *   count?: number,
 * }} input
 * @returns {Array<string|null>} exactly `count` entries; null where the
 *   catalogue ran out of photographs and the band falls back to the weave.
 */
export function bandPhotographs({
  collections = [],
  products = [],
  claimed = [],
  count = 4,
} = {}) {
  const seen = new Set(claimed.filter(Boolean))
  const chosen = []

  for (const source of [collections, products]) {
    for (const entry of source) {
      if (chosen.length >= count) break
      const url = entry?.image_url
      if (!url || seen.has(url)) continue
      seen.add(url)
      chosen.push(url)
    }
  }

  return Object.freeze(
    Array.from({ length: count }, (_, index) => chosen[index] ?? null)
  )
}

/**
 * The "Latest collections" row: the seasonal slugs in the order given, topped
 * up from the rest of the catalogue to `count` and never repeating one that is
 * already spoken for elsewhere on the page.
 *
 * Topping up is what keeps the row full when a slug is retired: the design's
 * four tiles are a composition, and three of them reads as a bug rather than as
 * an edit. `exclude` carries the hero's and the featured band's collections so
 * the page never shows the same collection twice.
 *
 * @param {Array<{ slug: string }>} collections
 * @param {{ slugs?: string[], count?: number, exclude?: string[] }} [options]
 */
export function pickCollections(collections = [], options = {}) {
  const { slugs = [], count = 4, exclude = [] } = options
  const spokenFor = new Set(exclude)
  const chosen = []

  const take = (collection) => {
    if (!collection || spokenFor.has(collection.slug)) return
    spokenFor.add(collection.slug)
    chosen.push(collection)
  }

  slugs.forEach((slug) => {
    if (chosen.length < count) take(collectionBySlug(collections, slug))
  })
  collections.forEach((collection) => {
    if (chosen.length < count) take(collection)
  })

  return Object.freeze(chosen.slice(0, count))
}

/**
 * The collections the office has featured, in rank order (ported with the
 * August 2026 redraw — the brands index's featured band reads it). The shared
 * rule lives in lib/featured.js.
 *
 * @param {Array<{ featured_rank?: number|null }>} collections
 * @param {number} [count]
 * @returns {Array<object>}
 */
export function featuredCollections(collections = [], count = Infinity) {
  return featuredByRank(collections, count)
}
