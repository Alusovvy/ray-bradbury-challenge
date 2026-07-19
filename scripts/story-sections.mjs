import { load } from 'cheerio'

const COLLECTION_TITLES = {
  essay: /\b(essays|papers|addresses|speeches|lectures|letters|thoughts|reflections|discourses|studies|reviews|sketches|miscellan(?:y|ies))\b/i,
  poem: /\b(poems|poetry|verse|verses|ballads|songs|sonnets|rhymes|lyrics|works|anthology|collection)\b/i,
  story: /\b(stories|tales|fables|sketches|adventures|complete|collected|short works|anthology|fairy tales|legends|instances|episodes)\b/i,
}
const NON_STORY_HEADING = /^(contents?|table of contents|author'?s note|about the author|acknowledg(?:e)?ments?|addenda|copyright|credits?|errata|glossary|index|illustrations?|list of|no\.?\s+[ivxlcdm\d]+\.?$|notes?|transcriber'?s notes?|bibliography|appendix|the full project gutenberg|project gutenberg|volume\b|book\b|part\b|chapters?\b|canto(?:\s+[ivxlcdm\d]+|\s+the\s+\w+)?\b|section\s+[ivxlcdm\d]+\b|scene\s+[ivxlcdm\d]+\b|act\s+[ivxlcdm\d]+\b|prologue\b|epilogue\b|dedication\b|envoi\b|explanatory\b|(and\s+)?other stories\b)|\b(preface|introduction|introductory|foreword|afterword)\b/i
const WORDS_PER_MINUTE = 225

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalize(value) {
  return cleanText(value)
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function cleanHeading($, element) {
  const clone = $(element).clone()
  clone.find('.pagenum, .indexpageno, .pb, .subtitle, .byline').remove()
  return cleanText(clone.text())
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .replace(/\s+\d+\s*$/g, '')
    .trim()
}

function isWorkTitle(title, bookTitle, author) {
  const bookTitleKey = normalize(bookTitle)
  const authorKey = normalize(author)
  if (title.length < 2 || title.length > 160) return false
  if (NON_STORY_HEADING.test(title)) return false
  const titleKey = normalize(title)
  if (!titleKey || titleKey.length < 3 || titleKey === bookTitleKey) return false
  if (authorKey && (titleKey === authorKey || authorKey.includes(titleKey))) return false
  const authorSurname = authorKey.split(' ').at(-1)
  if (authorSurname && titleKey.split(' ').includes(authorSurname) && titleKey.length < 40) return false
  if (bookTitleKey.includes(titleKey) && titleKey.length > 18) return false
  if (/^(by|edited by|translated by)\b/i.test(title)) return false
  if (/^\[\s*\d+\s*]$/.test(title)) return false
  if (/^[,;]/.test(title)) return false
  if (/\bline\s+\d+\s+from\s+(?:the\s+)?(?:top|bottom)\b/i.test(title)) return false
  if (/^[-\u2013\u2014]{2,}\s*from\b/i.test(title)) return false
  if (/^\d+\s*(?:\[[ivxlcdm]+])?$/i.test(title)) return false
  if (/^\(\s*\d+\s*\)$/.test(title)) return false
  if (/\{\s*\d+\s*}$/.test(title)) return false
  if (/^[ivxlcdm\d .-]+$/i.test(title)) return false
  return true
}

function isReferenceElement($, element) {
  let current = element
  while (current && current.type !== 'root') {
    const marker = `${$(current).attr('id') ?? ''} ${$(current).attr('class') ?? ''}`.toLowerCase()
    if (/footnote|fnanchor|illustration|caption/.test(marker)) return true
    if (current.tagName === 'figure' || current.tagName === 'figcaption') return true
    current = current.parent
  }
  return false
}

function countWords(value) {
  const words = cleanText(value).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)
  return words?.length ?? 0
}

function getAnchor($, element, title) {
  const ownId = $(element).attr('id') || $(element).attr('name')
  const childId = $(element).find('[id], [name]').first().attr('id') ||
    $(element).find('[id], [name]').first().attr('name')
  const previousId = $(element).prev('[id], [name]').attr('id') ||
    $(element).prev('[id], [name]').attr('name')
  const id = ownId || childId || previousId
  return id ? `#${encodeURIComponent(id)}` : `#:~:text=${encodeURIComponent(title)}`
}

function findCandidates($, bookTitle, author, level) {
  return $(`body ${level}`)
    .toArray()
    .filter((element) => !$(element).closest('#pg-header, #pg-footer, .pg-boilerplate').length)
    .map((element) => ({
      element,
      title: cleanHeading($, element),
    }))
    .filter(({ title }) => isWorkTitle(title, bookTitle, author))
}

function sectionWordCounts($, candidates) {
  const candidateIndexes = new Map(candidates.map((candidate, index) => [candidate.element, index]))
  const textBySection = candidates.map(() => [])
  let activeIndex = -1

  function visit(node) {
    const candidateIndex = candidateIndexes.get(node)
    if (candidateIndex !== undefined) activeIndex = candidateIndex

    if (node.type === 'text' && activeIndex >= 0) {
      textBySection[activeIndex].push(node.data)
    }

    for (const child of node.children ?? []) visit(child)
  }

  const body = $('body').get(0)
  if (body) visit(body)
  return textBySection.map((parts) => countWords(parts.join(' ')))
}

