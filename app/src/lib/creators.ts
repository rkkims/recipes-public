/**
 * The creator tables, as the app reads them — CREATOR-SPEC §1, read side.
 *
 * Same posture as `data.ts`: files read once into a process cache. The tables
 * are minted offline (`npm run creators`, `npm run creator-index`) and change
 * only between deploys, exactly like the ontology.
 *
 * What is deliberately NOT here: counts. CREATOR-SPEC §7 computes analytics
 * from `user_recipe` and `cook_event` at read time and forbids displaying any
 * of it before volume — so this module exposes who exists and what they made,
 * and nothing that looks like a dashboard.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load, type Recipe } from "./data";
import { expandComponents } from "./match";
import { claimOf } from "./claims";
import { removalOf } from "./removals";
import { applyConfirmations } from "./claims";
import { allCreatorRecipes, asRecipe, creatorRecipeById, creatorRecipesOf } from "./creator-recipes";
import { allSelfCreators, selfByHandle, selfById, type SelfCreator } from "./self-creators";

const DIR = resolve(process.cwd(), "..", "data", "creators");

export type Creator = {
  id: string;
  handle: string;
  displayName: string;
  /** CREATOR-SPEC SS1's five states. `self_registered` is in the union so the
      type matches the spec, but nothing emits it until SS5a's open door is
      built - its writer and its first reader land together, like `removed`'s
      did with SS6a. */
  status: "indexed" | "self_registered" | "claimed" | "withdrawn" | "removed";
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

let cache: {
  byHandle: Map<string, Creator>;
  byId: Map<string, Creator>;
  creatorOf: Map<string, string>;   // rec_… → crt_…
  domainOf: Map<string, string>;    // crt_… → the domain channel's handle
  iconOf: Map<string, { url: string; lowRes: boolean }>;
  channelsOf: Map<string, Array<{ kind: string; handle: string }>>;
  aliasOf: Map<string, string[]>;   // crt_… → other names the corpus knows
} | null = null;

function tables() {
  if (cache) return cache;
  const byHandle = new Map<string, Creator>();
  const byId = new Map<string, Creator>();
  const cFile = resolve(DIR, "creators.csv");
  if (existsSync(cFile)) {
    for (const r of parseCsv(readFileSync(cFile, "utf8")).slice(1)) {
      const c: Creator = {
        id: r[0] ?? "", handle: r[1] ?? "", displayName: r[2] ?? "",
        status: (r[3] as Creator["status"]) || "indexed",
      };
      if (!c.id || !c.handle) continue;
      byHandle.set(c.handle, c);
      byId.set(c.id, c);
    }
  }
  const domainOf = new Map<string, string>();
  const channelsOf = new Map<string, Array<{ kind: string; handle: string }>>();
  const chFile = resolve(DIR, "creator_channel.csv");
  if (existsSync(chFile)) {
    for (const r of parseCsv(readFileSync(chFile, "utf8")).slice(1)) {
      if (!r[0] || !r[1] || !r[2]) continue;
      if (r[1] === "domain" && !domainOf.has(r[0])) domainOf.set(r[0], r[2]);
      const list = channelsOf.get(r[0]) ?? [];
      list.push({ kind: r[1], handle: r[2] });
      channelsOf.set(r[0], list);
    }
  }
  const iconOf = new Map<string, { url: string; lowRes: boolean }>();
  const icFile = resolve(DIR, "icons.csv");
  if (existsSync(icFile)) {
    for (const r of parseCsv(readFileSync(icFile, "utf8")).slice(1)) {
      if (r[0] && r[1]) iconOf.set(r[0], { url: r[1], lowRes: r[2] === "favicon-fallback" });
    }
  }
  const creatorOf = new Map<string, string>();
  const rcFile = resolve(DIR, "recipe-creators.json");
  if (existsSync(rcFile)) {
    for (const [rec, crt] of Object.entries(
      JSON.parse(readFileSync(rcFile, "utf8")) as Record<string, string>,
    )) creatorOf.set(rec, crt);
  }
  const aliasOf = new Map<string, string[]>();
  const alFile = resolve(DIR, "creator_alias.csv");
  if (existsSync(alFile)) {
    for (const r of parseCsv(readFileSync(alFile, "utf8")).slice(1)) {
      const [raw, crt] = [r[0] ?? "", r[1] ?? ""];
      /* The alias file holds both person names and schema.org URLs; only the
         names are anything a person would type into a search box. */
      if (!raw || !crt || raw.includes("://") || raw.includes("/")) continue;
      aliasOf.set(crt, [...(aliasOf.get(crt) ?? []), raw]);
    }
  }
  cache = { byHandle, byId, creatorOf, domainOf, iconOf, channelsOf, aliasOf };
  return cache;
}

