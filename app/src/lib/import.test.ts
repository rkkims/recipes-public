/**
 * Import tests — the export reader, which is the part most likely to rot.
 *
 * TikTok's archive shape is not a contract. The whole design of
 * `linksFromExport` is that it survives a rename, so the tests are written
 * against shapes we have seen AND against a deliberately renamed one: if a
 * future TikTok calls the section something new, the fallback walk must still
 * find the links.
 */
import { linksFromExport, linksFromText } from "./import";

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failures++;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

// ── pasted links ──────────────────────────────────────────────────────────
{
  const r = linksFromText(`
    https://www.tiktok.com/@chef/video/7311111111111111111
    https://www.tiktok.com/@chef/video/7322222222222222222?is_from_webapp=1
    https://www.youtube.com/watch?v=abc123
    not a link at all
  `);
  ok("paste: finds every link", r.candidates.length === 3, JSON.stringify(r.candidates));
  ok("paste: keeps non-TikTok links — 'anywhere you cook from'",
      r.candidates.some((c) => c.url.includes("youtube")));

  const dup = linksFromText(`
    https://www.tiktok.com/@chef/video/7311111111111111111
    https://www.tiktok.com/@chef/video/7311111111111111111?is_from_webapp=1&sender=x
  `);
  ok("paste: the same video with tracking params is ONE row",
      dup.candidates.length === 1, JSON.stringify(dup.candidates));

  ok("paste: prose punctuation is not part of the URL",
      linksFromText("see https://www.tiktok.com/@a/video/7300000000000000000.")
        .candidates[0]!.url.endsWith("7300000000000000000"));

  ok("paste: nothing pasted is reported as such", linksFromText("hello").emptyButValid === true);
}

// ── the JSON export, in the shape it has been seen in ─────────────────────
{
  const archive = {
    Activity: {
      "Favorite Videos": {
        FavoriteVideoList: [
          { Date: "2026-01-02 10:00:00", Link: "https://www.tiktokv.com/share/video/7333333333333333333/" },
          { Date: "2026-01-03 10:00:00", Link: "https://www.tiktok.com/@a/video/7344444444444444444" },
        ],
      },
      "Like List": {
        ItemFavoriteList: [
          { Date: "2026-01-04 10:00:00", link: "https://www.tiktok.com/@b/video/7355555555555555555" },
        ],
      },
    },
  };
  const r = linksFromExport(JSON.stringify(archive));
  ok("export: reads favourites and likes",
      r.candidates.length === 3, JSON.stringify(r.candidates));
  // The export writes favourites against tiktokv.com, not tiktok.com. A reader
  // that only knows the public domain drops exactly the rows people came for.
  ok("export: the tiktokv.com share domain counts",
      r.candidates.some((c) => c.url.includes("tiktokv.com")),
      JSON.stringify(r.candidates.map((c) => c.url)));
  // TikTok's Like List holds a key called `ItemFavoriteList`; a label that
  // relabelled as it descended called every liked video a favourite.
  ok("export: an inner key named 'Favorite' does not relabel the Likes section",
      r.candidates.filter((c) => c.from === "Likes").length === 1,
      JSON.stringify(r.candidates.map((c) => c.from)));
  ok("export: labels which list each came from",
      r.candidates.some((c) => c.from === "Favourites") &&
      r.candidates.some((c) => c.from === "Likes"),
      JSON.stringify(r.candidates.map((c) => c.from)));
  ok("export: says where they came from, with counts",
      r.where.join(" ").includes("Favourites") && r.where.join(" ").includes("Likes"),
      JSON.stringify(r.where));
}

// ── a RENAMED export: the whole point of the fallback walk ────────────────
{
  const renamed = {
    Activity: {
      "Saved Clips v3": {
        SomeNewListName: [
          { url: "https://www.tiktok.com/@c/video/7366666666666666666" },
        ],
      },
    },
  };
  const r = linksFromExport(JSON.stringify(renamed));
  ok("export: a renamed section still yields its links",
      r.candidates.length === 1, JSON.stringify(r.candidates));
  ok("export: and does not claim a section it did not find",
      r.candidates[0]!.from === "export", r.candidates[0]!.from);
}

// ── the plain-text export ─────────────────────────────────────────────────
{
  const txt = [
    "Favorite Videos:",
    "Date: 2026-01-02",
    "Link: https://www.tiktok.com/@d/video/7377777777777777777",
    "",
    "Like List:",
    "Link: https://www.tiktok.com/@e/video/7388888888888888888",
  ].join("\n");
  const r = linksFromExport(txt);
  ok("export (txt): finds both", r.candidates.length === 2, JSON.stringify(r.candidates));
  ok("export (txt): labels by the heading above them",
      r.candidates[0]!.from === "Favourites" && r.candidates[1]!.from === "Likes",
      JSON.stringify(r.candidates.map((c) => c.from)));
}

// ── the two empty cases, which must not read the same ─────────────────────
{
  ok("export: a valid archive with nothing saved says so",
      linksFromExport(JSON.stringify({ Activity: {} })).emptyButValid === true);
  ok("export: an unreadable file is NOT reported as empty-but-valid",
      linksFromExport("<<< not json and not an export >>>").emptyButValid !== true);
}

// ── shapes that must not crash it ─────────────────────────────────────────
{
  const deep = JSON.parse(JSON.stringify(
    Array.from({ length: 30 }).reduce<Record<string, unknown>>(
      (acc) => ({ nest: acc }), { Link: "https://www.tiktok.com/@f/video/7399999999999999999" })));
  ok("export: absurd nesting is depth-limited rather than fatal",
      Array.isArray(linksFromExport(JSON.stringify(deep)).candidates));

  ok("export: an empty file is handled", linksFromExport("").candidates.length === 0);
}

console.log(failures === 0 ? `import: all checks passed` : `import: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
