/**
 * The decision-file reader.
 *
 * Moved verbatim out of `weee.ts` when findability stopped being a Weee fact
 * (RETAILER-SPEC §4). Two consumers now read hand-maintained CSVs, and a
 * second copy of a quote-and-escape parser is the kind of duplication that
 * diverges silently — one copy learning about `""` escapes and the other not.
 *
 * Deliberately minimal: our decision files are written by us, so this handles
 * quoted cells, doubled quotes and CRLF, and nothing else.
 */
export function parseCsv(text: string): string[][] {
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

export const asObjects = (text: string): Array<Record<string, string>> => {
  const rows = parseCsv(text);
  const h = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
