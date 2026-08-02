import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// Structured content collections (Astro content layer). A CMS can later manage
// these entries; the markdown files here are the fallback / seed baseline. Every
// schema is intentionally CMS-friendly: flat frontmatter + a markdown body.

// A brand's marketing page: slideshow header, blurb, and collection cards. The
// `brand` field is the API brand slug so pages join to live catalogue data.
const brandPage = defineCollection({
  loader: glob({ base: './src/content/brands', pattern: '**/*.md' }),
  schema: z.object({
    brand: z.string(),
    slideshow: z.array(z.string()).default([]),
    blurb: z.string(),
    collectionCards: z
      .array(
        z.object({
          heading: z.string(),
          description: z.string(),
          link: z.string(),
          featuredImage: z.string().optional(),
        }),
      )
      .default([]),
  }),
})

// Journal / newsletter posts. `brands` tags relate a post to brand pages.
// `excerpt` is the standfirst on the journal index; it is OPTIONAL because
// lib/journal.js falls back to the post's own opening paragraph, so a file that
// omits it still reads properly on the index (matches the EmDash post shape,
// which always carries an excerpt).
const post = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    brands: z.array(z.string()).default([]),
    hero: z.string().optional(),
    excerpt: z.string().optional(),
  }),
})

// Standalone company pages (story, contact). Body markdown is the page content.
const page = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
  }),
})

export const collections = { brandPage, post, page }
