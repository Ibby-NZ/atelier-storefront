// What "featured" means, for every surface that reads the office's choice.
//
// `featured_rank` is one nullable integer per row, on `brands` and on
// `collections` alike, set by the office in the CRM and carried by every public
// catalogue response. The homepage reads it for its collections and the brands
// index reads it for its "in focus" strip, so the rule lives here once: two
// copies of "what counts as a rank" would otherwise be corrected on one surface
// and not the other.
//
// Pure functions, no fetching, no DOM.

/**
 * A row's `featured_rank` as a positive integer, or null for "not featured".
 *
 * NULL is what the column holds for an unfeatured row. Rank 0 and negatives are
 * refused by the column's own CHECK, so they can only arrive from a source that
 * is not the API — and they read here as "not featured" rather than sorting
 * ahead of rank 1, which is the reading that cannot promote a row nobody chose.
 *
 * @param {{ featured_rank?: number|string|null }|null|undefined} row
 * @returns {number|null}
 */
export function featuredRank(row) {
  const rank = Number(row?.featured_rank)
  return Number.isInteger(rank) && rank > 0 ? rank : null
}

/**
 * The rows the office has featured, in the order it chose.
 *
 * The API already returns them first and in rank order, and this sorts anyway:
 * `featured_rank` carries no unique index (deliberately — a unique index would
 * make every step of a reorder a potential 409), so two rows may share a rank,
 * and the tie has to break on something. It breaks on the order the API gave,
 * which is that endpoint's own name/id tail — a filter alone would pass an
 * unordered list through silently.
 *
 * @param {Array<{ featured_rank?: number|null }>} rows
 * @param {number} [count] cap — the surface's own composition, not the schema's
 * @returns {Array<object>} a new frozen list; the input is never reordered
 */
export function featuredByRank(rows = [], count = Infinity) {
  const featured = rows
    .map((row, order) => ({ row, order, rank: featuredRank(row) }))
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.row)

  return Object.freeze(featured.slice(0, Math.max(0, count)))
}
