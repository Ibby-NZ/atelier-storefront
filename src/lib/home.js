// Homepage view helpers (design: Figma "Atelier Home page", node 7307:617).
//
// The 2026 home is merchandised out of the live COLLECTIONS endpoint rather
// than the product grid: the hero, the "Latest collections" row and the
// featured band are one collection each. WHICH collections is no longer a slug
// list in the page frontmatter — it is `featured_rank`, set by the office in the
// CRM — so the rules that must not drift with it live here: which collections
// are featured and in what order, how one resolves to a shop destination, which
// photograph it shows, and how the row is topped up when the office has featured
// fewer than it holds.
//
// **The database owns the ORDER; this page owns the COMPOSITION.** The API hands
// over one ranked list; that the first three are the hero and the next four the
// latest row is decided here and is deliberately not encoded in the schema.
//
// Pure functions, no fetching, no DOM — mirrors lib/catalogue.js.

/** Hero slides, and tiles in the "Latest collections" row — the design's own. */
export const HERO_SLOTS = 3
export const LATEST_SLOTS = 4

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
 * The `(house, collection)` PAIR that identifies a collection, or null.
 *
 * A collection slug is unique per HOUSE and never globally
 * (`collections_brand_id_slug_unique`), so the pair is the only safe key: two
 * maisons may both hold a "2024", and anything keyed on the slug alone — an art
 * registry, a de-duplication set — would hand one of them the other's entry.
 * Null for a collection with no house, which the caller treats as "no key" and
 * never as a match.
 *
 * @param {{ slug?: string, brand?: { slug?: string } }|null|undefined} collection
 * @returns {string|null}
 */
export function collectionKey(collection) {
  const house = collection?.brand?.slug
  const slug = collection?.slug
  return house && slug ? `${house}/${slug}` : null
}

/** A positive integer `featured_rank`, or null for "not featured". */
function rankOf(collection) {
  const rank = Number(collection?.featured_rank)
  return Number.isInteger(rank) && rank > 0 ? rank : null
}

/**
 * The collections the office has featured, in the order it chose.
 *
 * The API already returns them first and in rank order, and this sorts anyway:
 * `featured_rank` carries no unique index (deliberately — a unique index would
 * make every step of a reorder a potential 409), so two collections may share a
 * rank, and the tie has to break on something. It breaks on the order the API
 * gave, which is that endpoint's own `name`/`id` tail — a filter alone would
 * pass an unordered list through silently.
 *
 * NULL means not featured; rank 0 and a negative are refused by the column's
 * CHECK, so they can only arrive from a source that is not the API, and they
 * read here as "not featured" rather than sorting ahead of rank 1.
 *
 * @param {Array<{ featured_rank?: number|null }>} collections
 * @param {number} [count] cap — the hero takes the first three
 * @returns {Array<object>} a new frozen list; the input is never reordered
 */
export function featuredCollections(collections = [], count = Infinity) {
  const featured = collections
    .map((collection, order) => ({ collection, order, rank: rankOf(collection) }))
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.collection)

  return Object.freeze(featured.slice(0, Math.max(0, count)))
}

/**
 * The photograph a featured collection shows, as a chain:
 *
 *   1. the art commissioned FOR THIS collection, keyed by its `(house,
 *      collection)` pair — an `ImageMetadata` the build sizes and hashes;
 *   2. else the collection's own catalogue photograph, a plain URL;
 *   3. else neither, and the caller paints its designed ground.
 *
 * The office can feature anything in the CRM, so most featured collections will
 * eventually have no commissioned art — hence rung 2. What the chain never does
 * is fall back to ANOTHER collection's photograph: a band captioned "Nature's
 * Opera" over Larsen's interior is worse than a plain band, and the pair key is
 * what stops a same-slug collision doing it by accident.
 *
 * @param {Record<string, object>} artwork  pair key → committed image
 * @param {{ image_url?: string|null }} collection
 * @returns {{ image: object|null, src: string|null }} at most one is set
 */
export function collectionArtwork(artwork, collection) {
  const key = collectionKey(collection)
  const committed = (key && artwork?.[key]) || null
  if (committed) return Object.freeze({ image: committed, src: null })

  const url = collection?.image_url
  const src = typeof url === 'string' && url.trim() ? url : null
  return Object.freeze({ image: null, src })
}

/**
 * The collection the featured band shows, or null to omit the band.
 *
 * The band is a commissioned PORTRAIT beside the copy — a different frame from
 * the hero's full-bleed banner — so the collection that owns that portrait is
 * the one the band was drawn for. That, not "the highest-ranked one", is why
 * reordering the hero in the CRM does not move this band, and it is what keeps
 * today's page identical: the portrait belongs to Larsen 2024, which the office
 * has at rank 2.
 *
 * Fall back to the first featured collection with a photograph of its own, so a
 * completely re-chosen list still renders a band. Null when nothing featured has
 * a picture at all — the page's standing rule is that a section with no art is
 * omitted rather than framed around nothing.
 *
 * @param {Array<object>} featured  already in rank order
 * @param {Record<string, object>} artwork  pair key → committed portrait
 * @returns {object|null}
 */
export function pickFeature(featured = [], artwork = {}) {
  const commissioned = featured.find((collection) => {
    const key = collectionKey(collection)
    return Boolean(key && artwork?.[key])
  })
  if (commissioned) return commissioned

  return featured.find((collection) => collectionArtwork({}, collection).src) ?? null
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
 * The "Latest collections" row: the given collections in the order given, taken
 * until the row is full and never repeating one that is already spoken for
 * elsewhere on the page.
 *
 * The caller hands over the featured collections the hero did not take, followed
 * by the whole catalogue — so the row is the office's choice first and a top-up
 * after. Topping up is what keeps the row full when the office has featured only
 * three: the design's four tiles are a composition, and three of them reads as a
 * bug rather than as an edit.
 *
 * De-duplication is on the `(house, collection)` PAIR, not the slug: the input
 * deliberately repeats itself, and two houses' "2024" are two different tiles.
 *
 * @param {Array<{ slug: string, brand?: { slug?: string } }>} collections
 * @param {{ count?: number, exclude?: Array<object> }} [options] `exclude`
 *   carries the hero's and the featured band's collections
 */
export function pickCollections(collections = [], options = {}) {
  const { count = LATEST_SLOTS, exclude = [] } = options
  const spokenFor = new Set(exclude.map(collectionKey).filter(Boolean))
  const chosen = []

  collections.forEach((collection) => {
    const key = collectionKey(collection)
    if (chosen.length >= count || !key || spokenFor.has(key)) return
    spokenFor.add(key)
    chosen.push(collection)
  })

  return Object.freeze(chosen.slice(0, count))
}
