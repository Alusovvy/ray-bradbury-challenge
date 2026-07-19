import { beforeAll, describe, expect, it } from 'vitest'
import { catalog, loadCatalog } from './catalog'
import { CATALOG_PAGE_SIZE, getCatalogPage } from './catalog-browser'

beforeAll(() => loadCatalog())

describe('catalog browser', () => {
  it('paginates one category without rendering the full collection', () => {
    const result = getCatalogPage(catalog, 'essay', '', 1)
    const essayCount = catalog.filter((item) => item.kind === 'essay').length

    expect(result.items).toHaveLength(CATALOG_PAGE_SIZE)
    expect(result.total).toBe(essayCount)
    expect(result.page).toBe(1)
    expect(result.pageCount).toBe(Math.ceil(essayCount / CATALOG_PAGE_SIZE))
    expect(result.items.every((item) => item.kind === 'essay')).toBe(true)
  })

  it('searches titles, authors, and descriptions case-insensitively', () => {
    const byTitle = getCatalogPage(catalog, 'poem', 'OZYMANDIAS', 1)
    const byAuthor = getCatalogPage(catalog, 'story', 'hawthorne', 1)
    const byDescription = getCatalogPage(catalog, 'essay', 'philosophy', 1)

    expect(byTitle.items.some((item) => item.title === 'Ozymandias')).toBe(true)
    expect(byAuthor.items.some((item) => item.author.includes('Hawthorne'))).toBe(true)
    expect(byDescription.total).toBeGreaterThan(0)
  })

  it('clamps requested pages to the available result set', () => {
    const result = getCatalogPage(catalog, 'story', 'Canterville Ghost', 99)

    expect(result.total).toBeGreaterThan(0)
    expect(result.page).toBe(result.pageCount)
  })

  it('sorts works by estimated reading time in either direction', () => {
    const shortest = getCatalogPage(catalog, 'essay', '', 1, 24, 'time-asc')
    const longest = getCatalogPage(catalog, 'essay', '', 1, 24, 'time-desc')

    expect(shortest.items[0].minutes).toBeLessThanOrEqual(shortest.items[1].minutes)
    expect(longest.items[0].minutes).toBeGreaterThanOrEqual(longest.items[1].minutes)
    expect(shortest.items[0].minutes).toBeLessThan(longest.items[0].minutes)
  })
})
