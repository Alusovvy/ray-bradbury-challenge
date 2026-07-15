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
    expect(catalogById.size).toBe(catalog.length)
    expect(new Set(catalog.map((item) => item.kind))).toEqual(
      new Set(['essay', 'poem', 'story']),
    )
  })

  it('includes complete Project Gutenberg reader metadata', () => {
    const gutenbergWorks = catalog.filter((item) => item.source === 'gutenberg')

    expect(gutenbergWorks).toHaveLength(5)
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
