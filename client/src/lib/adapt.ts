/** Map hub wire shapes into the client's Contact/Message models. */
import type { Contact, Lane, LastWho, Message } from "../types";
import type { HubConversation, HubMessage } from "./hub";

const DAY = 86_400_000;

export function daysSince(ms: number | null): number {
  if (!ms) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / DAY));
}

/** A day-level label used for grouping bubbles under date dividers. */
function dayLabel(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  if (now.getTime() - ms < 7 * DAY) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Humans -> "people"; groups -> "feed"; shortcodes/automated -> "trail". */
function laneFor(conv: HubConversation): Lane {
  if (conv.is_group) return "feed";
  const id = conv.identifier ?? "";
  if (/^\d{3,6}$/.test(id)) return "trail";
  return "people";
}

export function convToContact(conv: HubConversation): Contact {
  const last = conv.last_message;
  let who: LastWho = "them";
  if (conv.is_group) who = "group";
  else if (last?.from_me) who = "you";
  const snippet = last
    ? last.is_reaction || last.from_me === false
      ? last.text
      : `You: ${last.text}`
    : "—";
  return {
    id: conv.guid,
    name: conv.name || conv.identifier || "(unknown)",
    lane: laneFor(conv),
    closeness: 3, // default outer ring; the user curates placement via circlePos
    age: daysSince(conv.last_date),
    last: who,
    unread: conv.unread,
    snippet,
    thread: [], // lazy-loaded when the conversation is opened
  };
}

// Tapback type (BlueBubbles associatedMessageType — numeric 2000-2005 / 3000-3005
// for add/remove, or the named value) -> emoji.
const REACTION_EMOJI: Record<string, string> = {
  "2000": "❤️", "2001": "👍", "2002": "👎", "2003": "😂", "2004": "‼️", "2005": "❓",
  love: "❤️", like: "👍", dislike: "👎", laugh: "😂", emphasize: "‼️", question: "❓",
};

/** Emoji for a reaction name ("love" -> "❤️"), for optimistic rendering. */
export function emojiForReaction(name: string): string | undefined {
  return REACTION_EMOJI[name];
}

function reactionEmoji(type: string | number | null): { emoji: string; removal: boolean } | null {
  if (type === null || type === undefined) return null;
  const s = String(type).trim();
  if (/^300[0-5]$/.test(s)) return { emoji: REACTION_EMOJI[String(Number(s) - 1000)], removal: true };
  if (s.startsWith("-")) {
    const e = REACTION_EMOJI[s.slice(1)];
    return e ? { emoji: e, removal: true } : null;
  }
  const e = REACTION_EMOJI[s];
  return e ? { emoji: e, removal: false } : null;
}

/** A reaction target like "p:0/GUID" -> "GUID". */
function targetGuid(ref: string): string {
  return ref.includes("/") ? ref.split("/").pop()! : ref;
}

export function hubThreadToMessages(msgs: HubMessage[]): Message[] {
  // Oldest-first (iCloud-synced histories arrive out of order).
  const sorted = [...msgs].sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const out: Message[] = [];
  const byGuid = new Map<string, Message>();
  const pending: { target: string; emoji: string; removal: boolean }[] = [];

  for (const m of sorted) {
    if (m.reaction_to) {
      // A tapback: attach it to its target bubble, never render it as its own.
      const r = reactionEmoji(m.reaction_type);
      if (r) pending.push({ target: targetGuid(m.reaction_to), emoji: r.emoji, removal: r.removal });
      continue;
    }
    const msg: Message = { guid: m.guid, from: m.from_me ? "me" : "them", text: m.text, time: dayLabel(m.date) };
    out.push(msg);
    byGuid.set(m.guid, msg);
  }

  for (const r of pending) {
    const target = byGuid.get(r.target);
    if (!target) continue;
    const set = new Set(target.reactions ?? []);
    if (r.removal) set.delete(r.emoji);
    else set.add(r.emoji);
    target.reactions = set.size ? [...set] : undefined;
  }
  return out;
}

/**
 * Collapse multiple chats for the same person (an iMessage *and* an SMS, or two
 * numbers) into one row. Input is assumed newest-first, so the first occurrence
 * of a resolved name — the most recent chat — is the one kept.
 */
export function dedupeContacts(contacts: Contact[]): Contact[] {
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const key = c.name.trim().toLowerCase();
    if (!key) return true; // keep unnamed rows as-is (can't tell them apart)
    if (seen.has(key)) return false; // a later duplicate of the same person
    seen.add(key);
    return true;
  });
}
