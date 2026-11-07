# Jipbap

Jipbap is a "what do I cook with this?" tool for Asian home cooking, starting
with Korean. You enter one or two ingredients, for example from this week's
grocery flyer, and get recipes from food creators. You can filter them by
creator and by how many more ingredients you would need to buy. Most of the
code exists to match ingredients correctly: a search for "scallion" should
find green-onion recipes, and gochugaru should never match crushed red pepper.

The site is live at [jipbap.com](https://jipbap.com).

## About this repo

This repo holds the public code of a project whose data is private. The recipe
corpus, creator records, curation history and user data live in a separate
private repo.

The repo contains all of the code: the website, the data pipeline, the
workers, and the deploy and mobile setup. It also contains the ingredient
ontology in `data/ontology/`, the curation decisions about ingredients in
`data/decisions/`, and the design specs (`*-SPEC.md` and `DECISIONS.md`).

`DATA-SPEC.md` describes what a data folder must contain for the app to run.

## Layout

| Path | What it is |
|---|---|
| `app/` | The website, built with Next.js and TypeScript. Most logic is in `app/src/lib/`. |
| `src/ingest/` | Crawls recipe sites and parses ingredient lines. |
| `src/ontology/` | Builds the ingredient graph and the recipe index, and handles resolution, naming and allergens. |
| `src/qc/` | Tools for curation and review. |
| `src/static/` | Builds the static export of the site. |
| `src/actor/` | Packages the crawler as an Apify actor, built by the root `Dockerfile`. |
| `workers/` | Cloudflare Workers for the event and sync API (`api.ts`) and the `/go` outbound-link redirect. |
| `deploy/` | Holds the systemd units and the nginx and Cloudflare config for the production server. |
| `mobile/` | Holds the Capacitor shell for iOS. |
| `data/` | Holds the public part of the data. |
| `legal/` | Holds the privacy policy and terms that the site renders. |

## Running it

Install dependencies at the root and in `app/`, then run the typecheck:

```
npm ci
cd app && npm ci
cd .. && npm run typecheck
```

To start the website, run `cd app && npm run dev`. It serves on port 3000 and
expects the data described in `DATA-SPEC.md`.

## Current state

The app does not start from this repo alone. It needs
`data/ontology/recipe-index.json`, which is built from the private corpus.

The tests are standalone scripts. Each `*.test.ts` file has its own `check()`
helper and runs with `tsx`, for example `npm run test-match`. `npm test` runs
Vitest, but Vitest does not find any suites in these files yet.

Two test files already fail: `client-store.test.ts` fails 6 beacon checks, and
`not-stocked.test.ts` fails the "bean water" check. `site-rules.test.ts` needs
the private curation data and cannot run here.

The Weee! grocery integration has been removed, but some specs and code
comments still mention it. A few documents also mention files that were not
carried into this repo.

`BUILD.md` is out of date on the stack. It names Postgres (Supabase) and
Vercel, but the app stores its data in files on disk and is served by a Node
server and a static export on Cloudflare (see `deploy/`).

## Where to start reading

- `DECISIONS.md` explains what the product is and records each decision with
  its date.
- `INGREDIENT-SPEC.md` and `NORMALIZATION.md` define an ingredient and explain
  how written names become ontology nodes.
- `RECIPE-SPEC.md` and `RESOLUTION-SPEC.md` define the recipe entity and
  explain how an ingredient mention gets its meaning.
- `app/src/lib/match.ts` is the matcher, the core of the product.
