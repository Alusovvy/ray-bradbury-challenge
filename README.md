# The Bradbury Practice

A small daily-reading app inspired by Ray Bradbury's challenge: read one essay, one poem, and one short story every night.

**Live website:** [alusovvy.github.io/ray-bradbury-challenge](https://alusovvy.github.io/ray-bradbury-challenge/)

## Features

- A random daily trio drawn from a curated 11,000+ work public-domain catalog
- Classics from both Wikisource and Project Gutenberg
- A searchable, paginated Catalog with essay, poetry, and short-story categories
- Catalog sorting by title, shortest reading time, or longest reading time
- One-sentence descriptions, quick-reader popups, and dedicated full-page readers
- Individual rerolls and a full-trio shuffle with recent-repeat avoidance
- An optional per-work reading limit: unlimited, 60 minutes, or 30 minutes
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
npm run catalog:audit
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
Essay, poetry, and story collections are parsed into individually anchored works with reading
times derived from their actual word counts. Footnotes, illustration captions, structural
headings, ambiguous collections, and oversized sections are excluded. The builder also verifies
minimum pools of 104 essays and 512 poems that take no more than 30 minutes to read.

```bash
npm run catalog:build
```

On the first run, the script downloads `pg_catalog.csv` and the selected editions from Project
Gutenberg. Those source files are cached in ignored local folders. The generated catalog contains
2,000 essays, 2,000 poetry works, and more than 7,000 individually addressable short stories.
