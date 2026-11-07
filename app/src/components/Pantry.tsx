"use client";

/**
 * The pantry, the grocery list, and the add box.
 *
 * A client component because everything here is interaction. It receives plain
 * data and calls server actions; it does not know how matching works, and the
 * matching page does not know how a chip is drawn.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useGrid } from "./GridStatus";
import { usePanels } from "./Panels";
import { useAck } from "./Ack";
import { useSearch } from "@/lib/debounce";
import { useSaveStatus } from "./SaveStatus";
import { Button, Chip, ChipRow, Empty, Section } from "./primitives";
import { StateWidget, type Ask, type IngredientState } from "./StateWidget";
import { Popover } from "./Popover";
import { AskModal } from "./AskModal";
import { Dialog, useConfirm } from "./Dialog";
import type { ActionResult } from "@/lib/result";
import { aisleOf, aisleRank, OTHER_AISLE } from "@/lib/aisle";
import { BuyBlock } from "./BuyBlock";
import { DEFAULT_BRAND, type RetailerBrand } from "@/lib/retailer-brand";
import { goHref, mintClickId } from "./affiliate";
import Link from "next/link";
import { ListSeen } from "./ListSeen";
import { SignUpPrompt } from "./SignUpPrompt";
/* Re-exported so existing importers keep working; it lives in `lib/day` now
   because StateWidget needs it and importing Pantry there would be a cycle. */
export { ageOf } from "@/lib/day";
import { ageOf } from "@/lib/day";

export type Item = {
  id: string; name: string;
  /**
   * The representational name — `displayOf`'s "korean red pepper paste -
   * gochujang" — present only when it differs from `name`. The LIST and cart
   * render it: standing in a shop is the moment a native name needs its
   * English half. `name` stays canonical because everything else reads it —
   * sorting, the state widget, the affiliate lookups.
   */
  display?: string;
  /** Present only on hard-to-find list rows — see `BuyBlock` and §4h. */
  buy?: { url: string;
          products: Array<{ id: string; title: string; url: string; image?: string }> };
  /** What sort of thing it is, for the aisle grouping — see `lib/aisle`. */
  kind?: string;
  /** ISO timestamp the row was created — surfaced as an age, never as a date. */
  addedAt?: string;
  /** When it was FIRST ever added, across gaps — `UserIngredient.first_added_at`. */
  sinceAt?: string;
  /** Last time it was held or listed — recency, for the add box's own-history rank. */
  usedAt?: string;
  /** Pinned, but past its shelf life: shown, and no longer steering the ranking. */
  lapsedPin?: boolean;
  /** What the user wrote about it — INGREDIENT-SPEC §2's `note`. */
  note?: string;
} & IngredientState;

/**
 * One chip, one tone — and an ingredient can be in more than one state.
 *
 * Precedence is by urgency, because that is what the colour is for: a pinned
 * item is the one steering tonight, something on the list is a decision already
 * made, and merely having it is the resting state.
 */
/*
  There is no `toneOf` any more, and that is the point.

  It answered "what is this item's state" and the two panels used it to colour
  their chips, so the pantry drew a blue chip for anything also on the list and
  the list drew a green row for anything also in the pantry. Both shelves ended
  up speckled with the other one's colour, and a user changing state watched
  chips change hue in place without moving — which reads as a rendering fault
  rather than as information.

  The tone is the SHELF now: green in the pantry, blue on the list, always. An
  item that is in both places appears in both places, once in each colour, which
  is the truth stated twice rather than a colour trying to say two things.
*/

/**
 * "Use first", marked rather than coloured.
 *
 * A fourth colour was doing the work, and it had two problems: the palette was
 * carrying more meaning than a glance can separate, and colour alone fails in
 * greyscale and for anyone who cannot tell those hues apart — which is the rule
 * this file already applies everywhere else.
 *
 * A leading dot instead. It survives greyscale, needs no legend, and it is
 * reinforced by position: pinned items already sort to the top of the pantry,
 * so the mark confirms an order the eye has already noticed rather than being
 * the only clue.
 */
const isPinned = (i: Item) => !!i.use_first && !i.lapsedPin;

