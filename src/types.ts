export const CONTENT_KINDS = ['essay', 'poem', 'story'] as const

export type ContentKind = (typeof CONTENT_KINDS)[number]

export type LibrarySource = 'wikisource' | 'gutenberg'

export interface CatalogItem {
  id: string
  kind: ContentKind
  title: string
  author: string
  description: string
  minutes: number
  source?: LibrarySource
  pageTitle?: string
  readerUrl?: string
  sourceUrl?: string
}

export type DailySelections = Record<ContentKind, string>

export interface DailyChallenge {
  date: string
  selections: DailySelections
  completed: ContentKind[]
}

export interface ChallengeStore {
  version: 1
  days: DailyChallenge[]
}

export interface ChallengeStats {
  completedDays: number
  streak: number
}
