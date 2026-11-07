/**
 * The registry's invariants — RETAILER-SPEC §2, §6.
 *
 *   npm run test-retailers
 *
 * Two of these are ordinary table hygiene and one is a security property, so
 * they live together rather than in a "security tests" file nobody runs: since
 * `/go` derives its open-redirect allowlist from `retailerForHost`, a registry
 * bug and a redirect vulnerability are the same bug.
 *
 * These assert the *guard*, not the presence of a table. A registry with the
 * right rows and a substring host test would pass an "is Weee! registered"
 * check and still redirect to `weee.com.evil.example`.
 */
import assert from "node:assert/strict";
import { isSearchUrl, RETAILERS, retailerForHost, retailersFor } from "./retailers";

let pass = 0, fail = 0;
const check = (label: string, fn: () => void) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  FAIL  ${label}\n        ${(e as Error).message.split("\n")[0]}`); }
};

// ── the security property ───────────────────────────────────────────────────

/**
 * Hosts that must never resolve, each a real way an allowlist gets broken:
 * suffix confusion, prefix confusion, an embedded match, and case tricks on a
 * host that only differs in a subdomain.
 */
const HOSTILE = [
  "weee.com.evil.example",
  "evil-weee.com",
  "wwwweee.com",
  "weee.com.attacker.net",
  "notweee.com",
  "sayweee.com.evil.example",
  "",
];
for (const h of HOSTILE) {
  check(`hostile host rejected: ${h || "(empty)"}`, () =>
    assert.equal(retailerForHost(h), null));
}

// ── round-trip: every registered host maps back to its own retailer ─────────

for (const r of RETAILERS) {
  for (const h of r.hosts) {
    check(`${r.id} owns ${h}`, () =>
      assert.equal(retailerForHost(h)?.id, r.id));
  }
}

// ── no host is claimed twice ────────────────────────────────────────────────

/**
 * The invariant that makes host-derived labelling sound at all.
 *
 * If two retailers listed the same host, `retailerForHost` would return
 * whichever sorts first in the registry and the event dimension would be
 * silently wrong — the exact failure `ATTRIBUTION-SPEC` §c's cross-retailer
 * comparison cannot survive. Most likely to fire on a copy-pasted row when the
 * second retailer lands, which is precisely when nobody is looking here.
 */
check("no host is claimed by two retailers", () => {
  const owner = new Map<string, string>();
  for (const r of RETAILERS)
    for (const h of r.hosts) {
      const prev = owner.get(h);
      assert.equal(prev, undefined, `${h} claimed by both ${prev} and ${r.id}`);
      owner.set(h, r.id);
    }
});

check("ids are unique", () => {
  const ids = RETAILERS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── rows are habitable ──────────────────────────────────────────────────────

for (const r of RETAILERS) {
  check(`${r.id}: has hosts, regions and a label`, () => {
    assert.ok(r.hosts.length > 0, "no hosts");
    assert.ok(r.regions.length > 0, "no regions");
    assert.ok(r.label.length > 0, "no label");
  });
  check(`${r.id}: hosts are bare hostnames`, () =>
    // A scheme or path here would never match `url.hostname` and the retailer
    // would be permanently unreachable — silently, since the guard would just
    // redirect home.
    r.hosts.forEach((h) => assert.match(h, /^[a-z0-9.-]+$/)));
  check(`${r.id}: its own search URL reads as a search`, () => {
    const url = r.urlFor("a-name-no-catalogue-will-have");
    // `urlFor` may legitimately answer null; only assert when it did not.
    if (url) assert.equal(isSearchUrl(r, new URL(url)), true);
  });
  check(`${r.id}: searchUrlFor is a search, and is asked for not fallen into`, () => {
    // The shared-shelf path in `lib/buy.ts` depends on this being a *search*
    // even for a name that HAS an aisle — otherwise it would hand back the
    // same aisle it was trying to escape. A retailer with no catalogue
    // (Instacart) answers search for BOTH, and equal is then correct: there
    // is no aisle to escape, and the no-op costs nothing.
    const url = r.searchUrlFor("rice");
    const aisle = r.urlFor("rice");
    if (url) {
      assert.equal(isSearchUrl(r, new URL(url)), true);
      if (aisle && !isSearchUrl(r, new URL(aisle))) assert.notEqual(url, aisle);
    }
  });
}

// ── region routing ──────────────────────────────────────────────────────────

check("US has at least one retailer", () =>
  assert.ok(retailersFor("US").length > 0));
check("a region with no retailer returns none, and does not throw", () =>
  assert.equal(retailersFor("JP").length, 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
