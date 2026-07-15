# The Bradbury Practice

A small daily-reading app inspired by Ray Bradbury's challenge: read one essay, one poem, and one short story every night.

## Features

- A random daily trio drawn from a curated 2,000-work public-domain catalog
- Classics from both Wikisource and Project Gutenberg
- A searchable, paginated Catalog with essay, poetry, and short-story categories
- One-sentence descriptions, quick-reader popups, and dedicated full-page readers
- A quick pop-up reader plus a dedicated full-page reader that can open in a new tab
- Individual rerolls and a full-trio shuffle with recent-repeat avoidance
- Per-piece completion, completed-night totals, and streak tracking
- Daily selections and progress saved locally in the browser
- Gzip-compressed, AES-256-GCM encrypted catalog payload, decrypted and validated at app startup
- Responsive, accessible layout with no account or backend required

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Verification

```bash
npm run lint
npm run test
npm run build
```

The reader sanitizes Wikisource HTML before displaying it. Project Gutenberg works use the
official library edition in a sandboxed reader frame. Every work retains a link to its original
source page.

The encrypted catalog keeps the work list out of plain-text JSON. Because the decryption key must
ship with a static frontend, this is an obfuscation layer rather than a substitute for a private
backend.

## Rebuild the catalog

The catalog builder uses Project Gutenberg's official weekly metadata feed, keeps English text
editions by public-domain-era authors, removes reference works and duplicate editions, preserves
the hand-picked Wikisource entries, and writes only an AES-256-GCM encrypted payload to `src`.

```bash
npm run catalog:build
```

On the first run, the script downloads `pg_catalog.csv` from Project Gutenberg. That source file is
ignored by Git. The generated catalog contains 666 essays, 667 poetry works, and 667 short-story
works or collections.
