"use client";

/**
 * "Nearly there", rebuilt around the thing you would actually do about it.
 *
 * It used to be a grid of recipes ordered by how far away they were, with an
 * `UnlockBand` on top offering one ingredient at a time. Two problems, and the
 * second is the one that made the shelf worth rewriting rather than tuning:
 *
 *   - **The grid answered the wrong question.** A shelf of near-misses tells you
 *     what you cannot cook. Sorted by distance it tells you that in order. What
 *     a person does with "you are two ingredients away from eleven dinners" is
 *     go shopping, and the grid made you derive the shopping list yourself by
 *     reading eleven cards and noticing what they had in common.
 *
 *   - **The band claimed a number and hid its evidence.** "Buy scallion and 12
 *     recipes become cookable" put the twelve behind a link. The claim and the
 *     recipes are the same fact and belong on the same screen.
 *
 * So the shelf is now **one row per ingredient**, and the row IS the evidence:
 * the ingredient on the left, the recipes it is blocking sliding horizontally
 * beside it. Scanning down the rows is scanning a shopping list ordered by how
 * much each line buys you.
 *
 * ── Why a row is not gated on "exactly one away" ──────────────────────────
 *
 * The obvious rule was: a row holds the recipes that become cookable the moment
 * you buy that one thing. Measured against a real 21-ingredient pantry, that
 * rule produced NOTHING — zero recipes one away, while eighteen sat between two
 * and five away. A shelf that is empty for everyone below about thirty-five
 * pantry items is a shelf that teaches new users the product does not work yet.
 *
 * So a row holds everything that ingredient BLOCKS, and each card keeps saying
 * how far away it still is — which `RecipeCard` already renders from `away` and
 * `missing`. The header carries the strong claim separately and only when it is
 * true: `unlocks` counts the recipes that need nothing else.
 *
 * The ordering is what keeps it honest. Rows are sorted by outright unlocks
 * first, so when there IS something one purchase away it is the top row and the
 * header says so. When there is not, the shelf degrades to "here is what is in
 * your way, most blocking first" instead of degrading to nothing.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Chip } from "./primitives";
import { useAck } from "./Ack";
import { ProductMark, useAffiliateModal, type AffiliateProduct } from "./affiliate";
import { DEFAULT_BRAND, type RetailerBrand } from "@/lib/retailer-brand";
import { Shot } from "./Shot";
import { beacon } from "@/lib/beacon";
/* The DUAL-WRITE pair, not the bare actions: this shelf is drawn from the
   device's pantry (`HomeGrid`), so "Have it!" has to land in the store the
   shelf was computed from — and in `owners.json` too, while `/list` and the
   calendar still read it. Same names, same signatures; one import line. */
import { addToGroceryList, updateState } from "@/lib/dual-write";
import { openRecipeHref } from "@/lib/static-mode";

export type NearRow = {
  id: string;
  name: string;
  /** Recipes needing this and NOTHING else — the strong claim. Often zero. */
  unlocks: number;
  onList: boolean;
  /**
   * The affiliate offer, set by the server on the FIRST row whose ingredient
   * has assigned products and on no other — one ad per shelf, ever
   * (CREATORS-TAB-SPEC §7). The thumbnail rides the row's actions; the click
   * opens the shared `AffiliateModal`.
   */
  offer?: {
    products: AffiliateProduct[];
    /** The shelf or search — the modal's link-out. */
    url: string;
  };
  recipes: Array<{
    id: string; title: string; source: string; image?: string;
    /** How many ingredients still missing, this one included. */
    away: number;
  }>;
};

