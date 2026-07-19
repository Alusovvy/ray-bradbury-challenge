import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  extractStorySections,
  extractWorkSections,
  extractWholeBookMinutes,
  looksLikeStoryCollection,
  looksLikeUnsplitCollection,
  looksLikeWorkCollection,
} from './story-sections.mjs'

const CATALOG_URL = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv'
const OUTPUT_PATH = resolve('src/catalog.enc.json')
const INPUT_PATH = resolve(process.argv[2] || 'pg_catalog.csv')
const GUTENBERG_CACHE_PATH = resolve('.catalog-cache')
const KEY = Buffer.from(
  ['5xJ2wpTWcQ4', 'NjGWLoUMFZj', 'DDxupp+SIIu', '1zJU3lFUF8='].join(''),
  'base64',
)
const TARGETS = { essay: 666, poem: 667, story: 667 }
const MIN_SHORT_WORKS = { essay: 104, poem: 512 }
const MAX_REFINED_WORKS = { essay: 2_000, poem: 2_000 }
const MAX_SECTION_MINUTES = { essay: 180, poem: 60 }
const MIN_SECTION_WORDS = { essay: 1_350, poem: 20 }
const MAX_STORY_MINUTES = 180
const EXCLUDED_STORY_EDITIONS = /entire project gutenberg|\bcomplete works\b|\bcollected works\b|\bthe works of\b|one volume edition|lock and key library|stories of all nations|best .* stories|famous stories|stories every child|selections from/i
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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the\s+/, '')
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
  if (EXCLUDED_STORY_EDITIONS.test(title)) return false
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

