import { beforeAll, describe, expect, it } from 'vitest'
import encryptedPayload from './catalog.enc.json'
import { catalog, catalogById, loadCatalog } from './catalog'
import { getFullReaderUrl, getLibraryName, getSourceUrl } from './library'

beforeAll(() => loadCatalog())

describe('reading catalog', () => {
  it('does not expose catalog metadata in the encrypted JSON payload', () => {
    const serialized = JSON.stringify(encryptedPayload)

    expect(serialized).not.toContain('Ozymandias')
    expect(serialized).not.toContain('Project Gutenberg')
    expect(serialized).not.toContain('Wikisource')
  })

  it('has unique identifiers and all three reading kinds', () => {
    const essays = catalog.filter((item) => item.kind === 'essay')
    const poems = catalog.filter((item) => item.kind === 'poem')
    const stories = catalog.filter((item) => item.kind === 'story')

    expect(catalog.length).toBeGreaterThan(2_000)
    expect(catalogById.size).toBe(catalog.length)
    expect(new Set(catalog.map((item) => item.kind))).toEqual(
      new Set(['essay', 'poem', 'story']),
    )
    expect(essays.length).toBeGreaterThanOrEqual(766)
    expect(poems.length).toBeGreaterThanOrEqual(767)
    expect(stories.length).toBeGreaterThan(667)
    expect(essays.filter((item) => item.minutes <= 30).length).toBeGreaterThanOrEqual(104)
    expect(poems.filter((item) => item.minutes <= 30).length).toBeGreaterThanOrEqual(512)
  })

  it('uses individual, measured works instead of essay and poetry collection cards', () => {
    const shortForms = catalog.filter((item) => item.kind !== 'story')
    const structuralTitle = /^(?:\[\s*\d+\s*]|contents?|table of contents|list of illustrations)$/i

    expect(shortForms.some((item) => structuralTitle.test(item.title))).toBe(false)
    expect(
      shortForms.some((item) => /^(?:collected |complete )?(?:essays|poems|poetry)\.?$/i.test(item.title)),
    ).toBe(false)
    expect(
      shortForms.filter((item) => item.description.includes('from the collection')).length,
    ).toBeGreaterThan(200)
  })

  it('stores individual stories instead of oversized collection records', () => {
    const stories = catalog.filter((item) => item.kind === 'story')
    const beastsAndSuperBeasts = stories.filter((item) =>
      item.readerUrl?.includes('/269/'),
    )

    expect(Math.max(...stories.map((item) => item.minutes))).toBeLessThanOrEqual(180)
    expect(stories.some((item) => item.title === 'Beasts and Super-Beasts')).toBe(false)
    expect(stories.some((item) => item.title === 'The She-Wolf')).toBe(true)
    expect(beastsAndSuperBeasts.length).toBeGreaterThan(20)
    expect(new Set(beastsAndSuperBeasts.map((item) => item.readerUrl)).size).toBe(
      beastsAndSuperBeasts.length,
    )
  })

  it('gives every work a short card description', () => {
    catalog.forEach((item) => {
      expect(item.description.length).toBeGreaterThan(20)
      expect(item.description.length).toBeLessThanOrEqual(220)
      expect(item.description).toMatch(/[.!?]$/)
    })
  })

  it('includes complete Project Gutenberg reader metadata', () => {
    const gutenbergWorks = catalog.filter((item) => item.source === 'gutenberg')

    expect(gutenbergWorks.length).toBeGreaterThan(1_900)
    expect(new Set(gutenbergWorks.map((item) => item.kind))).toEqual(
      new Set(['essay', 'poem', 'story']),
    )
    gutenbergWorks.forEach((item) => {
      expect(item.readerUrl).toMatch(/^https:\/\/www\.gutenberg\.org\/cache\/epub\//)
      expect(item.sourceUrl).toMatch(/^https:\/\/www\.gutenberg\.org\/ebooks\//)
      expect(getLibraryName(item)).toBe('Project Gutenberg')
      expect(getSourceUrl(item)).toBe(item.sourceUrl)
    })
  })

  it('keeps every Wikisource work connected to its source page', () => {
    const wikisourceWorks = catalog.filter((item) => item.source !== 'gutenberg')

    expect(wikisourceWorks.length).toBeGreaterThan(0)
    wikisourceWorks.forEach((item) => {
      expect(item.pageTitle).toBeTruthy()
      expect(getLibraryName(item)).toBe('Wikisource')
      expect(getSourceUrl(item)).toMatch(/^https:\/\/en\.wikisource\.org\/wiki\//)
    })
  })

  it('builds a shareable full-page reader URL for every work', () => {
    catalog.forEach((item) => {
      expect(getFullReaderUrl(item)).toContain(`?read=${encodeURIComponent(item.id)}`)
    })
  })
})
