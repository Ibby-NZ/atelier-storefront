// Multi-select facet state for the product library: the values each filter
// holds, how that round-trips through the querystring, and how a click toggles
// it. Pure — the island owns the React state, this owns the shape.
//
// The querystring carries one REPEATED key per value
// (`?brand=dedar&brand=zimmer`), never a delimiter: free-text facets such as
// composition carry commas ("55% linen, 45% cotton"). A single-value link
// (`?brand=dedar`, how the home and house pages hand off into the library) is
// just the one-element case, so every existing deep link keeps working.

const NONE = Object.freeze([])

/** @param {string[]} keys */
export const emptySelection = (keys) =>
  Object.freeze(keys.reduce((acc, key) => ({ ...acc, [key]: NONE }), {}))

/**
 * The selection a querystring describes: every key in `keys`, each holding its
 * distinct non-blank values in URL order (an empty frozen array when absent).
 *
 * @param {URLSearchParams} params
 * @param {string[]} keys
 */
export function readSelection(params, keys) {
  return Object.freeze(
    keys.reduce((acc, key) => {
      const values = [...new Set(params.getAll(key).map((v) => v.trim()).filter(Boolean))]
      return { ...acc, [key]: values.length ? Object.freeze(values) : NONE }
    }, {})
  )
}

/** A fresh URLSearchParams carrying the selection, keys in selection order. */
export function selectionParams(selection) {
  const params = new URLSearchParams()
  for (const [key, values] of Object.entries(selection)) {
    for (const value of values) params.append(key, value)
  }
  return params
}

/** Toggle one value in a value list. Returns a new list; never mutates. */
export const toggleValue = (values, value) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value]

/** How many values are chosen across every filter. */
export const selectedCount = (selection) =>
  Object.values(selection).reduce((n, values) => n + values.length, 0)