/**
 * Withdrawal honoured at the read layer, so no page has to remember to check —
 * CREATOR-SPEC §6: their recipes drop out of display and their name stops
 * being shown, and the cheapest place to enforce "everywhere" is the one
 * function everything reads through.
 */
/**
 * The claim layered over the crawl row — status and display name come from
 * claims.json when one exists, read FRESH per call because claims move at
 * runtime while the tables move at deploys.
 */
/** A SS5a row in the app's Creator shape - base status says what the row IS
    (an assertion, not an observation) and the claim overlay says where it
    stands, exactly as for a crawled row. */
function asCreator(r: SelfCreator): Creator {
  return { id: r.id, handle: r.handle, displayName: r.display_name, status: "self_registered" };
}

function withClaim(c: Creator): Creator {
  const claim = claimOf(c.id);
  /* Removal outranks everything, including a claim in good standing and a
     withdrawal already in place - SS6a: the operator ejected the row, and no
     self-serve toggle argues with that. The display name still honours the
     claimant's choice, because the name is a fact about them either way. */
  const removed = removalOf(c.id);
  if (removed) {
    return {
      ...c,
      status: "removed",
      displayName: claim?.display_name ?? c.displayName,
    };
  }
  if (!claim) return c;
  return {
    ...c,
    status: claim.withdrawn_at ? "withdrawn" : "claimed",
    displayName: claim.display_name ?? c.displayName,
  };
}

/**
 * Returns a WITHDRAWN creator rather than null, deliberately: the public page
 * 404s on the status, but the claim page must keep working for the claimant —
 * §6 makes withdrawal reversible, and a restore button nobody can reach is
 * not reversible.
 */
export function creatorByHandle(handle: string): Creator | null {
  const c = tables().byHandle.get(handle.toLowerCase())
    ?? ((r) => r && asCreator(r))(selfByHandle(handle));
  return c ? withClaim(c) : null;
}

export function creatorOfRecipe(recipeId: string): Creator | null {
  const id = tables().creatorOf.get(recipeId)
    ?? creatorRecipeById(recipeId)?.creator_id;   // rec_c… — theirs by construction
  const c = id
    ? tables().byId.get(id) ?? ((r) => r ? asCreator(r) : undefined)(selfById(id))
    : undefined;
  const merged = c ? withClaim(c) : null;
  // §6: their name stops being displayed. Every surface that names a creator
  // reads through here, so null IS the name coming down.
  return merged && merged.status !== "withdrawn" && merged.status !== "removed"
    ? merged : null;
}

/** By id, with the same withdrawal rule `creatorOfRecipe` applies: a creator
    who left is not resolvable, wherever the id came from — including a stale
    entry in someone's follows (CREATORS-TAB-SPEC §4). */
export function creatorById(id: string): Creator | null {
  const c = tables().byId.get(id) ?? ((r) => r ? asCreator(r) : undefined)(selfById(id));
  const merged = c ? withClaim(c) : null;
  return merged && merged.status !== "withdrawn" && merged.status !== "removed"
    ? merged : null;
}

/**
 * Every listed creator, for the Creators tab's search — crawled and
 * self-registered, claim overlay applied, withdrawn/removed out for the same
 * reason `creatorOfRecipe` returns null for them: a search result IS display.
 */
export function allCreators(): Creator[] {
  const { byId } = tables();
  const out: Creator[] = [...byId.values()].map(withClaim);
  for (const r of allSelfCreators())
    if (!byId.has(r.id)) out.push(withClaim(asCreator(r)));
  return out.filter((c) => c.status !== "withdrawn" && c.status !== "removed");
}

/** Names the corpus knows this creator by besides the display name. */
export function aliasesOf(creatorId: string): string[] {
  return tables().aliasOf.get(creatorId) ?? [];
}

/**
 * The face beside the name, resolved the way the profile page resolves it:
 * the claimant's chosen avatar wins over the probed site icon, and `lowRes`
 * still marks the favicon fallback so small is drawn small.
 */
export function avatarOf(creatorId: string): { url: string; lowRes: boolean } | null {
  const claim = claimOf(creatorId);
  if (claim?.avatar_url && !claim.withdrawn_at)
    return { url: claim.avatar_url, lowRes: false };
  return iconOf(creatorId);
}

/**
 * §6's other half: "their recipes drop out of matching." One set, read fresh,
 * consumed by `servable` — the choke point every shelf and payoff already
 * passes through.
 */
