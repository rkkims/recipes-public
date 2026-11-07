# Data — what the app reads and writes

This repo is the code. The data is not here: the recipe corpus, creator records
and curation history live in a separate private repo. This file is the contract
between them: what a data folder must hold for the app to run, in what format,
and what the app writes back into it. Anyone who supplies a folder that meets
this spec can run Jipbap on their own recipes.

Scope: the **website** (`app/`). The pipeline in `src/` produces most of these
files from raw crawl output; its own inputs (`data/raw/`, `data/qc/`, …) are
not specified here.

---

## 1. The data root

Every path below is relative to one folder, the **data root**. In this repo it
is `data/`.

How the code finds it today (the thing this spec exists to replace):

- `lib/data.ts` honours `RECIPES_DATA`, but that variable names the
  **`ontology/` folder**, not the data root, and no other module reads it.
- Five modules (`data`, `buy`, `lines`, `findability`, `enriched`) walk up
  from the working directory looking for `data/`.
- `user-images` builds its path from its own file location.
- The rest build `resolve(process.cwd(), "..", "data", …)`, which only works
  when Next is started from `app/`.
- The pipeline in `src/` builds `resolve(ROOT, "data/…")` per file.

The rule: **one setting names the data root; every read and write goes through
it.**

- **`JIPBAP_DATA_DIR`** is the data root, for the website and the pipeline
  alike. With nothing set, it is the repo's `data/`, so an existing checkout
  keeps working unchanged.
- **`RECIPES_DATA`** keeps the meaning it has today, for compatibility: when
  set, it is where `ontology/` is read from, and it wins over
  `<JIPBAP_DATA_DIR>/ontology`. Every other path follows `JIPBAP_DATA_DIR`.

---

## 2. Three kinds of file

| Kind | If absent | Who writes it |
|---|---|---|
| **Required** | The app refuses to start, with an error naming the missing file and the setting from §1 | The pipeline |
| **Optional** | The feature it feeds is off; nothing else changes | The pipeline, or a person |
| **Runtime state** | Treated as empty and created on first write | The running app |

Runtime state is never shipped with a data set, and a sample data set must not
contain it. It is the users' own data.

---

## 3. Required

### 3.1 `ontology/ontology.json`: the ingredient graph

Built by `npm run build-ontology` from the CSVs beside it (`nodes.csv`,
`is_a.csv`, `aliases.csv`, `identity.csv`, `derives_from.csv`, `glosses.csv`).

```jsonc
{
  "schema": 1,
  "ingredients": [
    {
      "id": "ing_1204i2rtn256",     // stable id, "ing_" + 12 chars
      "slug": "garlic",
      "name": "garlic",              // canonical name, may be a native term
      "mentions": 2638,              // how often the corpus mentions it
      "aliases": ["garlic cloves"],  // other written forms
      "gloss": "…",                  // optional: English explanation of a native name
      "kind": "produce",             // optional: aisle grouping
      "allergens": ["soy"],          // optional: "contains", never "free of"
      "animal_source": "meat"        // optional: meat | fish | dairy | egg
    }
  ],
  "redirects": { "ing_old…": "ing_new…" },  // optional: retired id → replacement
  "relations": {
    "is_a":            [["ing_child", "ing_parent"]],
    "derives_from":    [["ing_product", "ing_source"]],
    "substitutes_for": [["ing_sub", "ing_original"]]
  }
}
```

The type is `Ontology` / `Ingredient` in `app/src/lib/data.ts`. Unknown extra
fields (e.g. `kind_reviewed`) are ignored.

### 3.2 `ontology/recipe-index.json`: the recipes

Built by `npm run recipe-index` from the crawl. The type is `Recipe` in
`app/src/lib/match.ts`.

```jsonc
{
  "generated_from": "data/raw",           // informational
  "counts": { "recipes": 3 },              // informational
  "recipes": [
    {
      "id": "rec_o546js9g8ll7",            // stable id, "rec_" + 12 chars
      "title": "…",
      "url": "https://…",                  // the source page
      "source": "example-blog",            // source key; groups recipes by site
      "cuisine": "korean",
      "requires": ["ing_…"],               // ontology ids; the core of matching
      "unresolved": ["…"],                 // written names that matched no node; [] when fully resolved
      "optional": ["ing_…"],               // optional: garnishes, "if you have it"
      "alternates": { "ing_…": [["ing_…"], ["ing_…", "ing_…"]] },  // optional: OR of ANDs
      "image": "https://…",                // optional
      "yield": "4",                        // optional: free text
      "rating": 4.5,                       // optional: the source's own, out of 5
      "datePublished": "2021-02-19T…"      // optional
    }
  ]
}
```

