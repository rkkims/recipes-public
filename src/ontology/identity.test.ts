/**
 * Identity regression cases.
 *
 *   npm run test-identity
 *
 * INGREDIENT-SPEC §1. These assert the one property the whole design exists for:
 * a reference written once keeps resolving, through renames and merges, forever.
 * It is the only guarantee in the system that cannot be repaired after the fact —
 * once a user's pantry row points at an id nothing resolves, the information
 * about what they meant is gone.
 */
import { Registry, type Identity } from "./identity.js";

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

const D = "2026-01-01";
const rows: Identity[] = [];
const reg = new Registry(rows);

// ── ids are stable and opaque ──────────────────────────────────────────────
const jalopeno = reg.idFor("jalopeno", D);
check("an id is opaque", /^ing_[0-9a-v]{12}$/.test(jalopeno), jalopeno);
check("the same name returns the same id", reg.idFor("jalopeno", D) === jalopeno);

const jalapeno = reg.idFor("jalapeno", D);
check("different names get different ids", jalapeno !== jalopeno);

// ── a merge keeps old references alive ─────────────────────────────────────
//
// This is the case that motivated the file. Review decides `jalopeno` was a
// typo; the node stops existing. A pantry row written last week still points at
// its id, and must still mean something.
check("retire succeeds", reg.retire("jalopeno", "jalapeno", D));
check("the retired id still resolves", reg.resolve(jalopeno) === jalapeno,
  `${jalopeno} -> ${reg.resolve(jalopeno)}, expected ${jalapeno}`);
check("the surviving id resolves to itself", reg.resolve(jalapeno) === jalapeno);
check("a retired node is not live", !reg.live().some((r) => r.id === jalopeno));
check("a retired node is still recorded", reg.all().some((r) => r.id === jalopeno));

// ── chains ─────────────────────────────────────────────────────────────────
//
// Merges happen more than once. `jalopeno -> jalapeno -> jalapeno pepper` must
// resolve end to end, or the first merge's references break on the second.
const pepper = reg.idFor("jalapeno pepper", D);
reg.retire("jalapeno", "jalapeno pepper", D);
check("a chain resolves transitively", reg.resolve(jalopeno) === pepper,
  `${jalopeno} -> ${reg.resolve(jalopeno)}, expected ${pepper}`);

// ── a cycle must not hang ──────────────────────────────────────────────────
//
// Nothing should create one, which is exactly why it is worth a test: the code
// that would notice is the code nobody runs.
const a = reg.idFor("aaa", D), b = reg.idFor("bbb", D);
reg.retire("aaa", "bbb", D);
const bRow = reg.all().find((r) => r.id === b)!;
bRow.retired_to = a;                                  // force a cycle
check("a cycle terminates", typeof reg.resolve(a) === "string");

// ── renaming does not silently mint a duplicate ────────────────────────────
//
// A name that has ever been seen keeps its id even after it is retired. If
// `jalopeno` reappears in a corpus, it must NOT get a fresh id — it must return
// the old one and keep pointing where review sent it.
check("a retired name reuses its original id", reg.idFor("jalopeno", D) === jalopeno);
check("and still redirects", reg.resolve(reg.idFor("jalopeno", D)) === pepper);

console.log(failed ? `\n${failed} identity case(s) failed` : "\nall identity cases pass");
if (failed) process.exit(1);
