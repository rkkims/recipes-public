-- The behavioural record, as one table — STATIC-SPEC §7b, revised.
--
--   npx wrangler d1 execute jipbap --remote --file=workers/schema.sql
--
-- `data/events/events.jsonl` on the VM is an append-only file of one JSON
-- object per event, and this is that file with a primary key. Deliberately not
-- a column per kind: BEHAVIOR-SPEC's derivations read whole events and the six
-- kinds carry different fields, so the shape that survives a new kind is a
-- envelope plus a blob. The three columns that ARE promoted out of the payload
-- are the three every question groups by — what happened, when, and whose
-- kitchen.
--
-- `at` is the SERVER's clock, written by the Worker. The sender's own moment
-- (`cooked_at`) stays inside the payload where it belongs: it is a claim, and
-- a claim and a receipt should not share a column.
--
-- `household` is nullable because two of the six kinds have none:
-- `list_viewed` and `buyblock_shown/opened` are impression facts about a
-- surface, not about a kitchen (ATTRIBUTION-SPEC §2's denominators).
--
-- Nothing here identifies a person. `household` is the device-minted id the
-- client store already keys on, there is no user id and no free text — the
-- Worker refuses a `txt_` ingredient id outright (BEHAVIOR-SPEC §6), which is
-- the same rule the Next route and the `/go` Worker both enforce.
CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL,
  at        TEXT NOT NULL,
  household TEXT,
  payload   TEXT NOT NULL
);

-- The two orders every reading of this table wants: "what happened lately"
-- and "what did this kitchen do". Cheap on a table this size and cheaper than
-- discovering they were needed once it is not.
CREATE INDEX IF NOT EXISTS events_kind_at ON events (kind, at);
CREATE INDEX IF NOT EXISTS events_household_at ON events (household, at);