Every id in `requires`, `optional` and `alternates` must be an `ingredients[].id`
in §3.1 or a key of its `redirects`.

Fields set by curation or creators, never by the pipeline: `cuisines`,
`components`, `mainIngredients`, `confirmed`. A data set may omit them.

---

## 4. Optional

| Path | Format | Feeds |
|---|---|---|
| `ontology/recipe-lines.json` | `{ [recipeId]: Line[] }`, the parsed ingredient lines (`Line` in `lib/lines.ts`) | Ingredient list on the recipe page |
| `ontology/resolutions.json` | `{ [recipeId]: { [writtenName]: nodeName } }` | Buy links that name the exact leaf |
| `ontology/main-proposals.json` | `{ [recipeId]: { ids: string[], why: string } }` | Pre-fill on the curate form |
| `ontology/classify.json` | `{ [recipeId]: { cuisine, dish_type, make_ahead, main_ingredients, confidence } }` | Pre-fill on the curate form |
| `decisions/hard-to-find.csv` | `node,hard_to_find,source,why`; a row counts when `hard_to_find` is `yes` | "Hard to find" marks and buy links |
| `creators/creators.csv` | `id,handle,display_name,status,claimed_at,affiliate_tag` | Creator pages and attribution |
| `creators/creator_channel.csv` | `creator_id,kind,handle,verified_at` | Creator links |
| `creators/icons.csv` | `creator_id,url,found_by` | Creator icons |
| `creators/creator_alias.csv` | `raw,creator_id,source_id` | Matching a crawled author to a creator |
| `creators/recipe-creators.json` | `{ [recipeId]: creatorId }` | Recipe → creator |
| `enriched/*.jsonl` | one JSON object per line: `{ sourceUrl, prepMinutes?, cookMinutes?, totalMinutes?, leadMinutes?, leadReason?, error? }` | Cooking times |
| `qc/unknown.csv` | `surface,mentions,in_title,headline,cuisines,example` | The curator's unknown-ingredient queue |
| `curation/drafts.json` | `{ [recipeId]: … }` | Draft verdicts on the curate list |

CSV files have a header row. Multi-valued cells use `|`.

A malformed optional file is treated as absent. It must never take a page down.

---

## 5. Runtime state

Written by the app. Listed for location only: the format is owned by the
module named, and nothing outside the app should edit these files while it runs.

| Path | Module | What it is |
|---|---|---|
| `app/owners.json` | `lib/store.ts` | Accounts: pantry, list, cook log |
| `app/requests.json` | `lib/requests.ts` | Recipe requests |
| `app/reports.jsonl` | `lib/reports.ts` | Problem reports |
| `events/events.jsonl` | `lib/events.ts` | Behaviour events (BEHAVIOR-SPEC §2) |
| `creators/claims.json` | `lib/claims.ts` | Creator claims |
| `creators/recipes.json` | `lib/creator-recipes.ts` | Recipes added by creators |
| `creators/self.json` | `lib/self-creators.ts` | Creator self-registrations |
| `creators/removals.json` | `lib/removals.ts` | Removal requests |
| `curation/recipes.json` | `lib/curation.ts` | Curator verdicts, merged into recipes on load |
| `decisions/ontology-edits.csv` | `lib/ontology-edits.ts` | Ingredient editor edits, overlaid on the ontology |
| `decisions/unknown.csv` | `lib/unknowns.ts` | Verdicts on the unknown queue |
| `decisions/parse-errors.csv` | `lib/unknowns.ts` | Reported parse errors |
| `images/user/` | `lib/user-images.ts` | Uploaded images |

Writes go to a temp file and are renamed into place. The JSONL logs are
appended.

`decisions/*.csv` are both runtime state and reviewed history: the app appends
to them, and they are committed to the data repo.

---

## 6. A minimal data set

The smallest folder the app runs on:

```
<data root>/
  ontology/
    ontology.json
    recipe-index.json
```

Everything else is optional or created at runtime.
