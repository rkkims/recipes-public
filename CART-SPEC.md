# The cart — the state between the shelf and the shelf

**Status:** BUILT, 2026-08-18. Richard's call: *"they check out item one
by one, and then they will finally move items bought to pantry. we should provide
feature for this transient moment."* Replaces UX-SPEC §4g and reshapes §4e.

---

## 0. The moment this exists for

A tick in the aisle used to mean *"this is in my kitchen"*. It is not. It is in
a cart, twenty minutes and a car journey from the kitchen, and the product has
been asking the kitchen question in the shop — which is why §4g had to grow a
dialog and a standing preference to paper over a guess.

Between grabbing a thing and shelving it there is a real state with a start and an
end, and it lasts long enough to survive a phone locking, a queue, a drive and a
front door. Everything below follows from taking that seriously.

---

## 1. The entity

`UserIngredient` gains one flag:

```ts
/** Bought, not yet put away — TROLLEY-SPEC. Persisted: a shop is not a visit. */
in_cart: boolean;
```

Three independent booleans, which is the shape INGREDIENT-SPEC §2 already
argues for. Every combination is legal and each says something true:

| `on_list` | `in_cart` | `in_pantry` | Means |
|---|---|---|---|
| ✓ | | | to buy |
| | ✓ | | in the cart, not home yet |
| | | ✓ | in the kitchen |
| ✓ | | ✓ | have some, want more |
| ✓ | ✓ | | bought one, still want another |
| | | | known to us, held by nobody |

**Persisted, not a visit.** `Pantry.offList` — the in-memory set that survives
only until the component remounts — is exactly the mechanism that fails here: the
phone sleeps in a pocket between the till and the car. A cart that empties
itself when the page reloads is worse than no cart.

**A flag, not a document.** No `carts` collection, no session id. A cart is a
property of an ingredient row, the store is one file per owner, and a second
document would need its own lifecycle, its own deletion path in `deleteAccount`
and its own line in the export.

---

## 2. The transitions

Settled with Richard, 2026-08-18. On the grocery page a chip is the row's whole
control: **the tick is gone until you ask for it**, and tapping a name asks where
the thing is going. The drawer's copy of the list is untouched by all of this —
see §7.

| Gesture | What happens |
|---|---|
| **Tap a chip on the list** | Asks: **Move to cart** / **Delete it**. Nothing is written until one is pressed; closing writes nothing |
| **Move to cart** | `on_list: false, in_cart: true`. Nothing enters the pantry |
| **Delete it** | `on_list: false`, and `in_pantry` left exactly as it was — deciding against more soy sauce says nothing about the bottle in the cupboard |
| **Tap a chip in the cart** | Asks: **Move back to grocery list** / **Delete it** |
| **Move to pantry** (under the cart) | The whole cart, through the §4b basket: remove what you didn't keep, the rest lands in the pantry, the cart empties |
| **Empty cart** | Every row leaves the cart having entered nothing. Asked first — it is the one control here that discards a whole shop in a tap |
| **Select** | A checkbox appears left of EVERY row, on both shelves. Then **Move to pantry (n)** or **Delete (n)**, on the spot, no confirmation |
| **Undo** (heading, or the toast) | Reverses the last checkout exactly |

**Two questions, and each is asked where it can be answered.** At the shelf: did
this go in the cart, or have you decided against it? At the door: which of these
came into the kitchen? Neither is asked in the other's place, which is the whole
correction to §4g.

**Confirm the sweep, never the selection.** The two bottom buttons act on rows
the user may not have looked at since the shop, so they ask. A selection was
built by tapping each row; restating it in a dialog is the product asking twice.

**Nothing leaves the cart on a timer.** No sweep, no expiry. Every transition
above is a gesture.

## 3. The cart is a shelf

It was drawn — an SVG basket built to grow with its contents, on the argument
that seeing a thing land makes the transition legible. Two rewrites in it still
read as assembled rather than drawn, and the honest limit is that a line drawing
stretched around live content is hard to make good and was buying very little.

So: a heading in the page's own vocabulary, wearing the same small uppercase
label PRODUCE and MEAT wear, with the cart mark beside it drawn in the tab bar's
hand — 24px box, 1.8 stroke, round joins, `currentColor` — so the two read as
one product rather than two icon sets. Its rows are one per line like the
aisles', because the two shelves are read the same way and a wrapping cloud made
the cart look like a different kind of thing.

