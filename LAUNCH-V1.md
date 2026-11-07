# Launch v1

**Status:** plan, not yet executed. Decisions in §0 are settled; open questions are
marked **OPEN** and should be closed before the section they sit in is built.

---

## 0. What v1 is, and what it is not

v1 has exactly two jobs. Everything in this document is justified by one of them,
and anything justified by neither is cut.

| # | Job | What it demands |
|---|-----|-----------------|
| 1 | **Dogfooding.** One user — the author — cooks from this daily, in a real kitchen, on a real phone. Bugs and bad data are found by use, not by audit. | A public HTTPS URL, installable as a PWA, with state that survives. The cook → pantry → list loop must work end to end. |
| 2 | **Affiliate qualification.** The site is submitted to Weee! so that the monetisation machinery is approved and waiting when v2 opens to the public. | A reviewable site: real name, privacy policy, affiliate disclosure, working outbound links, a plausible content story. |

**v1 is not a public launch.** No marketing, no SEO push, no sign-ups, no
accounts. `signedIn()` stays hard-wired `false` (`app/src/lib/account.ts`), so
account-gated surfaces stay dark for free.

### Settled 2026-08-10

| Decision | Choice | Consequence |
|---|---|---|
| Hosting | **This GCP VM, `next start` behind Caddy** | The file-backed store and the ~70MB of `data/` reads keep working untouched. No storage rewrite. |
| Name | **jipbap**, "what can I cook" demoted to tagline | Copy-only change; the domain and the product finally agree. |
| Access | **Fully public; `/curate` locked** | Affiliate reviewer can visit. Per-cookie owner state means no visitor sees another's pantry. |

---

## 1. The surface cut

The instruction is *hide My recipes, Meal plan, and their buttons — not ready for
production*. The cut is by **flag, not by deletion**: the code is working and will
be wanted back at v2, and deleting it would strand `/list`, which reads from the
plan (§1.3).

### 1.1 One flag, read in one place

`app/src/lib/surface.ts` — **built 2026-08-10**:

```ts
/** Places that exist and work, but that v1 does not advertise. */
const HIDDEN = new Set(["/my-recipes", "/calendar"]);
export function listed(href: string): boolean { return !HIDDEN.has(href); }
export const PLAN_BUTTON: boolean = false;   // needs the calendar to mean anything
```

No `SAVE_BUTTON` — §1.4 resolved in favour of keeping the heart.

No env var. The flag is a code constant so that turning it on at v2 is a diff
with a commit message, not a server restart nobody remembers.

### 1.2 Call sites

| File | What changes |
|---|---|
| `app/src/components/Nav.tsx:46` | `PLACES` filtered through `showPlaces` — drops both from the top bar and the phone tab bar at once. `TITLES` may stay; it is only read for the routes that survive. |
| `app/src/app/manifest.ts:44` | Drop the `Meal plan` shortcut. Keep `Grocery list`. |
| `app/src/app/page.tsx:842` | `PlanButton` in the recipe modal — behind `PLAN_BUTTON`. |
| `app/src/app/recipe/[id]/page.tsx:153` | Same. |
| `app/src/app/my-recipes/page.tsx:429`, `app/src/app/calendar/page.tsx:347` | Same, though these pages are unlisted anyway. |
| `app/src/app/page.tsx:736` | `Nothing yet. <Link href="/my-recipes">Add a recipe</Link>` — the only in-body link to a hidden place. Replace the empty state, do not just unlink it. |
| `app/src/app/page.tsx` ×6, `recipe/[id]/page.tsx` ×2 | `SaveButton` — pending §1.4. |

The routes themselves stay live and unlisted. Nothing 404s, nothing is deleted,
and a bookmark still works — which is what "hide from surface" means.

### 1.3 What the cut costs, stated

