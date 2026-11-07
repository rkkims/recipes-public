/**
 * Barrel. The tables live in two files, split by the only distinction that
 * matters for maintenance:
 *
 *   rules.ts       general, cuisine-independent — must NOT grow with cuisines
 *   exceptions.ts  semantic, per-cuisine        — expected to grow with them
 *
 * Importers do not care which side a name comes from. The engine distinguishes
 * them only when reporting where an answer came from.
 */
export * from "./rules.js";
export * from "./exceptions.js";
