"use client";

/**
 * The grocery list's combined offer — CREATORS-TAB-SPEC §7.
 *
 * One block at the BOTTOM of `/list`, below the list and never between its
 * aisles: the list is a tool, the ad is a footer. It gathers products for the
 * hard-to-find items currently on the list — the same findability rule the
 * chips follow (§4h), because "your butter, delivered" is an offer nobody
 * needs — and one tap opens the shared `AffiliateModal` with all of them.
 *
 * Silence is a state, exactly as for `BuyBlock`: nothing hard to find on the
 * list, no block at all.
 */
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useAffiliateModal, type AffiliateProduct } from "./affiliate";
import { DEFAULT_BRAND, type RetailerBrand } from "@/lib/retailer-brand";
import { beacon } from "@/lib/beacon";

export function ListAffiliate({ products, more, allUrl, perk,
                                retailer = DEFAULT_BRAND }: {
  products: AffiliateProduct[];
  /** Whose shop — defaults to the only one, see `BuyBlock` for why. */
  retailer?: RetailerBrand;
  /** How many further matches were cut at four — "and N more". */
  more: number;
  /** The storefront, tagged — no single shelf can stand for a whole list. */
  allUrl: string;
  perk?: string;
}) {
  const { open, modal } = useAffiliateModal(perk);

  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || products.length === 0) return;
    shown.current = true;
    beacon("listad_shown", { n: products.length + more });
  });

  if (products.length === 0) return null;

  const offer = () => {
    beacon("listad_opened", { n: products.length + more });
    open({
      retailer,
      title: "Your list, delivered",
      ingredientId: "list",
      surface: "list_combined",
      products,
      allUrl,
      allLabel: `Shop on ${retailer.label}`,
    });
  };

  return (
    <section className="listad">
      <button type="button" className="listad-body" onClick={offer}>
        <span className="listad-lead">
          The hard-to-find items on your list, delivered
        </span>
        <span className="listad-thumbs">
          {products.map((p) => p.image
            ? <img key={p.id} className="listad-thumb" src={p.image} alt=""
                   loading="lazy" />
            : <span key={p.id} className="listad-name">{p.title}</span>)}
          {more > 0 && <span className="note">and {more} more</span>}
        </span>
      </button>
      <p className="buyblock-disclose">
        We earn a commission on these links. <Link href="/terms">Terms</Link>.
      </p>
      {modal}
    </section>
  );
}