**`/list` loses half its reason to exist.** `app/src/app/list/page.tsx:82-102`
builds a whole shelf — *"for your meal plan"* — from `upcomingPlans`, and the
per-row provenance (*"gochujang — Korean Fried Chicken, Thu"*) is the calendar
join UX-SPEC §4a calls "one fact". With no way to create a plan, that shelf is
permanently empty and the list falls back to being a manual list plus near-miss
suggestions.

That is survivable for dogfooding — the pantry → list → shop loop is intact — but
it means **§4a goes untested in v1**, and it is one of the least-proven parts of
the product. Worth knowing before v2 assumes it works.

**Cook history becomes write-only.** `madeIt` still records and still deducts
from the pantry, but the record is only readable on `/my-recipes`. See §1.4.

### 1.4 **SETTLED 2026-08-10** — "Made it" and the heart both survive

Three buttons sit on the recipe modal: **Made it**, **Save** (heart), **Plan**.
Plan is clearly out. The other two are not obvious:

- **"Made it" should stay.** It is a *pantry* action, not a my-recipes feature —
  DECISIONS §5, additive to the pantry (`app/src/app/actions.ts:346`). It is
  also the single most valuable dogfooding signal: it is how the pantry drains,
  and pantry drain is the thing most likely to be wrong. Its readback being
  unlisted is acceptable; the write is the point.
- **The heart is the real question.** With `/my-recipes` unlisted, saving is a
  write into a room you cannot open. Options: (a) drop the heart, (b) keep the
  heart and unlist `/my-recipes` but leave it bookmarkable for the author's own
  use, (c) keep `/my-recipes` visible after all and hide only the calendar.

  Chosen: **(b)** — the author is the only user, a bookmark is enough, and it
  keeps the save data accumulating for v2 instead of starting from zero.

### 1.5 Two things the cut turned up that the plan had not

- **The `.modal-actions` row.** `RecipeDetail.tsx:314` renders it on
  truthiness, and a JSX fragment is truthy however empty it is. With the plan
  button gone, every corpus recipe would have drawn an empty action row. Both
  call sites now spread `actions` conditionally rather than passing an empty
  fragment.
- **The "Added by me" tab** on the home gallery. Own recipes cannot be created
  at v1 (account-gated), so the tab could only ever read `0` beside an empty
  state inviting you to a page that is no longer on the map. It is now gated on
  a non-zero count: it survives for anyone who already has some, and otherwise
  does not appear.

### 1.6 Deliberately untouched

`/calendar` and `/my-recipes` keep their own `PlanButton`s. They are behind the
unlisting already, and stripping "Add to plan" from the calendar would break the
one page for the one person who can still reach it.

---

## 2. Brand

Copy-only, ~6 files. `jipbap` lowercase, 집밥 not shown in chrome.

| File | Now | v1 |
|---|---|---|
| `app/src/components/Nav.tsx:122` | `what can I cook` | `jipbap` |
| `app/src/components/Nav.tsx:118` | `sr-only` h1 fallback | `jipbap` |
| `app/src/app/layout.tsx:9,11` | title, `appleWebApp.title` | `jipbap` |
| `app/src/app/manifest.ts:22-23` | name, short_name | `jipbap` |
| `app/src/app/manifest.ts:25` | description | keep — it is already the tagline |
| `app/src/app/recipe/[id]/page.tsx:86` | `${title} · what can I cook` | `${title} · jipbap` |

Per the standing copy rule: chrome gets no accent, and the tagline is the
description, not a second line in the bar.

**OPEN:** does the icon (`app/src/app/icons/[size]/route.tsx`) draw a mark that
still reads as jipbap, or does it spell something? Check before shipping — a
wrong glyph on the home screen is the one branding error that is expensive to
correct after install.

---

## 3. Deploy

### 3.1 Shape

```
jipbap.com ──DNS A──▶ this VM ──Caddy :443──▶ next start :3000
                                              reads  /home/ubuntu/recipes/data/**
                                              writes /home/ubuntu/recipes/data/app/owners.json
```

