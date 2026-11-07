# Operating jipbap

Written 2026-08-24, for the version of you who comes back in three months
having forgotten all of this. It assumes nothing except that you can open a
terminal and a browser.

The deal you set: **jipbap gets curation and nothing else.** You are looking
for work; this project may not ask you for troubleshooting, plumbing, or
attention beyond three activities — curate, add recipes, map affiliate
products. Everything below exists to keep that true. If something here starts
demanding more, that is a bug in the setup, not a task for you.

---

## 1. Money — read this first

| Thing | Cost | Notes |
|---|---|---|
| jipbap.com | ~$15/yr | domain.com, already paid, auto-renews |
| Cloudflare (site, Workers, D1, KV, analytics) | **$0** | free tiers, by orders of magnitude |
| **The GCP VM** | **~$100+/month** | `e2-standard-4`, Montreal. **The only real cost, and it is large.** |

**The VM is the thing to deal with.** It serves two sites: jipbap (which is
being moved to Cloudflare) and `<other-site>` (a wedding site, plain
static files in `/var/www/other-site`). Once jipbap's cutover is done,
the wedding site can move to Cloudflare Pages the same way — and then the VM
can be **deleted**, taking the running cost of everything to the domain
renewal alone.

Until that happens you are paying about $100 a month to host two static
sites. Nothing else in this document is worth as much as that paragraph.

---

## 2. Where everything is

- **The site people visit:** https://jipbap.com
- **The repo:** `github.com/rkkims/recipes`, branch `main`. It holds the
  app, the recipe corpus, the ontology, and your curation decisions.
- **Cloudflare** (account: your Google login) runs four things, all free:
  - `jipbap` — the static site itself
  - `jipbap-go` — outbound shop links, records which ingredient was clicked
  - `jipbap-sync` — behavioural events, and (soon) accounts and sync
  - `jipbap` D1 database + `jipbap_outbound_clicks` analytics dataset
- **The VM** (<server-ip>) — currently still serving jipbap.com, and the
  wedding site. See §1.
- **Deploy credentials:** `/home/ubuntu/.jipbap-deploy.env` on the VM
  (chmod 600). If the VM is deleted, move this file to wherever you curate.

---

## 3. The loop: curate, and the site publishes itself

This is the whole job.

```sh
cd ~/recipes
git pull

# start the curation server (production build; rebuild after any code change)
cd app && NEXT_DIST_DIR=.next npx next build && NEXT_DIST_DIR=.next npx next start -p 5173
```

Open **http://localhost:5173/curate** and judge recipes. Keep or drop; the
form pre-fills the machine's guesses and you correct them. Everything you
decide lands in `data/curation/recipes.json`.

When you are done for the session:

```sh
cd ~/recipes
npm run build-static          # regenerates the shelf and builds the site
npx wrangler deploy -c deploy/cloudflare/wrangler-site.toml
git add data/ && git commit -m "curation: <what you judged>" && git push
```

That is the publish. A recipe you keep appears on the live site; a recipe you
drop disappears from it. **Only recipes you have kept are on the site at
all** — the shelf is exactly your judgement, which is why curation is the
product.

> While the VM still exists, a timer does the publish step for you every 15
> minutes (`jipbap-static.timer`). Once the VM is gone, run the two commands
> above yourself at the end of a sitting.

---

## 4. Adding recipes

Two different things, do not confuse them:

**a. Adding a recipe to the corpus (yours to curate).** The corpus came from
crawling ~18 blogs. Growing it means running the ingest pipeline in the repo
(`npm run` scripts under `src/`), which re-parses source pages into
`data/ontology/recipe-index.json`. This is the "add more recipes for
curation" you asked for; it is a batch job, not a UI.

**b. A visitor adding their own recipe by URL.** This is a product feature on
`/my-recipes`. It needs a parser running somewhere. **Status: not yet
working on the static site** — see §8.

---

## 5. Mapping affiliate products

When an affiliate programme approves you, ingredients need to point at that
retailer's pages. That is a decisions file, not code:
`data/decisions/weee-shelf.csv` is the existing pattern — one row per
ingredient, naming the retailer's shelf. Add a file per retailer, rerun
`npm run build-static`, deploy. The registry that decides *which* retailer a
region gets lives in `app/src/lib/retailers.ts`.

**Current affiliate state (2026-08-24):** Instacart declined (traffic),
FlexOffers declined (traffic), Awin approved but WaNaHong pending, Instacart
IDP still in review, Amazon deliberately not applied for. Links currently
work but earn nothing. Reapply after the shelf is deep and the first
community posts have brought real visitors — not before, because a third
decline is a real cost.

---

## 6. Checking whether anyone came

**Cloudflare dashboard → Workers & Pages → `jipbap` → Metrics.** Requests,
unique visitors, countries. Free, no setup, no script in anyone's browser.

**What actually matters is not visits but returns.** The question the whole
plan turns on: does a stranger come back a week later and cook? That lives in
the D1 database:

```sh
npx wrangler d1 execute jipbap --remote --command \
  "SELECT kind, count(*) FROM events GROUP BY kind"
```

`cook_event` rows are people cooking. `pantry_event` rows are people filling
a kitchen. If those two grow, the product works. If visits grow and those do
not, the product does not — and that is worth knowing before spending
attention on it.

Baseline as of today: **no organic human visitors yet.** The traffic in the
logs is Google's crawler, vulnerability scanners, and affiliate reviewers.
That is expected — nothing has been announced anywhere.

---

## 7. If it gets popular — when to pay Cloudflare

You are on free tiers with a great deal of headroom. The order things break:

| Limit | Free tier | Roughly |
|---|---|---|
| D1 writes | 100,000/day | ~10,000 active cooks a day |
| Worker requests | 100,000/day | ~5,000–10,000 visitors a day |
| Static site requests | unlimited | never |

**The upgrade is one click: Workers Paid, $5/month**, which raises all of the
above by orders of magnitude. If the dashboard shows you approaching any
limit, take it — $5 is not a decision, and hitting a limit means events stop
being recorded (the site itself keeps serving).

---

## 8. What is NOT finished (2026-08-24)

Read this before assuming the cutover happened.

- **jipbap.com still points at the VM.** The static site exists and works at
  `https://jipbap.richard-k-kim-work.workers.dev` but the domain has not
  moved. Moving it is one change in Cloudflare (DNS → the `jipbap` Worker).
- **Add-by-URL does not work on the static site.** The parser needs to become
  a Worker (`jipbap-parse`). This is a **cutover blocker** — it is one of
  your three activities and the second step of the growth loop.
- **The export-your-data button** is not wired to the device's export.
- **Accounts and sync on D1** were being built when this was written; if they
  landed, you set your password once by signing up with your existing email.
- **Creator claims** need an endpoint; creator pages are read-only until then.
- **The wedding site has not moved**, so the VM cannot be deleted yet (§1).

---

## 9. Coming back after a long time

1. `cd ~/recipes && git pull` — read `DECISIONS.md` and `BUSINESS-REVIEW.md`
   §11 if you want the reasoning behind the current state.
2. Read §8 above; it is the only place that goes stale.
3. Curate (§3). If the shelf grew meaningfully, reapply to the affiliate
   programmes (§5).
4. Check §6 for whether anyone came.

**The one thing not to do:** do not start building features. The product is
finished for its purpose. Its remaining risk is not missing functionality —
it is spending your attention on something that has not yet earned it.
