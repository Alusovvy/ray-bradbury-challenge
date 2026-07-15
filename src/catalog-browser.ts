import type { CatalogItem, ContentKind } from './types'

export const CATALOG_PAGE_SIZE = 24

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
): CatalogPage {
  const search = normalizeSearch(query.trim())
  const filtered = items.filter((item) => {
    if (item.kind !== kind) return false
    if (!search) return true
    return normalizeSearch(`${item.title} ${item.author} ${item.description}`).includes(search)
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
