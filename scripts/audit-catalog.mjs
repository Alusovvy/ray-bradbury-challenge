import { createDecipheriv } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const CATALOG_PATH = resolve('src/catalog.enc.json')
const KEY = Buffer.from(
  ['5xJ2wpTWcQ4', 'NjGWLoUMFZj', 'DDxupp+SIIu', '1zJU3lFUF8='].join(''),
  'base64',
)
const MAX_STORY_MINUTES = 180
const STRUCTURAL_TITLE = /^(?:\[\s*\d+\s*]|\(\s*\d+\s*\)|\[pg\s+\d+].*|\d+\s*(?:\[[ivxlcdm]+])?|[,;].*|[-\u2013\u2014]{2,}\s*from\b.*|.*\{\s*\d+\s*}|contents?|table of contents|about the author|acknowledg(?:e)?ments?|addenda|copyright|credits?|errata|glossary|no\.?\s+[ivxlcdm\d]+\.?|preface|introduction|foreword|afterword|prologue|epilogue|dedication|envoi|list of illustrations|chapter [\divxlcdm]+|act [\divxlcdm]+|book [\divxlcdm]+|part [\divxlcdm]+|canto(?: [\divxlcdm]+| the [a-z]+)?|section [\divxlcdm]+|scene [\divxlcdm]+)$/i
const COLLECTION_TITLE = /\b(stories|tales|fables|sketches|adventures|complete|collected|short works|anthology|fairy tales|legends|instances|episodes)\b/i
const SHORT_FORM_COLLECTION_TITLES = {
  essay: /\b(essays|papers|addresses|speeches|lectures|letters|thoughts|reflections|discourses|studies|reviews|sketches|miscellan(?:y|ies))\b/i,
  poem: /\b(poems|poetry|verse|verses|ballads|songs|sonnets|rhymes|lyrics|works|anthology|collection)\b/i,
}

function normalize(value) {
  return value
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the\s+/, '')
}

function decryptCatalog() {
  const payload = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  const decipher = createDecipheriv(
    'aes-256-gcm',
    KEY,
    Buffer.from(payload.iv, 'base64'),
  )
  const encrypted = Buffer.from(payload.ciphertext, 'base64')
  const ciphertext = encrypted.subarray(0, -16)
  decipher.setAuthTag(encrypted.subarray(-16))

  const compressed = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return JSON.parse(gunzipSync(compressed))
}

const catalog = decryptCatalog()
const stories = catalog.filter((item) => item.kind === 'story')
const essays = catalog.filter((item) => item.kind === 'essay')
const poems = catalog.filter((item) => item.kind === 'poem')
const invalidLongStories = stories.filter((item) => item.minutes > MAX_STORY_MINUTES)
const structuralEntries = catalog.filter((item) => STRUCTURAL_TITLE.test(item.title.trim()))
const unresolvedCollections = stories.filter((item) => COLLECTION_TITLE.test(item.title))
const unresolvedShortFormCollections = [...essays, ...poems].filter((item) =>
  SHORT_FORM_COLLECTION_TITLES[item.kind].test(item.title),
)
const duplicateIds = catalog.filter(
  (item, index) => catalog.findIndex((candidate) => candidate.id === item.id) !== index,
)
const seenWorks = new Set()
const duplicateWorks = [...essays, ...poems].filter((item) => {
  const key = `${item.kind}:${normalize(item.title)}:${normalize(item.author)}`
  if (seenWorks.has(key)) return true
  seenWorks.add(key)
  return false
})

const summary = {
  totalWorks: catalog.length,
  essayWorks: essays.length,
  essaysAtMost30Minutes: essays.filter((item) => item.minutes <= 30).length,
  poemWorks: poems.length,
  poemsAtMost30Minutes: poems.filter((item) => item.minutes <= 30).length,
  storyWorks: stories.length,
  longestStoryMinutes: Math.max(...stories.map((item) => item.minutes)),
  storiesAtMost30Minutes: stories.filter((item) => item.minutes <= 30).length,
  storiesAtMost60Minutes: stories.filter((item) => item.minutes <= 60).length,
  storiesOver120Minutes: stories.filter((item) => item.minutes > 120).length,
  structuralEntries: structuralEntries.length,
  unresolvedCollections: unresolvedCollections.length,
  unresolvedShortFormCollections: unresolvedShortFormCollections.length,
  duplicateIds: duplicateIds.length,
  duplicateWorks: duplicateWorks.length,
}

console.log('Catalog audit', summary)
const requestedKind = ['essay', 'poem', 'story'].includes(process.argv[2])
  ? process.argv[2]
  : 'story'
const requestedSort = process.argv[3] === 'shortest' ? 'shortest' : 'longest'
const requestedLimit = Number(process.argv[4] || (requestedKind === 'story' ? process.argv[2] : 20)) || 20
console.table(
  catalog
    .filter((item) => item.kind === requestedKind)
    .sort((left, right) => requestedSort === 'shortest'
      ? left.minutes - right.minutes || left.title.localeCompare(right.title, 'en')
      : right.minutes - left.minutes || left.title.localeCompare(right.title, 'en'))
    .slice(0, requestedLimit)
    .map(({ title, author, minutes, readerUrl }) => ({ title, author, minutes, readerUrl })),
)

if (
  invalidLongStories.length ||
  structuralEntries.length ||
  unresolvedCollections.length ||
  unresolvedShortFormCollections.length ||
  duplicateIds.length ||
  duplicateWorks.length
) {
  console.error({
    duplicateIds,
    duplicateWorks,
    invalidLongStories,
    structuralEntries,
    unresolvedCollections,
    unresolvedShortFormCollections,
  })
  process.exitCode = 1
}
