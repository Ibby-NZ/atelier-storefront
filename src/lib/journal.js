// Journal (resources) presentation helpers.
//
// The EmDash CMS gives every post an `excerpt` field; the markdown `post`
// collection has never had one, so a markdown post had nothing to show as a
// standfirst on the journal index. Rather than require an `excerpt` in every
// file's frontmatter (which would leave the shipped baseline post without one
// until someone edits it), the standfirst falls back to the post's own opening
// paragraph. Frontmatter still wins when it is present.
//
// Pure functions — no fetching, no DOM.

const EXCERPT_LIMIT = 180

// Lines that are not prose: headings, images, block quotes, list items, rules,
// and the fenced-code markers around them.
const NON_PROSE = /^\s*(?:[#>-]|\d+\.\s|!\[|```|\|)/

// The inline markdown a standfirst should not carry through as syntax. Links
// collapse to their text; emphasis and code markers are dropped.
const stripInline = (text) =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Truncate at a word boundary, appending an ellipsis only when text was cut.
 *
 * @param {string} text
 * @param {number} limit
 * @returns {string}
 */
export function truncateWords(text, limit = EXCERPT_LIMIT) {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  // A single word longer than the limit has no space to break on — cut it flat
  // rather than returning the whole thing.
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`
}

/**
 * A standfirst drawn from a markdown body: the first prose paragraph, inline
 * markdown removed, truncated at a word boundary. Empty string when the body is
 * missing or has no prose (an image-only post).
 *
 * @param {string|null|undefined} body raw markdown
 * @param {number} [limit]
 * @returns {string}
 */
export function excerptFromBody(body, limit = EXCERPT_LIMIT) {
  if (typeof body !== 'string' || !body.trim()) return ''

  // Paragraphs are blank-line separated; a paragraph may still wrap over
  // several lines, so each is joined before it is judged.
  const paragraph = body
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.trim() && !NON_PROSE.test(line))
        .join(' ')
    )
    .map(stripInline)
    .find((block) => block.length > 0)

  return paragraph ? truncateWords(paragraph, limit) : ''
}
