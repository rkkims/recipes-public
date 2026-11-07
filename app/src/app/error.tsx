"use client";

/**
 * Route-level recovery.
 *
 * Without this a throw anywhere in a server component renders Next's default
 * error page in production — a blank screen with no way forward. The pantry is
 * the one thing here that cannot be regenerated, so the failure mode that
 * matters is a user concluding their data is gone and starting over.
 *
 * So: say what happened, say the data is intact, and offer the two things that
 * actually help — retry, and a link that does not depend on whatever broke.
 */
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error("[route]", error); }, [error]);
  return (
    <main className="page">
      <h1>Something broke on this page.</h1>
      <p className="note">
        Nothing was lost. Retrying is safe.
      </p>
      <pre className="fail-detail">{error.message}</pre>
      <p className="note">
        <button className="btn btn-primary" onClick={reset}>Try again</button>{" "}
        <a className="btn btn-plain" href="/">Back to the pantry</a>
      </p>
    </main>
  );
}
