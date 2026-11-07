"use client";

/* The static route allowlist — see `page.static.tsx` for what this file is.
   The last-resort boundary, unchanged. The directive is repeated because a boundary IS the client
   boundary, and a re-export does not inherit one. */
export * from "./global-error";
export { default } from "./global-error";
