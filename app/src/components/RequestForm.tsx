"use client";

/**
 * One field, a URL, and the action is about THEM — "I want to cook this",
 * never "submit a recipe" (UX-SPEC §11). What comes back is the promise
 * card: the processing step visible and honest, never a claim of instant
 * parsing, and the saved-by count only once it is not embarrassing.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Panel } from "@/components/primitives";

type Result =
  | { ok: true; kind: "have"; recipeId: string }
  | { ok: true; kind: "held" }
  | { ok: true; kind: "saved"; count: number | null }
  | { ok: false; error: string };

export function RequestForm({ onRequest }: {
  onRequest: (url: string) => Promise<Result>;
}) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  return (
    <Panel>
      <label className="field">
        <span className="field-label">Link to the recipe you want to cook</span>
        <input value={url} onChange={(e) => { setUrl(e.target.value); setResult(null); }}
               placeholder="https://…" />
      </label>
      <p className="cook-line">
        <Button kind="primary" disabled={pending || !/^https?:\/\/\S+\.\S/.test(url.trim())}
                onClick={() => start(async () => setResult(await onRequest(url)))}>
          I want to cook this
        </Button>
      </p>

      {result && !result.ok && <p className="note">{result.error}</p>}
      {result?.ok && result.kind === "have" && (
        <p className="note">
          We already have this one:{" "}
          <Link href={`/recipe/${result.recipeId}`}>open it</Link> and see what
          you can cook it with.
        </p>
      )}
      {result?.ok && result.kind === "held" && (
        <div className="req-card">
          <p><b>We hold this one already.</b></p>
          <p>It is waiting on a few ingredients our vocabulary does not know
             yet. Your ask moves it up the queue.</p>
        </div>
      )}
      {result?.ok && result.kind === "saved" && (
        <div className="req-card">
          <p><b>Saved.</b></p>
          <p>We&apos;re preparing this recipe for pantry matching.</p>
          {result.count !== null && <p>Saved by {result.count} people</p>}
        </div>
      )}
    </Panel>
  );
}
