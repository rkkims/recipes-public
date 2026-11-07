/**
 * The demand board — UX-SPEC §11, DECISIONS §8's public request queue.
 *
 * Two framings of the same data, and only one ships: never "our database is
 * incomplete, please wait", always "these are the recipes people want to
 * cook next". The unlocked block is what makes the difference — a queue with
 * visible completions reads as something being built; without them it is a
 * complaints board.
 *
 * This page is also where §6 rule 3 and §6a finally land: a withdrawn
 * creator's rows say "unavailable at the creator's request", a removed
 * creator's say "no longer listed here", and both stop collecting. The two
 * sentences are the entire reason `removed` is a separate status.
 *
 * What is deliberately absent: comments (a request is a count, not a
 * thread, §7) and notify-me — decided against, 2026-08. The return trip is
 * the product, not a message: the unlocked block below says it to everyone,
 * and My Recipes replaces a bare pasted copy with the corpus version the
 * moment curation unlocks it (`corpusTwin`).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/owner";
import { load } from "@/lib/data";
import { servable } from "@/lib/recipes";
import { creatorByDomain, type Creator } from "@/lib/creators";
import { allRequests, normalizeUrl, COUNT_MIN, PUBLIC_MIN, type RecipeRequest } from "@/lib/requests";
import { allCreatorRecipes } from "@/lib/creator-recipes";
import { RequestForm } from "@/components/RequestForm";
import { requestRecipe } from "./actions";
import { listed } from "@/lib/surface";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Recipes people want to cook · JipBap",
    description:
      "The recipes cooks are waiting to make with what's in their kitchens. " +
      "Ask for one with a link, and creators can claim their own.",
    // Unlisted pages stay out of the index too — flipping `lib/surface`
    // relists and reindexes in the same diff.
    ...(listed("/recipe-requests") ? {} : { robots: { index: false } }),
  };
}

/** The corpus by normalized URL — static per process, like the corpus. */
let urlIndex: Map<string, { id: string; servable: boolean }> | null = null;
function corpusByUrl() {
  if (urlIndex) return urlIndex;
  urlIndex = new Map();
  for (const r of load().allRecipes) {
    const u = normalizeUrl(r.url);
    if (u) urlIndex.set(u, { id: r.id, servable: servable([r]).length > 0 });
  }
  return urlIndex;
}

function RequestRow({ r, creator }: { r: RecipeRequest; creator: Creator | null }) {
  const name = r.title ?? new URL(r.url).pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ?? r.host;
  return (
    <li className="req-row">
      <span className="req-title">{name}</span>
      <span className="req-meta">
        {r.owners.length >= COUNT_MIN && <>{r.owners.length} cooks waiting · </>}
        {creator?.status === "withdrawn" ? (
          // §6 rule 3: the queue tells the truth, in the creator's favour.
          <>unavailable at the creator&apos;s request</>
        ) : creator?.status === "removed" ? (
          // §6a: the honest sentence about someone we ejected.
          <>no longer listed here</>
        ) : creator ? (
          <>
            from <Link href={`/creators/${creator.handle}`}>{creator.displayName}</Link>
            {creator.status !== "claimed" && (
              <>
                {" · "}
                <Link href={`/creators/${creator.handle}/claim`}>
                  Are you the creator? Claim this page →
                </Link>
              </>
            )}
          </>
        ) : (
          <>from {r.host}</>
        )}
      </span>
    </li>
  );
}

export default async function RequestBoard() {
  const user = await currentUser();
  const index = corpusByUrl();

  const rows = allRequests();
  const withCreator = rows.map((r) => ({ r, creator: creatorByDomain(r.host) }));

  // Unlocked: a requested URL that is now a servable corpus recipe. The block
  // §11 calls not-optional — visible completions are the difference between
  // "being built" and "a list of things we failed to do".
  const unlocked = withCreator
    .filter(({ r }) => index.get(r.url)?.servable)
    .sort((a, b) => b.r.owners.length - a.r.owners.length)
    .slice(0, 6);
  const unlockedUrls = new Set(unlocked.map((u) => u.r.url));

  // Public: enough independent askers, on a host we recognise. Everything
  // else stays in the private tally — the spam line, DECISIONS §11.
  const pub = withCreator.filter(({ r, creator }) =>
    !unlockedUrls.has(r.url) && r.owners.length >= PUBLIC_MIN && creator !== null);

  const trending = [...pub].sort((a, b) => b.r.owners.length - a.r.owners.length).slice(0, 12);
  const trendingUrls = new Set(trending.map((t) => t.r.url));
  const recent = [...pub]
    .filter((p) => !trendingUrls.has(p.r.url))
    .sort((a, b) => b.r.last_at.localeCompare(a.r.last_at))
    .slice(0, 8);

  // Creator-added rows are unlocks too — pantry-ready the day they arrived,
  // annotated by the person who wrote them.
  const arrived = allCreatorRecipes()
    .sort((a, b) => b.added_at.localeCompare(a.added_at))
    .slice(0, 3);

  return (
    <Page>
      <Nav user={!!user} />
      <h1 className="page-title">Recipes people want to cook</h1>

      <Section title="Ask for one">
        <RequestForm onRequest={requestRecipe} />
      </Section>

      <Section title="Trending requests" count={trending.length}>
        {trending.length > 0 ? (
          <ul className="req-list">
            {trending.map(({ r, creator }) => (
              <RequestRow key={r.url} r={r} creator={creator} />
            ))}
          </ul>
        ) : (
          <Note>
            Nothing public yet. A request appears here once more than one cook
            asks for the same recipe. Ask for yours above.
          </Note>
        )}
      </Section>

      <Section title="Recently unlocked">
        {unlocked.length > 0 || arrived.length > 0 ? (
          <ul className="req-list">
            {unlocked.map(({ r }) => {
              const hit = index.get(r.url)!;
              return (
                <li className="req-row" key={r.url}>
                  <span className="req-title">
                    <Link href={`/recipe/${hit.id}`}>{r.title ?? r.host}</Link>
                  </span>
                  <span className="req-meta">
                    now pantry-enabled
                    {r.owners.length >= COUNT_MIN && <> · unlocked after {r.owners.length} requests</>}
                  </span>
                </li>
              );
            })}
            {arrived.map((r) => (
              <li className="req-row" key={r.id}>
                <span className="req-title">
                  <Link href={`/recipe/${r.id}`}>{r.title}</Link>
                </span>
                <span className="req-meta">
                  added by the creator · pantry-ready on arrival
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Note>
            When a requested recipe becomes pantry-ready it moves out of the
            queue and lands here.
          </Note>
        )}
      </Section>

      {recent.length > 0 && (
        <Section title="Recent requests">
          <ul className="req-list">
            {recent.map(({ r, creator }) => (
              <RequestRow key={r.url} r={r} creator={creator} />
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}
