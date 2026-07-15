import { catalog, catalogById } from './catalog'
import {
  CONTENT_KINDS,
  type CatalogItem,
  type ChallengeStats,
  type ChallengeStore,
  type ContentKind,
  type DailyChallenge,
  type DailySelections,
} from './types'

export const STORAGE_KEY = 'bradbury-practice-v1'
const RECENT_DAYS_TO_AVOID = 4
export function toLocalDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createEmptyStore(): ChallengeStore {
  return { version: 1, days: [] }
}

export function loadStore(raw: string | null): ChallengeStore {
  if (!raw) return createEmptyStore()

  try {
    const parsed = JSON.parse(raw) as Partial<ChallengeStore>
    if (parsed.version !== 1 || !Array.isArray(parsed.days)) {
      return createEmptyStore()
    }

    const validDays = parsed.days.filter(isDailyChallenge)
    return { version: 1, days: validDays }
  } catch {
    return createEmptyStore()
  }
}

function isDailyChallenge(value: unknown): value is DailyChallenge {
  if (!value || typeof value !== 'object') return false
  const day = value as Partial<DailyChallenge>
  if (typeof day.date !== 'string' || !Array.isArray(day.completed)) return false
  if (!day.selections || typeof day.selections !== 'object') return false

  return CONTENT_KINDS.every(
    (kind) => {
      const selectedId = day.selections?.[kind]
      return (
        typeof selectedId === 'string' &&
        catalogById.get(selectedId)?.kind === kind &&
        day.completed?.every((item) => CONTENT_KINDS.includes(item))
      )
    },
  )
}

export function chooseItem(
  kind: ContentKind,
  excludedIds: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): CatalogItem {
  const allForKind = catalog.filter((item) => item.kind === kind)
  const preferred = allForKind.filter((item) => !excludedIds.has(item.id))
  const pool = preferred.length > 0 ? preferred : allForKind
  return pool[Math.floor(random() * pool.length)]
}

function recentIdsForKind(
  days: DailyChallenge[],
  kind: ContentKind,
): Set<string> {
  return new Set(
    [...days]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_DAYS_TO_AVOID)
      .map((day) => day.selections[kind]),
  )
}

export function createSelections(
  days: DailyChallenge[],
  random: () => number = Math.random,
): DailySelections {
  return {
    essay: chooseItem('essay', recentIdsForKind(days, 'essay'), random).id,
    poem: chooseItem('poem', recentIdsForKind(days, 'poem'), random).id,
    story: chooseItem('story', recentIdsForKind(days, 'story'), random).id,
  }
}

export function ensureToday(
  store: ChallengeStore,
  date = new Date(),
  random: () => number = Math.random,
): { store: ChallengeStore; today: DailyChallenge } {
  const dateKey = toLocalDateKey(date)
  const existing = store.days.find((day) => day.date === dateKey)
  if (existing) return { store, today: existing }

  const today: DailyChallenge = {
    date: dateKey,
    selections: createSelections(store.days, random),
    completed: [],
  }

  const days = [...store.days, today].sort((a, b) => a.date.localeCompare(b.date))
  return { store: { version: 1, days }, today }
}

export function replaceSelection(
  store: ChallengeStore,
  date: string,
  kind: ContentKind,
  random: () => number = Math.random,
): ChallengeStore {
  const day = store.days.find((candidate) => candidate.date === date)
  if (!day) return store

  const excluded = recentIdsForKind(store.days, kind)
  excluded.add(day.selections[kind])
  const replacement = chooseItem(kind, excluded, random)

  return {
    ...store,
    days: store.days.map((candidate) =>
      candidate.date === date
        ? {
            ...candidate,
            selections: { ...candidate.selections, [kind]: replacement.id },
            completed: candidate.completed.filter((item) => item !== kind),
          }
        : candidate,
    ),
  }
}

export function replaceAllSelections(
  store: ChallengeStore,
  date: string,
  random: () => number = Math.random,
): ChallengeStore {
  let next = store
  for (const kind of CONTENT_KINDS) {
    next = replaceSelection(next, date, kind, random)
  }
  return next
}

export function setKindCompleted(
  store: ChallengeStore,
  date: string,
  kind: ContentKind,
  completed: boolean,
): ChallengeStore {
  return {
    ...store,
    days: store.days.map((day) => {
      if (day.date !== date) return day
      const nextCompleted = completed
        ? Array.from(new Set([...day.completed, kind]))
        : day.completed.filter((item) => item !== kind)
      return { ...day, completed: nextCompleted }
    }),
  }
}

function shiftDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toLocalDateKey(date)
}

export function calculateStats(
  days: DailyChallenge[],
  todayKey = toLocalDateKey(),
): ChallengeStats {
  const completedDates = new Set(
    days.filter((day) => day.completed.length === CONTENT_KINDS.length).map((day) => day.date),
  )
  let cursor = completedDates.has(todayKey) ? todayKey : shiftDate(todayKey, -1)
  let streak = 0

  while (completedDates.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }

  return { completedDays: completedDates.size, streak }
}
