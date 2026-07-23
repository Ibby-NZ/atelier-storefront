# EmDash CMS integration — beta notes (US-026)

EmDash `emdash@0.29.0` was integrated into `atelier-store` and **works
end-to-end**: the admin UI is reachable, a post created and published in EmDash
renders on the storefront's `/resources` page and at `/resources/<slug>`, and the
built-in MCP server responds. The integration is the shipped state; the markdown
collections remain the baseline and the site degrades to them when the CMS is
empty/absent.

This file records the beta rough edges hit and how each was worked around, per
the story's timebox instruction. **None became a hard blocker** — all were
resolved within the timebox.

## Friction encountered & workarounds

1. **Static output is incompatible — requires a server adapter.**
   With the default `output: 'static'`, the build fails: EmDash injects dynamic
   API routes (e.g. `/_emdash/api/admin/allowed-domains/[domain]`) that export
   `prerender = false`, but Astro's static build still demands `getStaticPaths()`
   for them (`[GetStaticPathsRequired]`).
   **Workaround:** set `output: 'server'` + `@astrojs/node` adapter, and add
   `export const prerender = true` to every existing storefront page so they stay
   statically prerendered. Only EmDash routes and the two `/resources` pages
   render on demand.

2. **`createCoalescingDialect` missing-export build warning.**
   The build logs `Import 'createCoalescingDialect' will always be undefined
   because there is no matching export in 'emdash/dist/db/sqlite.mjs'` (from the
   internal `virtual:emdash/dialect` module).
   **Impact:** cosmetic — SQLite works at runtime (migrations, CRUD, publish and
   the live loader all function). Left as-is; it is an upstream packaging bug.

3. **`Astro.request.headers` warning on prerendered pages.**
   EmDash's `pre` middleware reads request headers on every route, including
   prerendered ones, so the build prints one warning per static page. Harmless
   (prerendered pages get no real request), noisy in build output.

4. **Single-entry loader shape differs from the collection loader.**
   `getEmDashCollection('posts')` returns `{ entries }` (each entry has
   `.slug` + `.data`), but `getEmDashEntry('posts', slug)` returns
   `{ entry, isPreview, fallbackLocale, cacheHint }` — the entry is nested under
   `.entry`. **Workaround:** `src/lib/emdash.js` unwraps `.entry`.

5. **REST content API is auth-gated (by design, not a bug).**
   `GET /_emdash/api/content/posts` requires `content:read` and returns nothing
   useful to an anonymous caller. The **site** surface is the in-process Astro
   loader (`getEmDashCollection` / `getEmDashEntry`), which reads the SQLite store
   directly and correctly serves published content. Public rendering uses the
   loader, not the REST API.

## Verification note

The full "create a post → appears on the site" path was verified **headlessly**
(dev server + `curl`), because no browser / dev-browser tooling is available in
this environment and EmDash admin login is passkey-first (WebAuthn). The dev-only
`/_emdash/api/setup/dev-bypass?token=1` endpoint was used to create the admin
user and author the post; rendering was confirmed against `/resources` and
`/resources/<slug>`. **Manual browser verification of the passkey admin login
flow is still recommended.**
