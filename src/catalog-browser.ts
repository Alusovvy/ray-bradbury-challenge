import type { CatalogItem, ContentKind } from './types'

export const CATALOG_PAGE_SIZE = 24
export const CATALOG_SORTS = ['title', 'time-asc', 'time-desc'] as const
export type CatalogSort = (typeof CATALOG_SORTS)[number]

export interface CatalogPage {
  items: CatalogItem[]
  page: number
  pageCount: number
  total: number
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function getCatalogPage(
  items: CatalogItem[],
  kind: ContentKind,
  query: string,
  requestedPage: number,
  pageSize = CATALOG_PAGE_SIZE,
  sort: CatalogSort = 'title',
): CatalogPage {
  const search = normalizeSearch(query.trim())
  const filtered = items.filter((item) => {
    if (item.kind !== kind) return false
    if (!search) return true
    return normalizeSearch(`${item.title} ${item.author} ${item.description}`).includes(search)
  })
  filtered.sort((left, right) => {
    const titleOrder = left.title.localeCompare(right.title, 'en')
    if (sort === 'time-asc') return left.minutes - right.minutes || titleOrder
    if (sort === 'time-desc') return right.minutes - left.minutes || titleOrder
    return titleOrder || left.author.localeCompare(right.author, 'en')
  })

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const start = (page - 1) * pageSize

  return {
    items: filtered.slice(start, start + pageSize),
    page,
    pageCount,
    total: filtered.length,
  }
}
