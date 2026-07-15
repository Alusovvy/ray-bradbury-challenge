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
const STRUCTURAL_TITLE = /^(?:contents?|table of contents|preface|introduction|foreword|afterword|list of illustrations|chapter [\divxlcdm]+|act [\divxlcdm]+|book [\divxlcdm]+|part [\divxlcdm]+)$/i
const COLLECTION_TITLE = /\b(stories|tales|fables|sketches|adventures|complete|collected|short works|anthology|fairy tales|legends|instances|episodes)\b/i

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
const invalidLongStories = stories.filter((item) => item.minutes > MAX_STORY_MINUTES)
const structuralEntries = stories.filter((item) => STRUCTURAL_TITLE.test(item.title.trim()))
const unresolvedCollections = stories.filter((item) => COLLECTION_TITLE.test(item.title))
const duplicateIds = catalog.filter(
  (item, index) => catalog.findIndex((candidate) => candidate.id === item.id) !== index,
)

const summary = {
  totalWorks: catalog.length,
  storyWorks: stories.length,
  longestStoryMinutes: Math.max(...stories.map((item) => item.minutes)),
  storiesAtMost30Minutes: stories.filter((item) => item.minutes <= 30).length,
  storiesAtMost60Minutes: stories.filter((item) => item.minutes <= 60).length,
  storiesOver120Minutes: stories.filter((item) => item.minutes > 120).length,
  structuralEntries: structuralEntries.length,
  unresolvedCollections: unresolvedCollections.length,
  duplicateIds: duplicateIds.length,
}

console.log('Catalog audit', summary)
console.table(
  [...stories]
    .sort((left, right) => right.minutes - left.minutes)
    .slice(0, Number(process.argv[2] || 20))
    .map(({ title, author, minutes, readerUrl }) => ({ title, author, minutes, readerUrl })),
)

if (
  invalidLongStories.length ||
  structuralEntries.length ||
  unresolvedCollections.length ||
  duplicateIds.length
) {
  console.error({ invalidLongStories, structuralEntries, unresolvedCollections, duplicateIds })
  process.exitCode = 1
}