function titleCase(value) {
  const initialCapitalized = value.replace(
    /^(["'\u201c\u201d\u2018\u2019(\s-]*)([\p{L}])/u,
    (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('en')}`,
  )
  if (initialCapitalized !== initialCapitalized.toLocaleUpperCase('en')) return initialCapitalized
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor', 'of', 'on', 'or', 'the', 'to'])
  return initialCapitalized
    .toLocaleLowerCase('en')
    .split(/(\s+)/)
    .map((word, index, words) => {
      if (/^\s+$/.test(word)) return word
      if (index > 0 && index < words.length - 1 && smallWords.has(word)) return word
      return word.replace(/^([\p{L}\p{N}])|(-[\p{L}\p{N}])/gu, (letter) => letter.toLocaleUpperCase('en'))
    })
    .join('')
}

function cleanExtractedTitle(value, kind) {
  let title = cleanText(value)
    .replace(/^["'\u201c\u201d\u2018\u2019]\s*(?=\d+(?:\.\d+)*\.)/, '')
    .replace(/^(?:[ivxlcdm]+|\d+(?:\.\d+)*)\.\s*/i, '')
    .replace(/^[-\u2013\u2014]+\s*/, '')
    .replace(/(?<=[\p{L})"'\u2019\u201d])\d{1,3}$/u, '')
    .trim()

  if (kind === 'essay') {
    title = title
      .replace(/(?<=[\p{L})])\s*1[5-9]\d{2}(?:\s*;.*)?$/u, '')
      .trim()
  }

  return title || cleanText(value)
}

function isCleanSectionTitle(title, kind) {
  if (title.length < 2 || title.length > 160) return false
  if (/^(?:[,;.]|contents?|errata|addenda|notes?|appendix|bibliography)$/i.test(title)) return false
  return !looksLikeWorkCollection(title, kind)
}

function storySlug(value) {
  return normalize(value).replace(/\s+/g, '-').slice(0, 64) || 'story'
}

function collectionDescription(title, kind = 'story') {
  const cleanTitle = cleanText(title).replace(/[.!?]+$/g, '').slice(0, 120)
  const label = kind === 'essay' ? 'essay' : kind === 'poem' ? 'poem' : 'short story'
  return `A classic ${label} from the collection “${cleanTitle}”.`
}

function getGutenbergId(item) {
  return item.sourceUrl?.match(/\/ebooks\/(\d+)/)?.[1]
}

async function getGutenbergHtml(item) {
  const gutenbergId = getGutenbergId(item)
  if (!gutenbergId || !item.readerUrl) throw new Error(`Missing Gutenberg reader for ${item.id}`)
  const cacheDirectory = resolve(GUTENBERG_CACHE_PATH, `${item.kind}s`)
  mkdirSync(cacheDirectory, { recursive: true })
  const cachePath = resolve(cacheDirectory, `pg${gutenbergId}.html`)
  if (existsSync(cachePath)) return readFileSync(cachePath, 'utf8')

  const readerUrl = item.readerUrl.split('#')[0]
  const response = await fetch(readerUrl, {
    headers: { 'User-Agent': 'BradburyPracticeCatalogBuilder/1.0' },
  })
  if (!response.ok) throw new Error(`${readerUrl} returned ${response.status}`)
  const html = await response.text()
  writeFileSync(cachePath, html)
  return html
}

async function concurrentMap(items, concurrency, worker, label = 'Project Gutenberg editions') {
  const results = new Array(items.length)
  let cursor = 0
  let completed = 0

  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
      completed += 1
      if (completed % 25 === 0 || completed === items.length) {
        console.log(`Inspected ${completed}/${items.length} ${label}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, run))
  return results
}

async function refineEssayAndPoemCatalog(catalog) {
  const kinds = ['essay', 'poem']
  const fixedItems = catalog.filter(
    (item) => !kinds.includes(item.kind) || item.source !== 'gutenberg',
  )
  const editions = catalog.filter(
    (item) => kinds.includes(item.kind) && item.source === 'gutenberg',
  )
  const report = Object.fromEntries(kinds.map((kind) => [kind, {
    excludedCollections: 0,
    excludedLongSections: 0,
    failedEditions: 0,
    individualWorks: 0,
    splitEditions: 0,
    verifiedSingles: 0,
  }]))

  const expanded = await concurrentMap(editions, 6, async (item) => {
    const kindReport = report[item.kind]
    try {
      const html = await getGutenbergHtml(item)
      const isCollection = looksLikeWorkCollection(item.title, item.kind)
      const sections = isCollection
        ? extractWorkSections(html, {
            author: item.author,
            bookTitle: item.title,
            kind: item.kind,
            minimumWords: MIN_SECTION_WORDS[item.kind],
            readerUrl: item.readerUrl.split('#')[0],
          })
        : []
      const plausibleSections = sections
        .map((section) => ({
          ...section,
          title: cleanExtractedTitle(section.title, item.kind),
        }))
        .filter(
        (section) =>
          section.minutes <= MAX_SECTION_MINUTES[item.kind] &&
          isCleanSectionTitle(section.title, item.kind),
        )

      if (plausibleSections.length >= 2) {
        kindReport.splitEditions += 1
        kindReport.individualWorks += plausibleSections.length
        kindReport.excludedLongSections += sections.length - plausibleSections.length
        const usedIds = new Set()
        return plausibleSections.map((section, index) => {
          const sectionTitle = section.title
          let id = index === 0 ? item.id : `${item.id}-${storySlug(sectionTitle)}`
          if (usedIds.has(id)) id = `${id}-${index + 1}`
          usedIds.add(id)
          return {
            ...item,
            _catalogSection: true,
            id,
            title: titleCase(sectionTitle),
            description: collectionDescription(item.title, item.kind),
            minutes: section.minutes,
            readerUrl: section.readerUrl,
          }
        })
      }

      if (isCollection) {
        kindReport.excludedCollections += 1
        return []
      }

      kindReport.verifiedSingles += 1
      return [{ ...item, _catalogSection: false, minutes: extractWholeBookMinutes(html) }]
    } catch (error) {
      kindReport.failedEditions += 1
      console.warn(`Could not inspect ${item.id}: ${error instanceof Error ? error.message : error}`)
      return []
    }
  }, 'Project Gutenberg essay and poem editions')

  const deduplicated = []
  const workKeys = new Set()
  for (const item of [...fixedItems, ...expanded.flat()]) {
    const key = `${item.kind}:${normalize(item.title)}:${normalize(item.author)}`
    if (workKeys.has(key)) continue
    workKeys.add(key)
    deduplicated.push(item)
  }

  const result = deduplicated.filter((item) => !kinds.includes(item.kind))
  for (const kind of kinds) {
    const candidates = deduplicated.filter((item) => item.kind === kind)
    const preserved = candidates.filter((item) => !item._catalogSection)
    const sections = candidates
      .filter((item) => item._catalogSection)
      .sort((left, right) =>
        Number(left.minutes > 30) - Number(right.minutes > 30) ||
        left.minutes - right.minutes ||
        left.title.localeCompare(right.title, 'en'))
    const availableSlots = Math.max(0, MAX_REFINED_WORKS[kind] - preserved.length)
    result.push(...preserved, ...sections.slice(0, availableSlots))
  }

  for (const item of result) delete item._catalogSection
  const ids = new Set(result.map((item) => item.id))
  if (ids.size !== result.length) {
    throw new Error('Essay or poem splitting created duplicate catalog IDs')
  }

  for (const kind of kinds) {
    const shortCount = result.filter(
      (item) => item.kind === kind && item.minutes <= 30,
    ).length
    if (shortCount < MIN_SHORT_WORKS[kind]) {
      throw new Error(
        `Only found ${shortCount} ${kind} works at 30 minutes or less; expected at least ${MIN_SHORT_WORKS[kind]}`,
      )
    }
  }

  console.log('Essay and poem edition audit', report)
  return result.sort((left, right) => {
    const kindOrder = Object.keys(TARGETS).indexOf(left.kind) - Object.keys(TARGETS).indexOf(right.kind)
    return kindOrder || left.title.localeCompare(right.title, 'en')
  })
}

async function refineStoryCatalog(catalog) {
  const fixedItems = catalog.filter((item) => item.kind !== 'story' || item.source !== 'gutenberg')
  const storyEditions = catalog.filter((item) => item.kind === 'story' && item.source === 'gutenberg')
  const report = {
    splitEditions: 0,
    individualStories: 0,
    verifiedSingles: 0,
    excludedCollections: 0,
    excludedLongWorks: 0,
    failedEditions: 0,
  }

  const expanded = await concurrentMap(storyEditions, 4, async (item) => {
    try {
      const html = await getGutenbergHtml(item)
      const sections = extractStorySections(html, {
        bookTitle: item.title,
        author: item.author,
        readerUrl: item.readerUrl.split('#')[0],
      })

      const plausibleSections = sections
        .map((section) => ({
          ...section,
          title: cleanExtractedTitle(section.title, item.kind),
        }))
        .filter(
        (section) =>
          section.minutes <= MAX_STORY_MINUTES &&
          isCleanSectionTitle(section.title, item.kind) &&
          !looksLikeStoryCollection(section.title),
        )
      if (plausibleSections.length >= 2) {
        report.splitEditions += 1
        report.individualStories += plausibleSections.length
        report.excludedLongWorks += sections.length - plausibleSections.length
        const usedIds = new Set()
        return plausibleSections.map((section, index) => {
          const sectionTitle = section.title
          let id = index === 0 ? item.id : `${item.id}-${storySlug(sectionTitle)}`
          if (usedIds.has(id)) id = `${id}-${index + 1}`
          usedIds.add(id)
          return {
            ...item,
            id,
            title: titleCase(sectionTitle),
            description: collectionDescription(item.title),
            minutes: section.minutes,
            readerUrl: section.readerUrl,
          }
        })
      }

      if (looksLikeStoryCollection(item.title) || looksLikeUnsplitCollection(html)) {
        report.excludedCollections += 1
        return []
      }

      const minutes = extractWholeBookMinutes(html)
      if (minutes > MAX_STORY_MINUTES) {
        report.excludedLongWorks += 1
        return []
      }
      report.verifiedSingles += 1
      return [{ ...item, minutes }]
    } catch (error) {
      report.failedEditions += 1
      console.warn(`Could not inspect ${item.id}: ${error instanceof Error ? error.message : error}`)
      return []
    }
  }, 'Project Gutenberg story editions')

  const result = [...fixedItems, ...expanded.flat()]
  const ids = new Set(result.map((item) => item.id))
  if (ids.size !== result.length) throw new Error('Story splitting created duplicate catalog IDs')
  console.log('Story edition audit', report)
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
const baseCatalog = buildCatalog(rows, decryptExistingCatalog())
const shortFormCatalog = await refineEssayAndPoemCatalog(baseCatalog)
const catalog = await refineStoryCatalog(shortFormCatalog)
writeFileSync(OUTPUT_PATH, `${JSON.stringify(encryptCatalog(catalog), null, 2)}\n`)

const counts = Object.fromEntries(
  Object.keys(TARGETS).map((kind) => [kind, catalog.filter((item) => item.kind === kind).length]),
)
console.log(`Encrypted ${catalog.length.toLocaleString('en-US')} works to ${OUTPUT_PATH}`)
console.log(counts)