export function NearlyRows({ rows, perk, retailer = DEFAULT_BRAND }: {
  rows: NearRow[];
  perk?: string;
  /** Whose shop — defaults to the only one, see `BuyBlock` for why. */
  retailer?: RetailerBrand;
}) {
  const { open: openOffer, modal: offerModal } = useAffiliateModal(perk);

  /* The denominator, once per mount — same contract as `BuyBlock`'s
     impression: clicks with no impressions are a number compared to nothing. */
  const offerSeen = useRef(false);
  const offerIds = rows.filter((r) => r.offer).map((r) => r.id);
  useEffect(() => {
    if (offerSeen.current || offerIds.length === 0) return;
    offerSeen.current = true;
    /* Every row that carries one, since there is no longer only one. The shape
       follows `buyblock_shown`: the fact recorded is "these were on screen",
       not "the component re-rendered". */
    beacon("nearoffer_shown", { n: offerIds.length, ingredient_ids: offerIds });
  });
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [, start] = useTransition();
  const { say } = useAck();

  /**
   * What this row's ingredient is, locally, until the page catches up.
   *
   * The shelf is server-rendered from the pantry, so without this a tap sat
   * there looking unpressed until a refresh landed — the same lag every other
   * control in the product had removed. `undefined` means "no opinion, use the
   * server's".
   */
  const [local, setLocal] = useState<Record<string, "have" | "list" | "none">>({});
  const stateOf = (row: NearRow): "have" | "list" | "none" =>
    local[row.id] ?? (row.onList ? "list" : "none");

  /**
   * Every write here goes through one funnel, so the acknowledgement and its
   * undo cannot drift apart from what was actually written.
   *
   * `say` has always taken an undo callback — `StateWidget` passes one — and
   * this shelf was the one place calling it with a message and nothing else. So
   * adding something to the grocery list from here was the single state change
   * in the product you could not take back, which is exactly the mis-tap most
   * worth taking back: these rows are a wall of similar-looking ingredients.
   */
  const write = (row: NearRow, to: "have" | "list" | "none", said: string) =>
    start(async () => {
      const from = stateOf(row);
      setPending(row.id);
      setLocal((m) => ({ ...m, [row.id]: to }));
      try {
        const r = to === "list"
          ? await addToGroceryList([row.id])
          : await updateState(row.id, {
              in_pantry: to === "have", on_list: false, use_first: false,
            });
        if (!r.ok) { setFailed(r.error); setLocal((m) => ({ ...m, [row.id]: from })); return; }
        setFailed(null);
        /* Undo replays the PREVIOUS state through this same function, so it
           cannot mean something different from what the tap undid. */
        say(said, () => write(row, from, `${row.name} put back`));
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
        setLocal((m) => ({ ...m, [row.id]: from }));
      } finally {
        setPending(null);
      }
    });

  const add = (row: NearRow) => write(row, "list", `${row.name} → grocery list`);
  const have = (row: NearRow) => write(row, "have", `${row.name} → pantry`);

  return (
    <div className="nearrows">
      {rows.map((row) => (
        <section className="nearrow" key={row.id}>
          <div className="nearrow-head">
            <p className="nearrow-name">
              {/*
                The ingredient, drawn as an ingredient.

                It was bold text, which made it the only place in the product
                where an ingredient did not look like one — the pantry, the
                grocery list and the recipe modal all draw the same chip, and
                the eye had learned that shape. `missing` is the right tone: on
                this shelf the ingredient IS the thing you do not have, which is
                the same fact the recipe modal uses it for.

                Not a button. Everything you can do to it is a labelled control
                beside it, and a chip that opened a second way of doing the same
                thing would be two answers to one question.
              */}
              <Chip label={row.name} tone={stateOf(row) === "have" ? "have"
                                        : stateOf(row) === "list" ? "want" : "missing"} />
              {/*
                Two different sentences, because they are two different facts and
                collapsing them would overclaim. `unlocks` means cookable the
                moment you buy this; the fallback counts what it is holding up.

                "Unlock 12 recipes", not "buy it and 12 become cookable". Both
                say the same thing; the first says it in three words, and the
                shopping is already implied by the chip being missing and the
                two buttons sitting beside it.
              */}
              {row.unlocks > 0
                ? <span className="note">unlock {row.unlocks} recipe{row.unlocks === 1 ? "" : "s"}</span>
                : <span className="note">blocking {row.recipes.length}</span>}
            </p>
            {/*
              Both answers to "you do not have this", side by side.

              "Add to grocery list" assumed the only reason an ingredient is
              missing is that you have not bought it. The other reason is that
              the pantry is wrong — you do have gochujang, it was never ticked —
              and the shelf that surfaces the ingredient is exactly where that
              is noticed. Without this the fix cost a trip to the drawer and a
              search, so the pantry stayed wrong and the shelf kept lying.

              Have it first: it is the one that removes the row entirely.
            */}
            <span className="nearrow-do">
              {stateOf(row) === "have"
                ? <span className="note">in your pantry</span>
                : <>
                    <Button kind="plain" disabled={pending === row.id}
                            onClick={() => have(row)}>Have it!</Button>
                    {stateOf(row) === "list"
                      ? <span className="note">on your grocery list</span>
                      : <Button kind="plain" disabled={pending === row.id}
                                onClick={() => add(row)}>
                          {pending === row.id ? "Adding…" : "Add to grocery list"}
                        </Button>}
                  </>}
              {/* "Get it delivered" stood here and is gone entirely (Richard,
                  2026-08-19). It was a third control in a row of two, competing
                  with the two things you can actually do about a missing
                  ingredient. The offer is a card in the strip below now. */}
            </span>
          </div>

          {/*
            Horizontal, and deliberately overflowing.
            A row that wrapped would be a grid again, and the whole point of the
            shape is that one ingredient is one line of the eye. The cut-off card
            at the right edge is the affordance — it is what says there are more.
          */}
          <div className="nearrow-strip">
            {/*
              The offer, as the FIRST card in the strip — Richard's design.

              A row is already a line of pictures you look along, so a picture is
              the shape the eye is expecting here; a labelled button up in the
              controls was a different kind of object asking to be read. First,
              because the row's subject is the ingredient you do not have and
              this is the one card about the ingredient rather than about a dish.

              It is drawn as a card and marked as an ad: the product's own
              thumbnail with the retailer's name on it, so nothing here can be
              mistaken for a recipe you saved. The modal behind it is the shared
              one, and the click ids and the beacons are unchanged.
            */}
            {row.offer && ((first) => (
              <button type="button" className="nearcard nearcard-offer" key="offer"
                      onClick={() => {
                        beacon("nearoffer_opened", { ingredient_id: row.id });
                        openOffer({ retailer, title: row.name, ingredientId: row.id,
                                    surface: "nearly",
                                    products: row.offer!.products,
                                    allUrl: row.offer!.url,
                                    allLabel: `See all on ${retailer.label}` });
                      }}>
                {/*
                  A PLACEHOLDER, not their photograph — Richard, 2026-08-19:
                  *"we are not affiliated with weee yet anyway."*

                  The card was showing the product's own picture and its
                  catalogue title, which is their imagery and their copy on our
                  page for a partnership that does not exist. A drawn jar and
                  our own words say the same thing and claim nothing: there is
                  somewhere to buy this. The real thumbnails go in the day the
                  agreement does, and the fetch that fills them
                  (`npm run weee-product-images`) is a one-line revert away.
                */}
                <span className="nearcard-img nearcard-blank">
                  <ProductMark />
                </span>
                <span className="nearcard-title">
                  Find it on <b className="aff-mark">{retailer.label}</b>
                </span>
              </button>
            ))(row.offer.products[0])}
            {row.recipes.map((r) => (
              <Link className="nearcard" key={r.id} href={openRecipeHref(r.id, `?recipe=${r.id}`)} scroll={false}>
                <Shot src={r.image} className="nearcard-img"
                      fallback={<span className="nearcard-img nearcard-noimg" aria-hidden="true" />} />
                <span className="nearcard-title">{r.title}</span>
                {/* One away means this row's ingredient is the only thing
                    missing, and the row heading already named it. "1 away" would
                    be true and useless; "just this" said the same thing in more
                    words. The card says nothing, which is the shortest way to
                    say there is nothing else to get. */}
                {r.away > 1 && (
                  <span className="note nearcard-away">{r.away} away</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
      {failed && <p className="fail">not saved: {failed}</p>}
      {offerModal}
    </div>
  );
}
