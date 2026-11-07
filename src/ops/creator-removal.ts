/**
 * Removal for cause — CREATOR-SPEC §6a's only writer.
 *
 * Deliberately a terminal command and not an admin page: a removal is a
 * decision a person makes with the evidence in front of them, and there are
 * exactly two grounds. Anything else you are tempted to type here is the
 * moderation system §4 declined to build.
 *
 *   npm run creator-removal -- <handle|crt_id> remove dead-source [note…]
 *   npm run creator-removal -- <handle|crt_id> remove tag-abuse  [note…]
 *   npm run creator-removal -- <handle|crt_id> lift
 *   npm run creator-removal -- list
 *
 * Takes effect on the app's next request — the store is read fresh, no
 * restart needed. `lift` restores exactly what removal suspended; the row,
 * the claim and the recipes were never touched.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(import.meta.dirname, "..", "..", "data", "creators", "removals.json");
const CSV = resolve(import.meta.dirname, "..", "..", "data", "creators", "creators.csv");

type Removal = { removed_at: string; reason: "dead-source" | "tag-abuse"; note?: string };

function read(): Record<string, Removal> {
  if (!existsSync(FILE)) return {};
  return JSON.parse(readFileSync(FILE, "utf8"));
}
function write(rows: Record<string, Removal>): void {
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(rows, null, 1) + "\n", "utf8");
  renameSync(tmp, FILE);
}

/** handle or crt_… id → [id, handle], from the pipeline's own table. */
function resolveCreator(who: string): [string, string] {
  const lines = readFileSync(CSV, "utf8").trim().split("\n").slice(1);
  for (const line of lines) {
    const [id, handle] = line.split(",");
    if (id === who || handle === who) return [id!, handle!];
  }
  console.error(`no creator matches "${who}" in ${CSV}`);
  process.exit(1);
}

const [who, verb, ...rest] = process.argv.slice(2);

if (who === "list" && !verb) {
  const all = Object.entries(read());
  if (all.length === 0) { console.log("no removals on file"); process.exit(0); }
  for (const [id, r] of all)
    console.log(`${id}  ${r.reason}  ${r.removed_at}${r.note ? `  — ${r.note}` : ""}`);
  process.exit(0);
}

if (!who || !verb || !["remove", "lift"].includes(verb)) {
  console.error("usage: creator-removal <handle|crt_id> remove dead-source|tag-abuse [note…]");
  console.error("       creator-removal <handle|crt_id> lift");
  console.error("       creator-removal list");
  process.exit(1);
}

const [id, handle] = resolveCreator(who);
const rows = read();

if (verb === "lift") {
  if (!rows[id]) { console.log(`${handle} (${id}) is not removed — nothing to lift`); process.exit(0); }
  delete rows[id];
  write(rows);
  console.log(`lifted: ${handle} (${id}) is listed again on the next request`);
  process.exit(0);
}

const reason = rest[0];
if (reason !== "dead-source" && reason !== "tag-abuse") {
  console.error("a reason is required and there are exactly two: dead-source | tag-abuse");
  console.error("(low quality is not a ground — CREATOR-SPEC §6a)");
  process.exit(1);
}
const note = rest.slice(1).join(" ");
rows[id] = {
  removed_at: new Date().toISOString(),
  reason,
  ...(note ? { note } : {}),
};
write(rows);
console.log(`removed: ${handle} (${id}) — ${reason}${note ? ` — ${note}` : ""}`);
console.log("out of display and matching on the next request; lift any time");
