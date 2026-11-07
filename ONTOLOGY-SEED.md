# Ontology Seed — v0

Draft for correction. **You are the validator.**

**Quality standard (§2):** frugal in ingredient use, never in taste. The dish should be the actual dish — not a cheap version of it.

**Substitution model (§4):** a curated **positive list** only. No fidelity scores. If it's on the list, we'll suggest it. If it isn't, the recipe is gated and becomes a shopping prompt.

```
ingredient.substitutes:     [id]              # short, curated, endorsed
ingredient.not_substitutes: [{id, reason}]    # common wrong assumptions
```

> **Tiers are gone (DECISIONS §3).** The "Tier 1 / Tier 2" headings below are retained as *seeding convenience* — they are groupings for hand-entry, not a runtime concept. Translate them on the way into YAML:
>
> | Old tier | Becomes |
> |---|---|
> | Tier 1 — universal staples | `sourcing: supermarket` + membership in the **starter list** (pre-checked at first run) |
> | Tier 2 — cuisine staples | `sourcing: specialty` → high friction, the unlock/affiliate items |
> | Perishables | Nothing. No shelf-life field exists |
>
> **There is exactly one ingredient attribute: `sourcing`.** `ubiquity` and `shelf_life_days` were both proposed and cut — see DECISIONS §3 for why (no data source; no purchase date).
>
> Nothing is "assumed present" any more. Starter-list items are *pre-checked* at first run and can be unchecked — after that, a pantry row always means presence. The note below about Tier 1 being "validated by absence" still holds as evidence for what belongs on the starter list; it no longer implies implicit state.

---

## Tier 1 — Universal staples

Assumed present. Editable in settings, never prompted. (§3)

| ID | Name |
|---|---|
| `salt` | Salt |
| `pepper.black` | Black pepper |
| `oil.neutral` | Neutral cooking oil (vegetable/canola) |
| `sugar.white` | White sugar |
| `garlic` | Garlic |
| `onion.yellow` | Onion |
| `egg` | Eggs |
| `flour.ap` | All-purpose flour |
| `butter` | Butter |
| `rice.short_grain` | Rice |
| `soy_sauce.generic` | Soy sauce (whatever bottle they own) |
| `vinegar.generic` | Vinegar |

**Watch:** `butter` and `flour.ap` are most likely to be switched off (dairy-free, low-carb). If >30% turn either off, demote to Tier 2.

---

## Tier 2 — Korean cuisine staples

Asked once at onboarding. These gate recipes. (§3)

| ID | Korean | Romanized | Note |
|---|---|---|---|
| `gochujang` | 고추장 | gochujang | Fermented chili paste |
| `gochugaru` | 고춧가루 | gochugaru | Coarse chili flake — sweet, mild |
| `doenjang` | 된장 | doenjang | Fermented soybean paste |
| `ganjang.guk` | 국간장 | guk-ganjang | Soup soy — saltier, lighter colour |
| `oil.sesame` | 참기름 | chamgireum | Toasted |
| `sesame_seed.toasted` | 깨소금 | kkaesogeum | |
| `vinegar.apple` | 식초 | sikcho | |
| `mirin` | 맛술 | matsul | Cooking wine |
| `oligodang` | 올리고당 | oligodang | Syrup — standard Korean glaze sweetener |
| `anchovy.dried` | 멸치 | myeolchi | Stock base |
| `kelp.dried` | 다시마 | dasima | Stock base |
| `gim` | 김 | gim | Roasted seaweed |
| `aekjeot` | 액젓 | aekjeot | Korean fish sauce (anchovy) |
| `oil.perilla` | 들기름 | deulgireum | **Distinct from sesame oil** |
| `ssamjang` | 쌈장 | ssamjang | |

**Considered and cut** — add if they turn out to gate recipes: `dashida` (다시다), `saeujeot` (새우젓).

---

## Approved substitutions

Short by design. Everything here is something a cook would actually endorse without caveat.

| Ingredient | Can be substituted with | Note |
|---|---|---|
| `oligodang` | `mulyeot` (물엿), `jocheong` (조청), `corn_syrup` | All starch syrups — genuinely interchangeable |
| `ganjang.jin` | `soy_sauce.generic` | Jin-ganjang *is* general-purpose soy sauce |
| `soy_sauce.generic` | `tamari` | Same product, wheat-free |
| `mirin` | `sake` + sugar | Standard swap |
| `shaoxing` | `sherry.dry`, soju | Universally endorsed in Chinese cooking |
| `radish.korean` (무) | `daikon` | |
| `starch.potato` | `starch.corn` | Marginally less chewy |
| `beef.bulgogi_cut` | thin-sliced `ribeye` or `sirloin` | A cut, not a product |
| `pork.belly.samgyeopsal` | `pork.belly` | Same thing |
| `tofu.firm` | `tofu.extra_firm` | |
| `aekjeot` | fish sauce | |

