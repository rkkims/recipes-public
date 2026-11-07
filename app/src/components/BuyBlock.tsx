"use client";

/**
 * The affiliate, as a block — UX-SPEC §4h.
 *
 * ── Why it is not in the list any more ────────────────────────────────────
 *
 * It was a run of item names in a `note` under the rows, inside the thing being
 * read and mixed into the task. §4 holds the line that the grocery list must be
 * *"meaningfully better than Apple Notes even without the shopping links"*, and
 * the way you keep a promise like that visible is to make the links removable in
 * one piece: one section, below the list, that could be deleted tomorrow without
 * touching the list's own design.
 *
 * ── Why only some items ───────────────────────────────────────────────────
 *
 * Because the offer has to be about a problem the shopper actually has. §4h
 * settles it as **findability**, not "Asian items": `butter` and `chicken
 * breast` resolve to real Weee shelves as cleanly as `gochujang` does, so a
 * rule keyed on having a shelf offers to deliver butter. Nobody needs help
 * buying butter, and doenjang is worth the help whoever is shopping.
 *
 * ── Silence is a state ────────────────────────────────────────────────────
 *
 * With nothing hard to find on the list, the block does not render at all. That
 * is what makes its presence mean something: it appears when there is a real
 * answer and not as a permanent fixture that the eye learns to skip.
 */
import { useEffect, useRef } from "react";
import Link from "next/link";
import { goHref, mintClickId, useAffiliateModal } from "./affiliate";
import { DEFAULT_BRAND, type RetailerBrand } from "@/lib/retailer-brand";
import { beacon } from "@/lib/beacon";

export type BuyRow = {
  id: string;
  name: string;
  /** The shelf or search page. Always present — this is the fallback. */
  url: string;
  /** Named products from that shelf. Often empty; see §4h. */
  products: Array<{ id: string; title: string; url: string; image?: string }>;
};

/* `goHref` and `mintClickId` live in `affiliate.tsx` now — three placements
   share them (CREATORS-TAB-SPEC §7), and a click id minted two ways would be
   two attribution schemes. */

/**
 * `retailer` defaults rather than being threaded from the page, because
 * RETAILER-SPEC §1's corollary is that adding a retailer must not require
 * touching a page component. One retailer ships today, so the default IS the
 * only one; when §3's region choice lands, the page passes a brand and nothing
 * here changes.
 */
export function BuyBlock({ rows, perk, retailer = DEFAULT_BRAND }: {
  rows: BuyRow[];
  perk?: string;
  retailer?: RetailerBrand;
}) {
  const { open, modal } = useAffiliateModal(perk);

  /*
    The denominator — ATTRIBUTION-SPEC §2. Clicks without impressions produce
    a number that cannot be compared to anything, which is why this fires even
    though it earns nothing. Once per mount: the fact recorded is "the block
    was seen", not "the component re-rendered".
  */
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || rows.length === 0) return;
    shown.current = true;
    beacon("buyblock_shown", { n: rows.length, ingredient_ids: rows.map((r) => r.id) });
  });

  if (rows.length === 0) return null;

  const names = rows.slice(0, 3).map((r) => r.name);

  return (
    <section className="buyblock">
      <p className="buyblock-lead">
        Not sure where to buy {names.join(", ")}
        {rows.length > 3 && ` and ${rows.length - 3} more`}? {retailer.label} delivers them.
      </p>
      <div className="buyblock-items">
        {rows.map((r) => (
          /*
            A button when we have products to show, a plain link when we do not
            — §4h settles the 33-of-98 case as "a shelf link and no modal",
            because a modal headed "recommended for doenjang" over assorted
            pastes is a recommendation nobody made.
          */
          r.products.length > 0
            ? <button key={r.id} type="button" className="mealchip"
                      onClick={() => {
                        open({ retailer, title: r.name, ingredientId: r.id,
                               surface: "modal_product",
                               products: r.products, allUrl: r.url,
                               allLabel: `See all on ${retailer.label}` });
                        beacon("buyblock_opened", { ingredient_id: r.id });
                      }}>{r.name}</button>
            : <a key={r.id} className="mealchip" href={goHref(r.url, r.id, "chip", false)}
                 onClick={mintClickId} onAuxClick={mintClickId}
                 target="_blank" rel="noreferrer nofollow sponsored">{r.name}</a>
        ))}
      </div>

      {/*
        The disclosure, against the links it is about.

        `rel="sponsored"` above tells a crawler; it tells a reader nothing. The
        FTC asks for clear and conspicuous, which means near the link, in the
        same visual field, before the tap — not in a footer two screens down and
        not behind the word "Terms".

        It states the fact and stops there. It used to add that the block
        cannot change what recipes you were shown, which is true and is a
        PROMISE — one that a paid placement would turn into a statement already
        made to every reader. The disclosure is required; the commitment was
        volunteered, and it comes out while removing it is still free.
      */}
      <p className="buyblock-disclose">
        We earn a commission on these links. <Link href="/terms">Terms</Link>.
      </p>

      {/* One modal for every placement — see `AffiliateModal`. DECISIONS §513
          still holds inside it: a link out, never a basket. */}
      {modal}
    </section>
  );
}
