# Go live

**As of 18 August 2026.** The operational checklist, superseding `LAUNCH-V1.md`
§9's order of work — that document is the reasoning, this one is the state.

Everything under *Standing* was verified by running it on this VM on 18 August,
not read off a plan. Everything under *The path* is what remains.

---

## Standing — checked 18 August 2026

| | State | How it was checked |
|---|---|---|
| Service | `jipbap.service` **active, `NRestarts=0`, enabled** | Was crash-looping 102× on `EADDRINUSE` behind a hand-started `next start`; the squatter is gone and systemd owns :3000 again |
| Public | `http://<server-ip>` → **200** | curl from outside |
| `/curate`, `/_stats` | **401** | curl; nginx basic auth, separate credential files |
| Backups | `jipbap-backup.timer` + `jipbap-stats.timer` **running** | `systemctl list-timers`; hourly `owners.json` snapshots present on disk |
| Legal pages | `/privacy`, `/terms` **200**, no unfilled placeholders | curl |
| Disclosure | *"We earn a commission on these links."* | `BuyBlock.tsx:110` |
| Attribution | **Recording in production** | `events.jsonl`: `buyblock_shown: 34`, `outbound_click: 1` |
| Icon | A green rice bowl, **no letterforms** | Rendered `/icons/192` and looked at it. `LAUNCH-V1` §2's OPEN question is closed — there is no wrong-glyph risk |
| Affiliate tag plumbing | **Dry-run proven** — see below | The one-line-env-change claim, tested |
| Deploy | `./deploy/deploy.sh` — stages, swaps, restarts, rolls back | Used it today |

### The tag dry run, so approval day is five minutes

`LAUNCH-V1` §6 claims approval is "a one-line env change and a restart, not a
code change". That had never been run. On 18 August it was, with a dummy value:

```
WEEE_AFFILIATE_TAG=dryrun-DELETE-ME  →  app/.env.production  →  systemctl restart
  service environment carries the tag                                  ✓
  weeeUrlFor("gochujang") → …/Hot-Sauce?ref=dryrun-DELETE-ME            ✓  still a valid URL
  with no tag set        → …/Hot-Sauce                                  ✓  working, untagged
```

Reverted afterwards; the service holds no tag today. **`app/.env.production` is
gitignored**, so the real tag cannot be committed by accident.

The claim holds — *provided* the programme issues a query parameter. See the
open question on tag shape below.

---

## The path, in order

> **2026-08-21:** steps 1 and 2 are done — `jipbap.com` live over TLS (the
> cookie flag died with it, `deploy/README.md` has the day as it actually
> went), `hello@jipbap.com` receiving via Cloudflare Email Routing. Step 4
> changed shape: Weee! is out of the funnel entirely (store credit, invite
> only — `BUSINESS-REVIEW` §11 "Superseded"), Instacart's Impact application
> and the IDP Canada application are both filed. Step 3 remains the gate.

### 1. Domain, and email at it — the long pole

`dig jipbap.com` returns nothing today. This blocks TLS, the affiliate
application, and the reviewer's ability to reach a human.

1. Register `jipbap.com`. Point an `A` record at **<server-ip>**, plus `www`.
2. **Set up `hello@jipbap.com` in the same sitting.** `/privacy` and `/terms`
   both publish that address; the affiliate reviewer emails it, and a bounce
   reads as a dead site. Registrar forwarding or ImprovMX → Gmail is enough; no
   Workspace bill needed.
3. `deploy/nginx-jipbap-domain.conf` is written and waiting — its header carries
   the exact four steps, including the certbot command.

### 2. TLS, and the cookie flag that must die with it

`certbot --nginx -d jipbap.com -d www.jipbap.com`, then **delete
`INSECURE_COOKIES=1` from `app/.env.production`** and redeploy. Not cosmetic:
that flag exists only because a `secure` cookie over plain http is silently
dropped, and the moment there is TLS it means session tokens travel in the
clear. It is the single easiest thing to forget in this document.

### 3. Put recipes on the shelf

The public homepage renders **0 recipes** — the gate is closed and the archive
emptied it (`7d4e58c`). An affiliate reviewer arriving today finds a working app
with no content, which is the one thing that fails a review outright.

This is the ongoing QC work; it is the true gate on step 4, not the paperwork.

### 4. Apply — Weee and Instacart in parallel, Amazon deliberately later

