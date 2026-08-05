// Brand-page collection tiles: the live catalogue joined with editorial.
//
// The tiles are DRIVEN by the API (`GET /catalogue/collections?brand=`) and
// only DECORATED by editorial. That split is the whole linking model:
//   - The CRM's Houses & collections screen owns the collections — their names,
//     tile description and hero image (seeded from the atelier.co.nz snapshot,
//     CRM-editable thereafter) — and assigns products to them.
//   - The SECTION shows whenever the API returns collections for the house.
//     It used to be gated on the house holding products (`brandHasProducts`,
//     Aug 2026 client feedback) and that gate is GONE — the collection wall is
//     the design's own route into a house (Figma "Brand Page" 9379:2647 draws
//     the tiles and no "View all products" action at all), so gating it left
//     the three houses that have collections but no assigned products — de Le
//     Cuona, No.9 Thompson, Loro Piana — reading as a house page with nothing
//     under it.
//   - Every tile of a stocked collection links to /products?brand=&collection=
//     so filtering, sorting and trade pricing stay in the library. A collection
//     whose products are not yet assigned links to the house's full grid
//     instead — which is where the shopper wants to be anyway, and for a
//     trade-gated house is the surface that explains the gate.
//   - An EmDash brand-page card decorates the tile it matches and WINS over the
//     API's own description/image; a card matching no live collection renders
//     nothing — editorial cannot invent a shop destination.
//
// Card matching: the card's `collection` field (the collection slug, the same
// join style as brand_pages slug = brand slug) wins; failing that, a card whose
// heading equals the collection name (case-insensitive) matches, so editorial
// written before the join field existed still lines up. Collection slugs are
// unique per brand, never globally — safe here because both inputs are already
// scoped to one house.
//
// Pure functions, no fetching, no DOM — mirrors lib/catalogue.js.

const norm = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

/**
 * Split a collection name into the tile's two lines.
 *
 * "Chilgrove Collection | Spring 2024" is ONE name in the CRM, and the mock
 * draws its halves differently: the season as the small light label above, the
 * collection itself as the tile title. Split on the FIRST pipe only; a name
 * without one (most of them — "Canya", "Giverny", "Mazan (outdoor)") keeps the
 * whole string as the title and gets no label rather than an empty one.
 *
 * @param {string} value
 * @returns {{ title: string, season: string }}
 */
export function splitCollectionName(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  const bar = text.indexOf('|')
  if (bar === -1) return { title: text, season: '' }
  const title = text.slice(0, bar).trim()
  const season = text.slice(bar + 1).trim()
  // A name that OPENS with the pipe has no title half to promote; keep what
  // there is as the title so the tile is never labelled but nameless.
  if (!title) return { title: season || text, season: '' }
  return { title, season }
}

const cardFor = (cards, collection) =>
  cards.find((card) => norm(card?.collection) === collection.slug) ??
  cards.find((card) => !norm(card?.collection) && norm(card?.heading) === norm(collection.name)) ??
  null

/**
 * @param {{
 *   collections?: Array<{ slug: string, name: string, description?: string|null, image_url?: string|null, product_count: number }>,
 *   cards?: Array<{ collection?: string, heading?: string, description?: string, featuredImage?: string|null }>,
 *   brandSlug: string,
 * }} input  `collections` as returned by GET /catalogue/collections?brand=;
 *   `cards` as normalised from EmDash / the markdown brandPage collection.
 * @returns {Array<{ slug: string, name: string, heading: string, season: string, description: string, image: string|null, href: string, productCount: number }>}
 */
export function collectionTiles({ collections = [], cards = [], brandSlug }) {
  const brandHref = `/products?brand=${encodeURIComponent(brandSlug)}`
  return collections.map((collection) => {
    const card = cardFor(cards, collection)
    const productCount = Number(collection?.product_count) || 0
    // The split runs over whatever heading is actually shown, so editorial that
    // keeps the CRM's "Name | Season" shape is drawn the same way.
    const { title, season } = splitCollectionName(card?.heading || collection.name)
    return Object.freeze({
      slug: collection.slug,
      name: collection.name,
      heading: title,
      season,
      description: card?.description || collection.description || '',
      image: card?.featuredImage || collection.image_url || null,
      href:
        productCount > 0
          ? `${brandHref}&collection=${encodeURIComponent(collection.slug)}`
          : brandHref,
      productCount,
    })
  })
}
