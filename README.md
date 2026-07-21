# atelier-store

Astro + React-islands storefront for the Atelier platform. Reads products,
inventory, brands and orders from **atelier-api**. Plain JavaScript (ESM), no
TypeScript.

- `npm run dev` — dev server on http://localhost:4321 (API expected on :3001).
- `npm run build` — server build to `dist/` (Node adapter; see EmDash below).
- `npm run lint` — ESLint over `.js/.jsx/.mjs`.

For storefront conventions (API access, islands, cart, content collections) see
[`CLAUDE.md`](./CLAUDE.md).

## Content: markdown baseline + EmDash CMS

Structured content (brand pages, journal posts, company pages) is defined as
Astro content collections in `src/content.config.js`, backed by markdown files
under `src/content/`. **Markdown is the shipped baseline** — the site renders
fully from it with no CMS running.

[EmDash](https://emdashcms.com) (US-026) is added as an Astro integration so a
non-developer can author and edit posts without a code deploy. EmDash content is
**additive**: the `/resources` journal merges published EmDash posts with the
markdown posts (markdown wins on slug collisions), and individual posts resolve
markdown-first, then fall back to EmDash. If the CMS database is empty or absent
(e.g. a clean CI build), the site silently falls back to the markdown baseline —
all EmDash reads go through `src/lib/emdash.js`, which never throws.

### How it is wired

- `astro.config.mjs` — the site runs in `output: 'server'` with the
  `@astrojs/node` adapter (EmDash injects on-demand routes, so an adapter is
  required). Every storefront page opts back into static prerendering with
  `export const prerender = true`; only EmDash's own routes and the two
  `/resources` pages render on demand.
- `emdash({ database: sqlite(...), storage: local(...) })` — content lives in a
  local SQLite file and uploads on local disk, both under `data/` (gitignored).
- `src/live.config.js` — registers the `_emdash` live collection loader.
- `src/lib/emdash.js` — offline-safe read helpers (`listEmdashPosts`,
  `getEmdashPost`) used by the `/resources` pages.

### Admin UI (local)

1. `npm run dev`, then open **http://localhost:4321/_emdash/admin**.
2. First run redirects to `/_emdash/admin/setup` to create the first admin
   (passkey-first auth). In a browser, complete the passkey registration.
3. Create/edit a post in the **Posts** collection and **Publish** it — it then
   appears on http://localhost:4321/resources and at
   `/resources/<slug>`.

**Headless / scripted setup (development only):**
`GET /_emdash/api/setup/dev-bypass?token=1` runs migrations, seeds the default
collections, creates a `dev@emdash.local` admin, and returns a full-scope API
token — useful for local automation and for the MCP connection below. It is
gated to `import.meta.env.DEV` and never available in production.

### EmDash MCP connection

EmDash exposes a built-in **MCP server** (Streamable HTTP) for AI tools to manage
content:

- **Endpoint:** `http://localhost:4321/_emdash/api/mcp`
- **Auth:** `Authorization: Bearer <API token>`. Create a token in the admin
  (Settings → API tokens) or grab one from the `dev-bypass?token=1` response
  above.
- **Transport:** Streamable HTTP (send `Accept: application/json,
  text/event-stream`).
- **Tools:** `content_list`, `content_get`, `content_create`,
  `content_update`, `content_publish`, schema/media tools, … (`tools/list` for
  the full set).

Example MCP client entry (Claude Code / any MCP client that supports HTTP
transports):

```json
{
  "mcpServers": {
    "emdash": {
      "type": "http",
      "url": "http://localhost:4321/_emdash/api/mcp",
      "headers": { "Authorization": "Bearer ec_pat_..." }
    }
  }
}
```

Quick smoke test:

```bash
curl -s -X POST http://localhost:4321/_emdash/api/mcp \
  -H "Authorization: Bearer ec_pat_..." \
  -H "content-type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

> EmDash is a **beta** integration. Known rough edges and the workarounds applied
> are recorded in [`../tasks/emdash-blockers.md`](../tasks/emdash-blockers.md).