export function unlistedRecipeIds(): Set<string> {
  const out = new Set<string>();
  const { creatorOf, byId } = tables();
  const gone = new Set<string>();
  for (const c of byId.values()) {
    const status = withClaim(c).status;
    // SS6 withdrawn and SS6a removed behave identically here - out of display
    // and matching. They differ only in what the copy is allowed to say.
    if (status === "withdrawn" || status === "removed") gone.add(c.id);
  }
  for (const r of allSelfCreators()) {
    const status = withClaim(asCreator(r)).status;
    if (status === "withdrawn" || status === "removed") gone.add(r.id);
  }
  if (gone.size === 0) return out;
  for (const [rec, crt] of creatorOf) if (gone.has(crt)) out.add(rec);
  for (const r of allCreatorRecipes()) if (gone.has(r.creator_id)) out.add(r.id);
  return out;
}

/** The creator's own website, from the unverified domain channel — a crawl
    fact, which is exactly what a link out is allowed to state. */
export function domainOf(creatorId: string): string | null {
  const self = selfById(creatorId);
  if (self) return self.channel.kind === "domain" ? self.channel.handle : null;
  return tables().domainOf.get(creatorId) ?? null;
}

/**
 * The best icon the creator's site publishes — probed offline by
 * `npm run creator-icons`, because a 16px favicon scaled to avatar size is
 * mush and the 180px apple-touch-icon almost every source ships is not.
 * `lowRes` marks the favicon fallback so the page can draw it small instead
 * of stretched.
 */
export function iconOf(creatorId: string): { url: string; lowRes: boolean } | null {
  return tables().iconOf.get(creatorId) ?? null;
}

/** Every channel the crawl knows for a creator — domain, youtube, later more.
    For a self-registered row: the provable channel plus the platforms they
    added at the door (CREATORS-TAB-SPEC §5). */
export function channelsOf(creatorId: string): Array<{ kind: string; handle: string }> {
  const self = selfById(creatorId);
  if (self) return [self.channel, ...(self.extras ?? [])];
  return tables().channelsOf.get(creatorId) ?? [];
}

/** Does any creator, crawled or self-registered, already live at this domain?
    The door's duplicate check - the answer to "register my site" when the
    site is already here is "claim it", never a second row. */
export function creatorByDomain(domain: string): Creator | null {
  const d = domain.toLowerCase();
  for (const [crt, dom] of tables().domainOf)
    if (dom.toLowerCase().replace(/^www\./, "") === d.replace(/^www\./, ""))
      return withClaim(tables().byId.get(crt)!);
  for (const r of allSelfCreators())
    if (r.channel.kind === "domain" &&
        r.channel.handle.replace(/^www\./, "") === d.replace(/^www\./, ""))
      return withClaim(asCreator(r));
  return null;
}

/** A fixed row order, so the icons do not reshuffle when a link is edited. */
const LINK_ORDER = ["domain", "youtube", "instagram", "tiktok"];

/**
 * Where this creator lives, as ready hrefs — the crawl's channels merged with
 * the claimant's own links, theirs winning per kind. The crawl found where
 * they were; the claimant says where they are. Kinds we have no icon for are
 * dropped here rather than rendered as mystery chrome.
 */
export function linksOf(creatorId: string): Array<{ kind: string; href: string }> {
  const out = new Map<string, string>();
  for (const { kind, handle } of channelsOf(creatorId)) {
    const href = kind === "domain" ? `https://${handle}/`
      : kind === "youtube" ? `https://www.youtube.com/${handle}`
      : kind === "instagram" ? `https://www.instagram.com/${handle}/`
      : kind === "tiktok" ? `https://www.tiktok.com/${handle}`
      : null;
    if (href) out.set(kind, href);
  }
  const c = claimOf(creatorId);
  for (const ch of c?.channels ?? [])
    if (LINK_ORDER.includes(ch.kind)) out.set(ch.kind, ch.url);
  return [...out]
    .sort((a, b) => LINK_ORDER.indexOf(a[0]) - LINK_ORDER.indexOf(b[0]))
    .map(([kind, href]) => ({ kind, href }));
}

/** Every corpus recipe attributed to this creator, servable ones first.
    Components resolve within this shelf — the same-creator rule means a
    component is always a sibling here. */
export function recipesOf(creatorId: string): Recipe[] {
  const { creatorOf } = tables();
  return expandComponents([
    ...creatorRecipesOf(creatorId).map(asRecipe),   // theirs first — read fresh
    ...applyConfirmations(load().recipes.filter((r) => creatorOf.get(r.id) === creatorId)),
  ]);
}
