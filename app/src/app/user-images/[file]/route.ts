/**
 * Serve a mirrored user-recipe thumbnail from disk, at request time.
 *
 * These files are written by `cacheUserImage` while the app is RUNNING, and
 * `next start` only serves public/ files that existed at build time — so the
 * directory lives in data/ and this route reads it per request. Verified the
 * hard way: a file dropped into public/ after boot 404s until the next deploy.
 *
 * The filename is a hash our own code minted, so anything that does not match
 * that exact shape is refused before the filesystem is consulted — this route
 * must never become a path-traversal primitive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { USER_IMAGE_DIR } from "@/lib/user-images";

const NAME = /^[0-9a-f]{16}\.(jpg|png|webp|gif)$/;
const TYPE: Record<string, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

export async function GET(
  _req: Request, { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const m = file.match(NAME);
  if (!m) return new Response("not found", { status: 404 });
  try {
    const bytes = readFileSync(resolve(USER_IMAGE_DIR, file));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": TYPE[m[1]!]!,
        // Hash-named and immutable by construction; let browsers keep it.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