export function Pantry({ items, asksFor, excludes, planNeeds = [], accounted = false,
                         search, onUpdate, onAddMany, onMoveToPantry, onAnswer, onExclude,
                         onAddNote, onTick, onPutAway, pushKey, onNote, live = false,
                         listHeading = false, perk, retailer = DEFAULT_BRAND }: {
  /**
   * The rows come from the DEVICE, so there is nothing to be optimistic about.
   *
   * Everything below that holds a local override exists because `items` was a
   * server render arriving one round trip late: the chip flipped here and the
   * truth caught up when `revalidatePath` landed. Under `client-store`
   * (STATIC-SPEC §2) the store has already applied the write before the
   * handler returns and the subscription re-renders this component with it —
   * so an override would be a copy of the truth, held beside the truth,
   * released by comparing it to the truth.
   *
   * Worse than redundant: its release condition compares an override to the
   * incoming row, and a second change to the same id inside one frame would
   * mask the newer answer with the older claim. So the mechanism is switched
   * off rather than left to be harmless.
   *
   * A flag rather than a deletion, because `/list` was still server-rendered
   * and needed every line of it. Slice C converted that page, `PantryDrawer` —
   * the server assembly — is gone, and `PantryDrawerLive` is the only caller
   * left: this is `true` everywhere it is read. The override machinery below
   * is therefore unreachable, and taking it out means editing twelve
   * `addOptimistic` calls threaded through two thousand lines of JSX with no
   * behavioural change to show for it. That is its own change, not this one's.
   */
  live?: boolean;
  /** Whose shop the buy links name — defaults to the only one, see `BuyBlock`. */
  retailer?: RetailerBrand;
  /**
   * This list is the whole page, so its shelf heading is the page heading.
   *
   * A prop rather than a CSS rule keyed off an ancestor: what changes is which
   * ELEMENTS exist (a page title, a progress line, no fold control), and
   * hiding a fold button that is still focusable would leave a keyboard user
   * able to collapse a page into nothing.
   */
  listHeading?: boolean;
  /** The affiliate modal's perk line, from config — CREATORS-TAB-SPEC §7. */
  perk?: string;
  /** VAPID public key, forwarded to the state widget — §12. */
  pushKey?: string;
  items: Item[];
  /** Ingredient ids whose recipes are hidden (USER-SPEC §6). */
  excludes: string[];
  /**
   * "Buy one thing" — what to add to the list to unlock the most recipes.
   *
   * It lives INSIDE this component rather than beside it because it was inert
   * text: it named the highest-leverage purchase in the product and gave the
   * user no way to act on it, so they had to go and find the chip themselves.
   * Here each row is a button onto the very list it sits under, and it shares
   * this component's one failure bar instead of growing a second one.
   */
  /**
   * What the meal plan needs and the pantry lacks.
   *
   * The grocery list's reason to know about the calendar: planning three
   * dinners is a shopping decision, and working out what to buy recipe by
   * recipe is work the product should have already done. Nothing is added
   * automatically — a list that fills itself from your calendar is a list you
   * stop trusting.
   */
  planNeeds?: Array<{ id: string; name: string; forMeals: string[]; onList: boolean }>;
  /** Whether this kitchen already has an account — suppresses §9's ask. */
  accounted?: boolean;
  /** Unanswered clarifications, by trigger ingredient (INGREDIENT-SPEC §6). */
  asksFor: Record<string, Ask[]>;
  /**
   * `recipes` is how many recipes use it, and `via` the alias that matched.
   * Both are on the row because the choice is between near-identical names —
   * `onion` against `korean green onion` — and the count is what settles it.
   */
  search: (q: string) => Promise<Array<{
    id: string; name: string; recipes: number; via?: string;
    children?: Array<{ id: string; name: string; recipes: number }>;
  }>>;
  onUpdate: (id: string, next: IngredientState) => Promise<ActionResult>;
  /** Confirmed basket → grocery list, in one write (UX-SPEC §4b). */
  onAddMany: (ids: string[]) => Promise<ActionResult>;
  /** Shopping done — the confirmed basket moves list → pantry, in one write. */
  onMoveToPantry: (ids: string[]) => Promise<ActionResult>;
  onAnswer: (askId: string, yes: boolean, grants: string) => Promise<ActionResult>;
  onExclude: (id: string, excluded: boolean) => Promise<ActionResult>;
  /** A typed item the vocabulary does not have — see `addFreeText`. */
  onAddNote: (text: string) => Promise<ActionResult>;
  /** Tick one thing off in the aisle; `enough: false` keeps it on the list. */
  onTick: (id: string, enough: boolean) => Promise<ActionResult>;
  /**
   * Home — the cart onto the shelves, in one write (CART-SPEC §2).
   *
   * Takes what to KEEP: the dialog in front of it is a list you remove from,
   * and what you remove was bought and is not in your kitchen.
   */
  onPutAway: (moveIds: string[], clearRest?: boolean) => Promise<ActionResult>;
  /** Write the note behind "More" — INGREDIENT-SPEC §2. */
  onNote?: (id: string, note: string) => Promise<ActionResult>;
}) {
  /**
   * The open item AND the chip it was opened from.
   *
   * The element is what the popover anchors to — see `Popover`. Held in state
   * rather than a ref because which chip is anchoring changes with every tap.
   */
  const [open, setOpen] = useState<{ item: Item; anchor: HTMLElement } | null>(null);
  /* The catch-up exists to tell SERVER-rendered surfaces that something was
     written. A live drawer has none behind it — the grid recomputed on the
     same frame — so marking dirty would schedule a full re-render of a page
     that is already correct. `/list` still needs it. */
  const grid = useGrid();
  const markDirty = live ? () => {} : grid.markDirty;
  /* Closing is no longer what triggers the catch-up — every write asks for one
     and the provider debounces the burst. So this just closes. */
  const closePanel = () => setOpen(null);
  const { q, setQ, hits, clear } = useSearch(search);
  const [pending, start] = useTransition();
  const { begin, end } = useSaveStatus();
  /**
   * The last write that failed.
   *
   * Every mutation here is optimistic — the chip flips before the server has
   * agreed. That is right for a pantry, where the alternative is a UI that lags
   * every tap. It is only honest if a failure is visible, so a failed write
   * both says so and reverts the optimism by re-reading from the server.
   */
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * Left the list THIS visit — §4e. Dimmed, struck through, and still on screen.
   *
   * Removing a row the instant it goes is literally correct and wrong in a shop:
   * you look back down the list to check you actually picked something up, and a
   * row that vanished gives you nothing to check against. This is a view of this
   * visit rather than state — it is not persisted, so a refresh gives a clean
   * list. The WRITE still happens immediately.
   *
   * It was named `ticked` and it held only the ✓ button's ids, so taking
   * something off the list through the state widget still made the row
   * disappear under the user's finger with no way back. Both routes end the same
   * way — the item is no longer on the list — and both now leave the same
   * struck-through row to undo.
   */
  const [offList, setOffList] = useState<Set<string>>(new Set());
  /**
   * Taken OUT of the pantry this visit — `ticked`'s mirror on the other shelf.
   *
   * Same argument, and it was only ever applied to one of the two panels: a row
   * that vanishes the instant you touch it gives you nothing to check against,
   * and a mis-tap that removes something is unrecoverable if the thing you
   * mis-tapped is no longer on screen. The chip stays, struck through, and
   * tapping it again puts it back.
   *
   * Not persisted, exactly like `ticked` — leaving the page gives a clean
   * pantry, because this is a view of a visit and not a fact about a kitchen.
   */
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  /**
   * The basket awaiting confirmation — UX-SPEC §4b.
   *
   * Nothing the app SUGGESTS reaches the grocery list without passing through
   * here first. One row per ingredient, each removable, and the list only moves
   * when the user says so. The same panel serves one row and a whole week,
   * because a review step that only appears for bulk adds teaches people that
   * small adds are unreviewed.
   */
  const [draft, setDraft] = useState<
    { to: "list" | "pantry"; rows: Array<{ id: string; name: string; why?: string }> } | null>(null);
  /** The ingredient whose outstanding questions are being asked — see `AskModal`. */
  const [asking, setAsking] = useState<{ name: string; asks: Ask[] } | null>(null);
  /** A search result the user has tapped, awaiting a decision — see `choose`. */
  /*
    This dialog used to fetch what the ingredient would unlock and show a strip
    of recipe cards. That answer belongs to the RECIPE search now — it takes an
    ingredient and lists what you can cook with it, fewest missing first — so
    the two boxes stopped answering the same question in two different shapes.
    The dialog is a decision about your inventory: have it, or want it.
  */
  const [choosing, setChoosing] =
    useState<{ id: string; name: string; recipes: number } | null>(null);
  /**
   * The thing just ticked off that more than one planned meal wants.
   *
   * The tick lands FIRST and this appears under it — never a dialog in front of
   * the action. She will tap the tick eleven times in one shop, and a question
   * in the way of that is a question she learns to dismiss. Ignoring this row
   * means "yes, enough".
   */
  /** What a checkout undo has to put back — the row's state BEFORE the ✓. */
  type TickPrev = { in_pantry: boolean; use_first: boolean };
  /**
   * The row being checked out, waiting on "cart or bin?" — CART-SPEC §2.
   *
   * §4g's dialog stood here once and asked the wrong question ("is this in your
   * kitchen?") about a thing that would not be in a kitchen for half an hour.
   * This is the question that IS live at the till, and it has two real answers:
   * the thing went in the cart, or you have decided against it and it should
   * leave the list. Nothing is written until one of them is pressed — closing
   * writes nothing, which is the standing rule for every dialog here, and the
   * row stays on the list where it was.
   */
  const [checkingOut, setCheckingOut] =
    useState<{ id: string; name: string; prev: TickPrev } | null>(null);

  /** A chip tapped INSIDE the cart — back on the list, or gone entirely. */
  const [cartRow, setCartRow] =
    useState<{ id: string; name: string; prev: TickPrev } | null>(null);

  /**
   * Picking a few things out of the cart rather than unpacking all of it.
   *
   * Two ways to reach the pantry, and they want opposite confirmations. The
   * bottom button moves the WHOLE cart and asks first, because "everything"
   * is a claim about rows you may not have looked at. Selecting is the user
   * naming each row by hand, one tap each — asking them to confirm a list they
   * just built by pointing at it is the nag §4g was killed for.
   */
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) =>
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [askedEnough, setAskedEnough] =
    useState<{ id: string; name: string; meals: string[]; prev: TickPrev } | null>(null);

  /**
   * The toast with the way back — every checkout path says what it did and
   * offers undo, because a mis-tap in a shop was the one write in the product
   * you could not take back (the user's report, 2026-08-16).
   */
  const { say } = useAck();
  /* The one control here that discards a whole shop in a tap. */
  const { confirm, dialog: confirmDialog } = useConfirm();
  /**
   * The place a thing just went, as somewhere you can actually get to.
   *
   * It was a `<Link>`, and it was clickable — it just did nothing you could
   * see, which is the same thing to a reader (Richard: "pantry/grocery list is
   * still not clickable"). Both destinations are usually on the page you are
   * already on: "→ grocery list" from the grocery list navigated to the grocery
   * list, and "→ pantry" went to Cook, where the pantry is a panel that may
   * well be closed.
   *
   * So the destination TAKES YOU TO THE SHELF. If it is on this page, open it
   * if it is a panel and scroll it into view; if it is not, navigate, and the
   * page you land on scrolls itself.
   */
  const panels = usePanels();
  const goTo = (what: "pantry" | "list" | "cart") => {
    if (what === "pantry") panels.set({ pantry: true });
    if (what === "list" || what === "cart") panels.set({ list: true });
    /* After the panel state has painted, or the target may still be display:none
       and `scrollIntoView` would have nothing to scroll to. */
    requestAnimationFrame(() => {
      const sel = what === "pantry" ? ".shelf-pantry"
        : what === "cart" ? ".cart-shelf" : ".shelf-list";
      const el = [...document.querySelectorAll<HTMLElement>(sel)]
        .find((n) => n.offsetParent !== null);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      else window.location.href = what === "pantry" ? "/" : "/list";
    });
  };
  const dest = (label: string, what: "pantry" | "list" | "cart") => (
    <button type="button" className="ack-dest" onClick={() => goTo(what)}>{label}</button>
  );
  /**
   * The last thing ticked off, so the way back outlives the toast.
   *
   * The toast has carried an undo since the mis-tap report, and a toast is the
   * wrong lifetime for this one: it is gone in a few seconds, and the moment
   * you realise you ticked the wrong row is the moment after you look up from
   * the phone. This is the same undo, parked in the heading until the next tick
   * replaces it — one item deep, which is what "undo" means everywhere else.
   *
   * Set by the tick in the aisle, which every checkout path starts from, so the
   * dialogs need to know nothing about it.
   */
  const [lastTick, setLastTick] =
    useState<{ id: string; name: string; prev: TickPrev } | null>(null);
  /**
   * "Move to cart" — the answer that fills the cart.
   *
   * Everything the tick used to do at the moment of the tap happens here
   * instead: the optimistic move, the queued-or-sent write, the heading's undo,
   * and §12's offline path. In a shop the write must survive thick walls, so it
   * is queued and replayed rather than lost.
   */
  const toCart = (i: { id: string; name: string; prev: TickPrev }, meals: string[] = []) => {
    addOptimistic({ id: i.id, name: i.name,
      next: { in_pantry: i.prev.in_pantry, on_list: false,
              use_first: i.prev.use_first, in_cart: true } });
    setLastTick(i);
    /* No offline branch here any more. The tick is a device write and lands
       whatever the signal is doing; parking the SERVER's copy of it is
       `lib/dual-write`'s decision, made once, for every surface. */
    run(() => onTick(i.id, true));
    /* The one question still worth asking in an aisle: you are in front of the
       shelf and can still pick up another. */
    if (meals.length > 1)
      setAskedEnough({ id: i.id, name: i.name, meals, prev: i.prev });
    else say(<>{i.name} → {dest("cart", "cart")}</>,
                     () => untick(i.id, i.name, i.prev));
  };

  /**
   * "Move to pantry" — the drawer's answer, and the whole of its checkout.
   *
   * The cart is a GROCERY PAGE feature (Richard, 2026-08-18). The drawer's list
   * is a reference copy you consult while doing something else — you are not
   * standing in a shop when you open it over a recipe — so a tick there is the
   * old, simple thing: it went in the kitchen, or it goes away. No cart, no
   * select mode, no basket to unpack later.
   */
  const toPantryNow = (i: { id: string; name: string; prev: TickPrev }) => {
    const next = { in_pantry: true, on_list: false,
                   use_first: i.prev.use_first, in_cart: false };
    addOptimistic({ id: i.id, name: i.name, next });
    setLastTick(i);
    run(() => onUpdate(i.id, next));
    say(<>{i.name} → {dest("pantry", "pantry")}</>,
        () => untick(i.id, i.name, i.prev));
  };

  /**
   * "Delete it" — off the list, into nothing.
   *
   * `in_pantry` is left exactly as it was. Deciding against buying more soy
   * sauce says nothing about the bottle already in the cupboard, and a delete
   * that emptied the pantry row would be this product's worst failure
   * (INGREDIENT-SPEC §2) dressed as a tidy-up.
   */
  const dropFromList = (i: { id: string; name: string; prev: TickPrev }) => {
    const next = { in_pantry: i.prev.in_pantry, on_list: false,
                   use_first: i.prev.use_first, in_cart: false };
    addOptimistic({ id: i.id, name: i.name, next });
    run(() => onUpdate(i.id, next));
    say(<>{i.name} off your {dest("grocery list", "list")}</>,
        () => untick(i.id, i.name, i.prev));
  };

  const untick = (id: string, name: string, prev: TickPrev) => {
    setOffList((t) => { const n = new Set(t); n.delete(id); return n; });
    /* `in_cart: false` explicitly: putting a row back on the list has to take it
       out of the cart, or the same thing appears in both places. */
    write(id, { in_pantry: prev.in_pantry, on_list: true,
                use_first: prev.use_first, in_cart: false }, name);
    /* Only if it is still the row being offered: undoing from the toast while a
       later tick owns the heading must not clear that later one's way back. */
    setLastTick((l) => (l && l.id === id ? null : l));
    say(<>{name} → {dest("grocery list", "list")}</>);
  };

  /**
   * The chips flip NOW; the server catches up.
   *
   * Every write here is a round trip that ends in `revalidatePath`, and until
   * that came back the cloud still showed the old state — so tapping "Have it"
   * did nothing visible for a beat, and the button was disabled while it
   * happened. On a slow connection it read as broken, and people tapped again.
   *
   * ── Held until the server agrees, not until the transition ends ───────────
   *
   * This was `useOptimistic`, whose value lives exactly as long as the
   * transition that dispatched it. That is the wrong lifetime here. The write
   * ends in `revalidatePath`, which re-renders the whole page — the grid, the
   * shelves, the counts — and the chip was snapping back to its old colour the
   * moment the action resolved, then flipping again when the new props finally
   * arrived. So the one thing that was supposed to be instant was pinned to the
   * slowest thing on the page: tap a chip, watch it change, change back, and
   * change again once the recipe grid caught up.
   *
   * An override held by id instead. It is applied from the tap and released
   * when the incoming props say the same thing — so the server, once it speaks,
   * is still the authority, and nothing has to be reconciled by hand. A failed
   * write drops the override, which reverts the chip and pairs with the failure
   * bar: instant, and never lying about having saved.
   */
  const [local, setLocal] =
    useState<Record<string, { next: IngredientState; name?: string }>>({});

  const addOptimistic = (patch: { id: string; next: IngredientState; name?: string }) => {
    /* Nothing to anticipate when the rows are the device's own — see `live`. */
    if (live) return;
    setLocal((m) => ({ ...m, [patch.id]: { next: patch.next, ...(patch.name ? { name: patch.name } : {}) } }));
  };

  /** Forget an override — on failure, so the chip goes back to the truth. */
  const dropLocal = (id: string) =>
    setLocal((m) => {
      if (!(id in m)) return m;
      const n = { ...m };
      delete n[id];
      return n;
    });

  const shown: Item[] = (() => {
    const keys = Object.keys(local);
    if (keys.length === 0) return items;
    const seen = new Set(items.map((i) => i.id));
    const merged: Item[] = items.map((i) =>
      local[i.id] ? { ...i, ...local[i.id]!.next } : i);
    /* An id the server has never heard of — something just added from the
       search box. It has no row to patch, so it becomes one. */
    for (const id of keys)
      if (!seen.has(id))
        merged.push({ id, name: local[id]!.name ?? id, ...local[id]!.next });
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  })();

  /**
   * Release each override the moment the server's own answer matches it.
   *
   * Without this an override outlives its purpose and starts hiding the truth:
   * a later change from somewhere else — "Made it" marking a dozen things
   * present — would be masked for that id by a stale local copy of an older tap.
   */
  useEffect(() => {
    setLocal((m) => {
      const keys = Object.keys(m);
      if (keys.length === 0) return m;
      let changed = false;
      const next = { ...m };
      for (const i of items) {
        const p = next[i.id];
        if (p && p.next.in_pantry === i.in_pantry && p.next.on_list === i.on_list
              && p.next.use_first === i.use_first
              && !!p.next.in_cart === !!i.in_cart) {
          delete next[i.id];
          changed = true;
        }
      }
      return changed ? next : m;
    });
  }, [items]);

  /** Fire a write, surface a failure, and clear a stale one on success. */
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      begin();
      try {
        const r = await fn();
        setFailed(r.ok ? null : r.error);
        end(r.ok);
      } catch (e) {
        end(false);
        // A transport failure never reaches `attempt` — the request itself
        // died. Offline, or the server restarted mid-action.
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  /** A state write that shows immediately. Must run inside the transition. */
  /**
   * Paint now, tell the server after.
   *
   * The optimistic update used to live INSIDE `start()`. A transition marks
   * its updates non-urgent by design, so React was free to hold the chip's
   * new colour behind whatever else it had queued — including the re-render
   * caused by the very round trip it was waiting on. On a slow phone that is
   * a button that does nothing for a beat, which is the whole complaint.
   *
   * So the override is applied as an ordinary urgent update, on the click
   * itself, and the write is fired detached. Nothing awaits it: the interaction
   * is finished the moment the state flips, and the network is allowed to take
   * as long as it takes.
   *
   * Dropping the transition also means `pending` stays false here, so the
   * controls are never disabled mid-tap — a disabled button under a finger is
   * the same lag wearing different clothes.
   */
  const write = (id: string, next: IngredientState, name?: string) => {
    markDirty();
    addOptimistic({ id, next, ...(name ? { name } : {}) });
    begin();

    void (async () => {
      try {
        const r = await onUpdate(id, next);
        setFailed(r.ok ? null : r.error);
        end(r.ok);
        // The override is the claim that this landed. It did not.
        if (!r.ok) dropLocal(id);
      } catch (e) {
        end(false);
        dropLocal(id);
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    })();
  };

  const byId = new Map(shown.map((i) => [i.id, i]));
  /** The plan join, by ingredient — what each list row is actually FOR. */
  const needsById = new Map(planNeeds.map((n) => [n.id, n]));
  const excluded = new Set(excludes);
  const urgent = shown.filter((i) => i.use_first);
  /**
   * On the list, plus what was ticked off THIS visit — §4e.
   *
   * The tick writes `on_list: false` optimistically, so without this the row
   * would leave the moment it was ticked and the dimming would have nothing to
   * dim. Keeping it means the list you look back at is the list you shopped,
   * and it resets when the component next mounts.
   */
  /**
   * The rows, with nothing laid over them.
   *
   * A queued tick used to be patched in here, because the write had gone to a
   * queue instead of to the server and the server was what drew the row. Both
   * halves of that are gone: the tick goes to the DEVICE first whatever the
   * signal is doing (`lib/dual-write`), and the device is what draws the row.
   * The overlay would now be a second answer to a question already answered.
   */
  const withQueued = shown;

  /**
   * Bought, not yet put away — CART-SPEC.
   *
   * Server state, not a visit: this is the whole point of the field. The list
   * below no longer holds struck-through ticks, because a ticked row has
   * somewhere real to be, and it is still there when the phone wakes up in a
   * car park.
   */
  const cart = withQueued.filter((i) => i.in_cart);

  const list = withQueued
    /* `offList` is now only about the OTHER way off the list — the state widget
       — which writes no cart row and would otherwise vanish under the finger
       with nothing to undo. A ticked row is excluded here because it is drawn
       below, in the cart. */
    .filter((i) => (i.on_list || offList.has(i.id)) && !i.in_cart);
  /* What is actually still to buy. The rows kept for undo are struck through,
     and counting them would have the heading disagree with the list under it —
     the same rule the pantry's count follows. */
  const listNow = list.filter((i) => i.on_list).length;
  /*
    There is no progress sentence any more (Richard, 2026-08-18: "erase 'n of m
    bought'"). It read as a score on a page whose whole job is a walk, and both
    halves of what it said are already on screen: what is left is the rows, and
    what is bought is drawn in the cart under them.
  */
  /* In the pantry, plus what was taken out of it THIS visit — see `dropped`.
     The count on the heading follows suit and states what is actually held, so
     a struck-through chip is not counted as one you have. */
  const held = shown.filter((i) => i.in_pantry || dropped.has(i.id));
  const heldNow = held.filter((i) => i.in_pantry).length;

  /**
   * The pantry, urgent first.
   *
   * Pinned items lead because they are the ones asking to be used, and they are
   * still pantry rows — a separate shelf for them is what made pinning
   * something look like removing it.
   */
  const pantryOrder = [...held].sort((a, b) =>
    Number(b.use_first && !b.lapsedPin) - Number(a.use_first && !a.lapsedPin) ||
    a.name.localeCompare(b.name));

  /**
   * The pantry, grouped the way the list is — UX-SPEC §3.
   *
   * Same `aisleOf`, same order, deliberately: two taxonomies for one kitchen is
   * how they drift, and if `kind` is wrong for eggplant it should be visibly
   * wrong in both places rather than quietly right in one.
   *
   * ── It used to wait for thirty rows, and now it does not ──────────────────
   *
   * The argument for a threshold was that grouping twelve items into six pairs
   * is worse than not grouping them — headings outnumbering content, the eye
   * reading structure instead of ingredients. It is a real effect and it was
   * the wrong trade, for a reason the list already demonstrates: the list groups
   * from the first row and nobody has ever wanted it not to.
   *
   * What the threshold actually bought was two different pantries. Under twenty
   * rows it was a cloud; over twenty it silently became a filing cabinet, and
   * the transition happened on an ordinary Tuesday when someone added a
   * twentieth thing. Learning where cabbage lives is worth doing once, not
   * twice, and "same as the list" is a promise the panel above can only keep by
   * being the same shape as it at every size.
   *
   * ── What happens to pins ──────────────────────────────────────────────────
   *
   * They stop being first overall and become first WITHIN their aisle. Position
   * was only ever a proxy for visibility, and the chip already carries that job
   * — a pin is drawn as a pin, in its own tone. What the old ordering was
   * really protecting is stated one comment up and still holds: a pin must not
   * get its own shelf, because a pinned item that vanishes from the place it
   * lives is the failure this section exists to avoid. Grouping keeps it where
   * it lives.
   */
  /* One chip, whether it is in a group or a flat cloud — extracted only so the
     two branches below cannot drift apart. */
  const pantryChip = (i: Item) => (
    <Chip key={i.id} pinned={isPinned(i)}
          label={i.lapsedPin ? `${i.name} · expired` : i.name}
          /* The shelf's colour, not the item's state — see the note where
             `toneOf` used to be. Green, whatever else is true of it. */
          tone="have"
          /* Removed this visit and kept on screen. Tapping it re-opens the
             widget, which is how it goes back. */
          gone={!i.in_pantry}
          title={[
            i.use_first && !i.lapsedPin ? "using today" : null,
            i.lapsedPin ? "pin expired, no longer steering results" : null,
            ageOf(i.addedAt) ? `added ${ageOf(i.addedAt)} ago` : null,
          ].filter(Boolean).join(" · ") || undefined}
          onClick={(e) => openFor(i.id, i.name, e.currentTarget)} />
  );

  const pantryByAisle = (() => {
    const groups = new Map<string, typeof held>();
    for (const i of pantryOrder) {
      const key = aisleOf(i.kind) ?? OTHER_AISLE;
      const at = groups.get(key);
      if (at) at.push(i); else groups.set(key, [i]);
    }
    return [...groups.entries()].sort((a, b) =>
      aisleRank(a[0] === OTHER_AISLE ? null : a[0]) -
      aisleRank(b[0] === OTHER_AISLE ? null : b[0]) ||
      a[0].localeCompare(b[0]));
  })();

  /**
   * The list, in the order you walk a shop — §4d.
   *
   * Grouped rather than sorted flat, because the header is what lets you skip a
   * whole section you have already passed. Unplaced rows sink into one group at
   * the end: a free-text row the user typed has no kind and never will, and it
   * is still on the list because they put it there.
   */
  const byAisle = (() => {
    const groups = new Map<string, typeof list>();
    for (const i of list) {
      const key = aisleOf(i.kind) ?? OTHER_AISLE;
      const at = groups.get(key);
      if (at) at.push(i); else groups.set(key, [i]);
    }
    // Within an aisle, the order things were ADDED — §4e. Consecutive rows tend
    // to come from one recipe or one planning session, and alphabetical
    // scatters exactly those.
    for (const rows of groups.values())
      rows.sort((x, y) => (x.addedAt ?? "").localeCompare(y.addedAt ?? ""));
    return [...groups.entries()].sort((a, b) =>
      aisleRank(a[0] === OTHER_AISLE ? null : a[0]) -
      aisleRank(b[0] === OTHER_AISLE ? null : b[0]) ||
      a[0].localeCompare(b[0]));
  })();

  /**
   * Your own history, offered before ours — UX-SPEC §4f.
   *
   * The suggester ranks 2,872 ontology names by how many recipes use them,
   * which is right for a recipe app and wrong for a shopping list. A list is
   * habitual: the same forty things, in cycles, per household. What you bought
   * last time predicts this time far better than the corpus average does.
   *
   * Three things make this worth its few lines rather than a tweak to the
   * server search:
   *
   *   - **Typed rows.** "bin bags" is not in the ontology and never will be,
   *     and it is on the list every week. A corpus-backed suggester cannot
   *     offer it at all.
   *   - **Tombstones.** Rows survive going empty now, so everything the user has
   *     ever had is still here to match against. This is the reader those rows
   *     were kept for.
   *   - **Recency, not frequency.** Frequency freezes a household into whatever
   *     it ate when it started using the app; the thing you bought last week is
   *     the better guess.
   */
  const mine = (() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    return items
      .filter((i) => i.name.toLowerCase().includes(term))
      .sort((a, b) => {
        // Prefix beats substring: someone typing "gar" means garlic, not
        // "sugar snap peas".
        const ap = a.name.toLowerCase().startsWith(term), bp = b.name.toLowerCase().startsWith(term);
        return Number(bp) - Number(ap) || (b.usedAt ?? "").localeCompare(a.usedAt ?? "");
      })
      .slice(0, 5);
  })();
  /* The corpus, minus anything already offered above it. A name in both lists
     twice is the suggester looking broken, not thorough. */
  const mineIds = new Set(mine.map((i) => i.id));
  const rest = hits.filter((h) => !mineIds.has(h.id));

  /** Typing the name of something we already know is not a custom item. */
  const exactMatch = hits.some((h) => h.name.toLowerCase() === q.trim().toLowerCase());



  /**
   * The state widget belongs UNDER THE CHIP THAT OPENED IT.
   *
   * It used to render after all three shelves, so clicking something in "Use
   * today" opened a panel below the grocery list — far from the thing being
   * edited, and on a phone often off-screen entirely. One widget still, but
   * placed by whichever shelf holds the open item, so the edit happens where
   * the eye already is.
   */
  const openFor = (id: string, name: string, anchor: HTMLElement) =>
    setOpen({
      item: byId.get(id) ?? { id, name, in_pantry: false, on_list: false, use_first: false },
      anchor,
    });

  /**
   * What a search result becomes — chosen, never assumed.
   *
   * Tapping a hit used to put it straight in the pantry. That was defended as
   * "somebody typing gochujang into an add box has gochujang", which is true of
   * an ADD box and false of a search box: you look things up to find out
   * whether we know them, to reach a specific cut, or to check what a recipe
   * meant. Every one of those wrote to the pantry.
   *
   * So a result opens this, and nothing is written until a button is pressed.
   * The two buttons are the two things a person means — I have this, or I need
   * to buy it — phrased as what they are saying rather than as which flag it
   * sets.
   */
  const choose = (flags: IngredientState) => {
    if (!choosing) return;
    const { id, name } = choosing;
    /* What was true before, so the toast can offer the way back — the same
       courtesy the Almost-there rows already extend. */
    const prev: IngredientState = {
      in_pantry: byId.get(id)?.in_pantry ?? false,
      on_list: byId.get(id)?.on_list ?? false,
      use_first: byId.get(id)?.use_first ?? false,
    };
    setChoosing(null);
    clear();
    write(id, flags, name);
    say(flags.on_list && !prev.on_list ? `${name} → grocery list`
        : flags.in_pantry && !prev.in_pantry ? `${name} → pantry`
        : `${name} updated`,
        () => { write(id, prev, name); say(`${name} put back`); });

    /*
     * Asked the moment it is added, which is the moment it matters.
     *
     * It used to be counted in a line at the top of the drawer — "1 question
     * about your pantry" — which is a notification about a question rather than
     * a question, and reads as a chore. The answer is only interesting because
     * something just entered the pantry, so that is when to ask.
     */
    const pending = (asksFor[id] ?? []).filter((a) => a.answer === null);
    if (flags.in_pantry && pending.length) setAsking({ name, asks: pending });
  };

  const apply = (next: IngredientState) => {
    if (!open) return;
    setOpen({ ...open, item: { ...open.item, ...next } });
    /* Taking it off the list here keeps the row, struck through, so it can be
       put back — the same courtesy the ✓ button has always had, and the same
       set. Putting it back on lifts the strike and forgets the id, so a stale
       entry cannot strike the row again the next time it leaves. Neither is
       persisted: a refresh is what finally clears a struck row away. */
    if (open.item.on_list && !next.on_list)
      setOffList((t) => (t.has(open.item.id) ? t : new Set(t).add(open.item.id)));
    else if (next.on_list)
      setOffList((t) => {
        if (!t.has(open.item.id)) return t;
        const n = new Set(t);
        n.delete(open.item.id);
        return n;
      });

    /* The same bookkeeping on the pantry side — see `dropped`. Taking something
       out keeps its chip on the shelf, struck through; putting it back takes
       the strike off. Only an item that WAS held can be dropped, or toggling
       the list flag on something you never had would post it to the pantry as a
       crossed-out row it was never part of. */
    if (open.item.in_pantry && !next.in_pantry)
      setDropped((d) => (d.has(open.item.id) ? d : new Set(d).add(open.item.id)));
    else if (next.in_pantry)
      setDropped((d) => {
        if (!d.has(open.item.id)) return d;
        const n = new Set(d);
        n.delete(open.item.id);
        return n;
      });

    write(open.item.id, next, open.item.name);
  };

  /**
   * The widget, anchored to whichever chip opened it.
   *
   * It used to render after the whole cloud, so tapping the first of forty
   * ingredients put the panel below all forty — off screen, inside a drawer
   * that is itself scrolling. The tap looked like it had done nothing.
   */
  const widget = open ? (
    <Popover anchor={open.anchor} label={open.item.name} onClose={closePanel}>
      <StateWidget {...(pushKey ? { pushKey } : {})}
        name={open.item.name}
        state={{ in_pantry: open.item.in_pantry, on_list: open.item.on_list,
                 use_first: open.item.use_first }}
        {...(open.item.addedAt ? { addedAt: open.item.addedAt } : {})}
        {...(open.item.sinceAt ? { sinceAt: open.item.sinceAt } : {})}
        asks={asksFor[open.item.id] ?? []}
        {...(open.item.note ? { note: open.item.note } : {})}
        {...(onNote ? { onNote: (next: string) => run(() => onNote(open.item.id, next)) } : {})}
        onChange={apply}
        onAnswer={(a, yes) => run(() => onAnswer(a.id, yes, a.grants))}
        excluded={excluded.has(open.item.id)}
        onExclude={(v) => {
          /* Detached, like `write` and for the same reason: `run` awaits the
             action INSIDE a transition, so the click paid for the round trip
             and then for the re-render it caused. The widget has already
             painted; the grid catches up when the drawer closes. */
          markDirty();
          begin();
          void (async () => {
            try {
              const r = await onExclude(open.item.id, v);
              setFailed(r.ok ? null : r.error);
              end(r.ok);
            } catch (e) {
              end(false);
              setFailed(e instanceof Error ? e.message : "Could not reach the server.");
            }
          })();
        }}
      />
    </Popover>
  ) : null;


  return (
    <>
      {failed && (
        <div className="failbar" role="alert">
          <b>Not saved.</b> {failed}
          <button type="button" onClick={() => location.reload()}>reload</button>
        </div>
      )}
      {/*
        A SEARCH bar, not an add bar.
        
        Naming it "Add" made every result a button that changed your pantry the
        moment it was touched, so looking something up and acquiring it were the
        same gesture — and you could not check whether we knew about "doenjang"
        without claiming to own it. Searching and adding are different acts, so
        the bar does the first and a dialog does the second.
        
        It is also the one place custom items are entered now. Somewhere to type
        an ingredient name is somewhere to type "bin bags", and having two boxes
        for that made the user decide which kind of thing they were adding
        before they had typed it.
      */}
      {/*
        Wrapped so it travels with the PANTRY panel (§4d).

        The add box is how something enters your inventory, so it belongs to the
        pantry; sitting outside both shelves it stayed on screen when only the
        grocery list was open, which read as "search the list" and is not what it
        does. It still adds to either place — the buttons inside say which — but
        it is the pantry's front door and it opens with the pantry.
      */}
      <div className="pantry-search">
      {/*
        No heading on this one.

        A box with a magnifier-shaped placeholder — "Type an ingredient" —
        under a heading reading SEARCH is the control labelled twice, and the
        heading is the half that says less. The two shelves below it keep
        theirs, because "Pantry" and "Grocery list" name things a box cannot:
        which of the two a row belongs to.
      */}
        {/* Debounced, and stale responses dropped — see `useSearch`. It fired
            once per keystroke, so the list could settle on a prefix you had
            already finished typing. */}
        <form className="search" onSubmit={(e) => e.preventDefault()}>
          <input value={q} placeholder="Type an ingredient"
                 aria-label="Search ingredients"
                 onChange={(e) => setQ(e.target.value)} />
          {/* Drawn, not typed, and INSIDE the bar — a word beside the box was
              a second control fighting the input for the row (the user's
              call, 2026-08-16). */}
          {q && (
            <button type="button" className="search-clear" aria-label="Clear search"
                    onClick={clear}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                   aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
              </svg>
            </button>
          )}
        </form>
        {/* The matches scroll inside themselves, not by moving the page — see
            `.hitbox`. The field you are typing into has to stay where it is. */}
        {(mine.length > 0 || rest.length > 0) && (
        <div className="hitbox">
        {mine.length > 0 && (
          <>
          <p className="aisle-head">Yours</p>
          <ul className="hits">
            {mine.map((i) => (
              <li key={i.id}>
                <button type="button" className={i.in_pantry ? "hit held" : "hit"}
                        /* The corpus count if the search happens to know this
                           name, else zero — which is the true answer for a
                           typed row like "bin bags" and reads correctly in the
                           dialog as "not used by any recipe we have". */
                        onClick={() => setChoosing({ id: i.id, name: i.name,
                                                     recipes: hits.find((h) => h.id === i.id)?.recipes ?? 0 })}>
                  <span className="hit-name">{i.name}</span>
                  <span className="hit-count">
                    {i.in_pantry ? "in your pantry"
                      : i.on_list ? "on your grocery list"
                      : ageOf(i.usedAt) ? `last had it ${ageOf(i.usedAt)} ago` : "you have had this"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}

        {rest.length > 0 && (
          <ul className="hits">
            {rest.map((h) => {
              const held = byId.get(h.id)?.in_pantry;
              return (
                <li key={h.id}>
                  <button type="button" className={held ? "hit held" : "hit"}
                          onClick={() => setChoosing({ id: h.id, name: h.name, recipes: h.recipes })}>
                    <span className="hit-name">{h.name}</span>
                    {/* The alias is bold: it is the part the user typed and
                        recognises, and without it the row looks like we ignored
                        them and offered something else. */}
                    {h.via && <span className="hit-via">«<b>{h.via}</b>»</span>}
                    <span className="hit-count">
                      {h.recipes > 0 ? `${h.recipes.toLocaleString()} recipes` : "no recipes yet"}
                    </span>
                    {held && <span className="hit-held">in pantry</span>}
                  </button>

                  {/*
                    More specific options, offered under the broad one.

                    A specific pantry entry strictly dominates: `coarse salt`
                    covers a recipe asking for `salt` SILENTLY, where `salt`
                    covers one asking for `coarse salt` only with a "check the
                    source" line and a ranking penalty (INGREDIENT-SPEC §3a).
                    Typing the broad word is the one moment that is worth
                    saying — but it is an offer, not a correction: someone
                    whose pack says "beef" should add beef, and a guessed cut
                    is worse data than an honest broad entry.
                  */}
                  {h.children && h.children.length > 0 && (
                    <ul className="kids">
                      {h.children.map((c) => (
                        <li key={c.id}>
                          <button type="button"
                                  className={byId.get(c.id)?.in_pantry ? "hit held" : "hit"}
                                  onClick={() => setChoosing({ id: c.id, name: c.name, recipes: c.recipes })}>
                            <span className="kid-mark" aria-hidden="true">↳</span>
                            <span className="hit-name">{c.name}</span>
                            <span className="hit-count">
                              {c.recipes > 0 ? `${c.recipes.toLocaleString()} recipes` : "no recipes yet"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        </div>
        )}

        {/*
          Your own words, when the vocabulary has none.

          The list has to be able to hold "bin bags" or it loses to a notes app,
          and this is where someone is already typing an ingredient name. Offered
          UNDER the matches rather than instead of them: if we know the thing,
          the known one matches recipes and the typed one never will.
        */}
        {q.trim().length > 1 && !exactMatch && (
          <p className="cook-line customline">
            <Button kind="plain" disabled={pending}
                    onClick={() => {
                      const t = q.trim(); clear();
                      run(() => onAddNote(t));
                    }}>
              Add “{q.trim()}” as my own
            </Button>
            <span className="note">grocery list only</span>
          </p>
        )}

      </div>

      {/*
        Two places, told apart at a glance — UX-SPEC §3.

        A four-way filter with counts replaced three stacked shelves and saved
        real height, but it cost more than it saved: what you own and what you
        still need are different KINDS of fact, and a tab bar made them look
        like two views of one thing. You had to read a control to find out which
        you were looking at.

        Two blocks now, styled apart rather than merely labelled apart.

        What the filter got right is kept: pinned items sit at the TOP of the
        pantry rather than in a shelf of their own, so pinning something no
        longer makes it vanish from the place it lives. It is still your pantry;
        it is just the part of it shouting.
      */}
      {/* The tickable kitchen lives in `BrowseGrid`, rendered beside this by
          `PantryDrawer`. It was here, and it was 600 of the drawer's 968
          elements — reconciled on every chip tap, hidden the whole time by
          `display: none`, which does nothing for React. */}
      <div className="shelf shelf-pantry">
      {/* The count is what you HAVE, not what is on screen — a struck-through
          chip is a thing you just removed, and counting it would make the
          heading disagree with the shelf under it. */}
      <Section title="Pantry" count={heldNow} foldable>
        {held.length === 0
          ? <Empty>Nothing yet.</Empty>
          : pantryByAisle.map(([aisle, rows]) => (
              <div className="aisle-group" key={aisle}>
                <p className="aisle-head">{aisle}</p>
                <ChipRow>{rows.map(pantryChip)}</ChipRow>
              </div>
            ))}

        {/* A pin is a claim about TODAY, so it stops steering after a week —
            see `pinLive`. The chip stays, greyed, because silently dropping
            something the user set is the failure this shelf exists to avoid. */}
        {held.some((i) => i.lapsedPin) && (
          <p className="note">Greyed pins have expired. Tap to pin again.</p>
        )}
      </Section>
      </div>


      {/*
        "Buy one thing" is gone from here.

        It was a list of ingredient rows reading "scallion · unlocks 12 · add",
        and its own comment admitted the weakness: the claim could only be
        checked on the Cook page, because the twelve recipes were the grid
        behind the drawer. "Nearly there" now makes the same offer WITH the
        twelve recipes on the same line as the ingredient (§4i), which is the
        version this one was approximating — and two surfaces making one offer
        is how they drift apart.
      */}

      {widget}

    {draft && (
      <Dialog label={draft.to === "pantry" ? "Move the cart into your pantry" : "Add to your grocery list"}
              onClose={() => setDraft(null)}>
          <h2 className="ask-question">
            {draft.rows.length === 0
              ? "Nothing left"
              : draft.to === "pantry"
                ? `Move ${draft.rows.length} to your pantry?`
                : `Add ${draft.rows.length} to your grocery list?`}
          </h2>
          {/* The one place §4g's question is asked, and the only place it can be
              answered honestly: you are at the door with the bags. Whatever you
              remove here was bought and is not in your kitchen. */}
          {draft.to === "pantry" && (
            <p className="note ask-because">Remove anything you didn’t keep.</p>
          )}
          <ul className="basket-list">
            {draft.rows.map((d) => (
              <li key={d.id}>
                <span className="basket-name">{d.name}</span>
                {d.why && <span className="basket-why">{d.why}</span>}
                {/* Removing here removes it from the BASKET, not from
                    anything stored — nothing has been written yet. */}
                <button type="button" className="basket-x"
                        aria-label={`Leave out ${d.name}`}
                        onClick={() => setDraft({ ...draft,
                          rows: draft.rows.filter((x) => x.id !== d.id) })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className="cook-line">
            <Button kind="primary" disabled={pending || draft.rows.length === 0}
                    onClick={() => {
                      const ids = draft.rows.map((d) => d.id);
                      const to = draft.to;
                      /* Each row's state BEFORE the sweep, so undo can put
                         every one back exactly — a bulk write undone with one
                         blanket state would erase whichever flags survived
                         the move. */
                      const prevs = ids.map((id) => ({
                        id,
                        prev: {
                          in_pantry: byId.get(id)?.in_pantry ?? false,
                          on_list: byId.get(id)?.on_list ?? false,
                          use_first: byId.get(id)?.use_first ?? false,
                          in_cart: !!byId.get(id)?.in_cart,
                        },
                      }));
                      /* The whole cart empties, whether or not a row survived
                         the list above — `putAway` takes what to KEEP. So the
                         optimistic state has to move every cart row, not just
                         the ids being kept, or the ones removed here sit on
                         screen until the server answers. */
                      if (to === "pantry")
                        for (const i of cart)
                          addOptimistic({ id: i.id, name: i.name, next: {
                            in_pantry: ids.includes(i.id) ? true : i.in_pantry,
                            on_list: i.on_list, use_first: i.use_first,
                            in_cart: false } });
                      setDraft(null);
                      run(() => (to === "pantry" ? onPutAway(ids) : onAddMany(ids)));
                      say(to === "pantry"
                            ? <>{ids.length} → {dest("pantry", "pantry")}</>
                            : `${ids.length} added to your grocery list`,
                          () => {
                            for (const { id, prev } of prevs)
                              addOptimistic({ id, next: prev });
                            /* Rows dropped from the basket went nowhere but out
                               of the cart, and undo has to put them back in it
                               or they are lost between two shelves. */
                            if (to === "pantry")
                              for (const i of cart) {
                                if (ids.includes(i.id)) continue;
                                addOptimistic({ id: i.id, name: i.name,
                                  next: { in_pantry: i.in_pantry, on_list: i.on_list,
                                          use_first: i.use_first, in_cart: true } });
                                run(() => onUpdate(i.id, { in_pantry: i.in_pantry,
                                  on_list: i.on_list, use_first: i.use_first,
                                  in_cart: true }));
                              }
                            /* Sequential, stopping at the first refusal — the
                               same rule the offline queue follows: a partial
                               undo applied out of order is worse than one
                               that says where it stopped. */
                            run(async () => {
                              for (const { id, prev } of prevs) {
                                const r = await onUpdate(id, prev);
                                if (!r.ok) return r;
                              }
                              return { ok: true };
                            });
                            say(ids.length === 1 ? "1 put back" : `${ids.length} put back`);
                          });
                    }}>
              {pending ? "Saving…"
                : draft.to === "pantry" ? `Move ${draft.rows.length}`
                : `Add ${draft.rows.length}`}
            </Button>
            <Button kind="quiet" onClick={() => setDraft(null)}>Cancel</Button>
          </p>
      </Dialog>
    )}

      {/*
        "Three dinners want this — did you buy enough?"

        Only when more than one planned meal needs it, so the question stays
        rare enough to be read. A dialog rather than a line under the list: it
        is a question, and every question in this product gets full attention.

        The tap is still not taxed. The tick already landed and the item is
        already in the cart — this asks about a SECOND fact, and closing it
        means "enough", so ignoring it costs nothing. Answering "need more"
        leaves the row on the list while the one you picked up stays in the
        cart, which is the state INGREDIENT-SPEC §2 made the flags independent
        to express and which nothing had ever written.
      */}
      {/*
        §4g's dialog stood here and is gone — CART-SPEC §4.

        It asked "did that go in the kitchen?" in an aisle, about a thing that
        would not be in a kitchen for another half hour, and carried a
        "don't ask me again" checkbox to make the wrong moment survivable. The
        question was always right; only the moment was wrong. It is asked once
        now, at the door, by the put-away basket below, where the answer is
        known and one review covers the whole trip.
      */}

      {/*
        The till — CART-SPEC §2. Two answers, and they are the two things that
        actually happen at a shelf: it went in the cart, or you have decided
        against it. Neither is about your kitchen, which is asked once, later,
        at the door.
      */}
      {checkingOut && (
        <Dialog label={`${checkingOut.name} — ${listHeading ? "into the cart" : "into the pantry"}, or off the list?`}
                onClose={() => setCheckingOut(null)}>
          {/* The name is the question. Read at arm's length, one-handed, in a
              shop — see `.ask-question-big`. */}
          <h2 className="ask-question ask-question-big">{checkingOut.name}</h2>
          {/* The destination is the page's, not the row's: on the grocery page
              you are shopping and it goes in the cart; in the drawer you are
              somewhere else entirely and the simple answer is the true one. */}
          <div className="ask-actions ask-actions-split ask-actions-tall">
            <Button kind="primary" onClick={() => {
              const it = checkingOut;
              setCheckingOut(null);
              if (listHeading) toCart(it, needsById.get(it.id)?.forMeals ?? []);
              else toPantryNow(it);
            }}>
              {listHeading ? "Move to cart" : "Move to pantry"}
            </Button>
            <Button kind="plain" onClick={() => {
              const it = checkingOut;
              setCheckingOut(null);
              dropFromList(it);
            }}>
              Delete it
            </Button>
          </div>
        </Dialog>
      )}

      {/*
        A chip tapped in the cart. Two answers again, and they are the two that
        exist for a thing already bought: it goes back on the list (you have put
        it back on the shelf), or it goes entirely. The pantry is not offered
        here — that is what the button under the cart is for, and offering it
        per chip would be two doors to one room.
      */}
      {cartRow && (
        <Dialog label={`${cartRow.name} — back on the grocery list, or gone?`}
                onClose={() => setCartRow(null)}>
          <h2 className="ask-question ask-question-big">{cartRow.name}</h2>
          <div className="ask-actions ask-actions-split ask-actions-tall">
            <Button kind="primary" onClick={() => {
              const it = cartRow;
              setCartRow(null);
              untick(it.id, it.name, it.prev);
            }}>
              Move back to grocery list
            </Button>
            <Button kind="plain" onClick={() => {
              const it = cartRow;
              setCartRow(null);
              dropFromList(it);
            }}>
              Delete it
            </Button>
          </div>
        </Dialog>
      )}

      {askedEnough && (
        <Dialog label={`Did you buy enough ${askedEnough.name}?`}
                onClose={() => setAskedEnough(null)}>
          <p className="ask-eyebrow">{askedEnough.name}</p>
          <h2 className="ask-question">Did you buy enough?</h2>
          <p className="note ask-because">
            {askedEnough.meals.join(", ")} want this.
          </p>
          <div className="ask-actions">
            <Button kind="plain" disabled={pending} onClick={() => {
              const it = askedEnough;
              setAskedEnough(null);
              run(() => onTick(it.id, false));
            }}>
              Need more, keep it on the list
            </Button>
            <Button kind="primary" onClick={() => {
              const it = askedEnough;
              setAskedEnough(null);
              say(<>{it.name} → {dest("cart", "cart")}</>,
                  () => untick(it.id, it.name, it.prev));
            }}>Got enough</Button>
          </div>
        </Dialog>
      )}

      {/*
        What to do with a search result — the decision, made explicitly.

        Two buttons for the two things a person means, phrased as what they are
        saying rather than as which flag it sets. Closing writes nothing, which
        is the point: you can look an ingredient up without acquiring it.
      */}
      {choosing && (
        <Dialog label={choosing.name} onClose={() => setChoosing(null)}>
          <p className="ask-eyebrow">
            {choosing.recipes > 0
              ? `used in ${choosing.recipes.toLocaleString()} recipes`
              : "not used by any recipe we have"}
          </p>
          <h2 className="ask-question">{choosing.name}</h2>
          {byId.get(choosing.id) && (
            <p className="note ask-because">
              Already {byId.get(choosing.id)!.in_pantry ? "in your pantry" : "on your grocery list"}.
            </p>
          )}

          <div className="ask-actions">
            <Button kind="primary"
                    onClick={() => choose({
                      in_pantry: true,
                      on_list: byId.get(choosing.id)?.on_list ?? false,
                      use_first: byId.get(choosing.id)?.use_first ?? false,
                    })}>
              Have it!
            </Button>
            <Button kind="plain"
                    onClick={() => choose({
                      in_pantry: byId.get(choosing.id)?.in_pantry ?? false,
                      on_list: true,
                      use_first: byId.get(choosing.id)?.use_first ?? false,
                    })}>
              Add to grocery list
            </Button>
          </div>
          {/* No Cancel button (the user's call, 2026-08-16, and the standing
              dialog rule): outside-click and Escape already close it, and
              closing writes nothing. */}
        </Dialog>
      )}

      {/* "Empty the cart?" — the only bulk discard on this page. */}
      {confirmDialog}

      {/* A question gets a screen of its own — INGREDIENT-SPEC §6. Closing
          answers nothing, so an unanswered question stays unanswered. */}
      {asking && (
        <AskModal ingredient={asking.name} asks={asking.asks}
                  onAnswer={(a, yes) => run(() => onAnswer(a.id, yes, a.grants))}
                  onClose={() => setAsking(null)} />
      )}

      <div className="shelf shelf-list">
      {/*
        On `/list` this heading IS the page's heading.

        Everywhere else the list is one shelf among several, so it wears the
        same small uppercase label as the pantry beside it and folds away. On
        its own page that label was the only thing above a short list of chips,
        which is what made the page read as unfinished: no anchor at the top,
        and the count sitting in the corner where a section number goes.

        Same `Section`, three switches. The title becomes the page title, the
        bare count becomes a sentence about the trip, and folding goes: there is
        nothing on this page to fold the list away FROM.

        The heading's right-hand end carries both how the trip is going and the
        way back out of the last tick. Undo is FILLED because it writes, per the
        button scheme in globals.css, and it names its row in the label for
        anyone who cannot see which one just left.
      */}
      <Section title={listHeading
                        ? <span className="list-title">Grocery list</span>
                        : "Grocery list"}
               {...(listHeading ? {} : { count: listNow })}
               {...(listHeading && (lastTick || cart.length > 0 || listNow > 0)
                      ? { action: (
                          <>
                            {/* Pick a few out of the cart by hand. Only offered
                                once there is a cart to pick from, and it is a
                                MODE, so it says how to leave: Select → Done. */}
                            {(cart.length > 0 || listNow > 0) && (
                              <button type="button" className="btn btn-quiet list-select"
                                      aria-pressed={selecting}
                                      onClick={() => {
                                        setSelecting((v) => !v);
                                        setPicked(new Set());
                                      }}>
                                {selecting ? "Done" : "Select"}
                              </button>
                            )}
                            {lastTick && (
                              <button type="button" className="btn btn-primary list-undo"
                                      aria-label={`Put ${lastTick.name} back on the list`}
                                      onClick={() => untick(lastTick.id, lastTick.name,
                                                            lastTick.prev)}>
                                Undo
                              </button>
                            )}
                          </>
                        ) }
                      : {})}
               foldable={!listHeading}>
        {/*
          UX-SPEC §4b — nothing the app suggests lands without this.

          It sits at the TOP of the grocery list, which is where the things
          would end up: the user reviews the basket in the place it is about to
          change, rather than in a dialog over it.
        */}
        {/*
          The "waiting to save" shelf went with the inversion.

          It drew rows typed with no signal above the empty/non-empty split,
          because the server had never heard of them and the list beneath was
          the server's. A typed row is a device write now: it goes into
          `ingredients` as a `txt_` row on the tap, sorts into its aisle with
          everything else, and can be ticked — so it belongs in the list rather
          than in a waiting room above it. There is nothing left to distinguish.
        */}

        {/*
          A cart is not an empty list. The cart shelf lives inside this branch,
          so ticking the last row and reloading mid-shop showed "Empty" with the
          whole trip's shopping invisible under it — the page denying the cart
          it had just filled. On the grocery page a non-empty cart keeps the
          branch open; the aisles above it simply render nothing. The drawer is
          untouched: it never draws the cart, so for it an empty list is empty.
        */}
        {list.length === 0
          && !(listHeading && cart.length > 0)
          ? <Empty>Empty</Empty>
          : <>
              {/*
                One row per item, with a tick — the aisle, not the till.

                "Move to pantry" below is a reconciliation at the
                end of the trip; it cannot let you watch the list shrink as the
                trolley fills, which is the actual job. The chip still opens the
                state widget, so nothing that worked before stopped working.
              */}
              {/*
                Grouped by aisle — §4d. The list is walked, not read.

                Headings only appear once there is more than one group: a
                five-item list that is all produce gains nothing from a header
                saying so, and a group-of-one for every row is noise.
              */}
              {byAisle.map(([aisle, rows]) => (
              <div className="aisle-group" key={aisle}>
              {byAisle.length > 1 && <p className="aisle-head">{aisle}</p>}
              <ul className="aisle">
                {rows.map((i) => {
                  const meals = needsById.get(i.id)?.forMeals ?? [];
                  /* What the row SAYS — and what the till dialog, the toast and
                     the undo it seeds all say after it, so the conversation
                     stays in one vocabulary. Writes still travel by id. */
                  const label = i.display ?? i.name;
                  /*
                    Struck through only while it is genuinely OFF the list.

                    `ticked` records what was ticked this visit, and it was being
                    read as the whole answer — so putting something back on the
                    list left it dimmed and crossed out, because the set still
                    remembered the tick. The set is half the fact; `on_list` is
                    the other half, and the row is only done when both agree.
                  */
                  const done = offList.has(i.id) && !i.on_list;
                  const pick = selecting && picked.has(i.id);
                  return (
                    <li key={i.id}
                        className={[done ? "ticked" : "", pick ? "cart-pick" : ""]
                          .filter(Boolean).join(" ") || undefined}>
                      {/*
                        The box appears only while selecting — Richard's
                        settlement, 2026-08-18.

                        On the page, the CHIP is the row's action: tapping it
                        asks where the thing went. A permanent tick beside it was
                        a second control for the same decision, and the two
                        disagreed about what a tap means. So the box is drawn
                        only when it has a job, and then it is drawn for every
                        row at once, left of the name, where a list of things to
                        pick puts it.

                        In the drawer (`!listHeading`) the tick stays: that list
                        is a reference copy with no select mode, and the tick is
                        its whole checkout.
                      */}
                      {selecting ? (
                        <button type="button" className="aisle-tick pick-box"
                                role="checkbox" aria-checked={pick}
                                aria-label={`Select ${label}`}
                                onClick={() => togglePick(i.id)}>
                          {pick ? "✓" : ""}
                        </button>
                      ) : !listHeading ? (
                        <button type="button" className="aisle-tick"
                                aria-label={`Got ${label}`}
                                onClick={() => setCheckingOut({ id: i.id, name: label,
                                  prev: { in_pantry: i.in_pantry,
                                          use_first: i.use_first } })}>✓</button>
                      ) : null}
                      {/*
                        The list's colour, on every row of it.

                        This used to go green for anything you already held, so
                        that the row could answer "do I have some?" on a page
                        with no pantry beside it. It cost more than it bought:
                        the list came out two-toned, and an item you ticked or
                        added changed colour where it stood, which reads as a
                        glitch rather than as news. The pantry shelf sits
                        directly above on every surface that carries this one,
                        and the chip is in it — that is where "I have some" is
                        said now, in the shelf's own green.
                      */}
                      {/*
                        On the grocery page the chip IS the row's action, and it
                        is the shopping question — "into the cart, or off the
                        list?" — not the state widget. A page you use standing in
                        a shop should not answer a tap with a panel about
                        portions and brands; that panel is what the drawer's copy
                        still opens, because there you are looking things up.
                      */}
                      <Chip label={label} tone="want" gone={done}
                            {...(selecting ? { title: "select" } : {})}
                            onClick={(e) => (selecting ? togglePick(i.id)
                              : listHeading
                                ? setCheckingOut({ id: i.id, name: label,
                                    prev: { in_pantry: i.in_pantry,
                                            use_first: i.use_first } })
                                : openFor(i.id, i.name, e.currentTarget))} />
                      {/*
                        WHY this row exists — the dishes waiting on it.

                        Two names, then a count: three full recipe titles wrap a
                        360px row into three lines and the tick stops being the
                        thing you see. The number is the part that matters past
                        two anyway — an ingredient four dinners want is the one
                        you must not come home without.
                      */}
                      {meals.length > 0 && (
                        <span className="note aisle-why">
                          {meals.slice(0, 2).join(" · ")}
                          {meals.length > 2 && ` +${meals.length - 2}`}
                        </span>
                      )}
                      {/*
                        The offer, at the end of the row it is about — Richard's
                        call, 2026-08-18.

                        This reverses UX-SPEC §4h, which moved the links OUT of
                        the list on the argument that a run of names in a note
                        among the rows is an ad mixed into the task, and that
                        keeping them in one removable block is how the promise
                        "better than Apple Notes even without the links" stays
                        checkable. Both halves of that still hold; what changes
                        is where the offer is legible. A link at the end of the
                        row it belongs to is answerable in place — this one, not
                        four names in a sentence below — and it is still only
                        drawn for rows §4h would have named, which is the part
                        that keeps it from being an ad for onions.

                        `/go` and a click id, like every other placement
                        (ATTRIBUTION-SPEC §3): one outbound path, one scheme.
                        The commission disclosure lives under the list, in the
                        block below, and must stay wherever these links are.

                        "Find it on <shop>", not "Get it delivered by" (Richard,
                        2026-08-19). The shop's name is data now
                        (`retailer-brand.ts`); the verb is the decision. Three
                        reasons, and the first is the honest one: the tap opens a SHELF. We do not know their delivery
                        zone, their stock or their minimum, so a promise about
                        the parcel is a promise made with someone else's
                        inventory. The second is that findability is the only
                        argument that justifies the link at all (§4h) — "you do
                        not know where to buy doenjang" — and this says that. The
                        third is width, and it is the smallest: measured at
                        320px the link goes from 166px to 110px. Neither wraps —
                        `.aisle-buy` is `nowrap` — but that is 56px the chip was
                        giving up to say less.

                        The `list_row` surface is unchanged on purpose, so the
                        click data spans the wording change instead of splitting
                        at it.
                      */}
                      {listHeading && !selecting && i.buy && (
                        <a className="btn btn-quiet aisle-buy"
                           href={goHref(i.buy.url, i.id, "list_row",
                                        i.buy.products.length > 0)}
                           onClick={mintClickId} onAuxClick={mintClickId}
                           target="_blank" rel="noreferrer nofollow sponsored">
                          Find it on <b className="aff-mark">{retailer.label}</b>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
              ))}

              {/*
                The cart, DRAWN — Richard's call, 2026-08-18.

                It was a "Bought" group: a heading and a list of struck-through
                rows, which is the same shape as the list above it and therefore
                reads as more list. A cart is not more list. Ticked things go
                somewhere, and a picture of the somewhere is what makes the
                transition legible — you can see the thing land.

                Drawn rather than typed (the standing rule): an SVG basket whose
                body stretches to whatever is in it, with `non-scaling-stroke`
                so the outline stays one weight however tall it grows, plus a
                handle and two wheels at fixed size. No 🛒 — a glyph inherits
                the label's size and reads as punctuation.

                Shown while there is anything to shop for, empty or not: a cart
                that appears only once you have used it cannot tell you where
                the ticks go, which is the one thing it is for.
              */}
              {/*
                The cart — a shelf like the aisles above it, not a picture.

                It WAS drawn: an SVG basket that grew with its contents, on the
                argument that seeing a thing land makes the transition legible.
                Two rewrites in, it still read as assembled rather than drawn
                (Richard, twice), and the honest read is that a line drawing
                stretched around live content is a hard thing to make good and
                was buying very little. A heading in the page's own vocabulary —
                the same small uppercase label PRODUCE and MEAT wear — says the
                same thing and cannot look sloppy.

                The mark beside it is the cart, drawn in the tab bar's hand:
                24px box, 1.8 stroke, round joins, `currentColor`. Same family
                as the basket on the Grocery list tab, so the two read as one
                product rather than two icon sets.
              */}
              {listHeading && (cart.length > 0 || listNow > 0) && (
                <div className={cart.length ? "aisle-group cart-shelf"
                                            : "aisle-group cart-shelf cart-empty"}>
                  <p className="aisle-head cart-head">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
                         strokeLinejoin="round" aria-hidden="true">
                      {/* Handle, basket, two wheels — the whole cart in four
                          strokes, which is all 17px has room for. */}
                      <path d="M2.5 3.5h2.2l2.3 10.5h9.4" />
                      <path d="M6.4 6.5h14.6l-1.5 6.2" />
                      <circle cx="9" cy="19" r="1.5" />
                      <circle cx="17" cy="19" r="1.5" />
                    </svg>
                    Cart <span className="count">{cart.length}</span>
                  </p>
                  {/* One row each, the way the list above does it: the two
                      shelves are read the same way, and a wrapping cloud made
                      the cart look like a different kind of thing. */}
                  <ul className="aisle cart-items">
                    {cart.map((i) => {
                      const pick = selecting && picked.has(i.id);
                      /* Same vocabulary as the list it was ticked off — see the
                         note where the aisle rows pick theirs. */
                      const label = i.display ?? i.name;
                      return (
                        <li key={i.id} className={pick ? "cart-pick" : undefined}>
                          {selecting && (
                            <button type="button" className="aisle-tick pick-box"
                                    role="checkbox" aria-checked={pick}
                                    aria-label={`Select ${label}`}
                                    onClick={() => togglePick(i.id)}>
                              {pick ? "✓" : ""}
                            </button>
                          )}
                          {/* Two jobs, and which one depends on the mode. While
                              selecting, a tap picks the row; otherwise it asks
                              the question a thing in a cart can still be asked —
                              back on the list, or gone. */}
                          <Chip label={label} tone="want"
                                title={selecting ? "select" : "move or delete"}
                                onClick={() => (selecting
                                  ? togglePick(i.id)
                                  : setCartRow({ id: i.id, name: label,
                                      prev: { in_pantry: i.in_pantry,
                                              use_first: i.use_first } }))} />
                        </li>
                      );
                    })}
                    {cart.length === 0 && (
                      <li className="cart-hint note">Nothing in it yet.</li>
                    )}
                  </ul>
                </div>
              )}

              {/*
                Home. The cart onto the shelves, through the same basket every
                other route fills (UX-SPEC §4b) — and this is where the kitchen
                question finally gets asked, once, about the whole trip: remove
                what you did not keep, and the rest goes in the pantry.

                Only when there is something to put away. An empty cart is drawn
                above as a destination, not as a task.
              */}
              {listHeading && (cart.length > 0 || selecting) && (
              <p className="cook-line list-finish">
                <Button kind="primary"
                        disabled={selecting && picked.size === 0}
                        onClick={() => {
                          if (!selecting) {
                            /* The whole cart, checked first: "everything" is a
                               claim about rows the user may not have looked at
                               since the shop. */
                            setDraft({ to: "pantry",
                              rows: cart.map((i) =>
                                ({ id: i.id, name: i.display ?? i.name })) });
                            return;
                          }
                          /* A hand-picked few, moved on the spot. The list was
                             built by tapping each chip; a dialog restating it
                             would be the product asking twice. The rest of the
                             cart stays in the cart — `clearRest: false`. */
                          /* From EITHER shelf: the Select mode belongs to the
                             page, not to the cart, so a row still on the list —
                             something you bought without ticking — moves the
                             same way. `putAway` clears both flags. */
                          const ids = [...picked].filter((id) => byId.has(id));
                          for (const id of ids) {
                            const i = byId.get(id)!;
                            addOptimistic({ id, name: i.name, next: {
                              in_pantry: true, on_list: false,
                              use_first: i.use_first, in_cart: false } });
                          }
                          run(() => onPutAway(ids, false));
                          say(<>{ids.length === 1 ? "1 thing" : `${ids.length} things`}
                              {" → "}{dest("pantry", "pantry")}</>);
                          setSelecting(false);
                          setPicked(new Set());
                        }}>
                  Move to pantry{selecting ? ` (${picked.size})` : ` (${cart.length})`}
                </Button>
              </p>
              )}

              {/*
                The other end of the same row of decisions, under it rather than
                beside it: two full-width buttons stacked read as two answers to
                "what now?", where a pair side by side would read as one action
                and its cancel.

                Outlined, and it stays outlined while selecting. The fill rule is
                about consequence and both of these change something — but the
                page already has one filled button under the cart, and two would
                leave nothing saying which is the ordinary end of a shop.
              */}
              {listHeading && (cart.length > 0 || selecting) && (
              <p className="cook-line list-finish">
                <Button kind="plain"
                        disabled={selecting && picked.size === 0}
                        onClick={() => {
                          if (selecting) {
                            /* Off both shelves and into nothing. `in_pantry` is
                               left alone: deciding against buying more soy sauce
                               says nothing about the bottle in the cupboard. */
                            const ids = [...picked].filter((id) => byId.has(id));
                            const rows = ids.map((id) => byId.get(id)!);
                            for (const i of rows)
                              addOptimistic({ id: i.id, name: i.name, next: {
                                in_pantry: i.in_pantry, on_list: false,
                                use_first: i.use_first, in_cart: false } });
                            run(async () => {
                              for (const i of rows) {
                                const r = await onUpdate(i.id, { in_pantry: i.in_pantry,
                                  on_list: false, use_first: i.use_first, in_cart: false });
                                if (!r.ok) return r;
                              }
                              return { ok: true };
                            });
                            say(ids.length === 1 ? "1 deleted" : `${ids.length} deleted`);
                            setSelecting(false);
                            setPicked(new Set());
                            return;
                          }
                          /* Emptying the cart is `putAway` with nothing to move:
                             every row leaves the cart having entered nothing,
                             which is what the button says. Asked first, because
                             it is the one control here that discards a whole
                             shop in a tap. */
                          confirm({
                            question: cart.length === 1
                              ? "Empty the cart?"
                              : `Empty the cart of ${cart.length} things?`,
                            detail: "They leave the cart without going in your "
                              + "pantry. What is on your grocery list stays there.",
                            confirmLabel: "Empty it",
                          }, () => {
                            for (const i of cart)
                              addOptimistic({ id: i.id, name: i.name, next: {
                                in_pantry: i.in_pantry, on_list: i.on_list,
                                use_first: i.use_first, in_cart: false } });
                            run(() => onPutAway([], true));
                            say("Cart emptied");
                          });
                        }}>
                  {selecting ? `Delete (${picked.size})` : "Empty cart"}
                </Button>
              </p>
              )}
              {/* UX-SPEC §4 — the list is the natural conversion moment, and
                  §5 forbids this anywhere on the results grid. DECISIONS §513:
                  a signup prompt, not a checkout, so one link per item and no
                  basket. */}
              {/* Its own block, below the list — §4h. It used to be a run of
                  names in a note among the rows, which is the arrangement that
                  made it impossible to say the links were removable. */}
              {/*
                On the grocery PAGE the block is gone — Richard, 2026-08-18:
                *"get rid of the redundant block. per-row recommendation is
                enough."* Every row that would have been named in it now carries
                its own link, and the block was saying the same three names a
                second time.

                What cannot go with it is the disclosure. `rel="sponsored"`
                tells a crawler and tells a reader nothing; the FTC asks for
                clear and conspicuous, which means near the links, in the same
                visual field, before the tap — not a footer two screens down.
                So the one line stays, under the rows it is about, and nothing
                is drawn at all when no row has a link.

                The drawer keeps the whole block: its list has no room for a
                link on the row, and there the block IS the placement.
              */}
              {listHeading ? (
                list.some((i) => i.buy) && (
                  <p className="buyblock-disclose list-disclose">
                    We earn a commission on these links.{" "}
                    <Link href="/terms">Terms</Link>.
                  </p>
                )
              ) : (
                <BuyBlock rows={list.filter((i) => i.buy)
                  .map((i) => ({ id: i.id, name: i.name, url: i.buy!.url, products: i.buy!.products }))}
                  retailer={retailer}
                  {...(perk ? { perk } : {})} />
              )}
              {/* The funnel's denominator, not a feature — ATTRIBUTION-SPEC §2. */}
              <ListSeen n={list.length} />
            </>}

        {/* The calendar, read from the list's end. Above "Buy one thing"
            because it is a commitment the user already made, where the unlock
            list is a suggestion. */}
        {planNeeds.length > 0 && (
          <div className="unlocks">
            <p className="unlocks-lead">
              For your meal plan
              <span className="note"> · next 7 days</span>
            </p>
            {/* One button for the whole week's shopping. It does not write —
                it fills the basket below, which is still the user's to edit. */}
            {planNeeds.some((n) => !n.onList) && (
              <p className="cook-line">
                <Button kind="plain" onClick={() => setDraft({ to: "list", rows:
                  planNeeds.filter((n) => !n.onList)
                    .map((n) => ({ id: n.id, name: n.name, why: n.forMeals.join(", ") })) })}>
                  Shop for this week ({planNeeds.filter((n) => !n.onList).length})
                </Button>
              </p>
            )}
            <ul className="hits">
              {planNeeds.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.onList ? "hit held" : "hit"}
                          disabled={n.onList}
                          onClick={() => setDraft({ to: "list", rows: [
                            { id: n.id, name: n.name, why: n.forMeals.join(", ") }] })}>
                    <span className="hit-name">{n.name}</span>
                    {/* Which meals want it — an ingredient three dinners need
                        is the one you must not come home without. */}
                    <span className="hit-via">{n.forMeals.join(", ")}</span>
                    <span className="hit-held">{n.onList ? "on grocery list" : "add"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

      </Section>
      </div>
    </>
  );
}
