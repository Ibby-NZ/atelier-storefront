// House (brand) presentation helpers.
//
// The catalogue API's brand shape is { slug, name, country, currency,
// is_international, story } — there is no founded-year column, and the Maison
// redesign wants "France · est. 1935" beside every house name.
//
// Rather than hardcode a table of dates (which would drift from, and could
// contradict, the copy the client actually wrote), the year is read out of the
// house's own story text — several of the seeded stories open with "Founded
// 1935" / "Established 2006". A house whose story names no year simply shows its
// country, which is what the design degrades to anyway.
//
// Since W7 this file also carries what `/brands` puts "in focus": the office's
// own `featured_rank` choice and the photograph each chosen house shows.
//
// Pure functions, no fetching, no DOM.

import { featuredByRank } from './featured.js'

const FOUNDED = /\b(?:founded|established|est\.?)\s*(?:in\s+)?(1[5-9]\d{2}|20\d{2})\b/i

/**
 * The founded year stated in a house's story, or null.
 *
 * @param {{ story?: string|null }|null} brand
 * @returns {number|null}
 */
export function foundedYear(brand) {
  const match = brand?.story ? FOUNDED.exec(brand.story) : null
  return match ? Number(match[1]) : null
}

/**
 * The meta line beside a house name: "France · est. 1935", "Italy", or ''.
 *
 * @param {{ country?: string|null, story?: string|null }|null} brand
 * @returns {string}
 */
export function houseMeta(brand) {
  const year = foundedYear(brand)
  return [brand?.country, year ? `est. ${year}` : null].filter(Boolean).join(' · ')
}

/**
 * The number word the redesign's headings spell out ("Six *colourways*", "Three
 * *collections*"). Falls back to the digits past twelve, which is where the
 * spelled form stops reading as editorial and starts reading as a typo.
 *
 * @param {number} count
 * @returns {string}
 */
export function countWord(count) {
  const words = [
    'No',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
  ]
  return words[count] ?? String(count)
}

/**
 * Tiles in the "in focus" strip — the design's three-column row.
 *
 * The office may feature up to twelve houses (the API caps both lists there),
 * so the strip takes the first three and the rest are still one alphabetical
 * row down in the full directory. The DATABASE owns the order; the PAGE owns
 * the composition, and this is the composition.
 */
export const FOCUS_SLOTS = 3

/**
 * The houses the office has featured, in the order it chose.
 *
 * This replaced a derived guess — international, ranked by how many designs the
 * anonymous catalogue showed, then by name — which nobody in the office could
 * change and which the trade gate had already flattened to alphabetical, since
 * every represented house reads 0 designs to a signed-out visitor.
 *
 * The rule is `featuredByRank()` in lib/featured.js, shared with the homepage's
 * collections: same column, same meaning, one implementation.
 *
 * @param {Array<{ featured_rank?: number|null }>} brands
 * @param {number} [count]
 * @returns {Array<object>} a new frozen list; the input is never reordered
 */
export function featuredHouses(brands = [], count = Infinity) {
  return featuredByRank(brands, count)
}

const imageSrc = (value) => (typeof value === 'string' && value.trim() ? value : null)

/**
 * The photograph a house shows in the strip, as a chain:
 *
 *   1. the editorial photograph published FOR THIS house — its brand page's
 *      first slideshow image, EmDash winning over the markdown baseline (the
 *      caller resolves that precedence, exactly as /brands/[slug] does);
 *   2. else a COLLECTION photograph of this house's own;
 *   3. else a design of THIS house's own, from the catalogue;
 *   4. else none of them, and the caller paints its designed ground (the shared
 *      `.weave` stand-in, the same answer the house page's collection tiles
 *      give a collection with no photograph).
 *
 * What the chain never does is borrow ANOTHER house's picture: a tile captioned
 * "de Le Cuona" over Pierre Frey's interior is worse than the plain weave,
 * because the caption asserts the photograph belongs to that maison. Every map
 * is read at this house's slug and at no other key.
 *
 * **Rung 2 is what actually photographs the directory.** Rung 1 covers one house
 * (only pierre-frey ships a markdown slideshow) and rung 3 thins out under the
 * trade gate — a represented house's designs are not in an anonymous product
 * list at all — so before it existed 40 of the 42 houses fell straight to the
 * weave. `/catalogue/collections` is public and ungated and carries an
 * `image_url` per collection, which lifts that to 14 houses photographed with
 * their OWN commissioned interiors. It sits above the catalogue rung because a
 * collection hero is an art-directed room, where a product shot is as often a
 * finished good on white linen.
 *
 * @param {{
 *   editorial?: Record<string, string>,
 *   collections?: Record<string, string>,
 *   catalogue?: Record<string, string>,
 * }} sources
 * @param {{ slug?: string }|null|undefined} house
 * @returns {string|null}
 */
export function houseArtwork(sources, house) {
  const slug = house?.slug
  if (!slug) return null
  return (
    imageSrc(sources?.editorial?.[slug]) ??
    imageSrc(sources?.collections?.[slug]) ??
    imageSrc(sources?.catalogue?.[slug]) ??
    null
  )
}
