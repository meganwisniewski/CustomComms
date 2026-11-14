/**
 * Hub API client. Talks to the CustomComms hub (FastAPI on the Pi).
 *
 * Base URL: VITE_HUB_URL in dev (e.g. http://100.115.237.105:8000); empty in
 * production, where the hub serves this app same-origin. Token: VITE_HUB_TOKEN
 * is sent on write calls (the hub's /messages/* endpoints require it).
 */
const env = import.meta.env as unknown as Record<string, string | undefined>;
const BASE = (env.VITE_HUB_URL ?? "").replace(/\/$/, "");
const TOKEN = env.VITE_HUB_TOKEN ?? "";

function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["content-type"] = "application/json";
  if (TOKEN) h["X-Hub-Token"] = TOKEN;
  return h;
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { headers: authHeaders() });
  if (!r.ok) throw new Error(`GET ${path} -> HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} -> HTTP ${r.status}: ${await r.text().catch(() => "")}`);
  return r.json() as Promise<T>;
}

export interface HubConversation {
  guid: string;
  name: string;
  identifier: string | null;
  is_group: boolean;
  participants: string[];
  archived: boolean;
  filtered: boolean;
  last_message: { text: string; from_me: boolean; date: number | null; is_reaction: boolean } | null;
  last_date: number | null;
  unread: boolean;
}

export interface HubMessage {
  guid: string;
  text: string;
  from_me: boolean;
  date: number | null;
  delivered: boolean;
  read: boolean;
  handle: string | null;
  reply_to: string | null;
  effect: string | null;
  reaction_to: string | null;
  reaction_type: string | number | null;
  has_attachments: boolean;
}

export interface HubContact {
  id: string;
  name: string;
  handles: string[];
  avatar: string | null;
}

export const hub = {
  conversations: (limit = 40) => getJSON<HubConversation[]>(`/conversations?limit=${limit}`),
  messages: (guid: string, limit = 50) =>
    getJSON<HubMessage[]>(`/conversations/${encodeURIComponent(guid)}/messages?limit=${limit}`),
  contacts: () => getJSON<HubContact[]>(`/contacts`),
  send: (to: string, body: string, opts: Record<string, unknown> = {}) =>
    postJSON(`/messages/send`, { channel: "imessage", to, body, ...opts }),
  react: (to: string, target: string, reaction: string) =>
    postJSON(`/messages/react`, { channel: "imessage", to, target, reaction }),
};
