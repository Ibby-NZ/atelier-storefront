// Brand-page collection tiles: the live catalogue joined with editorial.
//
// The tiles are DRIVEN by the API (`GET /catalogue/collections?brand=`) and
// only DECORATED by editorial. That split is the whole linking model:
//   - The CRM's Houses & collections screen owns the collections — their names,
//     tile description and hero image (seeded from the atelier.co.nz snapshot,
//     CRM-editable thereafter) — and assigns products to them.
//   - The SECTION shows only when Atelier holds products under the HOUSE
//     (`brandHasProducts`, the client's rule — page feedback Aug 2026:
//     "will only show if atelier have products under the brand"). The gate is
//     brand-level, NOT per collection: most memberships are still unassigned in
//     the CRM, and hiding every collection until they are made brand pages read
//     as if the house had nothing.
//   - Every tile of a stocked collection links to /products?brand=&collection=
//     so filtering, sorting and trade pricing stay in the library. A collection
//     whose products are not yet assigned links to the house's full grid
//     instead — a tile must never land on an empty grid.
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

const cardFor = (cards, collection) =>
  cards.find((card) => norm(card?.collection) === collection.slug) ??
  cards.find((card) => !norm(card?.collection) && norm(card?.heading) === norm(collection.name)) ??
  null

/**
 * @param {{
 *   collections?: Array<{ slug: string, name: string, description?: string|null, image_url?: string|null, product_count: number }>,
 *   cards?: Array<{ collection?: string, heading?: string, description?: string, featuredImage?: string|null }>,
 *   brandSlug: string,
 *   brandHasProducts?: boolean,
 * }} input  `collections` as returned by GET /catalogue/collections?brand=;
 *   `cards` as normalised from EmDash / the markdown brandPage collection;
 *   `brandHasProducts` from the house's own product count (meta.total > 0).
 * @returns {Array<{ slug: string, name: string, heading: string, description: string, image: string|null, href: string, productCount: number }>}
 */
export function collectionTiles({
  collections = [],
  cards = [],
  brandSlug,
  brandHasProducts = false,
}) {
  if (!brandHasProducts) return []
  const brandHref = `/products?brand=${encodeURIComponent(brandSlug)}`
  return collections.map((collection) => {
    const card = cardFor(cards, collection)
    const productCount = Number(collection?.product_count) || 0
    return Object.freeze({
      slug: collection.slug,
      name: collection.name,
      heading: card?.heading || collection.name,
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
