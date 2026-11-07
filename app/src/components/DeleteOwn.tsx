"use client";

/**
 * Remove a recipe you added.
 *
 * Confirms, because there is no undo: unlike a cook event this is content the
 * user typed, and re-entering an ingredient list is real work.
 *
 * Plans and cooks pointing at it are left alone — a dinner you ate does not
 * un-happen because you deleted the link you cooked it from. The confirmation
 * says so rather than leaving the user to wonder.
 */
import { useState, useTransition } from "react";
import { Button } from "./primitives";
import { useConfirm } from "./Dialog";
import type { ActionResult } from "@/lib/result";

export function DeleteOwn({ recipeId, title, onDelete }: {
  recipeId: string; title: string;
  onDelete: (id: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  return (
    <>
      <Button kind="quiet" disabled={pending} onClick={() => confirm({
        question: `Delete “${title}”?`,
        detail: "Its ingredients go with it. Your cooks and plans stay.",
        confirmLabel: "Delete it",
      }, () => start(async () => {
        try {
          const r = await onDelete(recipeId);
          setFailed(r.ok ? null : r.error);
        } catch {
          setFailed("Could not reach the server.");
        }
      }))}>
        Delete
      </Button>
      {failed && <span className="fail"> {failed}</span>}
      {dialog}
    </>
  );
}
