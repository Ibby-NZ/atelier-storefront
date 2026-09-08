// Journal posts from both sources as ONE list. The EmDash CMS is the editor of
// record — the post the office edits in the admin must be the one the site
// shows — and the markdown `post` collection is the offline baseline shipped in
// the repo. So on a slug both have, the CMS entry wins and the markdown file is
// not loaded at all: precedence is per POST, never a hybrid, the same rule the
// brand pages follow. Newest first. `listEmdashPosts` never throws, so with no
// CMS at all this is just the markdown journal.
import { getCollection } from 'astro:content'
import { listEmdashPosts } from './emdash.js'
import { excerptFromBody } from './journal.js'

// A markdown entry in the shape normalisePost gives a CMS entry. Frontmatter
// excerpt wins; otherwise the post's own opening paragraph stands in, so the
// shipped baseline post reads properly without being edited.
export const fromMarkdown = (post) => ({
  id: post.id,
  title: post.data.title,
  date: post.data.date,
  hero: post.data.hero ?? null,
  excerpt: post.data.excerpt ?? excerptFromBody(post.body),
  brands: post.data.brands ?? [],
  source: 'markdown',
})

export async function listPosts() {
  const cms = await listEmdashPosts()
  const seen = new Set(cms.map((post) => post.id))
  const markdown = (await getCollection('post'))
    .filter((post) => !seen.has(post.id))
    .map(fromMarkdown)
  return [...cms, ...markdown].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
}
