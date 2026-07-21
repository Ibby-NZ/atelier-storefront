import { defineLiveCollection } from 'astro:content'
import { emdashLoader } from 'emdash/runtime'

// Live (request-time) collections backed by EmDash's SQLite store. The existing
// file-based collections in src/content.config.js keep working as the markdown
// baseline; this loader exposes whatever an editor creates in the EmDash admin
// so it can be queried with getLiveCollection('_emdash', ...) at request time.
export const collections = {
  _emdash: defineLiveCollection({ loader: emdashLoader() }),
}
