"use client";

/**
 * The affiliate surfaces' shared pieces — CREATORS-TAB-SPEC §7.
 *
 * One modal for every placement (the list's chips, the combined list ad, the
 * Almost-there card), because the user meets it from three doors and it must
 * be the same room each time: what the product is, what the shop is, the perk
 * if one is configured, one link out, one way back. `goHref` and `mintClickId`
 * moved here from `BuyBlock` unchanged — every outbound click still goes
 * through `/go` with a per-click id (ATTRIBUTION-SPEC §§2–3, §7).
 */
import { type MouseEvent, useState } from "react";
import Link from "next/link";
import { Button } from "./primitives";
import { Dialog } from "./Dialog";
import type { RetailerBrand } from "@/lib/retailer-brand";
import { GO_ORIGIN, STATIC } from "@/lib/static-mode";

/**
 * What stands in for a product photograph while there is no agreement to use
 * one — Richard, 2026-08-19: *"we are not affiliated with weee yet anyway."*
 *
 * Every affiliate surface used to show the retailer's own image, fetched from
 * their product pages into `public/cached-images`. That is their photography on
 * our page for a partnership that does not exist, so it is drawn instead: a jar,
 * in the house's line style, saying "something you buy" and claiming nothing.
 *
 * One component, because three surfaces show it and a second drawing is how
 * they drift. The day the agreement lands, the `image` branches come back and
 * `npm run weee-product-images` fills the cache again.
 */
export function ProductMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2.8h6v2.6H9z" />
      <path d="M6.6 8.2c0-1.5 1.2-2.8 2.7-2.8h5.4c1.5 0 2.7 1.3 2.7 2.8v10.6c0 1.4-1.1 2.4-2.4 2.4H9c-1.3 0-2.4-1-2.4-2.4z" />
      <path d="M6.6 11.6h10.8" />
    </svg>
  );
}

/**
 * Outbound links go through `/go`, never straight to the retailer.
 *
 * The path is unchanged in both modes and so is every parameter — what moves in
 * static mode is the ORIGIN. `/go` is one of the routes the export deliberately
 * does not contain (STATIC-SPEC §3), because it is replaced rather than dropped:
 * the same contract runs as a Cloudflare Worker (§4). After the cutover the
 * Worker is routed at `jipbap.com/go` and `GO_ORIGIN` is empty, so these strings
 * are byte-identical to the ones the server route serves today. Before it, a
 * preview build names the Worker's own origin and the link goes straight there;
 * the Worker ignores the path so both forms are the same request to it.
 */
/* The static site links straight to the retailer (2026-11-06): the `/go` and
   `/api` Workers were never routed at jipbap.com and were dropped, along with
   affiliate tracking. Server mode keeps `/go`. */
export const goHref = (url: string, ingredientId: string, surface: string, hadProducts: boolean) =>
  STATIC ? url :
  `${GO_ORIGIN}/go?u=${encodeURIComponent(url)}&i=${encodeURIComponent(ingredientId)}` +
  `&s=${surface}&p=${hadProducts ? 1 : 0}`;

/**
 * Mint the click id at click time, on the anchor itself — fresh per CLICK
 * (ATTRIBUTION-SPEC §3), and the device keeps its own capped copy (§7). If
 * any of this throws, the link still works untracked.
 */
export function mintClickId(e: MouseEvent<HTMLAnchorElement>) {
  if (STATIC) return; // a direct retailer link carries no click id
  try {
    const cid = crypto.randomUUID();
    const a = e.currentTarget;
    const u = new URL(a.href, location.origin);
    u.searchParams.set("cid", cid);
    a.href = u.toString();
    const KEY = "click-ids";
    const held = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[];
    held.push({ cid, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(held.slice(-100)));
  } catch { /* untracked is still working */ }
}

export type AffiliateProduct = {
  id: string;
  title: string;
  url: string;
  /** Cached thumbnail, when the offline fetch has run — title-only otherwise. */
  image?: string;
};

export type AffiliateOffer = {
  /**
   * Whose shop this offer is for — RETAILER-SPEC §2, wired 2026-08-20.
   *
   * The modal is opened from three doors and every one of them knew the name
   * of the shop as a literal. Carrying it on the offer is what lets the modal
   * print a retailer it was never told about at build time.
   */
  retailer: RetailerBrand;
  /** What the modal is headed — an ingredient name, or the list itself. */
  title: string;
  /** For `/go`'s `i=` param; a combined offer passes "list". */
  ingredientId: string;
  /** Which placement opened it — the analytics dimension. */
  surface: string;
  products: AffiliateProduct[];
  /** The one link out: a shelf, a search, or the storefront. */
  allUrl: string;
  allLabel?: string;
};

/**
 * The modal, in the order the user asked its questions: the product (thumb +
 * title), what this service IS, what is in it for them (the perk, when
 * configured), the way out to it, and the way back. The disclosure sits with
 * the links it is about — near the link, same visual field, before the tap.
 */
export function AffiliateModal({ offer, perk, onClose }: {
  offer: AffiliateOffer;
  perk?: string;
  onClose: () => void;
}) {
  return (
    <Dialog label={offer.title} onClose={onClose}>
      <p className="ask-eyebrow">on {offer.retailer.label}</p>
      <h2 className="ask-question">{offer.title}</h2>

      {offer.products.length > 0 && (
        <ul className="aff-products">
          {offer.products.map((p) => (
            <li key={p.id}>
              <a className="aff-product" href={goHref(p.url, offer.ingredientId, offer.surface, true)}
                 onClick={mintClickId} onAuxClick={mintClickId}
                 target="_blank" rel="noreferrer nofollow sponsored">
                {/* Drawn, not theirs — see `ProductMark`. The product's NAME
                    stays: a name is the thing itself, and without it there is
                    nothing to choose between. */}
                <span className="aff-thumb aff-thumb-mark"><ProductMark size={22} /></span>
                <span>{p.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* What the shop is — said in the modal because this is where someone
          decides whether to leave, and a link-out to a service never named
          is a door with no sign on it. The sentence is the retailer's own
          (`retailer-brand.ts`), not a template: the useful half is never the
          name, it is the reason to tap, and that differs per shop. */}
      <p className="aff-what">{offer.retailer.blurb}</p>

      {/* The perk, only when configured (spec §7 O5): the retailer's promise,
          so it arrives from config and is never invented here. */}
      {perk && <p className="aff-perk">{perk}</p>}

      <p className="cook-line">
        <a className="btn aff-out" href={goHref(offer.allUrl, offer.ingredientId, offer.surface + "_all", offer.products.length > 0)}
           onClick={mintClickId} onAuxClick={mintClickId}
           target="_blank" rel="noreferrer nofollow sponsored">
          {offer.allLabel ?? `See it on ${offer.retailer.label}`}
        </a>
        <Button kind="quiet" onClick={onClose}>Close</Button>
      </p>

      <p className="buyblock-disclose">
        We earn a commission on these links. <Link href="/terms">Terms</Link>.
      </p>
    </Dialog>
  );
}

/** Convenience: state + modal in one hook-shaped helper for the surfaces. */
export function useAffiliateModal(perk?: string) {
  const [offer, setOffer] = useState<AffiliateOffer | null>(null);
  const modal = offer
    ? <AffiliateModal offer={offer} {...(perk ? { perk } : {})} onClose={() => setOffer(null)} />
    : null;
  return { open: setOffer, modal };
}
