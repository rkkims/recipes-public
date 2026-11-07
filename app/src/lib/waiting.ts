/**
 * Dishes you cannot eat the day you make them.
 *
 * ── Two sources, and the human wins ──────────────────────────────────────
 *
 * **`make_ahead`, from curation.** A curated boolean meaning "needs a head
 * start" — see the control in `Curate`, where it survived the cut that removed
 * time bands precisely because it is a fact about the DISH rather than about
 * whoever is cooking. Where a curator has answered, that is the answer.
 *
 * **`leadMinutes`, from the enrichment pass.** Stated waiting time scraped from
 * the method: 795 recipes carry one and every one is an hour or more. The
 * commonest reason by a distance is literally the word "overnight" (343), then
 * "refrigerator for up to 3 days", "soak for 1 hour", "marinate for 1 hour".
 * That is not an inference about what a dish probably is; it is the recipe's own
 * sentence about itself.
 *
 * This replaced a rule that read the TITLE — "X kimchi is a kimchi, kimchi Y is
 * a Y" — which was a decent guess and beside the point once it turned out the
 * corpus had already been enriched with the real thing. It matched 134 recipes
 * where this finds 795, and it would have called a fresh geotjeori slow while
 * missing every overnight marinade that is not named after a preserve.
 *
 * ── Server only ──────────────────────────────────────────────────────────
 *
 * `lib/enriched` reads the filesystem, so this can never be imported by a
 * client component — the grid takes a boolean prop computed here. That boundary
 * is not theoretical: importing an fs-backed module from a dialog took the site
 * down earlier today.
 */
import { times, type Times } from "./enriched";
import { allCurations } from "./curation";

/** An hour of waiting is the line the curation screen already draws. */
const LEAD_MINUTES = 60;

/**
 * Lines that are about KEEPING it, not about waiting for it.
 *
 * The enrichment pass reads any duration near the end of a method as lead time,
 * and 137 of the 795 it found are storage advice: "refrigerator for up to 3
 * days", "keeps for a week", "freeze for up to a month". Those are the opposite
 * claim — the dish is ready now and will survive a while — and badging a miso
 * soup "can eat tomorrow" because its blog said leftovers keep two weeks is the
 * exact wrong-claim failure this badge has to avoid.
 *
 * "up to" is the tell, and it does most of the work: a wait is "marinate for an
 * hour", never "marinate for up to an hour". What remains after this filter is
 * 658 recipes, led by the literal word "overnight" (343), then soaking,
 * marinating, rising and chilling.
 */
const STORAGE = /\b(up to|keeps?|store[ds]?|storage|leftovers?|lasts?|will keep|freezer|freeze|weeks?|months?)\b/i;

/**
 * The wait has to be a TRANSFORMATION, not merely a delay.
 *
 * Reviewer's call, and it is the right line: fermenting, proofing, rising,
 * marinating, brining and curing are the dish becoming something it was not.
 * Chilling a crème brûlée, soaking beans, resting a batter and "set aside for
 * an hour" are all real waits and none of them are that — badging them made the
 * mark meaningless, because half the corpus waits for something.
 *
 * The cost is stated plainly because it is large: the single commonest reason
 * in the corpus is the bare word **"overnight" (343 recipes)**, and the
 * enrichment pass stored only the duration phrase, not the verb around it. So
 * "marinate overnight" and "chill overnight" are indistinguishable in the data
 * we have, and both are dropped. Recovering them means re-running the
 * enrichment to capture the surrounding clause; until then a curator marking
 * `make_ahead` by hand is the only way those get the badge, and a curated
 * answer already wins.
 *
 * Erring toward silence, as ever: a missing mark costs a mild surprise, a wrong
 * one costs someone skipping a dish they could have eaten tonight.
 */
const TRANSFORM = /\b(ferment\w*|marinat\w*|proof\w*|prove[dsn]?|ris(e|es|en|ing)|doubl\w*|brin(e|es|ed|ing)|cur(e|es|ed|ing)|pickl\w*|sourdough|starter|dough|batter|yeast|kimchi|jangajji)\b/i;

/**
 * And an upper bound, because the words are not always there.
 *
 * One source says "refrigerator or 2 weeks" — a typo for "for 2 weeks" — so
 * "up to" never matches and a miso soup gets badged as needing a fortnight.
 * Rather than chase typos, bound the claim: a wait before EATING is hours to a
 * couple of days. Anything longer is either storage advice or a long ferment,
 * and a long ferment is precisely the case a curator marks by hand.
 */
