"use client";

/**
 * The last resort — a failure in the root layout itself, where `error.tsx`
 * cannot render because there is no layout left to render it into.
 *
 * It must therefore ship its own <html> and its own styles, and depend on
 * nothing: no imports from the app, no stylesheet, no fonts.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ font: "16px/1.5 system-ui, sans-serif", margin: "3rem auto", maxWidth: "42rem", padding: "0 1rem" }}>
        <h1 style={{ fontSize: "1.25rem" }}>The app failed to start.</h1>
        <p>Your data is untouched. This is a code fault.</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f2", padding: "0.75rem", borderRadius: 6 }}>
          {error.message}
        </pre>
        <button onClick={reset} style={{ font: "inherit", padding: "0.4rem 0.9rem" }}>Try again</button>
      </body>
    </html>
  );
}
