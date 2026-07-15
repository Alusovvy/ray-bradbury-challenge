import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const CATALOG_URL = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv'
const OUTPUT_PATH = resolve('src/catalog.enc.json')
const INPUT_PATH = resolve(process.argv[2] || 'pg_catalog.csv')
const KEY = Buffer.from(
  ['5xJ2wpTWcQ4', 'NjGWLoUMFZj', 'DDxupp+SIIu', '1zJU3lFUF8='].join(''),
  'base64',
)
const TARGETS = { essay: 666, poem: 667, story: 667 }
const LEGACY_GUTENBERG_IDS = new Set([
  'essay-civil-disobedience-gutenberg',
  'poem-reading-gaol-gutenberg',
  'poem-ancient-mariner-gutenberg',
  'story-sleepy-hollow-gutenberg',
  'story-canterville-ghost-gutenberg',
])

const CATEGORY_NAMES = {
  essay: 'Category: Essays, Letters & Speeches',
  poem: 'Category: Poetry',
  story: 'Category: Short Stories',
}

const FALLBACK_DESCRIPTIONS = {
  essay: 'A landmark public-domain essay chosen for its enduring ideas and distinctive voice.',
  poem: 'A celebrated public-domain poem chosen for its memorable language and imagery.',
  story: 'A classic public-domain short story chosen for its craft, atmosphere, and lasting appeal.',
}

function parseCsv(input) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [headers, ...records] = rows
  return records
    .filter((values) => values.length === headers.length)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])))
}

async function getCatalogCsv() {
  if (existsSync(INPUT_PATH)) return readFileSync(INPUT_PATH, 'utf8')

  console.log(`Downloading the official Project Gutenberg catalog from ${CATALOG_URL}`)
  const response = await fetch(CATALOG_URL)
  if (!response.ok) throw new Error(`Catalog download failed with ${response.status}`)
  const input = await response.text()
  writeFileSync(INPUT_PATH, input)
  return input
}

function decryptExistingCatalog() {
  if (!existsSync(OUTPUT_PATH)) return []
  const payload = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'))
  const encrypted = Buffer.from(payload.ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(payload.iv, 'base64'))
  decipher.setAuthTag(encrypted.subarray(-16))
  const decrypted = Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)),
    decipher.final(),
  ])
  const plaintext = payload.compression === 'gzip' ? gunzipSync(decrypted) : decrypted
  return JSON.parse(plaintext.toString('utf8'))
}

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function displayAuthor(authors) {
  const primary = cleanText(authors.split(';')[0])
    .replace(/\s*\[[^\]]+]\s*/g, '')
    .replace(/,?\s+\d{3,4}\??(?:\s+BCE)?-\d{2,4}\??(?:\s+BCE)?\.?$/i, '')
  const parts = primary.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return primary || 'Unknown author'
  return `${parts.slice(1).join(' ')} ${parts[0]}`
}

