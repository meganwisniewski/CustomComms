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

export function hubThreadToMessages(msgs: HubMessage[]): Message[] {
  // The hub returns newest-first; the conversation panel renders oldest-first.
  return [...msgs].reverse().map((m) => ({
    from: m.from_me ? "me" : "them",
    text: m.text,
    time: dayLabel(m.date),
  }));
}
