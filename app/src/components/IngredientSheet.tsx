"use client";

/**
 * The ingredient editor, opened OVER the recipe — QC-SPEC §4's sideways door.
 *
 * "Both are modal over the recipe, not separate pages. The recipe stays on
 * screen because it is the reason you are there." A curator mid-line who
 * dislikes an alias opens this sheet, drops or retargets it, and is back on
 * the same line — batch state intact, because nothing navigated.
 *
 * Every successful edit busts the server's ontology cache (the action does)
 * and refetches this sheet's own data, so the sheet shows the edit
 * immediately; the recipe side sees it on its next server round-trip, which
 * for the autosuggest is the next keystroke.
 */
import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { Note } from "./primitives";
import { IngredientEditor, type EditorData } from "./IngredientEditor";

type Result = { ok: true } | { ok: false; error: string };

export type SheetActions = {
  open: (idOrName: string) => Promise<EditorData | null>;
  rename: (id: string, next: string, note: string) => Promise<Result>;
  gloss: (id: string, gloss: string, note: string) => Promise<Result>;
  remove: (id: string, note: string) => Promise<Result>;
  aliasSet: (surface: string, targetId: string, note: string) => Promise<Result>;
  aliasDrop: (surface: string) => Promise<Result>;
  promoteAlias: (surface: string, fromNodeId: string, note: string) => Promise<Result>;
  mergeNode: (id: string, targetId: string, note: string) => Promise<Result>;
  fixLine: (recipeId: string, raw: string, targetId: string, note: string) => Promise<Result>;
  edgeAdd: (childId: string, parentId: string, relation: "is_a" | "derives_from", note: string) => Promise<Result>;
  edgeRemove: (childId: string, parentId: string, relation: "is_a" | "derives_from", note: string) => Promise<Result>;
  suggest: (q: string) => Promise<Array<{ id: string; name: string }>>;
};

export function IngredientSheet({ idOrName, actions, onClose }: {
  idOrName: string;
  actions: SheetActions;
  onClose: () => void;
}) {
  const [data, setData] = useState<EditorData | null | "loading">("loading");

  const fetchData = (key: string) =>
    actions.open(key).then(setData, () => setData(null));
  useEffect(() => { setData("loading"); void fetchData(idOrName); }, [idOrName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog label="Edit ingredient" onClose={onClose}>
      {data === "loading" && <Note>loading…</Note>}
      {data === null && <Note>no such ingredient. It may be a candidate the ontology has not confirmed.</Note>}
      {data && data !== "loading" && (
        <IngredientEditor
          data={data}
          actions={actions}
          /* Refetch by ID, not the name the sheet was opened with — a rename
             just changed the name, and the id is what survives (§1). */
          onChanged={() => void fetchData(data.id)}
        />
      )}
    </Dialog>
  );
}
