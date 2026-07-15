import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { catalogById } from './catalog'
import {
  calculateStats,
  ensureToday,
  loadStore,
  replaceAllSelections,
  replaceSelection,
  setKindCompleted,
  STORAGE_KEY,
} from './challenge'
import {
  fetchLibraryPage,
  getFullReaderUrl,
  getLibraryName,
  getSourceUrl,
} from './library'
import type { CatalogItem, ContentKind } from './types'

const KIND_DETAILS: Record<
  ContentKind,
  { label: string; action: string; number: string; monogram: string }
> = {
  essay: { label: 'Essay', action: 'Read essay', number: '01', monogram: 'E' },
  poem: { label: 'Poem', action: 'Read poem', number: '02', monogram: 'P' },
  story: { label: 'Short story', action: 'Read story', number: '03', monogram: 'S' },
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M14 3h3v3M3 5h3.4c3.8 0 3.8 10 7.6 10h3M14 12l3 3-3 3M3 15h3.4c1.1 0 1.9-.8 2.6-2M11 7c.8-1.2 1.6-2 3-2h3" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.7 1.6" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z" />
      <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
    </svg>
  )
}

function Brand({ href }: { href: string }) {
  return (
    <a className="brand" href={href} aria-label="The Bradbury Practice home">
      <span className="brand-seal"><BookIcon /></span>
      <span>
        <strong>The Bradbury Practice</strong>
        <small>One thousand nights of reading</small>
      </span>
    </a>
  )
}

interface ReadingCardProps {
  item: CatalogItem
  completed: boolean
  onOpen: () => void
  onReroll: () => void
  onToggleComplete: () => void
}

