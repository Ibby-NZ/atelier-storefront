import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import react from "@astrojs/react";
import node from "@astrojs/node";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

// Storefront config. React powers the interactive islands (filters, cart,
// forms); everything else ships as static HTML. Dev server port kept off the
// API's 3001 so both can run side by side.
//
// EmDash CMS (US-026) is added as an Astro integration. It injects its own
// on-demand routes (admin UI + JSON API + MCP server under /_emdash/*), so a
// server adapter (Node standalone) is required. Existing storefront pages keep
// their default static prerendering — only EmDash's injected routes render on
// demand. Content lives in a local SQLite file; media uploads on the local disk.
// `import.meta.env` is not available in a config file, so .env is loaded by hand
// (Vite's own helper — vite is already a dependency of Astro). SITE_URL is the
// public origin of the deployment; it feeds Astro's `site`, which Layout.astro
// uses for canonical and og:url. WITHOUT IT those URLs bake as
// http://localhost:4321 at build time, which is wrong the moment the site is
// indexable — so SITE_URL belongs in the launch checklist next to
// ALLOW_INDEXING (both are build-time, both need a rebuild to take effect).
const { SITE_URL } = loadEnv(
  process.env.NODE_ENV ?? "development",
  process.cwd(),
  "",
);

export default defineConfig({
  site: SITE_URL || undefined,
  // EmDash injects on-demand routes, so the site runs in server mode with a Node
  // adapter. Every storefront page opts back into static prerendering with
  // `export const prerender = true`, preserving the offline-safe static build.
  // `middleware` mode (not `standalone`): server.mjs wraps the handler in
  // Express to put a Basic Auth gate in front of EVERYTHING, prerendered pages
  // included — standalone would serve those before any auth could run.
  // Consequence: `npm start` runs server.mjs, and `astro preview` is unavailable.
  output: "server",
  adapter: node({ mode: "middleware" }),
  integrations: [
    react(),
    emdash({
      database: sqlite({ url: "file:./data/emdash.db" }),
      storage: local({
        directory: "./data/uploads",
        baseUrl: "/_emdash/api/media/file",
      }),
    }),
  ],
  server: {
    port: 4321,
    host: true,
  },
});
