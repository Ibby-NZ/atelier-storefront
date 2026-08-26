import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applySection,
  mediaUrl,
  bandClasses,
  normaliseBanner,
  normalisePage,
  normaliseSection,
  overlayArtwork,
} from './emdash.js'

test('mediaUrl resolves src / url / previewUrl and rejects the rest', () => {
  assert.equal(mediaUrl({ src: '/_emdash/api/media/file/k' }), '/_emdash/api/media/file/k')
  assert.equal(mediaUrl({ url: 'https://x/y.jpg' }), 'https://x/y.jpg')
  assert.equal(mediaUrl('/plain.jpg'), '/plain.jpg')
  assert.equal(mediaUrl({ id: 'abc' }), null)
  assert.equal(mediaUrl(null), null)
})

test('mediaUrl derives the URL from the storage key an admin save leaves behind', () => {
  // The exact shape a value has after being saved in the admin and read back
  // through the live loader: provider local, no src/url/previewUrl, storage
  // key under meta.storageKey. This is the regression that made image edits
  // silently keep the shipped art while text edits worked.
  assert.equal(
    mediaUrl({
      id: '01M0XKSN1GGKKTA02SEXYKZZ7Q',
      provider: 'local',
      filename: 'banner.jpg',
      meta: { storageKey: '01M0XKSMZW4XT2H0E19H83TG5A.jpg' },
    }),
    '/_emdash/api/media/file/01M0XKSMZW4XT2H0E19H83TG5A.jpg'
  )
  // Tolerate a top-level storageKey too, and still reject a keyless object.
  assert.equal(mediaUrl({ provider: 'local', storageKey: 'k.jpg' }), '/_emdash/api/media/file/k.jpg')
  assert.equal(mediaUrl({ provider: 'local', meta: {} }), null)
})

test('normaliseSection flattens an entry and resolves its image', () => {
  const section = normaliseSection({
    slug: 'home-manifesto',
    data: {
      title: 'Atelier',
      subtitle: '[ at-l-yey ]',
      body: 'Workshop.',
      cta_label: 'Our Story',
      cta_href: '/story',
      image: { src: '/_emdash/api/media/file/m.jpg' },
    },
  })
  assert.deepEqual(section, {
    slug: 'home-manifesto',
    title: 'Atelier',
    subtitle: '[ at-l-yey ]',
    body: 'Workshop.',
    ctaLabel: 'Our Story',
    ctaHref: '/story',
    image: '/_emdash/api/media/file/m.jpg',
    align: '',
    scrim: '',
    hidden: false,
  })
})

test('normaliseSection tolerates an empty entry', () => {
  assert.deepEqual(normaliseSection({ slug: 's' }), {
    slug: 's',
    title: '',
    subtitle: '',
    body: '',
    ctaLabel: '',
    ctaHref: '',
    image: null,
    align: '',
    scrim: '',
    hidden: false,
  })
})

const FALLBACK = Object.freeze({
  title: 'Shop by type',
  cta: 'Shop now',
  href: '/products',
  image: '/_astro/type.webp',
})

test('applySection returns the fallback untouched when the CMS has nothing', () => {
  assert.equal(applySection(FALLBACK, null), FALLBACK)
  assert.equal(applySection(FALLBACK, undefined), FALLBACK)
})

test('applySection lets a filled CMS field win and a blank one fall back', () => {
  const merged = applySection(
    FALLBACK,
    normaliseSection({
      slug: 'shop-by-type',
      data: { title: 'Fabrics by type', cta_label: '   ' },
    })
  )
  assert.equal(merged.title, 'Fabrics by type')
  assert.equal(merged.cta, 'Shop now')
  assert.equal(merged.href, '/products')
  assert.equal(merged.image, '/_astro/type.webp')
})

test('applySection overrides only the image when only the image is set', () => {
  const merged = applySection(
    FALLBACK,
    normaliseSection({ slug: 's', data: { image: { src: '/up.jpg' } } })
  )
  assert.equal(merged.image, '/up.jpg')
  assert.equal(merged.title, 'Shop by type')
})

test('applySection carries subtitle and body through the same rule', () => {
  const base = { title: 'Atelier', subtitle: '[ at-l-yey ]', body: 'Shipped.', cta: 'Go', href: '/x', image: null }
  const merged = applySection(base, normaliseSection({ slug: 's', data: { body: 'Edited.' } }))
  assert.equal(merged.subtitle, '[ at-l-yey ]')
  assert.equal(merged.body, 'Edited.')
})