Caddy for TLS because it does ACME with no configuration and renews itself. Next
runs under a systemd unit so it survives reboot and restarts on crash.

### 3.2 Steps

1. **DNS.** `A` record for `jipbap.com` → the VM's static external IP. Confirm the
   IP is *static* — an ephemeral IP that changes on stop/start silently breaks
   the domain. Add `www` only if we want it; a redirect is cheaper than a second
   cert.
2. **Firewall.** Open 80 and 443 on the GCP firewall. 3000 stays closed; Caddy is
   the only public listener.
3. **Build target.** Build into a dedicated dist dir so the curation session on
   `:5173` is never killed mid-review by a production build —
   `NEXT_DIST_DIR=.next-prod npm run build`, and the systemd unit starts with the
   same variable. This is exactly what `app/next.config.mjs` already anticipates.
4. **systemd unit** `jipbap.service`: `WorkingDirectory=/home/ubuntu/recipes/app`,
   `ExecStart=npm run start`, `Environment=NEXT_DIST_DIR=.next-prod`,
   `Restart=always`, `EnvironmentFile=/home/ubuntu/recipes/app/.env.production`.
5. **Caddyfile:** `jipbap.com { reverse_proxy localhost:3000 }`. That is the whole
   file; TLS is automatic.
6. **Deploy script** — `npm run deploy` at repo root: typecheck → build to
   `.next-prod` → `systemctl restart jipbap`. Small, but it is the difference
   between a repeatable deploy and a remembered one.

### 3.3 The data on disk is now production data

`data/app/owners.json` is the only file that cannot be regenerated. Everything
else in `data/` is pipeline output.

- **Back it up.** A cron `cp` to a timestamped file, plus off-VM. Fourteen days
  of hourly copies is ~a megabyte and covers every realistic mistake.
- `store.ts` writes via `renameSync`, so a torn write is not the risk. The risks
  are *deleting the VM* and *a bad migration*.
- **OPEN:** the curation loop and the live app both write under `data/`. Confirm
  no pipeline script rewrites `data/app/` — a `weee-pack` or `freeze` run that
  touches it would eat live user state.

### 3.4 Timezone

`app/src/lib/owner.ts:47` notes that the first render for a new visitor uses the
server's zone, and that a CDN geo header would fix it. There is no CDN here.
Behind Caddy, the `TimeZone` client component is still the only source — so the
first paint of the calendar can be a day off until JS runs. Acceptable at v1
(the calendar is hidden anyway); note it for v2.

---

## 4. Locking `/curate`

`/curate` and `/curate/list` are the internal curation queue. They are
`force-dynamic`, they **write** to `data/curation/`, and they are currently open
to anyone who guesses the URL.

Simplest sufficient lock: Caddy `basic_auth` on the `/curate*` path prefix, with a
bcrypt hash in the Caddyfile. No app change, no session handling, and it cannot
be bypassed by a route the app forgets to guard.

Also confirm `/export` (`app/src/app/export/route.ts`) is safe to leave open — it
is, since it keys on the caller's own `owner` cookie and returns 404 for a cold
browser, but it should be re-read once with a public URL in mind.

---

## 5. Legal, and the affiliate prerequisites

This is the section most likely to block the Weee submission, and none of it is
written yet.

| Item | State | Needed for |
|---|---|---|
| `legal/privacy-policy.md` | **draft with unfilled placeholders**, untracked in git, served at no route | Affiliate approval; also `pool.ts:92` refuses to enable sharing until it is real |
| Terms of service | does not exist | Affiliate approval usually asks |
| Affiliate disclosure in the UI | **missing** — links carry `rel="sponsored"` (`BuyBlock.tsx:66,77,85`) but there is no visible "we may earn a commission" | FTC requirement, and reviewers look for it |
| `/privacy`, `/terms` routes | do not exist | Something must be linkable from the footer |
| Cookie/consent notice | `ShareConsent` exists but pool sharing is off | Probably not needed at v1 — no third-party cookies, one first-party functional cookie |

