import { beforeAll, describe, expect, it } from 'vitest'
import { catalogById, loadCatalog } from './catalog'
import {
  applyReadingTimeLimit,
  calculateStats,
  chooseItem,
  ensureToday,
  loadReadingTimeLimit,
  loadStore,
  replaceSelection,
  setKindCompleted,
  toLocalDateKey,
} from './challenge'
import type { ChallengeStore, DailyChallenge } from './types'

const selections = {
  essay: 'essay-self-reliance',
  poem: 'poem-ozymandias',
  story: 'story-tell-tale-heart',
} as const

beforeAll(() => loadCatalog())

describe('challenge state', () => {
  it('uses a stable local date key', () => {
    expect(toLocalDateKey(new Date(2026, 6, 5, 23, 30))).toBe('2026-07-05')
  })

  it('recovers from invalid persisted state', () => {
    expect(loadStore('{not-json')).toEqual({ version: 1, days: [] })
    expect(loadStore(JSON.stringify({ version: 2, days: [] }))).toEqual({ version: 1, days: [] })
  })

  it('discards days that reference unknown catalog items', () => {
    const invalid = {
      version: 1,
      days: [{ date: '2026-07-15', selections: { ...selections, poem: 'missing' }, completed: [] }],
    }

    expect(loadStore(JSON.stringify(invalid))).toEqual({ version: 1, days: [] })
  })

  it('keeps the same challenge for an existing day', () => {
    const day: DailyChallenge = { date: '2026-07-15', selections, completed: [] }
    const store: ChallengeStore = { version: 1, days: [day] }
    const result = ensureToday(store, new Date(2026, 6, 15), () => 0.9)

    expect(result.today).toBe(day)
    expect(result.store).toBe(store)
  })

  it('avoids excluded works when alternatives exist', () => {
    const result = chooseItem('poem', new Set(['poem-ozymandias']), () => 0)
    expect(result.id).not.toBe('poem-ozymandias')
  })

  it('defaults invalid reading-time preferences to unlimited', () => {
    expect(loadReadingTimeLimit(null)).toBe('unlimited')
    expect(loadReadingTimeLimit('45')).toBe('unlimited')
    expect(loadReadingTimeLimit('30')).toBe('30')
  })

  it('chooses works within the active reading-time limit', () => {
    for (const kind of ['essay', 'poem', 'story'] as const) {
      expect(chooseItem(kind, new Set(), () => 0.5, 30).minutes).toBeLessThanOrEqual(30)
    }
  })

  it('replaces only selections that exceed a tighter limit', () => {
    const kinds = ['essay', 'poem', 'story'] as const
    const overLimitSelections = Object.fromEntries(
      kinds.map((kind) => {
        const item = [...catalogById.values()].find(
          (candidate) => candidate.kind === kind && candidate.minutes > 30,
        )
        if (!item) throw new Error(`Missing long ${kind} fixture`)
        return [kind, item.id]
      }),
    ) as DailyChallenge['selections']
    const day: DailyChallenge = {
      date: '2026-07-15',
      selections: overLimitSelections,
      completed: ['essay', 'poem', 'story'],
    }
    const result = applyReadingTimeLimit(
      { version: 1, days: [day] },
      day.date,
      30,
      () => 0,
    )

    for (const kind of kinds) {
      const item = catalogById.get(result.days[0].selections[kind])
      expect(item?.minutes).toBeLessThanOrEqual(30)
    }
    expect(result.days[0].completed).toEqual([])
  })

  it('resets completion when a selection is replaced', () => {
    const day: DailyChallenge = {
      date: '2026-07-15',
      selections,
      completed: ['essay', 'poem'],
    }
    const result = replaceSelection({ version: 1, days: [day] }, day.date, 'essay', () => 0.5)
    const changed = result.days[0]

    expect(changed.selections.essay).not.toBe(selections.essay)
    expect(changed.completed).toEqual(['poem'])
  })

  it('toggles completion without creating duplicates', () => {
    const day: DailyChallenge = { date: '2026-07-15', selections, completed: [] }
    const once = setKindCompleted({ version: 1, days: [day] }, day.date, 'essay', true)
    const twice = setKindCompleted(once, day.date, 'essay', true)

    expect(twice.days[0].completed).toEqual(['essay'])
  })
})

describe('challenge statistics', () => {
  it('counts a streak including today', () => {
    const makeDay = (date: string): DailyChallenge => ({
      date,
      selections,
      completed: ['essay', 'poem', 'story'],
    })
    const stats = calculateStats(
      [makeDay('2026-07-13'), makeDay('2026-07-14'), makeDay('2026-07-15')],
      '2026-07-15',
    )

    expect(stats).toEqual({ completedDays: 3, streak: 3 })
  })

  it('preserves yesterday’s streak while today is incomplete', () => {
    const days: DailyChallenge[] = [
      { date: '2026-07-13', selections, completed: ['essay', 'poem', 'story'] },
      { date: '2026-07-14', selections, completed: ['essay', 'poem', 'story'] },
      { date: '2026-07-15', selections, completed: ['essay'] },
    ]

    expect(calculateStats(days, '2026-07-15').streak).toBe(2)
  })
})