- **Weee!** — 6% on a **48-hour** cookie (their own page; the FlexOffers listing
  disagrees and is wrong). Submit the live `jipbap.com` URL.
- **Instacart — the *affiliate*, via Impact. Revised 2026-08-20.** US/CA, ~5%
  ongoing plus up to $10 CPA on a 7-day cookie — a materially better window than
  Weee's, and the fix for the coverage hole `RETAILER-SPEC` §0 exists for: Weee!
  does not deliver to Metro Vancouver, so today the product cannot show a buy
  link to the person building it. It is a drop-in `Retailer` row.

  **This bullet previously read "Instacart IDP — start this early" while quoting
  the affiliate's terms.** They are two applications with two agreements that
  happen to share Impact as the payment rail, and conflating them is easy enough
  that this document did it. The IDP is the recipe→cart API; the affiliate is a
  tracked link.

- **Instacart IDP — deferred, 2026-08-20.** The "start early" case was the 30–40
  day lead to a production key, free and needing no traffic. That only counts if
  the cart gets built, and `BUSINESS-REVIEW` §8A now scopes the cart to the
  grocery list and rules it out on the recipe — a gap link monetises the user's
  pantry, a recipe cart monetises someone else's recipe. The list surface that
  would carry it does not exist yet.

  **And free to apply is not free to sign.** The IDP agreement carries uncapped
  indemnity on our side against Instacart's **$100** liability cap, warranted
  over 8,129 recipes we did not write (`BUSINESS-REVIEW` §11). Revisit when the
  list cart is actually being built, not before.
- **Amazon Associates — not yet.** Amazon closes accounts that do not make **3
  qualifying sales within 180 days of approval**. Applying before there is
  traffic burns the application. Add it as the tail router once people are
  actually clicking.

Both applications need the entity and tax answers below.

### 5. Tag, then one canary order

1. Real tag into `app/.env.production`, `sudo systemctl restart jipbap`.
2. **Verify the link actually carries it** — do not assume; the dry run above is
   the procedure.
3. **One real purchase through our own link.** Confirm it appears in the network
   dashboard, and write down the gap between our `outbound_click` count and
   theirs. That constant is the only thing that later separates *"they are
   underreporting"* from *"our links are broken"* (`BUSINESS-REVIEW` §13).

### 6. A weekly number

Nothing reads `events.jsonl` today. `BUSINESS-REVIEW` §14 asks twice for click
discrepancy and conversion-rate stability as a `RUNBOOK.md` check. A twenty-line
report script is the entire analytics stack this product needs.

**The measurement that is already running:** every click records `had_products`
and `resolved`. §15's oldest open question — *what fraction of gap ingredients
resolve to no Weee product* — falls out of the log once traffic exists. No
crawl, no coverage audit. The single click on record so far had
`had_products: false`, which is a sample of one and worth nothing except as a
reminder of what the field is for.

---

## Distribution plan — recorded 2026-08-21

Settled with the curator the night the infrastructure gates all opened at
once. The full strategy context lives in `BUSINESS-REVIEW` and the settled
strategy of 2026-08-11; this is the operating shape.

**Three channels, three different physics:**

1. **Community placements — ammunition, not a channel.** Roughly 5–15 quality
   shots exist (Maangchi's forum, r/KoreanFood, Korean-American groups,
   r/AsianFood, r/Cooking in that firing order — cheapest goodwill first,
   strictest self-promo norms last) and they do not regenerate. The silence
   finding governs the format: nobody complains about westernized ingredient
   matching, so the post **names the problem** (recognition) rather than
   answering a complaint that was never filed. Per shot: the link lands on
   the exact experience the post describes, the referrer is watched in
   GoAccess that day, and the thread is tended for 48 hours. Cadence: one
   shot, one week reading residency (`cook_event` by arrival cohort, not
   visits), one message revision. At that cadence the inventory is a quarter
   of distribution — there is no rush that survives arithmetic.
2. **Creator pages as link-in-bio destinations — a continuous channel**
   (corrected 2026-08-21: what stays rejected is building a *general*
   link-in-bio tool; being the *destination* is why the creator page
   exists). A creator links their jipbap page in bio and their viewers cook
   the creator's other recipes from what they already have — one more cook
   from the same audience, recurringly, on the creator's own distribution.
   Passes the zero-user test, and gives creators a self-interested reason to
   claim before any demand signal exists — which softens "creators are step
   four" without repealing it: outreach still waits for the ledger's real
   numbers; the *claim flow* does not.