**`ssamjang` is not a substitution but a mix** — doenjang + gochujang + sesame oil + garlic. Handle as a "you can make this" note rather than a substitutes entry.

---

## Not substitutions

The negative knowledge — this is the editorial value. Surface the reason, not a score.

| Ingredient | Commonly mistaken for | Why it doesn't work |
|---|---|---|
| `ganjang.guk` | `soy_sauce.generic` | Different salt level and colour. Soups come out simultaneously muddy and under-seasoned. |
| `gochugaru` | crushed red pepper flakes | Far hotter, no sweetness, wrong texture entirely. |
| `gochujang` | `sriracha` | No fermented depth — thinner and more acidic. |
| `doenjang` | `miso` (any type) | Milder and sweeter; lacks the funk that defines the dish. |
| `doenjang` | `doubanjiang` | Chili-based. Different category, not a milder version. |
| `oil.sesame` | `oil.perilla` | Two distinct flavours, both used deliberately. Not a shortage substitute. |
| `oil.sesame` | untoasted sesame oil | Different product — none of the roasted aroma. |
| `soy_sauce.dark` (老抽) | `soy_sauce.generic` | The colour and sweetness are the entire point. |
| `cabbage.napa` | `cabbage.green` | Tougher and less sweet — wrong texture in kimchi and soups. |
| `perilla_leaf` (깻잎) | `shiso` | Related, distinctly different flavour. |
| `perilla_leaf` | `basil` | Unrelated. |
| `chive.asian` (부추) | common chives | Much milder, missing the garlic note. |
| `vinegar.rice` | distilled white vinegar | Harsher, different profile. |
| `tofu.silken` | `tofu.firm` | Makes a different dish. |
| `dangmyeon` (당면) | mung bean noodles | Different chew — noticeable in japchae. |
| `tteok` (떡) | gnocchi | Texture is wrong in a way that doesn't read as the same dish. |

---

## State variants — the moat data (§3)

Not substitutions. The *same* ingredient at a different stage, with different best uses.

| Ingredient | State | Window | Best for |
|---|---|---|---|
| `kimchi` | fresh | 0–7 d | Eating as banchan |
| `kimchi` | ripe | 7–21 d | Either |
| `kimchi` | sour | 21 d+ | **Jjigae, bokkeumbap, jeon — required, not tolerated** |
| `rice.cooked` | fresh | 0–1 d | Serving |
| `rice.cooked` | day-old | 1–3 d | **Fried rice — better than fresh** |
| `banana` | ripe | — | Eating |
| `banana` | overripe | — | **Bread, smoothie — better than fresh** |
| `bread` | fresh | 0–2 d | Serving |
| `bread` | stale | 2–5 d | **Croutons, panzanella, bread pudding** |
| `greens.leafy` | crisp | — | Salad, raw |
| `greens.leafy` | wilting | — | **Soup, braise, jeon — texture no longer matters** |
| `milk` | fresh | — | Drinking |
| `milk` | souring | — | **Pancakes, biscuits, soda bread** |
| `tomato` | firm | — | Slicing, salad |
| `tomato` | overripe | — | **Sauce, soup** |
| `avocado` | firm | — | Slicing |
| `avocado` | soft | — | **Mash, guacamole, smoothie** |

---

# v1 expansion — validated against a real inventory

Source: `~/kitchen-inventory.tsv`, 154 items, one Korean household.

## What the real inventory taught us

**1. Tier 1 is validated *by absence*.** Salt, pepper, oil, sugar, flour, soy sauce, vinegar, uncooked rice — none appear in the inventory. Not because they're missing, but because **you don't inventory what you assume**. That's the strongest possible confirmation of the assume-never-prompt design.

**2. The inventory has no dry-pantry section.** Locations are Fridge / Freezer / Meat / Dried goods / Room temperature. Every Tier 2 item that appears "missing" (guk-ganjang, mirin, oligodang, perilla oil, vinegar, aekjeot) is shelf-stable and would live on a cupboard shelf that simply isn't recorded. **Tier 2 gaps here are inconclusive — do not demote anything on this evidence.**

**3. Real pantries are cross-cuisine, and ours assumed one cuisine per user.** This household holds Korean, Japanese, Chinese, Filipino, Italian and American ingredients simultaneously — tsuyu, katsuobushi, atchara, lap cheong, calabrian chili crunch, parmesan, pierogies.

