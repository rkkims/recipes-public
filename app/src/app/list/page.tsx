/**
 * `/list` — the grocery list, UX-SPEC §4e.
 *
 * The first page in this product whose job is not deciding what to cook. You
 * stand in a shop for twenty minutes with it as the only thing on screen, which
 * is a place's job and not a drawer's — see §4d for why the pantry stayed a
 * layer and this did not.
 *
 * ── What this file still does, after the inversion ────────────────────────
 *
 * Nothing that depends on whose kitchen it is. The page reads no owner: the
 * list, the cart, the plan strip and the buy rows are computed on the DEVICE
 * from `client-store` (STATIC-SPEC §2), which is what makes a tick in an aisle
 * a state change rather than a round trip — and what makes the page work with
 * no signal at all, since the write it needs is a `localStorage` write.
 *
 * What is left here is the frame and the two things a device cannot answer:
 * the vocabulary (the autosuggest ranks the whole ontology, not the shipped
 * shelf) and the shop's catalogue (`offersForListRows`).
 *
 * ── One assembly, twice ───────────────────────────────────────────────────
 *
 * Both halves are `PantryDrawerLive` with `only` set. They share a basket, a
 * write path and one failure bar, so splitting the component would duplicate
 * all three to save rendering some rows that CSS hides.
 */
import { Page } from "@/components/primitives";
import { Shell } from "@/components/Shell";
import { TimeZone } from "@/components/TimeZone";
import { Nav } from "@/components/Nav";
import { PantryDrawerLive } from "@/components/PantryDrawerLive";
import { GroceryListLive } from "@/components/GroceryListLive";
import { ListOffline } from "@/components/ListOffline";
import { weeePerk } from "@/lib/weee";
import { clarifications } from "@/lib/clarify";
import { browseAisles } from "@/lib/browse";
import { signedIn } from "@/lib/account";
import { getOwner } from "@/lib/store";
import { offersForListRows, searchIngredients } from "@/app/shelf-actions";
import { STATIC } from "@/lib/static-mode";
import { currentUser, ownerId } from "@/lib/owner";

/* Both reads now live in `app/shelf-actions.ts` — see the note there. They
   were declared inline here and, identically, on three other pages; one module
   is what lets static mode swap them all at once. */

/*
  The combined list offer is **parked** — Richard's call, 2026-08-17.

  Not a deletion and not a bug: the block worked, and the decision is that a
  product with no users should not be running an ad. "The hard-to-find items on
  your list, delivered" plus four product thumbnails and a commission disclosure
  is the loudest commercial surface we have, and it is the one surface a first
  visitor cannot miss.

  It was kept behind a `SHOW_LIST_AFFILIATE = false` switch and a rendered-never
  IIFE that read the owner's list off the server. That reading is exactly what
  this slice removes, so the dead branch went with it rather than being ported
  to a device it does not run on. Restoring it means a shelf under
  `GroceryListLive` fed by `offersForListRows`, which is the same catalogue
  read the per-row chips already use. The per-ingredient chips (`BuyBlock`, via
  the drawer) are untouched and always were.
*/

export default async function GroceryList() {
  /**
   * The session, and only the session.
   *
   * `signedIn` is the one genuinely per-REQUEST fact on this page — whether
   * this browser is carrying a session — and it is what suppresses §9's ask.
   * It needs the owner row, so the owner is read; nothing rendered below comes
   * from it, and a failure to read it is not a reason to refuse the page the
   * way `StoreCorrupt` was. The device's own version of that guarantee is in
   * `GroceryListLive`.
   */
  /* A prerendered file has no request and therefore no session — static mode
     answers false without reading a cookie, which is also what keeps this page
     exportable. */
  const accounted = STATIC ? false : await (async () => {
    try { return signedIn(getOwner(await ownerId())); }
    catch { return false; }
  })();

  /* Flattened for the wire — `Clarification` carries fields the drawer does not
     read, and a server component may only hand a client one plain data. */
  const asks = clarifications().map((cl) => ({
    id: cl.id, trigger: cl.trigger, grants: cl.grants,
    question: cl.question, because: cl.because,
  }));
  const aisles = browseAisles();

  return (
    <Page>
      <TimeZone />
      <Nav user={STATIC ? false : !!(await currentUser())} />
      {/*
        No pantry DOCKED here — but the fridge still opens one on a phone.

        It was docked beside the list, on the argument that "do I already have
        this" is the commonest question in a shop. It is — but a second copy of
        the pantry is a heavy way to answer it, and it made the one page that has
        to stay the cheapest in the product render the whole inventory twice.
        The rows answer it themselves now, in colour: see `Pantry`.

        That reasoning is about DOCKING, and it was over-applied: the drawer was
        passed `null` and hidden at every width, which made the tab bar's fridge
        a button that did nothing on the one page you are most likely to be
        standing in a shop looking at. Shell's own comment worried about exactly
        that and the CSS undid it anyway.

        So: `only="pantry"`. The panel floats on a phone like it does everywhere
        else, and it carries the pantry ALONE — a grocery list inside a drawer
        over the grocery list page is the duplication this page exists to avoid.
      */}
      <Shell listPage
             drawer={<PantryDrawerLive asks={asks} aisles={aisles}
                                       accounted={accounted}
                                       {...(weeePerk() ? { perk: weeePerk()! } : {})}
                                       search={searchIngredients} only="pantry" />}>
        {/* §12: says which of offline / catching-up is happening, and drains
            the queue when the signal returns. The list itself no longer needs
            it to be writable — see `lib/queue`. */}
        <ListOffline />
        {/* No hint line on an empty list (Richard's call, 2026-08-18). It
            explained where rows come from, which is mechanism: the add box is
            directly above it and answers the same question by being there. */}
        <GroceryListLive asks={asks} aisles={aisles}
                         accounted={accounted}
                         {...(weeePerk() ? { perk: weeePerk()! } : {})}
                         search={searchIngredients} offersFor={offersForListRows} />
      </Shell>
    </Page>
  );
}
