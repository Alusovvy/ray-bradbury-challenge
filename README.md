# The Bradbury Practice

A small daily-reading app inspired by Ray Bradbury's challenge: read one essay, one poem, and one short story every night.

## Features

- A random daily trio drawn from a curated 34-work public-domain catalog
- Classics from both Wikisource and Project Gutenberg
- A quick pop-up reader plus a dedicated full-page reader that can open in a new tab
- Individual rerolls and a full-trio shuffle with recent-repeat avoidance
- Per-piece completion, completed-night totals, and streak tracking
- Daily selections and progress saved locally in the browser
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