function ReadingCard({
  item,
  completed,
  onOpen,
  onReroll,
  onToggleComplete,
}: ReadingCardProps) {
  const details = KIND_DETAILS[item.kind]

  return (
    <article className={`reading-card reading-card--${item.kind} ${completed ? 'is-complete' : ''}`}>
      <div className="card-accent" />
      <header className="card-header">
        <div className="kind-lockup">
          <span className="kind-number">{details.number}</span>
          <span>{details.label}</span>
        </div>
        <button
          className="icon-button card-reroll"
          type="button"
          onClick={onReroll}
          aria-label={`Choose another ${details.label.toLowerCase()}`}
          title={`Choose another ${details.label.toLowerCase()}`}
        >
          <ShuffleIcon />
        </button>
      </header>

      <div className="card-mark" aria-hidden="true">
        {details.monogram}
      </div>

      <div className="card-copy">
        <h2>{item.title}</h2>
        <p className="author">by {item.author}</p>
      </div>

      <div className="card-meta">
        <span>
          <ClockIcon />
          {item.minutes} min read
        </span>
        <span>{getLibraryName(item)}</span>
      </div>

      <div className="card-actions">
        <button className="read-button" type="button" onClick={onOpen}>
          <span>{details.action}</span>
          <ArrowIcon />
        </button>
        <a
          className="full-page-button"
          href={getFullReaderUrl(item)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${item.title} in a full-page reader`}
        >
          <ExpandIcon />
          <span>Full page</span>
        </a>
        <button
          className={`complete-button ${completed ? 'is-checked' : ''}`}
          type="button"
          onClick={onToggleComplete}
          aria-pressed={completed}
        >
          <span className="checkmark" aria-hidden="true">
            {completed ? '✓' : ''}
          </span>
          {completed ? 'Read' : 'Mark read'}
        </button>
      </div>
    </article>
  )
}

function ReaderLoading() {
  return (
    <div className="reader-loading" role="status">
      <span />
      <span />
      <span />
      <p>Opening the library…</p>
    </div>
  )
}

function ReaderContent({ item }: { item: CatalogItem }) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [frameLoaded, setFrameLoaded] = useState(false)
  const isGutenberg = item.source === 'gutenberg'

  useEffect(() => {
    setHtml('')
    setError('')
    setFrameLoaded(false)
    if (isGutenberg) return

    const controller = new AbortController()
    fetchLibraryPage(item, controller.signal)
      .then(setHtml)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError('The in-app text could not be loaded right now.')
      })

    return () => controller.abort()
  }, [isGutenberg, item])

  if (isGutenberg && item.readerUrl) {
    return (
      <div className={`reader-embed-shell ${frameLoaded ? 'is-loaded' : ''}`}>
        {!frameLoaded && !error && <ReaderLoading />}
        {error && (
          <div className="reader-error">
            <BookIcon />
            <h3>The library shelf is temporarily out of reach.</h3>
            <p>{error} You can still open the original edition.</p>
            <a href={getSourceUrl(item)} target="_blank" rel="noreferrer">
              Open on {getLibraryName(item)} <ArrowIcon />
            </a>
          </div>
        )}
        <iframe
          className="library-frame"
          src={item.readerUrl}
          title={`${item.title} on Project Gutenberg`}
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => setFrameLoaded(true)}
          onError={() => setError('The official library reader did not respond.')}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="reader-error">
        <BookIcon />
        <h3>The library shelf is temporarily out of reach.</h3>
        <p>{error} You can still read the original edition.</p>
        <a href={getSourceUrl(item)} target="_blank" rel="noreferrer">
          Open on {getLibraryName(item)} <ArrowIcon />
        </a>
      </div>
    )
  }

  if (!html) return <ReaderLoading />
  return <div className="reader-copy" dangerouslySetInnerHTML={{ __html: html }} />
}

interface ReaderModalProps {
  item: CatalogItem
  completed: boolean
  onClose: () => void
  onToggleComplete: () => void
}

function ReaderModal({ item, completed, onClose, onToggleComplete }: ReaderModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const details = KIND_DETAILS[item.kind]

  return (
    <div className="reader-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`reader-panel reader-panel--${item.kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="reader-header">
          <div>
            <p className="reader-kicker">Today's {details.label}</p>
            <h2 id="reader-title">{item.title}</h2>
            <p>by {item.author} · {getLibraryName(item)}</p>
          </div>
          <div className="reader-header-actions">
            <a
              className="reader-expand"
              href={getFullReaderUrl(item)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${item.title} in a full-page reader`}
              title="Open full-page reader"
            >
              <ExpandIcon />
            </a>
            <button className="reader-close" type="button" onClick={onClose} aria-label="Close reader">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>

        <div className="reader-scroll">
          <ReaderContent item={item} />
        </div>

        <footer className="reader-footer">
          <a href={getSourceUrl(item)} target="_blank" rel="noreferrer">
            Source: {getLibraryName(item)}
          </a>
          <div className="reader-footer-actions">
            <a
              className="reader-full-page"
              href={getFullReaderUrl(item)}
              target="_blank"
              rel="noreferrer"
            >
              <ExpandIcon /> Full page
            </a>
            <button
              className={`finish-button ${completed ? 'is-complete' : ''}`}
              type="button"
              onClick={onToggleComplete}
            >
              <span>{completed ? '✓' : ''}</span>
              {completed ? 'Finished' : `Mark ${details.label.toLowerCase()} as read`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

interface FullPageReaderProps {
  item: CatalogItem
  completed: boolean
  onToggleComplete: () => void
}

function FullPageReader({ item, completed, onToggleComplete }: FullPageReaderProps) {
  const details = KIND_DETAILS[item.kind]

  return (
    <main className={`full-reader full-reader--${item.kind}`}>
      <header className="full-reader-topbar">
        <Brand href={import.meta.env.BASE_URL} />
        <a className="back-to-challenge" href={import.meta.env.BASE_URL}>
          <span aria-hidden="true">←</span> Back to challenge
        </a>
      </header>

      <section className="full-reader-intro">
        <p className="reader-kicker">Today's {details.label}</p>
        <h1>{item.title}</h1>
        <p>by {item.author}</p>
        <a className="library-badge" href={getSourceUrl(item)} target="_blank" rel="noreferrer">
          {getLibraryName(item)} edition <ArrowIcon />
        </a>
      </section>

      <section className={`full-reader-content ${item.source === 'gutenberg' ? 'has-embed' : ''}`}>
        <ReaderContent item={item} />
      </section>

      <footer className="full-reader-footer">
        <div>
          <span>{details.label}</span>
          <strong>{item.minutes} min read</strong>
        </div>
        <button
          className={`finish-button ${completed ? 'is-complete' : ''}`}
          type="button"
          onClick={onToggleComplete}
        >
          <span>{completed ? '✓' : ''}</span>
          {completed ? 'Finished' : `Mark ${details.label.toLowerCase()} as read`}
        </button>
      </footer>
    </main>
  )
}

function App() {
  const initial = useMemo(() => {
    const stored = loadStore(window.localStorage.getItem(STORAGE_KEY))
    return ensureToday(stored)
  }, [])
  const [store, setStore] = useState(initial.store)
  const [openItem, setOpenItem] = useState<CatalogItem | null>(null)

  const today = store.days.find((day) => day.date === initial.today.date) ?? initial.today
  const stats = calculateStats(store.days, today.date)
  const todayIndex = store.days.findIndex((day) => day.date === today.date)
  const completedCount = today.completed.length
  const progressPercent = (completedCount / 3) * 100
  const readerId = new URLSearchParams(window.location.search).get('read')
  const fullReaderItem = readerId ? catalogById.get(readerId) : undefined

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  }, [store])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setStore(ensureToday(loadStore(event.newValue)).store)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const formattedDate = new Date(`${today.date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const items = (Object.keys(today.selections) as ContentKind[])
    .map((kind) => catalogById.get(today.selections[kind]))
    .filter((item): item is CatalogItem => Boolean(item))

  const toggleCompleted = (kind: ContentKind) => {
    const isCompleted = today.completed.includes(kind)
    setStore((current) => setKindCompleted(current, today.date, kind, !isCompleted))
  }

  if (fullReaderItem) {
    return (
      <FullPageReader
        item={fullReaderItem}
        completed={today.completed.includes(fullReaderItem.kind)}
        onToggleComplete={() => toggleCompleted(fullReaderItem.kind)}
      />
    )
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <Brand href="#top" />
        <a className="about-link" href="#about">About the practice</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Day {String(todayIndex + 1).padStart(3, '0')} · {formattedDate}</p>
          <h1>Feed your head<br />before you sleep.</h1>
          <p className="hero-intro">
            One essay. One poem. One short story. A nightly practice for a more curious life.
          </p>
        </div>

        <div className="progress-card" aria-label={`${completedCount} of 3 readings complete today`}>
          <div
            className="progress-ring"
            style={{ '--progress': `${progressPercent * 3.6}deg` } as CSSProperties}
          >
            <div>
              <strong>{completedCount}</strong>
              <span>of 3</span>
            </div>
          </div>
          <div className="progress-copy">
            <strong>{completedCount === 3 ? 'Night complete' : 'Tonight’s reading'}</strong>
            <span>{completedCount === 3 ? 'Well read.' : `${3 - completedCount} piece${3 - completedCount === 1 ? '' : 's'} waiting`}</span>
          </div>
        </div>
      </section>

      <section className="challenge-section" aria-labelledby="tonight-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your nightly three</p>
            <h2 id="tonight-heading">Tonight’s selection</h2>
          </div>
          <button
            className="shuffle-all"
            type="button"
            onClick={() => setStore((current) => replaceAllSelections(current, today.date))}
          >
            <ShuffleIcon />
            New trio
          </button>
        </div>

        <div className="reading-grid">
          {items.map((item) => (
            <ReadingCard
              key={item.kind}
              item={item}
              completed={today.completed.includes(item.kind)}
              onOpen={() => setOpenItem(item)}
              onReroll={() =>
                setStore((current) => replaceSelection(current, today.date, item.kind))
              }
              onToggleComplete={() => toggleCompleted(item.kind)}
            />
          ))}
        </div>
      </section>

      <section className="stats-band" aria-label="Reading progress">
        <div>
          <span className="stat-value">{stats.streak}</span>
          <span className="stat-label">Night streak</span>
        </div>
        <div>
          <span className="stat-value">{stats.completedDays}</span>
          <span className="stat-label">Nights completed</span>
        </div>
        <div>
          <span className="stat-value">{store.days.reduce((sum, day) => sum + day.completed.length, 0)}</span>
          <span className="stat-label">Pieces read</span>
        </div>
        <blockquote>
          “You must stay drunk on writing so reality cannot destroy you.”
          <cite>— Ray Bradbury</cite>
        </blockquote>
      </section>

      <section className="about" id="about">
        <p className="eyebrow">The idea</p>
        <div>
          <h2>A library, one night at a time.</h2>
          <p>
            Ray Bradbury encouraged young writers to read a short story, a poem, and an essay every
            night for one thousand nights. This quiet ritual is a way to collect ideas, voices, and
            surprising connections—three small doors at a time.
          </p>
        </div>
      </section>

      <footer className="site-footer">
        <span>The Bradbury Practice</span>
        <span>Public-domain editions via Wikisource and Project Gutenberg · Progress stays on this device</span>
      </footer>

      {openItem && (
        <ReaderModal
          item={openItem}
          completed={today.completed.includes(openItem.kind)}
          onClose={() => setOpenItem(null)}
          onToggleComplete={() => toggleCompleted(openItem.kind)}
        />
      )}
    </main>
  )
}

export default App
