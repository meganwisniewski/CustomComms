import type { Contact, Group } from "../types";
import { DEFAULT_GROUPS } from "../data/sampleData";

/** Ensure every person sits in exactly one group; append strays to the last. */
export function normalizeBoard(board: Group[] | null, people: Contact[]): Group[] {
  const known = new Set(people.map((p) => p.id));
  const base: Group[] = (board ?? DEFAULT_GROUPS).map((g) => ({
    name: g.name,
    ids: g.ids.filter((id) => known.has(id)),
  }));
  const placed = new Set(base.flatMap((g) => g.ids));
  const last = base[base.length - 1];
  for (const p of people) if (!placed.has(p.id) && last) last.ids.push(p.id);
  return base;
}

/** Add a new (empty) category, inserted before the last group so that group
 *  stays the catch-all for ungrouped people. No-op for blank/duplicate names. */
export function addGroup(board: Group[] | null, people: Contact[], name: string): Group[] {
  const n = name.trim();
  const cur = normalizeBoard(board, people);
  if (!n || cur.some((g) => g.name.toLowerCase() === n.toLowerCase())) return cur;
  const next = [...cur];
  next.splice(Math.max(next.length - 1, 0), 0, { name: n, ids: [] });
  return next;
}

/** Remove a category; its people fall back to the catch-all immediately.
 *  Keeps at least one group. */
export function removeGroup(board: Group[] | null, people: Contact[], name: string): Group[] {
  const cur = normalizeBoard(board, people);
  const next = cur.filter((g) => g.name !== name);
  if (!next.length) return cur;
  // Re-normalize so the removed group's people re-bucket into the catch-all now,
  // not on some later render.
  return normalizeBoard(next, people);
}