3. **Recommendation-query citations — the passive surface.** "Which site
   suggests Asian recipes from my ingredients" is answered by Reddit threads
   and LLM syntheses, never by our homepage; the community posts above are
   the citations. This is all that remains of SEO, and it is free.

**SEO is closed as a work item — 2026-08-23.** Search Console registered and
the sitemap submitted, which completes the brand-search carve-out; nothing
else about search is worth building. Public per-ingredient pages were
proposed as the one rankable surface (tool queries like "what to cook with
gochujang", fed automatically by curation) and **rejected by the curator on
the rule that decides it: we do not publish pages whose only job is to be
found.** A page a cook inside the product has no reason to open is a doorway
page wearing a product's clothes, whatever its traffic. If an ingredient
page is ever built it will be because the product needs it, and any search
benefit arrives as a by-product, never as the reason.

Same rule holds the sitemap at three URLs. Creator pages are already public
and crawlable but stay out of it while they are unclaimed and thin;
advertising them is honest only once a creator has claimed and populated
one, which is also the moment it starts feeding the bio-link channel.
Recipe pages remain canonical to the creator's original, permanently.

**Sequencing:** curate to the depth gate (the number of keeps at which a
Maangchi-forum regular browsing the shelf embarrasses nobody — the homepage
un-gates with it); meanwhile run the hostile import test (ten ugly URLs —
the bad-parse path must degrade to a small ask, or the loop dies at step 2
before any creator sees a signal), build the demand-signal ledger query, and
drop `IMPACT_INSTACART_BASE` in on approval day. Then shot #1. Creator
outreach begins when the ledger has real numbers, not on a date. Affiliate
approvals gate nothing — links work untagged.

**Not doing (distribution edition):** paid distribution at $0.01–$0.12 per
visitor; SEO as a volume channel; creator recruitment before the signal;
surveying creators; revenue share and its $1.35 checks; a general
link-in-bio tool; gap-report subscriptions on snapshots; and spending any
community shot before the depth gate — the first visitor from each
community arrives exactly once.

## Decisions still open

- **Legal entity — person or LLC?** Blocks the same answer in three places: the
  privacy policy, the affiliate application, and the tax form (W-9 if US).
  Sole proprietor under your own name is free and sufficient. Decide once.
- **Payee setup.** Approval and payment are different gates: Impact holds a $10
  minimum and pays ~55 days after month end, and wants a tax form and a payment
  method before any money moves.
- **What shape is the tag?** `weee.ts:141` appends `?ref=<tag>`. That is right
  for a query parameter and **wrong for a network redirect wrapper** — if
  FlexOffers or Impact hand back a `track.…/?url=` destination, `weeeUrlFor`
  needs a wrapping step, which is a code change and a redeploy rather than an
  env edit. The programme's terms page answers this *before* applying.
- **Does Weee permit competing retailers alongside?** Nothing in the public page
  addresses exclusivity, and the plan runs Weee plus Instacart. One email.
- ~~**`main` is 225 commits behind `ux-pass`.**~~ Done 2026-11-06: `main` was
  fast-forwarded to `ux-pass` and `ux-pass` deleted. `main` is the trunk.
- **Does the event log need a retention cap?** As of 18 August, closing an
  account anonymises that household's rows rather than deleting them, and the
  policy says so. Nothing trims the file by age. That is defensible — the rows
  carry no name, and `BEHAVIOR-SPEC` §2 makes the trajectory the asset — but it
  is a choice, and it should stay a choice made on purpose.

---

## Not doing, so it is not re-litigated

- **An `/about` page** — decided 18 August. The legal pages already carry the
  contact and will carry the entity; the recipes are the content story.
- **Amazon Associates** until there is traffic (see step 4).
- **Push notifications** — a retention mechanic, and there is one user who does
  not need reminding.
- Accounts as a launch requirement, the recipe pool, social ingest, SEO push.

---

## Verified end-to-end today, for the record

- The account-deletion promise. Closing an account now unpicks the household
  from `events.jsonl` before the owner write, so a person is never told their
  data is gone while it is not. Exercised against a fixture: the identifier goes,
  the row survives, other households are untouched, and a re-export returns zero
  rows.
- The export carries those events, so *"everything held against your browser"*
  is true.
- `data/events/` is gitignored — it was one `git add .` from being source.

**Not** verified end to end: a full account close through the UI, which needs a
throwaway account and a write to live `owners.json`. Worth doing on the next
forge-and-clean cycle.
