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
non-developer can author and edit posts and brand pages without a code deploy.
EmDash content is **additive**: the `/resources` journal merges published EmDash
posts with the markdown posts (markdown wins on slug collisions), and individual
posts resolve markdown-first, then fall back to EmDash. If the CMS database is
empty or absent (e.g. a clean CI build), the site silently falls back to the
markdown baseline — all EmDash reads go through `src/lib/emdash.js`, which never
throws.

**Brand pages are the exception to that precedence: EmDash wins over markdown.**
The CMS is the editor of record for `/brands/<slug>`; the markdown files under
`src/content/brands/` are the offline baseline that ships with the repo. See
[`CLAUDE.md`](./CLAUDE.md) for the rationale.

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
  `getEmdashPost`, `listEmdashBrandPages`, `getEmdashBrandPage`, `mediaUrl`)
  used by the `/resources` and `/brands/<slug>` pages.
- `.emdash/seed.json` — the collection schema (committed).

### Collections and the seed file

`.emdash/seed.json` defines the CMS schema: **`brand_pages`** (title, blurb,
slideshow repeater, collection-cards repeater, Portable Text story) plus
**`posts`** and **`pages`**.

> **The posts/pages definitions in that file are load-bearing copies of EmDash's
> built-in default seed.** A user seed *replaces* the default rather than
> extending it (`virtual:emdash/seed` exports `seed = userSeed` whenever
> `.emdash/seed.json` exists), so deleting them would leave a fresh environment
> with no Posts or Pages collection at all. Re-diff them against
> `node_modules/emdash/dist/default-*.mjs` when upgrading EmDash.

**Slug match rule:** a `brand_pages` entry joins to the live catalogue by slug —
the entry slug MUST equal the atelier-api brand slug (e.g. `pierre-frey`).
Nothing else links them. An entry whose slug no API brand matches still renders
(editorial-only page); a brand with no entry falls back to its markdown page,
then to the brand story from the API.

### Seed runbook

```bash
npm run seed:cms   # emdash seed --database ./data/emdash.db --uploads-dir ./data/uploads
```

Idempotent (`--on-conflict skip` by default): existing collections are skipped,
new ones created. On a database that already has posts/pages the expected output
is `Collections: 1 created, 2 skipped`.

- **Do not run bare `npx emdash seed`** — the CLI defaults are `./data.db` and
  `./uploads`, which are the wrong paths for this repo and create a stray
  database that nothing reads. Always use the npm script.
- **Restart the dev server after editing the seed file** — it is read into a
  virtual module when Astro starts.
- **Fresh local database:** either `npm run seed:cms`, or hit the dev bypass
  (`curl "http://localhost:4321/_emdash/api/setup/dev-bypass?token=1"`), which
  runs migrations and applies the seed as part of setup. The admin UI's setup
  wizard and the MCP schema tools can also create collections.
- **Production:** run `npm run seed:cms` on the server after deploying a seed
  change (`data/` persistence is covered in `DEPLOY-STOREFRONT-RUNCLOUD.md`).

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
> are recorded in [`tasks/emdash-blockers.md`](tasks/emdash-blockers.md).
