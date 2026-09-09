// Import the markdown journal posts (src/content/posts/*.md) into the EmDash
// `posts` collection, so the CMS is the editor of record for the journal — the
// post the site shows is the one the office can open in the admin. Before this
// the markdown post WON over the CMS on its slug, so it was live on /resources
// and invisible in the admin, and nothing an editor did could touch it.
//
// Same refusals as import-brand-pages.mjs, because CMS-wins means a bad import
// downgrades a live post:
//   - a slug already in the CMS is SKIPPED — an editor's post is never replaced
//     (delete the entry in the admin to re-import one);
//   - a body using markdown syntax the converter cannot carry losslessly is
//     skipped with a warning and that post stays on its markdown;
//   - the hero photograph is downloaded into the media library; a failed
//     download keeps the remote URL, which renders the same.
// The frontmatter `date` becomes publishedAt (the journal keeps its order), the
// `brands` tags become the comma-separated `houses` field (what the brand
// pages' Related reading joins on), and the standfirst is the same opening
// paragraph the index derived for the markdown post.
//
// Usage (local):   EMDASH_TOKEN=<token> node scripts/import-posts.mjs
// Usage (remote):  EMDASH_TOKEN=<token> node scripts/import-posts.mjs https://atelier-storefront.disrupted.co.nz
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import yaml from 'js-yaml'
import { markdownToPortableText } from '../src/lib/markdownToPortableText.js'
import { excerptFromBody } from '../src/lib/journal.js'
import { emdashClient, splitFrontmatter } from './lib/emdash-client.mjs'

const TOKEN = process.env.EMDASH_TOKEN
if (!TOKEN) {
  console.error('EMDASH_TOKEN is required (EmDash admin → API tokens).')
  process.exit(1)
}
const { post, listAll, importImage } = emdashClient({
  base: process.argv[2] ?? 'http://localhost:4321',
  token: TOKEN,
})

const existing = new Set((await listAll('/_emdash/api/content/posts')).map((item) => item.slug))

const dir = 'src/content/posts'
let created = 0
let skipped = 0
for (const file of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
  const slug = basename(file, '.md')
  const parts = splitFrontmatter(readFileSync(join(dir, file), 'utf8'))
  if (!parts) {
    console.warn(`${slug} — no frontmatter, skipped`)
    skipped += 1
    continue
  }
  if (existing.has(slug)) {
    console.log(`${slug} — already in the CMS, skipped`)
    skipped += 1
    continue
  }
  const frontmatter = yaml.load(parts.frontmatter) ?? {}
  const content = markdownToPortableText(parts.body)
  if (parts.body.trim() && !content) {
    console.warn(`${slug} — body uses syntax the converter cannot carry losslessly, skipped`)
    skipped += 1
    continue
  }

  const date = frontmatter.date ? new Date(frontmatter.date) : null
  const publishedAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined

  const { item } = await post('/_emdash/api/content/posts', {
    slug,
    status: 'draft',
    data: {
      title: frontmatter.title ?? slug,
      excerpt: frontmatter.excerpt ?? excerptFromBody(parts.body),
      houses: (frontmatter.brands ?? []).join(', '),
      ...(frontmatter.hero ? { featured_image: await importImage(frontmatter.hero) } : {}),
      ...(content ? { content } : {}),
    },
  })
  await post(`/_emdash/api/content/posts/${item.id}/publish`, publishedAt ? { publishedAt } : {})
  console.log(`${slug} — imported${publishedAt ? ` (published ${publishedAt.slice(0, 10)})` : ''}`)
  created += 1
}

console.log(`Done: ${created} imported, ${skipped} skipped.`)
