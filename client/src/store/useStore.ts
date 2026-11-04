import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CirclePos, Group, PersonMeta, Ring, ViewId } from "../types";
import { DEFAULT_GROUPS, PEOPLE } from "../data/sampleData";

type ThemeChoice = "light" | "dark" | null;

interface AppState {
  view: ViewId;
  theme: ThemeChoice;
  calm: boolean;
  activeContactId: string | null;

  avatarOverrides: Record<string, string>;
  circlePos: Record<string, CirclePos>;
  board: Group[] | null;
  personMeta: Record<string, PersonMeta>;

  setView: (v: ViewId) => void;
  toggleTheme: () => void;
  toggleCalm: () => void;
  openContact: (id: string | null) => void;

  setAvatar: (id: string, emoji: string) => void;
  setCirclePos: (id: string, pos: CirclePos) => void;
  setRing: (id: string, ring: Ring) => void;
  getBoard: () => Group[];
  setBoard: (groups: Group[]) => void;
  moveToGroup: (id: string, groupName: string) => void;
  setPersonMeta: (id: string, patch: Partial<PersonMeta>) => void;
}

/** Ensure every person sits in exactly one group; append strays to the last. */
export function normalizeBoard(board: Group[] | null): Group[] {
  const known = new Set(PEOPLE.map((p) => p.id));
  const base: Group[] = (board ?? DEFAULT_GROUPS).map((g) => ({
    name: g.name,
    ids: g.ids.filter((id) => known.has(id)),
  }));
  const placed = new Set(base.flatMap((g) => g.ids));
  const last = base[base.length - 1];
  for (const p of PEOPLE) if (!placed.has(p.id) && last) last.ids.push(p.id);
  return base;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "circles",
      theme: null,
      calm: false,
      activeContactId: null,
      avatarOverrides: {},
      circlePos: {},
      board: null,
      personMeta: {},

      setView: (v) => set({ view: v }),
      toggleTheme: () =>
        set((s) => {
          const isDark = s.theme ? s.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
          return { theme: isDark ? "light" : "dark" };
        }),
      toggleCalm: () => set((s) => ({ calm: !s.calm })),
      openContact: (id) => set({ activeContactId: id }),

      setAvatar: (id, emoji) =>
        set((s) => ({ avatarOverrides: { ...s.avatarOverrides, [id]: emoji } })),
      setCirclePos: (id, pos) =>
        set((s) => ({ circlePos: { ...s.circlePos, [id]: pos } })),
      setRing: (id, ring) =>
        set((s) => ({
          circlePos: { ...s.circlePos, [id]: { c: ring, a: s.circlePos[id]?.a ?? -Math.PI / 2 } },
        })),

      getBoard: () => normalizeBoard(get().board),
      setBoard: (groups) => set({ board: groups }),
      moveToGroup: (id, groupName) =>
        set((s) => {
          const b = normalizeBoard(s.board).map((g) => ({ name: g.name, ids: g.ids.filter((x) => x !== id) }));
          const target = b.find((g) => g.name === groupName) ?? b[0];
          if (target) target.ids.push(id);
          return { board: b };
        }),
      setPersonMeta: (id, patch) =>
        set((s) => ({ personMeta: { ...s.personMeta, [id]: { ...s.personMeta[id], ...patch } } })),
    }),
    { name: "customcomms" },
  ),
);