function normalize(value) {
  return cleanText(value)
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getDeathYears(authors) {
  return [...authors.matchAll(/-\s*(\d{3,4})\??(?!\s*BCE)/gi)].map((match) => Number(match[1]))
}

function isEligible(row, kind) {
  if (row.Type !== 'Text') return false
  if (!row.Language.split(';').map((language) => language.trim()).includes('en')) return false
  if (!row.Bookshelves.includes(CATEGORY_NAMES[kind])) return false

  const deathYears = getDeathYears(row.Authors)
  if (deathYears.length === 0 || deathYears.some((year) => year > 1955)) return false

  const title = cleanText(row.Title)
  const metadata = `${title}; ${row.Subjects}`
  if (!title || !row.Authors) return false
  if (/\b(index|bibliograph|catalogue?|dictionary|encyclop|periodical|magazine|journal|bulletin|proceedings|directory)\b/i.test(title)) return false
  if (/\b(volume|vol\.)\s+(?:[ivxlcdm]+|\d+)\b/i.test(title)) return false
  if (/history and criticism|bibliography/i.test(row.Subjects)) return false

  if (kind === 'essay') {
    return /essay|critici|philosoph|aestheti|ethics|conduct of life|political science|natural history|social question|literature/i.test(metadata)
  }
  if (kind === 'poem') {
    return !/\b(introduction|study|history|handbook|manual)\b/i.test(title)
  }
  return true
}

function subjectTopic(subjects, kind) {
  const generic = /^(poetry|poems|short stories|essays|english literature|american literature|fiction)$/i
  const candidates = subjects
    .split(';')
    .map(cleanText)
    .map((subject) => subject
      .replace(/\s*--\s*(fiction|poetry|juvenile fiction|translations into english)$/i, '')
      .replace(/\s*--\s*/g, ', ')
      .replace(/\b\d{3,4}(?:-\d{2,4})?\b/g, '')
      .replace(/,?\s*Early works to\s*$/i, '')
      .replace(/[.;]+/g, '')
      .replace(/\s*,(?:\s*,)+/g, ',')
      .replace(/,\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((subject) => subject && !generic.test(subject) && subject.length <= 95)

  const topic = candidates[0]
  if (!topic) return undefined
  if (kind === 'essay') return `A classic essay exploring ${topic}.`
  if (kind === 'poem') return `Classic verse shaped by themes of ${topic}.`
  return `Classic short fiction centered on ${topic}.`
}

function estimateMinutes(title, kind, numericId) {
  const collection = /\b(complete|collected|works|poems|stories|tales|fables|essays|verses|anthology)\b/i.test(title)
  const base = kind === 'poem' ? (collection ? 70 : 18) : kind === 'story' ? (collection ? 120 : 45) : (collection ? 90 : 35)
  return base + (numericId % (kind === 'poem' ? 11 : 21))
}

function fromGutenbergRow(row, kind) {
  const numericId = Number(row['Text#'])
  const title = cleanText(row.Title)
  return {
    id: `${kind}-gutenberg-${numericId}`,
    kind,
    title,
    author: displayAuthor(row.Authors),
    description: subjectTopic(row.Subjects, kind) || FALLBACK_DESCRIPTIONS[kind],
    minutes: estimateMinutes(title, kind, numericId),
    source: 'gutenberg',
    readerUrl: `https://www.gutenberg.org/cache/epub/${numericId}/pg${numericId}-images.html`,
    sourceUrl: `https://www.gutenberg.org/ebooks/${numericId}`,
  }
}

function prepareSeed(item) {
  return {
    ...item,
    description: item.description || FALLBACK_DESCRIPTIONS[item.kind],
  }
}

function buildCatalog(rows, existing) {
  const preserved = existing
    .filter((item) => item.source !== 'gutenberg' || LEGACY_GUTENBERG_IDS.has(item.id))
    .map(prepareSeed)
  const result = [...preserved]
  const keys = new Set(result.map((item) => `${item.kind}:${normalize(item.title)}:${normalize(item.author)}`))

  for (const kind of Object.keys(TARGETS)) {
    const candidates = rows
      .filter((row) => isEligible(row, kind))
      .sort((left, right) => Number(left['Text#']) - Number(right['Text#']))

    for (const row of candidates) {
      if (result.filter((item) => item.kind === kind).length >= TARGETS[kind]) break
      const item = fromGutenbergRow(row, kind)
      const legacy = preserved.find((candidate) => candidate.sourceUrl === item.sourceUrl)
      const nextItem = legacy || item
      const key = `${kind}:${normalize(nextItem.title)}:${normalize(nextItem.author)}`
      if (keys.has(key)) continue
      keys.add(key)
      result.push(nextItem)
    }

    const count = result.filter((item) => item.kind === kind).length
    if (count !== TARGETS[kind]) {
      throw new Error(`Only found ${count} eligible ${kind} works; expected ${TARGETS[kind]}`)
    }
  }

  return result.sort((left, right) => {
    const kindOrder = Object.keys(TARGETS).indexOf(left.kind) - Object.keys(TARGETS).indexOf(right.kind)
    return kindOrder || left.title.localeCompare(right.title, 'en')
  })
}

function encryptCatalog(catalog) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const compressed = gzipSync(JSON.stringify(catalog), { level: 9 })
  const ciphertext = Buffer.concat([
    cipher.update(compressed),
    cipher.final(),
    cipher.getAuthTag(),
  ])
  return {
    version: 1,
    algorithm: 'AES-GCM',
    compression: 'gzip',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

const input = await getCatalogCsv()
const rows = parseCsv(input)
const catalog = buildCatalog(rows, decryptExistingCatalog())
writeFileSync(OUTPUT_PATH, `${JSON.stringify(encryptCatalog(catalog), null, 2)}\n`)

const counts = Object.fromEntries(
  Object.keys(TARGETS).map((kind) => [kind, catalog.filter((item) => item.kind === kind).length]),
)
console.log(`Encrypted ${catalog.length.toLocaleString('en-US')} works to ${OUTPUT_PATH}`)
console.log(counts)
