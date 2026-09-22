// The New Zealand regions the checkout's Region field offers, and the rate zone
// each one bills against.
//
// A REGION IS NOT A RATE. Freight is priced per `zone` and the API knows only
// the zones that have tiers in `shipping_rates` — the three seeded ones below,
// flat rate per zone (meeting decision) — so GET /shipping/quote answers 400
// "Unknown shipping zone" for any other name. The regions are the shopper's own
// words for where they live; each maps to one of the three zones, so the Region
// field can still show what that choice costs before it is made.
//
// To price a region on its own, give it tiers on the CRM's shipping screen
// (zones are data, not code) and point it at itself here.

const AUCKLAND = 'Auckland'
const NORTH = 'North Island'
const SOUTH = 'South Island'

// Alphabetical, which also puts Auckland — the default — first.
// Chatham Islands is neither island; it bills at the dearer of the two until
// the office gives it tiers of its own.
export const REGION_ZONES = Object.freeze({
  Auckland: AUCKLAND,
  'Bay of Plenty': NORTH,
  Canterbury: SOUTH,
  'Chatham Islands': SOUTH,
  Gisborne: NORTH,
  "Hawke's Bay": NORTH,
  'Manawatū-Whanganui': NORTH,
  Marlborough: SOUTH,
  Nelson: SOUTH,
  Northland: NORTH,
  Otago: SOUTH,
  Southland: SOUTH,
  Taranaki: NORTH,
  Tasman: SOUTH,
  Waikato: NORTH,
  Wellington: NORTH,
  'West Coast': SOUTH,
})

/** The region names, in the order the Region field lists them. */
export const NZ_REGIONS = Object.freeze(Object.keys(REGION_ZONES))

/** The distinct zones to quote — one request each, not one per region. */
export const RATE_ZONES = Object.freeze([...new Set(Object.values(REGION_ZONES))])

/**
 * The rate zone a region bills against, or undefined for a name we do not know.
 * The field only offers names from NZ_REGIONS, so undefined means a caller
 * invented one — the quote then fails loudly rather than billing a guess.
 *
 * @param {string} region
 * @returns {string | undefined}
 */
export function zoneForRegion(region) {
  return REGION_ZONES[region]
}
