# Data — what the app reads and writes

This repo is the code. The data is not here: the recipe corpus, creator records
and curation history live in a separate private repo. This file is the contract
between them: what a data folder must hold for the app to run, in what format,
and what the app writes back into it. Anyone who supplies a folder that meets
this spec can run Jipbap on their own recipes.

Scope: the files the **website** (`app/`) reads and writes. The pipeline in
`src/` produces most of them from raw crawl output. The pipeline's own inputs
and working files (`raw/`, most of `qc/`, `reports/`) are not specified here.
The one `qc/` file the website reads, `qc/unknown.csv`, is in §4.

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
  set, it is the `ontology/` folder for every read and write under
  `ontology/`, by the app and the pipeline alike, and it wins over
  `<JIPBAP_DATA_DIR>/ontology`. Every other path follows `JIPBAP_DATA_DIR`.
- A relative value of either variable is resolved against the **repo root**,
  not the current directory, so it means the same folder whether the process
  starts in the repo root or in `app/`.

---

## 2. Four kinds of file

| Kind | If absent | Who writes it | Part of a data set? |
|---|---|---|---|
| **Required** (§3) | The app refuses to start, with an error naming the missing file and the setting from §1 | The pipeline | Yes |
| **Optional** (§4) | The feature it feeds is off; nothing else changes | The pipeline, or a person | Yes |
| **Curated** (§5) | Treated as empty, created on first write | The running app, through the curator's tools | Yes: it is reviewed judgement, kept in the data repo, and the pipeline also reads it |
| **User data** (§6) | Treated as empty, created on first write | The running app, on behalf of users and creators | **No** |

Each file has exactly one kind. User data belongs to the app's users: it is
never committed to the data repo or shipped with a data set, and a sample data
set must not contain it. A sample data set may contain curated files.

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

`ingredients`, `relations` and all three lists inside `relations` must be
present, though any list may be empty. Each ingredient needs `id`, `slug`,
`name`, `mentions` and `aliases` (`[]` when it has none). `redirects` and the
fields marked optional may be left out.

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
      "rating": 4.5,                       // optional: the source's own, out of 5, or null
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

A broken optional file (one that can't be parsed) is treated as absent. It must never take a page down.

---

## 5. Curated

Written by the app when a curator uses the curate and editor pages, and
committed to the data repo as reviewed history. The pipeline reads them as
input (`npm run recipe-index`, `npm run apply-edits`). The format is owned by
the module named.

| Path | Module | What it is |
|---|---|---|
| `curation/recipes.json` | `lib/curation.ts` | Curator verdicts, merged into recipes on load |
| `decisions/ontology-edits.csv` | `lib/ontology-edits.ts` | Ingredient editor edits, overlaid on the ontology |
| `decisions/unknown.csv` | `lib/unknowns.ts` | Verdicts on the unknown queue |
| `decisions/parse-errors.csv` | `lib/unknowns.ts` | Reported parse errors |
| `decisions/line-fixes.csv` | `lib/line-fixes.ts` | Corrections to single ingredient lines, applied by `npm run recipe-index` |

The other files in `decisions/` are not written by the app. Of those, the
website reads only `decisions/hard-to-find.csv` (§4). The rest are pipeline
inputs.

---

## 6. User data

Written by the app, with one exception noted below. Listed for location only:
the format is owned by the module named, and nothing outside the app should
edit these files while it runs.

| Path | Module | What it is |
|---|---|---|
| `app/owners.json` | `lib/store.ts` | Accounts: pantry, list, cook log |
| `app/requests.json` | `lib/requests.ts` | Recipe requests |
| `app/reports.jsonl` | `lib/reports.ts` | Problem reports |
| `events/events.jsonl` | `lib/events.ts` | Behaviour events (BEHAVIOR-SPEC §2) |
| `creators/claims.json` | `lib/claims.ts` | Creator claims |
| `creators/recipes.json` | `lib/creator-recipes.ts` | Recipes added by creators |
| `creators/self.json` | `lib/self-creators.ts` | Creator self-registrations |
| `creators/removals.json` | `lib/removals.ts` (reads) | Creator removals. Written by the operator script `src/ops/creator-removal.ts`, not by the app |
| `images/user/` | `lib/user-images.ts` | Uploaded images |

Writes to §5 and §6 files go to a temp file and are renamed into place. The
JSONL logs are appended.

---

## 7. A minimal data set

The smallest folder the app runs on:

```
<data root>/
  ontology/
    ontology.json
    recipe-index.json
```

Everything else is optional, or created when the app first writes it.