test('normaliseBanner builds the pair key and drops a half-keyed row', () => {
  assert.deepEqual(
    normaliseBanner({
      slug: 'x',
      data: { house: 'larsen', collection: 'larsen-2024', banner: { src: '/b.jpg' } },
    }),
    { key: 'larsen/larsen-2024', banner: '/b.jpg', portrait: null }
  )
  assert.equal(normaliseBanner({ slug: 'x', data: { house: 'larsen' } }).key, null)
  assert.equal(normaliseBanner({ slug: 'x', data: { house: ' ', collection: 'c' } }).key, null)
})

test('overlayArtwork lets a CMS banner win over the shipped art for the same pair', () => {
  const shipped = { 'larsen/larsen-2024': { src: '/_astro/larsen.webp' } }
  const banners = [
    { key: 'larsen/larsen-2024', banner: '/cms-larsen.jpg', portrait: null },
    { key: 'dedar/dune', banner: null, portrait: '/cms-dune.jpg' },
    { key: null, banner: '/orphan.jpg', portrait: null },
  ]
  const hero = overlayArtwork(shipped, banners, 'banner')
  assert.deepEqual(hero, { 'larsen/larsen-2024': '/cms-larsen.jpg' })
  const feature = overlayArtwork({}, banners, 'portrait')
  assert.deepEqual(feature, { 'dedar/dune': '/cms-dune.jpg' })
})

test('overlayArtwork tolerates an absent banner list', () => {
  const shipped = { k: 'v' }
  assert.deepEqual(overlayArtwork(shipped, undefined, 'banner'), { k: 'v' })
})

test('normalisePage flattens a pages entry and nulls an empty body', () => {
  assert.deepEqual(
    normalisePage({ slug: 'our-showrooms', data: { title: 'Our Showrooms', content: [{ _type: 'block' }] } }),
    { slug: 'our-showrooms', title: 'Our Showrooms', content: [{ _type: 'block' }], source: 'emdash' }
  )
  assert.deepEqual(normalisePage({ slug: 'bare', data: { title: 'Bare', content: [] } }), {
    slug: 'bare',
    title: 'Bare',
    content: null,
    source: 'emdash',
  })
})

test('normaliseSection carries the layout knobs, normalised and safe', () => {
  const section = normaliseSection({
    slug: 's',
    data: { title: 'T', align: ' Centre ', scrim: 'NONE', hidden: true },
  })
  assert.equal(section.align, 'centre')
  assert.equal(section.scrim, 'none')
  assert.equal(section.hidden, true)
  const bare = normaliseSection({ slug: 's', data: { title: 'T' } })
  assert.equal(bare.align, '')
  assert.equal(bare.scrim, '')
  assert.equal(bare.hidden, false)
})

test('applySection passes the knobs through and never invents them', () => {
  const fallback = { title: 'T', cta: 'Go', href: '/x', image: null }
  const merged = applySection(
    fallback,
    normaliseSection({ slug: 's', data: { align: 'right', scrim: 'soft', hidden: 1 } })
  )
  assert.equal(merged.align, 'right')
  assert.equal(merged.scrim, 'soft')
  assert.equal(merged.hidden, true)
  // No section at all → the untouched fallback, and falsy knobs downstream.
  assert.equal(applySection(fallback, null), fallback)
})

test('bandClasses emits classes only for a real, known choice', () => {
  assert.deepEqual(bandClasses({ align: 'centre', scrim: 'none' }), [
    'band-align-centre',
    'band-scrim-none',
  ])
  assert.deepEqual(bandClasses({ align: 'center' }), ['band-align-centre'])
  assert.deepEqual(bandClasses({ align: 'right', scrim: 'deep' }), [
    'band-align-right',
    'band-scrim-deep',
  ])
  // Defaults, unknown values, and a plain fallback object emit nothing.
  assert.deepEqual(bandClasses({ align: 'left', scrim: 'standard' }), [])
  assert.deepEqual(bandClasses({ align: 'diagonal', scrim: 'plaid' }), [])
  assert.deepEqual(bandClasses({}), [])
  assert.deepEqual(bandClasses(undefined), [])
})
