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
