// Markdown → Portable Text, for importing the markdown content baseline into
// EmDash (scripts/import-brand-pages.mjs). Deliberately covers only what the
// corpus actually uses — the brand markdown bodies are plain paragraphs, no
// headings, no emphasis, no links (verified across all 36 files) — so the
// conversion is lossless for them and REFUSES anything it would mangle: a body
// using unsupported syntax returns null and the caller keeps the markdown as
// the source of record instead of importing a degraded copy.
//
// Pure module, no imports — tested in markdownToPortableText.test.js.

// Syntax the paragraph splitter would silently flatten into plain text. A hit
// means "do not import this body", never "strip the formatting".
const UNSUPPORTED = [
  /^#{1,6}\s/m, // headings
  /^\s*[-*+]\s+/m, // lists
  /^\s*\d+\.\s+/m, // ordered lists
  /^\s*>/m, // blockquotes
  /```/, // code fences
  /!?\[[^\]]*\]\([^)]*\)/, // links and images
  /\*\*|__|(^|\s)[_*]\S/, // emphasis
  /^\s*\|/m, // tables
]

/**
 * @param {string} markdown
 * @returns {Array<object>|null} Portable Text blocks, or null when the body is
 *   empty or uses syntax this converter does not carry.
 */
export function markdownToPortableText(markdown) {
  const source = typeof markdown === 'string' ? markdown.trim() : ''
  if (!source) return null
  if (UNSUPPORTED.some((pattern) => pattern.test(source))) return null

  const paragraphs = source
    .split(/\n\s*\n/)
    // A hard-wrapped paragraph is one flowing text: the line breaks are the
    // 80-column editor's, not the author's.
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return null

  return paragraphs.map((text, index) => ({
    _type: 'block',
    _key: `b${index + 1}`,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `b${index + 1}s1`, text, marks: [] }],
  }))
}