**Work:** fill the placeholders in the privacy policy, write a short terms page,
render both as static routes from the markdown, link them from a footer, and add
one line of disclosure to `BuyBlock`. `PRIVACY-SPEC.md` and
`legal/partner-data-clauses.md` are also untracked — commit them.

**OPEN:** who is the legal entity on the privacy policy and terms — a person, or
an LLC? The affiliate application asks, and the answer goes on the page.

---

## 6. The Weee! track

Per `BUSINESS-REVIEW.md` §11 and the 2026-08-05 settlement, Weee! is the v1
affiliate and the terms are still unread. Two things run in parallel:

1. **Apply through the network.** FlexOffers lists $8/new customer order, 7-day
   cookie; the programme is also reachable via Impact for US/CA traffic. Submit
   the live jipbap.com URL. Approval is what v1 exists to obtain — the traffic
   comes later.
2. **Email `affiliate@sayweee.com` directly**, and do not wait for the reply.
   Ask two questions: the real rate, and whether the nationwide shipping tier
   counts for attribution (BUSINESS-REVIEW §11 flags coverage as the second
   disqualifier after rate).

**Ship the links untagged now.** `app/src/lib/weee.ts:33` reads
`WEEE_AFFILIATE_TAG` from the environment and produces a working, untagged link
when it is unset — which is correct, and means approval is a one-line env change
and a restart, not a code change.

**OPEN:** what shape is the tag once approved — a query parameter appended to the
Weee URL, or a network redirect domain (FlexOffers/Impact wrap the destination)?
If it is a redirect wrapper, `weeeUrlFor` needs a wrapping step, not a parameter,
and that is a small code change to plan for rather than discover.

Also correct `DECISIONS.md` §2, which still quotes the consumer refer-a-friend
terms as if they were the affiliate terms. Every revenue figure downstream
inherits that error.

---

## 7. Dogfooding instrumentation

The point of v1 is to *find* things, so there has to be somewhere for findings to
go that is not memory.

- **A running log.** `DOGFOOD.md` at repo root — one line per observation, dated,
  tagged `bug` / `data` / `ux`. Cheap, and it is the input to the v2 backlog.
- **Data QC is the expected bulk of it.** 4,874 recipes, 40 curated, 70.5%
  servable. Every wrong ingredient parse met in a real kitchen is a curation
  entry — the existing `/curate` revisit flow is already the right tool, which is
  why §4 locks rather than removes it.
- **Server errors need to be visible.** `journalctl -u jipbap` is the log. Worth
  a `journalctl` alias or a weekly check; a 500 on a phone in a kitchen is
  otherwise invisible.
- **OPEN:** is push (`npm run remind`, `web-push`) part of v1? It needs VAPID
  keys in the environment and a reason to fire. Recommendation: **out** — it is a
  retention mechanic, and there is one user who does not need reminding.

---

## 8. Not in v1

Named so they are not re-litigated mid-build: accounts and auth; the recipe
pool / crowd truth sharing (`pool.ts` correctly refuses while the policy is a
draft); recipe requests (§11 of UX-SPEC); social ingest; SEO and sitemap; Amazon
Associates as the second affiliate (BUSINESS-REVIEW recommends it, but two
programmes at once doubles the approval surface — add it once Weee is approved);
push reminders; anything that needs a database.

---

## 9. Order of work

1. Surface cut + brand (§1, §2) — pure code, no dependencies, testable locally.
2. Legal pages + affiliate disclosure (§5) — the long pole, because it needs
   decisions and prose rather than code.
3. Deploy (§3) + lock `/curate` (§4) — DNS propagation is the only wait.
4. Submit to Weee and email them (§6) — needs 1–3 live.
5. Start the log and cook from it (§7).
