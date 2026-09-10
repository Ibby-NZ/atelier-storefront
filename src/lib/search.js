// Site search (/search): the index of the store's own pages, and the
// word-matching rule every search surface shares — journal posts and CMS
// pages server-side in pages/search.astro, houses in the SearchResults island.
// Designs are NOT matched here: the API's own `q` filter does that,
// credentialed, so a trade account searching is shown the houses it may see.
//
// Pure — no DOM, no fetch.

// The API's `q` maxLength; the same cap keeps a pasted paragraph out of the
// page heading.
const MAX_QUERY = 200

/** Whitespace-collapsed, trimmed, capped. Anything that is not a string → ''. */
export const normaliseQuery = (raw) =>
  typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY) : ''

export const queryWords = (q) => normaliseQuery(q).toLowerCase().split(' ').filter(Boolean)

// EVERY word must appear (AND, not OR): on an index this small OR reads as
// noise — "linen throw" would list every page that so much as mentions linen.
export function matchesWords(text, words) {
  if (words.length === 0) return false
  const haystack = String(text ?? '').toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/**
 * The items whose text contains every word of the query. An empty query
 * matches nothing — the page renders its prompt, not the whole index.
 *
 * @template T
 * @param {T[]} items
 * @param {string} q
 * @param {(item: T) => string} toText
 * @returns {T[]}
 */
export function searchIndex(items, q, toText) {
  const words = queryWords(q)
  return words.length === 0 ? [] : items.filter((item) => matchesWords(toText(item), words))
}

// The fixed pages, with the words a shopper might reach them by. `description`
// is also the blurb under the hit.
export const SITE_PAGES = Object.freeze(
  [
    {
      href: '/products',
      title: 'Shop the collection',
      description:
        'Fabrics and finished goods from the houses we represent — by house, category, application and price.',
      keywords: ['fabric', 'fabrics', 'textiles', 'library', 'browse', 'designs', 'price', 'trade pricing'],
    },
    {
      href: '/brands',
      title: 'Our Brands',
      description: 'The maisons Atelier Textiles represents in New Zealand.',
      keywords: ['houses', 'maison', 'designers'],
    },
    {
      href: '/bespoke',
      title: 'Bespoke',
      description: 'Made-to-order pieces from the houses that offer them.',
      keywords: ['custom', 'made to order', 'commission'],
    },
    {
      href: '/story',
      title: 'Our Story',
      description: 'Who Atelier Textiles is, and the houses we have stood beside.',
      keywords: ['about', 'history', 'team'],
    },
    {
      href: '/resources',
      title: 'Journal',
      description: 'Collection stories, house notes and news from the maisons we represent.',
      keywords: ['news', 'newsletter', 'posts', 'stories'],
    },
    {
      href: '/contact',
      title: 'Contact & showrooms',
      description: 'Enquiries, phone, and our Auckland, Wellington and Christchurch showrooms.',
      keywords: ['email', 'phone', 'address', 'showroom', 'hours', 'Parnell', 'visit'],
    },
    {
      href: '/trade-application',
      title: 'Apply for a trade account',
      description: 'Trade pricing and the full library for designers, architects and retailers.',
      keywords: ['trade', 'account', 'apply', 'designer', 'architect', 'interior', 'wholesale'],
    },
    {
      href: '/login',
      title: 'Sign in',
      description: 'Sign in to your Atelier Textiles account.',
      keywords: ['login', 'account', 'password'],
    },
    {
      href: '/account',
      title: 'Your account',
      description: 'Your orders, requests and trade status.',
      keywords: ['orders', 'profile'],
    },
    {
      href: '/order-lookup',
      title: 'Find an order',
      description: 'Look up an order with its number and the email it was placed with.',
      keywords: ['order', 'tracking', 'status', 'guest'],
    },
    {
      href: '/cart',
      title: 'Cart',
      description: 'What you have set aside to buy.',
      keywords: ['basket', 'checkout'],
    },
    {
      href: '/order-request',
      title: 'Request list',
      description: 'The fabrics you have set aside to ask about.',
      keywords: ['request', 'order request', 'enquiry'],
    },
    { href: '/privacy', title: 'Privacy policy', description: 'How we handle your details.', keywords: [] },
    { href: '/terms', title: 'Terms & conditions', description: 'The terms we trade on.', keywords: [] },
  ].map(Object.freeze)
)

export const pageText = (page) =>
  [page.title, page.description, ...(page.keywords ?? [])].join(' ')

export const postText = (post) => [post.title, post.excerpt].join(' ')

export const brandText = (brand) => [brand.name, brand.country, brand.story].join(' ')

/** The plain text of a Portable Text array — block children only. */
export const portableTextToString = (blocks) =>
  Array.isArray(blocks)
    ? blocks
        .flatMap((block) =>
          Array.isArray(block?.children) ? block.children.map((child) => child?.text ?? '') : []
        )
        .join(' ')
    : ''

// The fixed company pages resolve their own CMS entry in their own file and
// already sit in SITE_PAGES, so their entries would list twice.
const FIXED_SLUGS = new Set(['contact', 'privacy', 'terms'])

/** A published CMS page as a search hit at /<slug>, or null for a fixed page. */
export const cmsPageHit = (page) =>
  !page?.slug || FIXED_SLUGS.has(page.slug)
    ? null
    : Object.freeze({
        href: `/${page.slug}`,
        title: page.title,
        description: portableTextToString(page.content),
        keywords: [],
      })
