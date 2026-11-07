# Diet filter sweep — all twelve, against the corpus

Run 2026-08-11, driving the real `applyDiet` / `dietVerdict` (compiled from
`src/lib/diet.ts`, not a reimplementation) over `recipe-index.json`.

Corpus 4,874. **Servable 3,490** (71.6%) — `servable` is `unresolved.length === 0`,
so the numbers users actually experience are the servable column.

| filter | shown | hidden | of servable | of full corpus |
|---|---:|---:|---:|---:|
| vegetarian | 1,582 | 1,908 | 54.7% | 55.4% |
| vegan | 947 | 2,543 | 72.9% | 73.3% |
| pescatarian | 2,171 | 1,319 | 37.8% | 38.2% |
| no peanut | 3,390 | 100 | 2.9% | 30.4% |
| no treenut | 3,359 | 131 | 3.8% | 31.1% |
| no milk | 2,810 | 680 | 19.5% | 42.3% |
| no egg | 2,562 | 928 | 26.6% | 47.4% |
| no soy | 1,494 | 1,996 | 57.2% | 69.3% |
| no wheat | 1,147 | 2,343 | 67.1% | 76.5% |
| no fish | 2,916 | 574 | 16.4% | 40.2% |
| no shellfish | 2,868 | 622 | 17.8% | 41.2% |
| no sesame | 1,947 | 1,543 | 44.2% | 60.1% |

Every filter fires. None is dead, and none is silently matching everything.

The gap between the two right-hand columns is the §6 strict-unresolved gate: on
the full corpus an allergen setting also hides the 1,384 recipes carrying an
unparsed line. On the servable set that gate cannot fire by construction, which
is why e.g. peanut is 30.4% of the corpus but 2.9% of what anyone sees.

## Combinations

| setting | survives |
|---|---:|
| vegetarian + no peanut | 1,536 (44.0%) |
| vegan | 947 (27.1%) |
| no shellfish + no fish | 2,436 (69.8%) |
| vegan + no soy + no wheat | 375 (10.7%) |
| all nine allergens at once | 329 (9.4%) |

Soy, wheat and sesame dominate because this is an Asian corpus: soy sauce is in
1,617 recipes and carries both soy and wheat. That is honest, not a bug, but it
means a coeliac or soy-allergic user sees roughly a third of the app.

## Coverage

Every ingredient id the corpus references (2,715) is known to the ontology, so
"an ingredient we could not identify" never fires on a servable recipe. The
filter's honesty therefore rests entirely on tag completeness, not on matching.

Of those 2,715: 654 carry `animal_source`, 685 carry `allergens`.

Spot-checked the 45 highest-traffic ingredients: correct throughout. soy sauce →
`soy,wheat`; oyster sauce → source `fish`, `soy,shellfish`; fish sauce → `fish`;
sesame oil → `sesame`; mayonnaise → source `egg`, `egg`; chicken stock → `meat`,
no allergens.

## Gaps worth fixing

Ordered by exposure. These are FALSE NEGATIVES — the filter passes the recipe as
clean — which is the direction §6 says is the wrong one to be wrong in.

| ingredient | uses | carries | should carry |
|---|---:|---|---|
| kimchi | 257 | nothing | `fish`, `shellfish`; source `fish` |
| kimchi juice | 54 | nothing | same |
| imitation crab meat | 12 | `shellfish` | + source `fish` |
| dumpling | 15 | nothing | `wheat` |
| kimchi brine | 8 | nothing | same as kimchi |
| buckwheat noodles | 8 | nothing | `wheat` (soba is usually cut with wheat) |

Kimchi is the one that matters: traditional and most commercial kimchi contains
jeotgal (salted shrimp or anchovy), so a shellfish-allergic user is currently
shown kimchi jjigae as though it were clean.

The counter-argument is that vegan kimchi exists, so tagging it hides recipes
some users could eat. §6 settles that: the allergen axis errs toward hiding, and
the classes axis does not. Tagging kimchi costs a vegetarian some recall and
stops an allergen filter from making a claim it cannot support.

Not fixed here — tagging changes what users are shown and is a product call.

## Reproducing

`src/lib/diet.ts` compiled with `tsc --ignoreConfig`, driven over
`data/ontology/ontology.json` + `recipe-index.json`. Scripts were scratch; the
sweep is cheap to rerun and should be rerun after any ontology regeneration,
because a re-parse rewrites `requires` and can change every number above.