const MAX_LEAD_MINUTES = 3 * 24 * 60;

/**
 * Is this scraped duration a WAIT, or is it storage advice?
 *
 * Exported because two screens have to agree on it. The grid uses it to decide
 * the badge; the curation form uses it to pre-fill `make_ahead`. When they
 * disagreed, the form suggested "needs a head start" for exactly the 166
 * recipes the grid had already decided were storage lines — so a curator
 * working through them would have been nudged into confirming the wrong answer,
 * and a curated answer overrules the grid permanently.
 *
 * One rule, one place. A default that argues with the product is worse than no
 * default at all.
 */
export function isRealWait(t: Times | undefined): boolean {
  const lead = t?.leadMinutes ?? 0;
  if (lead < LEAD_MINUTES || lead > MAX_LEAD_MINUTES) return false;
  if (!t?.leadReason) return false;              // an unexplained wait is not a claim
  if (STORAGE.test(t.leadReason)) return false;  // about keeping it, not making it
  return TRANSFORM.test(t.leadReason);
}

export function needsTime(recipe: { id: string; url: string }): boolean {
  /* The curator's answer, where there is one — including an explicit "no",
     which is why this tests for undefined rather than for truthiness. A human
     saying "you can start this now" must be able to overrule a stray
     "refrigerate leftovers up to 3 days" the scraper read as a wait. */
  const curated = allCurations()[recipe.id]?.make_ahead;
  if (curated !== undefined) return curated;

  return isRealWait(times().get(recipe.url));
}

/** Why it waits, in the recipe's own words — for the card's tooltip. */
export function waitReason(recipe: { id: string; url: string }): string | undefined {
  const r = times().get(recipe.url)?.leadReason;
  // Never quote a storage line as the reason something waits — see `STORAGE`.
  return r && !STORAGE.test(r) ? r : undefined;
}

/**
 * The curation worklist for slow dishes — `/curate?focus=ferment`.
 *
 * ── Why a focused queue exists at all ────────────────────────────────────
 *
 * The queue is "the next uncurated recipe, in source order", which is right for
 * working through the corpus and useless for working through a QUESTION. The
 * long ferments are a question: 160 recipes where the automatic rule cannot
 * decide and a human can, in a few seconds each, because the answer is usually
 * obvious from the title.
 *
 * Two populations, and both need the same judgement:
 *
 *   **Waits the rule drops as too long.** Anything over three days is
 *   `MAX_LEAD_MINUTES`, and the reason is that "refrigerator for up to 1 week"
 *   and "let it ferment 4-5 days" are indistinguishable to a regex and opposite
 *   in meaning. A curator tells them apart at a glance.
 *
 *   **Dishes named as a preserve with no lead time found.** A "Turnip Green
 *   Kimchi" whose page never states a duration — the enrichment found nothing
 *   to read, so the product says nothing, and the one dish everyone knows takes
 *   days goes unmarked.
 *
 * Already-curated recipes are excluded in both cases: `make_ahead` is the
 * answer this list exists to collect, so anything carrying one is done.
 */
const PRESERVE_HEAD = /(kimchi|jangajji|gochujang|doenjang|ganjang|jeotgal|makgeolli|sikhye|pickles)\s*$/i;
const SERVED_DISH = /\b(with|stew|soup|guk|tang|jjigae|fried rice|noodles?|pasta|pancake|jeon|dumpling|mandu|rice balls?|onigiri|casserole|cookies?|cake|burger)\b/i;

/** Is this one of the slow dishes a human still has to rule on? */
export function needsFermentCall(recipe: { id: string; url: string; title: string }): boolean {
  if (allCurations()[recipe.id]?.make_ahead !== undefined) return false;

  const lead = times().get(recipe.url)?.leadMinutes ?? 0;
  // Long enough that the automatic rule refuses to guess.
  if (lead > MAX_LEAD_MINUTES) return true;
  if (lead > 0) return false;

  // No stated wait, but the name says it is a preserve.
  const head = recipe.title.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+recipe\s*$/i, "").trim();
  return PRESERVE_HEAD.test(head) && !SERVED_DISH.test(recipe.title);
}
