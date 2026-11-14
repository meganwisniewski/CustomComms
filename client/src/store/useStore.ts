import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CirclePos, Contact, Group, PersonMeta, Ring, ViewId } from "../types";
import { hub } from "../lib/hub";
import { convToContact, dedupeContacts, emojiForReaction, hubThreadToMessages } from "../lib/adapt";
import { addGroup as addGroupFn, normalizeBoard, removeGroup as removeGroupFn } from "../lib/board";

type ThemeChoice = "light" | "dark" | null;
type Status = "idle" | "loading" | "ready" | "error";

interface AppState {
  // --- UI + local metadata (persisted) ---
  view: ViewId;
  theme: ThemeChoice;
  calm: boolean;
  activeContactId: string | null;

  avatarOverrides: Record<string, string>;
  circlePos: Record<string, CirclePos>;
  board: Group[] | null;
  personMeta: Record<string, PersonMeta>;

  // --- hub data (not persisted; loaded each session) ---
  contacts: Contact[];
  status: Status;
  error: string | null;

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
  addGroup: (name: string) => void;
  removeGroup: (name: string) => void;
  setPersonMeta: (id: string, patch: Partial<PersonMeta>) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;

  loadData: () => Promise<void>;
  loadThread: (id: string) => Promise<void>;
  sendMessage: (id: string, text: string, replyTo?: string, rich?: string) => Promise<void>;
  reactTo: (id: string, targetGuid: string, reaction: string) => Promise<void>;
}

// Re-exported so existing imports (e.g. BoardView) keep working unchanged.
export { normalizeBoard };

const people = (contacts: Contact[]) => contacts.filter((c) => c.lane === "people");

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

      contacts: [],
      status: "idle",
      error: null,

      setView: (v) => set({ view: v }),
      // Cycle Synthwave (null) -> light -> dark -> Synthwave.
      toggleTheme: () =>
        set((s) => {
          const order: ThemeChoice[] = [null, "light", "dark"];
          const next = order[(order.indexOf(s.theme ?? null) + 1) % order.length];
          return { theme: next };
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

      getBoard: () => normalizeBoard(get().board, people(get().contacts)),
      setBoard: (groups) => set({ board: groups }),
      moveToGroup: (id, groupName) =>
        set((s) => {
          const b = normalizeBoard(s.board, people(s.contacts)).map((g) => ({
            name: g.name,
            ids: g.ids.filter((x) => x !== id),
          }));
          const target = b.find((g) => g.name === groupName) ?? b[0];
          if (target) target.ids.push(id);
          return { board: b };
        }),
      addGroup: (name) => set((s) => ({ board: addGroupFn(s.board, people(s.contacts), name) })),
      removeGroup: (name) => set((s) => ({ board: removeGroupFn(s.board, people(s.contacts), name) })),
      setPersonMeta: (id, patch) =>
        set((s) => ({ personMeta: { ...s.personMeta, [id]: { ...s.personMeta[id], ...patch } } })),
      addTag: (id, tag) =>
        set((s) => {
          const t = tag.trim();
          const cur = s.personMeta[id]?.tags ?? [];
          if (!t || cur.includes(t)) return {};
          return { personMeta: { ...s.personMeta, [id]: { ...s.personMeta[id], tags: [...cur, t] } } };
        }),
      removeTag: (id, tag) =>
        set((s) => {
          const cur = s.personMeta[id]?.tags ?? [];
          return {
            personMeta: {
              ...s.personMeta,
              [id]: { ...s.personMeta[id], tags: cur.filter((x) => x !== tag) },
            },
          };
        }),

      loadData: async () => {
        set((s) => ({ status: s.contacts.length ? s.status : "loading" }));
        try {
          const convs = await hub.conversations(40);
          // One row per person (collapses an iMessage + SMS chat for the same
          // contact); conversations arrive newest-first, so the most recent wins.
          const next = dedupeContacts(convs.map(convToContact));
          set((s) => {
            // Keep already-loaded threads so an open conversation doesn't flicker.
            const prev = new Map(s.contacts.map((c) => [c.id, c.thread]));
            return {
              contacts: next.map((c) => ({ ...c, thread: prev.get(c.id) ?? c.thread })),
              status: "ready",
              error: null,
            };
          });
        } catch (e) {
          set((s) => ({ status: s.contacts.length ? "ready" : "error", error: String(e) }));
        }
      },

      loadThread: async (id) => {
        try {
          const thread = hubThreadToMessages(await hub.messages(id, 50));
          set((s) => ({
            contacts: s.contacts.map((c) => (c.id === id ? { ...c, thread } : c)),
          }));
        } catch {
          /* keep whatever thread we have */
        }
      },

      sendMessage: async (id, text, replyTo, rich) => {
        const t = text.trim();
        if (!t) return;
        // Optimistic append; the next poll reconciles with the real message.
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.id === id ? { ...c, thread: [...c.thread, { from: "me", text: t, time: "Today" }] } : c,
          ),
        }));
        try {
          // iMessage delivers the plain `body`; `rich` (Markdown) rides along for
          // channels that support formatting. Only sent when formatting is present.
          const opts: Record<string, unknown> = {};
          if (replyTo) opts.reply_to = replyTo;
          if (rich && rich !== t) opts.rich = rich;
          await hub.send(id, t, opts);
        } catch {
          /* leave the optimistic bubble; a later poll will show its real state */
        }
      },

      reactTo: async (id, targetGuid, reaction) => {
        // Optimistic: drop the emoji onto the target bubble now; the next poll
        // reconciles against what BlueBubbles actually recorded.
        const emoji = emojiForReaction(reaction);
        if (emoji) {
          set((s) => ({
            contacts: s.contacts.map((c) =>
              c.id !== id
                ? c
                : {
                    ...c,
                    thread: c.thread.map((m) =>
                      m.guid === targetGuid
                        ? { ...m, reactions: [...new Set([...(m.reactions ?? []), emoji])] }
                        : m,
                    ),
                  },
            ),
          }));
        }
        try {
          await hub.react(id, targetGuid, reaction);
        } catch {
          /* ignore; caller can retry */
        }
      },
    }),
    {
      name: "customcomms",
      // Only local metadata is persisted; conversations/contacts come from the hub.
      partialize: (s) => ({
        view: s.view,
        theme: s.theme,
        calm: s.calm,
        avatarOverrides: s.avatarOverrides,
        circlePos: s.circlePos,
        board: s.board,
        personMeta: s.personMeta,
      }),
    },
  ),
);