```
   Grocery list                                     [Select]

   PRODUCE
   ( scallion )
   ( napa cabbage )
   ─────────────────────────────────────────────────────────
   🛒 CART  2
   ( gochujang )
   ( rice vinegar )

   [ Move to pantry (2) ]
   [ Empty cart ]
```

Selecting:

```
   Grocery list                                       [Done]

   PRODUCE
   ☐ ( scallion )
   ☑ ( napa cabbage )
   ─────────────────────────────────────────────────────────
   🛒 CART  2
   ☑ ( gochujang )
   ☐ ( rice vinegar )

   [ Move to pantry (2) ]
   [ Delete (2) ]
```

The chips are larger here than anywhere else in the product — 16px on a 44px
pill. Elsewhere a chip is one of forty in a cloud you scan; here it is a row you
tap while walking, and it is the row's only control.

**Select is a mode that belongs to the page.** While it is on, a chip's action
steps aside on both shelves. That was the first version's bug: selection worked
in the cart and silently did nothing on the list, because the list's chip was
still doing its own job.

## 4. What this removes

**UX-SPEC §4g goes** — the "did that go in the kitchen?" dialog and the
`tick_to_pantry` preference behind it. Both exist because the tick had to guess,
and it no longer guesses. The stored field stays in the file (no migration, no
rewrite of anyone's data — INGREDIENT-SPEC §1's rule) and is read by nothing;
`onRememberTick` and its action go.

**§4g's "did you buy enough?" stays.** It fires when more than one planned meal
wants the same thing, and it is a genuine shop-floor question: you are standing
in front of the shelf and can still pick up another. Unchanged.

---

## 5. A cart item is not in the pantry

It does not count toward matching, it does not appear on the pantry shelf, and a
recipe does not become cookable because something for it is in a cart in a car
park. This is the honest reading, and it is also what makes the tick safe: the
tick can no longer put a wrong thing into the pantry, because it cannot put
anything there at all.

The corollary is worth saying out loud: **between the till and the front door the
app will tell you that you do not have the thing you are holding.** That is
correct, it lasts minutes, and the cart group on screen is the explanation.

---

## 6. Offline — §12 holds

The queued write (`{ kind: "tick" }`) changes meaning, not shape: it now sets
`in_cart` rather than `in_pantry`. Replay, dedupe and the "catching up" bar are
untouched. A shop is exactly where the signal fails, which is why the cart must
be a queued write like any other and never a client-only state.

---

## 7. Everywhere else

The cart group appears **wherever the grocery-list shelf appears** — the `/list`
page and the drawer's list panel on other pages. It is the list's own tail, not a
feature of one page, and a shelf that shows five of your eight bought items
depending on which page you are on is the kind of split that made the two panels
speckled with each other's colour (see `Pantry`).

The **pantry** offers nothing about the cart. That was tried and reversed the
same day: the transition belongs to the grocery page, start to finish.

---

## 8. Settled

1. **The word.** The container is a **cart**, and it is drawn rather than
   labelled — the picture is the heading. The button under it says **Move to
   pantry**, which names the destination and matches the dialog it opens. The
   trip is counted as "bought": `3 of 7 bought`.

2. **A stale cart.** Nothing happens. No sweep, no nag, no age on the heading
   for now — the group is on screen with a button on it, which is as much
   reminding as an unfinished errand has earned.

3. **Getting home without opening `/list`.** REVERSED, 2026-08-18: *"Cart being
   inside pantry is awkward. The transition should happen within grocery list."*
   The pantry shelf carried a line offering put-away and it is gone. The whole
   arc — buy, hold, put away — belongs to the grocery page, and a second door to
   it from the kitchen made the cart feel like something the pantry owned.

4. **"They didn't have it."** No control. The row stays on the list, which is
   already the honest record of a thing you meant to buy and did not.

5. **Does the meal plan know?** Yes, and the matcher does not. `planStatuses`
   and `planNeeds` are passed on-list ∪ in-cart, so the week stops asking you to
   buy what is in your bag; `pantryOf` is untouched, so nothing becomes cookable
   because it is in a car park. Two readers, two questions, both right.

## 9. What is NOT in this

- No shopping "mode" or second page. The list page stays one page, in one state,
  with a group at the bottom — see the third shape considered and rejected.
- No store, no aisle order learned from your walk, no receipt scanning.
- No sharing a cart between two phones. The pool work (`lib/pool`) is where
  that question lives if it is ever asked.
