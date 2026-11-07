/**
 * The thumbnail mirror's retry contract (user-images.ts).
 *
 *   npm run test-user-images
 *
 * A host that answers the first request badly and the second well must yield
 * a cached image; a host that says a definitive no must be asked once.
 */
import assert from "node:assert/strict";
import { fetchImageWithRetry } from "./user-images";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const ok = (body: Uint8Array, status = 200) =>
  new Response(body as BodyInit, { status });

const realFetch = globalThis.fetch;
let calls: Array<[string, RequestInit | undefined]> = [];
function mockFetch(answers: Array<() => Response>) {
  calls = [];
  let i = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push([String(input), init]);
    const next = answers[Math.min(i++, answers.length - 1)]!;
    return next();
  }) as typeof fetch;
}

async function main() {
try {
  // 503, then an empty 200, then the real bytes — and the Referer rides along.
  mockFetch([() => ok(new Uint8Array(), 503), () => ok(new Uint8Array()), () => ok(JPEG)]);
  const got = await fetchImageWithRetry("https://x.test/a.jpg", 1000, "https://x.test/post");
  assert.equal(got?.ext, "jpg");
  assert.equal(calls.length, 3);
  assert.equal((calls[0]![1]!.headers as Record<string, string>).referer, "https://x.test/post");

  // A 404 is final.
  mockFetch([() => ok(new Uint8Array(), 404)]);
  assert.equal(await fetchImageWithRetry("https://x.test/a.jpg", 1000), undefined);
  assert.equal(calls.length, 1);

  // Three challenge pages: give up, bounded.
  mockFetch([() => ok(new TextEncoder().encode("<html>challenge</html>"))]);
  assert.equal(await fetchImageWithRetry("https://x.test/a.jpg", 1000), undefined);
  assert.equal(calls.length, 3);

  console.log("user-images: 3 checks passed");
} finally {
  globalThis.fetch = realFetch;
}
}

main().catch((e) => { console.error(e); process.exit(1); });
