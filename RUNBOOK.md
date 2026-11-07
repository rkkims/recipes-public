# Runbook

## Crawling the Cloudflare-blocked sources from home

`maangchi.com` and `justonecookbook.com` block datacenter IPs at the WAF
(`DECISIONS.md` §6 — investigated and closed). A home broadband connection is a
residential IP, which is exactly what they want, so running the crawler from
home is the whole fix. No proxy, no paid plan.

### 1. Get the code onto the home machine

Needs **Node 20+**. Copy the repo (or `git clone` once it's pushed), then:

```bash
cd recipes
npm install
```

You do **not** need `.env.local` for this. In fact leave it out — see step 3.

### 2. Confirm you're actually unblocked before crawling 2,000 pages

```
npm run probe -- www.maangchi.com www.justonecookbook.com
```

Works identically on Windows, macOS and Linux — no `curl`, no shell quoting.
Expect **posts and a JSON-LD hit rate** for both. If either says
`blocked (WAF)`, stop: your connection is being treated the way the datacenter
was, and crawling will just produce thousands of failures.

The probe deliberately requests a *sitemap*, never `/`. Maangchi's homepage is
edge-cached and returns 200 even when the rest of the site is blocked — that
fooled this investigation once already.

### 2a. Windows notes

Everything runs under PowerShell with Node 20+; nothing here needs WSL, and no
command in this runbook depends on a Unix shell.

- `npm run <script> -- --flag value` passes through correctly in PowerShell.
- The crawler writes `\n` line endings explicitly, so the JSONL files are
  byte-identical to a Linux run. Don't let an editor or transfer tool convert
  them to CRLF. `data/raw/` is still git-ignored, and the two directories that
  are now tracked — `data/curation/` and `data/decisions/` — are pinned to LF
  by `.gitattributes`, so `core.autocrlf` cannot rewrite them on checkout.
- Paths are built with `node:path`, so backslashes are handled.
- `scp` exists only if the OpenSSH client is installed. It isn't required —
  any file transfer works, see step 4.

### 3. Crawl

```bash
npm run crawl -- --source maangchi,justonecookbook --direct --delay 3000 --limit 20
```

**`--direct` is not optional if you copied `.env.local` across.** Both sources are
flagged `needsResidential`, so with a proxy credential present the crawler routes
them through Apify — which is exactly the path that 403s. Your home IP is already
residential; `--direct` stops it being thrown away.

- **`--source`** forces sources that are disabled in `sources.ts`. No code edit needed.
- **`--direct`** is only needed if the machine has a proxy credential in
  `.env.local`. Without one, routing is already direct. Add it if unsure — it
  ignores proxy config entirely.
- **`--delay 3000`** is deliberately slower than the 1,500 ms default. Maangchi
  returned a transient 403 under fast repeated probing during testing, so being
  gentle on the first real run is cheap insurance.

**Start with `--limit 20`.** It samples evenly across the sitemap rather than
taking the head (the head skews to roundups and non-recipe posts). Check the
totals line: `recipes stored` should be roughly 70–90% of `pages fetched`, in
line with the two working sources.

Then drop the limit for the full run:

```bash
npm run crawl -- --source maangchi,justonecookbook --direct --delay 3000
```

**Just One Cookbook is worth more than its recipe count.** It's a single-cuisine
Japanese source, which makes it the **Japanese ground-truth set that
`cuisine-eval` currently lacks** — the control today is Korean-only, so measured
precision of 1.000 says the classifier finds Korean and says nothing about false
positives toward Japanese. Crawling it closes that blind spot and lets the
thresholds be tuned against two cuisines instead of one.

Roughly 2,000+ pages at 3 s ≈ **2 hours**. It's **resumable** — URLs already in
`data/raw/*.jsonl` are skipped, so interrupting it costs nothing. Re-run the same
command to continue.

### 4. Bring the data back

The output is two JSONL files, `data/raw/maangchi.jsonl` and
`data/raw/justonecookbook.jsonl`. A few MB total.

**Any transfer method works** — the crawler appends and dedupes by `sourceUrl`,
so re-copying, partial copies and repeats are all safe. Options, easiest first:

1. Drop them anywhere on the Linux box and say where; nothing needs a specific path.
2. `scp` from PowerShell, if the OpenSSH client is installed:
   ```
   scp data\raw\maangchi.jsonl data\raw\justonecookbook.jsonl user@host:/home/ubuntu/recipes/data/raw/
   ```
3. Cloud drive / attachment — they're plain text.

Do not merge the files by hand; just place them alongside the others.

### 5. Regenerate the scope report

On the machine holding the full corpus:

```bash
npm run frequency
```

This rewrites `data/reports/ingredient-frequency.csv` across **all** sources
present. The cumulative-coverage numbers it prints are the ontology scope
decision (`DECISIONS.md` §3) — that's the output worth looking at.

---

## Offline QC on a laptop

Reviewing the Weee-derived vocabulary and mapping recipe ingredients onto it,
away from this machine, with no network and nothing installed. `WEEE-SPEC.md`
§4 is the what; this is the how.

### 1. Build the bundle (on this machine)

```bash
npm run weee-pack
```

Writes `data/weee/offline/` — four files, ~6.2 MB:

```
index.html       the tool
vocabulary.js    6,408 names
recipes.js       4,874 recipes, 59,616 ingredient lines
README.txt       the same instructions, next to the tool
```

Rebuild it whenever the vocabulary changes. If `vocabulary.csv` is missing,
run the pipeline first: `weee-shelves → weee-pull → weee-sitemap → weee-parse
→ weee-name`. Only `weee-pull` and `weee-sitemap` touch the network.

### 2. Copy the whole folder across

USB stick, OneDrive, scp — anything. **Keep the four files together**;
`index.html` loads the other two from beside itself.

Then open `index.html`. Double-click is enough: no server, no Node, no install.
Chrome, Edge and Firefox all work.

### 2a. Import the pre-pass

`npm run weee-prepass` (run before packing) decides the mechanical rows and
writes three files into the bundle:

| file | |
|---|---|
| `prepass-vocabulary.csv` | 710 names identical to a confirmed node — auto-accepted |
| `prepass-recipe-map.csv` | 33,347 lines where exactly one vocabulary name matched |
| `prepass-worklist.csv` | everything still undecided, **ordered by how many recipe lines it would resolve** |

Press **Import** in the tool and pick the first two. Every auto row is marked
`auto:` in its note, so they are one search away if you want to spot-check, and
one key overturns any of them.

The worklist is the part that makes this short: **the top 23 rows cover 80% of
the corpus lines still in play, the top 113 cover 95%, and 5,377 of the 5,698
resolve nothing in the corpus at all.** The first two dozen are all the same
decision — singular or plural for `onions`, `scallions`, `carrots` — which is
exactly the naming question WEEE-SPEC §4 exists to ask.

### 3. Work

Two tabs, and the keys are the ones from the `/curate` UI so nothing new has to
be learned:

```
Vocabulary QC   J / K move      A accept    X reject    E edit the name
                N note          G first undecided       U undo    / search

                Sort by confidence and read "low" first — that is the match
                class that produced `alaskan red sea cucumber -> cucumber`.

Recipe mapping  Pick a recipe on the left. Type in an ingredient's box;
                suggestions come from the Weee vocabulary, ranked by how many
                products carry the name. ↑ / ↓ choose, Enter accepts, and
                accepting jumps to the next unmapped line.
```

**About 1 line in 6 will offer no suggestion.** That is measured, not a bug —
some are catalogue gaps and some are recipe-writer abstractions (`neutral oil`,
`hot water`) that no grocer stocks. Skip them.

### 4. Turn autosave on — once, before you start

Click **Autosave to file…**, pick a location, name it anything. Every decision
is written to that file from then on, and the button reads *Autosaving ✓*.

This exists because an export you have to remember is an export you will
forget. Chrome and Edge can write to a file you picked without prompting again;
the handle survives in IndexedDB, so it also survives a reload — though after
one, the browser wants a single click to re-grant, and the button says
**Resume autosave** until you give it.

**Firefox has no such API.** There the button reads *Save a copy now*, a copy
lands in Downloads every 20 decisions, and closing the tab with unsaved work
warns first. Use Chrome or Edge if you have the choice.

### 5. Bring the work home

Copy the autosave `.json` back, then at the repo root:

```bash
npm run weee-import -- ~/Downloads/weee-qc-autosave.json
```

Writes `data/decisions/weee-vocabulary.csv` and `weee-recipe-map.csv`. Merging
is by key and last-write-wins, so re-importing the same file is a no-op and
importing a newer one updates in place. **Nothing is ever deleted by an
import** — a decision missing from the incoming file is left alone, because the
alternative is a partial export silently erasing a full review.

`npm run weee-import` also accepts the two CSVs from the **Export** button, if
you want a spreadsheet-readable artifact as well.

> **Re-packing starts a fresh review.** The bundle is keyed by build, so
> `npm run weee-pack` with a changed vocabulary will not inherit decisions made
> against different names. Import before you re-pack.

### If the page opens blank

Almost always the three files were separated — `index.html` needs
`vocabulary.js` and `recipes.js` beside it. It is never a network problem;
nothing here makes a request.

---

## Other commands

```bash
npm run crawl                      # enabled sources (koreanbapsang, thewoksoflife)
npm run crawl -- --limit 12        # quick end-to-end check
npm run frequency                  # rebuild the ingredient frequency report
npm run typecheck
```

## The Apify Actor

Built, deployed, and **currently useless** — the free plan has no residential
IPs, so it hits the same 403s (`DECISIONS.md` §6). Kept because it's correct and
works the moment a residential tier exists.

```bash
npx apify-cli login -t <APIFY_TOKEN>   # API token, not the proxy password
npx apify-cli push
npm run pull -- --run-id <runId>       # merges the dataset into data/raw/
```

If you're crawling from home, you don't need any of this.
