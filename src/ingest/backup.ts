/**
 * Corpus backup.
 *
 *   npm run backup            # default location, outside the repo
 *   npm run backup -- --to /path/to/dir
 *
 * `data/` is git-ignored (correctly — it's large and regenerable in principle),
 * which means the corpus lives in exactly one place and is NOT covered by
 * commits. Regenerating it is hours of crawling against sites that may have
 * changed or started blocking, so in practice it is not reproducible: the
 * Wayback snapshots and the pre-block Just One Cookbook pages especially.
 *
 * Writes to a timestamped directory outside the repo, so `git clean -xfd` or a
 * stray `rm -rf` on the working tree can't take the corpus with it. Copies
 * rather than compresses — cross-platform with no dependencies, and 1–2 MB of
 * JSONL doesn't need the compression.
 *
 * Every file gets a SHA-256 and a line count in manifest.json, so a restore can
 * be checked rather than assumed.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data/raw");

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

// Default sits beside the repo, not inside it — a backup within the working
// tree is not a backup.
const dest = arg("to") ?? resolve(ROOT, "..", "recipes-backups");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(dest, `corpus-${stamp}`);
mkdirSync(outDir, { recursive: true });

type Entry = { file: string; recipes: number; bytes: number; sha256: string };
const manifest: Entry[] = [];

for (const file of readdirSync(RAW).filter((f) => f.endsWith(".jsonl"))) {
  const buf = readFileSync(join(RAW, file));
  copyFileSync(join(RAW, file), join(outDir, file));
  manifest.push({
    file,
    recipes: buf.toString("utf8").split("\n").filter((l) => l.trim()).length,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
  });
}

const total = manifest.reduce((a, e) => a + e.recipes, 0);
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify({ createdAt: stamp, totalRecipes: total, files: manifest }, null, 2),
);

console.log(`backed up ${manifest.length} files, ${total} recipes → ${outDir}`);
for (const e of manifest) {
  console.log(`  ${e.file.padEnd(26)} ${String(e.recipes).padStart(5)} recipes  ${e.sha256.slice(0, 12)}`);
}
console.log(`
manifest.json records a SHA-256 and recipe count per file — verify a restore
against it rather than trusting the copy.

This is same-disk. For anything you'd be upset to lose, copy the directory
somewhere else too; it is only a couple of MB.`);
