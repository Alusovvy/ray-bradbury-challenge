import encryptedPayload from './catalog.enc.json'
import {
  CONTENT_KINDS,
  type CatalogItem,
  type ContentKind,
  type LibrarySource,
} from './types'

interface EncryptedCatalogPayload {
  version: number
  algorithm: string
  iv: string
  ciphertext: string
}

const KEY_FRAGMENTS = ["5xJ2wpTWcQ4","NjGWLoUMFZj","DDxupp+SIIu","1zJU3lFUF8="]

export const catalog: CatalogItem[] = []
export const catalogById = new Map<string, CatalogItem>()

let catalogPromise: Promise<void> | undefined

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isCatalogItem(value: unknown): value is CatalogItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CatalogItem>
  const source = item.source as LibrarySource | undefined
  const hasCoreFields =
    typeof item.id === 'string' &&
    CONTENT_KINDS.includes(item.kind as ContentKind) &&
    typeof item.title === 'string' &&
    typeof item.author === 'string' &&
    typeof item.minutes === 'number' &&
    Number.isFinite(item.minutes) &&
    item.minutes > 0 &&
    (source === undefined || source === 'wikisource' || source === 'gutenberg') &&
    isOptionalString(item.pageTitle) &&
    isOptionalString(item.readerUrl) &&
    isOptionalString(item.sourceUrl)

  if (!hasCoreFields) return false
  if (source === 'gutenberg') return Boolean(item.readerUrl && item.sourceUrl)
  return Boolean(item.pageTitle)
}

async function decryptCatalog(payload: EncryptedCatalogPayload): Promise<CatalogItem[]> {
  if (payload.version !== 1 || payload.algorithm !== 'AES-GCM') {
    throw new Error('Unsupported encrypted catalog format')
  }

  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase64(KEY_FRAGMENTS.join('')),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64(payload.iv) },
    key,
    decodeBase64(payload.ciphertext),
  )
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted))

  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isCatalogItem)) {
    throw new Error('Decrypted catalog failed validation')
  }

  const ids = new Set(parsed.map((item) => item.id))
  if (ids.size !== parsed.length) throw new Error('Decrypted catalog contains duplicate IDs')

  for (const kind of CONTENT_KINDS) {
    if (!parsed.some((item) => item.kind === kind)) {
      throw new Error(`Decrypted catalog has no ${kind} entries`)
    }
  }

  return parsed
}

export async function loadCatalog(): Promise<void> {
  if (catalog.length > 0) return
  catalogPromise ??= decryptCatalog(encryptedPayload as EncryptedCatalogPayload).then((items) => {
    catalog.push(...items)
    for (const item of items) catalogById.set(item.id, item)
  })
  return catalogPromise
}
