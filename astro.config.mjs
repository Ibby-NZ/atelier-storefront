import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import node from '@astrojs/node'
import emdash, { local } from 'emdash/astro'
import { sqlite } from 'emdash/db'

// Storefront config. React powers the interactive islands (filters, cart,
// forms); everything else ships as static HTML. Dev server port kept off the
// API's 3001 so both can run side by side.
//
// EmDash CMS (US-026) is added as an Astro integration. It injects its own
// on-demand routes (admin UI + JSON API + MCP server under /_emdash/*), so a
// server adapter (Node standalone) is required. Existing storefront pages keep
// their default static prerendering — only EmDash's injected routes render on
// demand. Content lives in a local SQLite file; media uploads on the local disk.
export default defineConfig({
  // EmDash injects on-demand routes, so the site runs in server mode with a Node
  // adapter. Every storefront page opts back into static prerendering with
  // `export const prerender = true`, preserving the offline-safe static build.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    emdash({
      database: sqlite({ url: 'file:./data/emdash.db' }),
      storage: local({
        directory: './data/uploads',
        baseUrl: '/_emdash/api/media/file',
      }),
    }),
  ],
  server: {
    port: 4321,
    host: true,
  },
})