**Consequence for onboarding:** don't tie the Tier 2 staple set to a single chosen cuisine. Ask *"which cuisines do you cook?"* (multi-select), then show those staple sets. The three-tier model survives; the assumption that Tier 2 is singular does not.

**4. ~~Storage location is an ontology field~~ — moot.** This observation argued that `shelf_life_days` had to be keyed on location (frozen doesn't decay; fridge and shelf decay differently). `shelf_life_days` is now dropped entirely (DECISIONS §3), so the complexity it implied evaporates rather than needing to be modelled. **It is in fact an argument *for* the cut:** if shelf life required a location × open-state matrix per ingredient to be even approximately right, it was never going to be maintainable by hand — and there is no purchase date to anchor it to regardless. Declared state ("this is going off") replaces the whole apparatus.

**5. Homemade and gifted items exist and have no purchase path.** *"Dad's doenjang"*, home-frozen gomtang and shrimp broth. These need to be first-class: real ingredients, no affiliate link, no barcode, possibly no expiry the system can compute. Don't let the data model assume every ingredient is purchasable.

**6. Manual meal planning is already happening.** The `Included in meal plan` column assigns items to L1–L7 / D1–D7 slots by hand. That's the weekly-plan feature being done with a spreadsheet — strong evidence the need is real, and a template for the slot model.

**7. Quantity tracking is happening too** (`% Left`), which we decided the recommender ignores (§3). No conflict — user-optional logging, ignored for matching. Worth confirming the tension is deliberate.

## Ingredient list v1

Tier 1 (12) and Tier 2 (15) as above, plus:

### Perishables — produce
`scallion` · `perilla_leaf` · `parsley.italian` · `kale` · `spinach` · `broccoli` · `radish.korean` · `pepper.shishito` · `melon` · `ginger` · `garlic` · `cabbage.napa` · `zucchini` · `pepper.serrano` · `lemongrass` · `corn` · `green_bean` · `cauliflower`

### Perishables — dairy & egg
`egg` · `egg_white` · `milk` · `milk.soy` · `yogurt.greek` · `butter.salted` · `margarine` · `cheese.cream` · `cheese.parmesan` · `cheese.slice` · `cheese.stick`

### Perishables — protein
`pork.belly` · `pork.sirloin` · `pork.capicola` · `beef.sirloin` · `beef.short_rib` · `beef.ground` · `sausage.raw` · `sausage.cooked` · `sausage.red` · `lap_cheong` · `ham.gimbap` · `patty.hamburger`

### Perishables — seafood
`tuna.frozen` · `salmon.smoked` · `crab.imitation` · `shrimp` · `shrimp.head` · `shrimp.shell` · `mentaiko` · `sashimi`

### Dried seafood & stock bases
`anchovy.dried` · `squid.dried` · `pollock.dried` · `katsuobushi` · `gim` · `kelp.dried` · `tuyo` · `seaweed.prepared`

### Korean prepared & frozen
`kimchi` · `tteok.tteokguk` · `tteok.cheese` · `fishcake.flat` · `fishcake.ball` · `fishcake.gimbap` · `sundae` · `gimmari` · `namul.myeongi` · `mu_sigeumchi` · `anchovy.stirfried`

### Noodles & starches
`somen` · `soba` · `pasta` · `dangmyeon` · `rice.cooked` · `rice.basmati.cooked` · `breadcrumb` · `starch.potato`

### Stocks
`stock.anchovy_kelp` · `stock.gomtang` · `stock.shrimp` · `bouillon` · `gravy`

### Cuisine staples — Japanese *(phase 2, recorded now)*
`tsuyu` · `sauce.tonkatsu` · `benishoga` · `umeboshi` · `miso.white` · `miso.sansho` · `dressing.shiso` · `dressing.sesame`

### Cuisine staples — Chinese *(phase 3, recorded now)*
`chunjang` · `jjajang` · `soy_sauce.light` · `soy_sauce.dark` · `shaoxing`

### Cuisine staples — Filipino *(later)*
`atchara` · `patis`

**Count: ~95 canonical ingredients**, covering one real household with room to spare.

## Open, from this pass

1. **`garlic` is in Tier 1 but absent from the inventory** while `ginger` is present at room temperature. Either an omission or genuinely out — worth checking, since Tier 1 membership means we'd never ask.
2. **`saeujeot` was "considered and cut" from Tier 2 but is stocked.** Promote it.
3. **`miso` is stocked in two forms** despite being on the *not-substitutions* list for doenjang. Both true and not contradictory — it's a Japanese staple in its own right, not a doenjang stand-in. Make sure the data model expresses that.
4. **Multi-select cuisine at onboarding** — decide the interaction before building the staple screen.

