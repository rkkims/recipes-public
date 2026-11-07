# Jipbap

A "what do I cook with this?" tool for Asian home cooking, Korean first. Enter
one or two ingredients, say from this week's grocery flyer, and get recipes
from food creators, filtered by creator and by how many more ingredients you'd
need to buy. The hard part, and most of this code, is matching ingredients
correctly: searching "scallion" should find green-onion recipes, and gochugaru
must never match crushed red pepper.

Live at [jipbap.com](https://jipbap.com).

## About this repo

This is the **public code** of a project whose data is private. The recipe
corpus, creator records, curation history and user data live in a separate
private repo and are not here. What is here:

- all the code: the website, the data pipeline, workers, deploy and mobile
- the ingredient ontology (`data/ontology/*.csv`, `ontology.json`)
- curation decisions about ingredients (`data/decisions/`)
- the design specs (`*-SPEC.md`, `DECISIONS.md`)

`DATA-SPEC.md` describes what a data folder must contain for the app to run.

## Layout

| Path | What it is |
|---|---|
| `app/` | The website: Next.js + TypeScript. Logic lives in `app/src/lib/` |
| `src/ingest/` | Crawling recipe sites and parsing ingredient lines |
| `src/ontology/` | Building the ingredient graph and the recipe index; resolution, naming, allergens |
| `src/qc/` | Curation and review tools |
| `src/static/` | The static export of the site |
| `src/actor/` | The crawler packaged as an Apify actor (`Dockerfile`) |
| `workers/` | Cloudflare Workers: the event and sync API (`api.ts`) and the `/go` outbound-link redirect |
| `deploy/` | systemd units, nginx and Cloudflare config for the production server |
| `mobile/` | Capacitor shell for iOS |
| `data/` | The public part of the data (see above) |
| `legal/` | Privacy policy and terms, rendered by the site |

## Running it

```
npm ci                 # root: pipeline, tests, typecheck
cd app && npm ci       # the website
npm run typecheck      # root
```

The website is `cd app && npm run dev` (port 3000). It expects the data
described in `DATA-SPEC.md`.

## Current state

- **The app does not start from this repo alone.** It needs
  `data/ontology/recipe-index.json`, which is built from the private corpus.
- **Tests are standalone scripts.** Each `*.test.ts` file has its own `check()`
  helper and runs with `tsx`, e.g. `npm run test-match`. `npm test` runs Vitest,
  which finds no suites in them yet.
- **Known failures:** `client-store.test.ts` (6 beacon checks) and
  `not-stocked.test.ts` ("bean water") fail today. `site-rules.test.ts` needs
  the private curation data.
- **Historical references:** the Weee! grocery integration was removed. Some
  specs and code comments still mention it, and a few documents mention files
  that were not carried into this repo.
- **`BUILD.md` is out of date on the stack.** It names Postgres (Supabase) and
  Vercel. The app stores its data in files on disk (see `DATA-SPEC.md`) and
  is served by a Node server plus a static export on Cloudflare (`deploy/`).

## Where to start reading

- `DECISIONS.md`: what the product is and what was decided, with dates
- `INGREDIENT-SPEC.md` and `NORMALIZATION.md`: what an ingredient is and how
  written names become ontology nodes
- `RECIPE-SPEC.md` and `RESOLUTION-SPEC.md`: the recipe entity and how an
  ingredient mention gets its meaning
- `app/src/lib/match.ts`: the matcher, the core of the product
