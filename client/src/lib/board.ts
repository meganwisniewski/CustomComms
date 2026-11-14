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