function chooseCandidateLevel($, bookTitle, author, minimumWords) {
  const levels = ['h1', 'h2', 'h3', 'h4']
    .map((level) => {
      const candidates = findCandidates($, bookTitle, author, level)
      const wordCounts = sectionWordCounts($, candidates)
      const usable = candidates
        .map((candidate, index) => ({ ...candidate, wordCount: wordCounts[index] }))
        .filter((candidate) => candidate.wordCount >= minimumWords)
      return { level, candidates: usable }
    })
    .filter((result) => result.candidates.length >= 2)

  if (levels.length === 0) return []
  levels.sort((left, right) => {
    return Number(left.level.slice(1)) - Number(right.level.slice(1)) ||
      right.candidates.length - left.candidates.length
  })
  return levels[0].candidates
}

function getLinkedContentsCandidates($, bookTitle, author, minimumWords) {
  const elements = $('body *').toArray()
  const positions = new Map(elements.map((element, index) => [element, index]))
  const targets = new Map()
  for (const element of elements) {
    const id = $(element).attr('id') || $(element).attr('name')
    if (id && !targets.has(id)) targets.set(id, element)
  }

  const candidates = []
  const usedTargets = new Set()
  for (const link of $('body a[href^="#"]').toArray()) {
    const href = $(link).attr('href')
    const targetId = href ? decodeURIComponent(href.slice(1)) : ''
    const target = targets.get(targetId)
    if (!target || usedTargets.has(target)) continue
    if (/footnote|fnanchor|^fn\d|^note\d|^illus|citation|_t$/i.test(targetId)) continue
    if (isReferenceElement($, link) || isReferenceElement($, target)) continue
    if ((positions.get(link) ?? Infinity) >= (positions.get(target) ?? -1)) continue

    let title = cleanText($(link).text())
    if (/^[\d\divxlcdm .-]+$/i.test(title)) {
      const row = $(link).closest('tr').clone()
      row.find('a, .pagenum, .indexpageno').remove()
      title = cleanText(row.text()).replace(/\bpage\.?$/i, '').trim()
    }
    title = title.replace(/^\.+\s*/, '').trim()
    if (!isWorkTitle(title, bookTitle, author)) continue

    usedTargets.add(target)
    candidates.push({ element: target, title })
  }

  candidates.sort((left, right) => (positions.get(left.element) ?? 0) - (positions.get(right.element) ?? 0))
  const wordCounts = sectionWordCounts($, candidates)
  return candidates
    .map((candidate, index) => ({ ...candidate, wordCount: wordCounts[index] }))
    .filter((candidate) => candidate.wordCount >= minimumWords)
}

export function looksLikeStoryCollection(title) {
  return looksLikeWorkCollection(title, 'story')
}

export function looksLikeWorkCollection(title, kind) {
  return COLLECTION_TITLES[kind]?.test(title) ?? false
}

export function extractWholeBookMinutes(html) {
  const $ = load(html)
  $('#pg-header, #pg-footer, .pg-boilerplate, script, style, nav').remove()
  const words = countWords($('body').text())
  return Math.max(2, Math.ceil(words / WORDS_PER_MINUTE))
}

export function extractStorySections(html, { bookTitle, author = '', readerUrl }) {
  return extractWorkSections(html, {
    author,
    bookTitle,
    kind: 'story',
    minimumWords: 250,
    readerUrl,
  })
}

export function extractWorkSections(
  html,
  { bookTitle, author = '', kind, minimumWords = 250, readerUrl },
) {
  const $ = load(html)
  $('#pg-header, #pg-footer, .pg-boilerplate, script, style, nav').remove()
  const linkedContents = getLinkedContentsCandidates($, bookTitle, author, minimumWords)
  const candidates = linkedContents.length >= 2
    ? linkedContents
    : chooseCandidateLevel($, bookTitle, author, minimumWords)
  const collectionExpected = looksLikeWorkCollection(bookTitle, kind)

  if (!collectionExpected && candidates.length < 3) return []
  if (candidates.length < 2) return []

  return candidates.map((candidate) => ({
    title: candidate.title,
    wordCount: candidate.wordCount,
    minutes: Math.max(2, Math.ceil(candidate.wordCount / WORDS_PER_MINUTE)),
    readerUrl: `${readerUrl}${getAnchor($, candidate.element, candidate.title)}`,
  }))
}

export function looksLikeUnsplitCollection(html) {
  const $ = load(html)
  $('#pg-header, #pg-footer, .pg-boilerplate, script, style, nav').remove()
  const repeatedFirstChapters = $('body h1, body h2, body h3, body h4')
    .toArray()
    .filter((element) => /^(?:chapter\s+)?(?:i|1)[.\s-]*$/i.test(cleanHeading($, element)))
  return repeatedFirstChapters.length >= 2
}
