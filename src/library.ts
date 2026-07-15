import DOMPurify from 'dompurify'
import type { CatalogItem } from './types'

interface ParseResponse {
  error?: { info?: string }
  parse?: { text?: string }
}

const WIKISOURCE_API = 'https://en.wikisource.org/w/api.php'
const WIKISOURCE_ORIGIN = 'https://en.wikisource.org'

const REMOVE_SELECTORS = [
  'script',
  'style',
  'link',
  '.mw-editsection',
  '.mw-empty-elt',
  '.pagenum',
  '.ws-pagenum',
  '.pagebreak',
  '.ws-noexport',
  '.noprint',
  '.metadata',
  '.ambox',
  '.ws-header',
  '.licenseContainer',
  '.printfooter',
  '.catlinks',
  '.navbox',
  'noscript',
].join(',')

function prepareWikisourceHtml(rawHtml: string): string {
  const document = new DOMParser().parseFromString(rawHtml, 'text/html')
  document.querySelectorAll(REMOVE_SELECTORS).forEach((node) => node.remove())

  document.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
    node.removeAttribute('style')
  })

  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href')
    if (href?.startsWith('/')) link.href = `${WIKISOURCE_ORIGIN}${href}`
    link.target = '_blank'
    link.rel = 'noreferrer noopener'
  })

  document.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const src = image.getAttribute('src')
    if (src?.startsWith('//')) image.src = `https:${src}`
    if (src?.startsWith('/')) image.src = `${WIKISOURCE_ORIGIN}${src}`
    image.loading = 'lazy'
  })

  return DOMPurify.sanitize(document.body.innerHTML, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'iframe'],
    FORBID_ATTR: ['srcset'],
  })
}

export function getLibraryName(item: CatalogItem): string {
  return item.source === 'gutenberg' ? 'Project Gutenberg' : 'Wikisource'
}

export function getSourceUrl(item: CatalogItem): string {
  if (item.source === 'gutenberg') return item.sourceUrl ?? 'https://www.gutenberg.org/'
  if (!item.pageTitle) return WIKISOURCE_ORIGIN
  return `${WIKISOURCE_ORIGIN}/wiki/${encodeURIComponent(item.pageTitle.replaceAll(' ', '_'))}`
}

export function getFullReaderUrl(item: CatalogItem): string {
  return `${import.meta.env.BASE_URL}?read=${encodeURIComponent(item.id)}`
}

export async function fetchLibraryPage(
  item: CatalogItem,
  signal?: AbortSignal,
): Promise<string> {
  if (item.source === 'gutenberg') {
    throw new Error('Project Gutenberg editions are displayed in their official reader')
  }
  if (!item.pageTitle) throw new Error('This work has no Wikisource page configured')

  const params = new URLSearchParams({
    action: 'parse',
    page: item.pageTitle,
    prop: 'text',
    redirects: '1',
    disableeditsection: '1',
    format: 'json',
    formatversion: '2',
    origin: '*',
  })

  const response = await fetch(`${WIKISOURCE_API}?${params}`, { signal })
  if (!response.ok) throw new Error(`Wikisource returned ${response.status}`)

  const data = (await response.json()) as ParseResponse
  if (data.error || !data.parse?.text) {
    throw new Error(data.error?.info ?? 'This text is not available')
  }

  return prepareWikisourceHtml(data.parse.text)
}
