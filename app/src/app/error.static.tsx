"use client";

/* The static route allowlist — see `page.static.tsx` for what this file is.
   The error boundary, unchanged. The directive is repeated because a boundary IS the client
   boundary, and a re-export does not inherit one. */
export * from "./error";
export { default } from "./error";
