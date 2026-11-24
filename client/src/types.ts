export type LastWho = "them" | "you" | "group";
export type Lane = "people" | "feed" | "trail";
export type ViewId = "circles" | "board" | "focus" | "lanes";
export type Ring = 1 | 2 | 3;
export type Cadence = "weekly" | "2w" | "monthly" | "fewmonths" | "none";

export interface Message {
  /** BlueBubbles message GUID — needed to tapback or reply to this message. */
  guid?: string;
  from: "me" | "them";
  text: string;
  time: string;
  /** Tapback emoji on this message (❤️ 👍 👎 😂 ‼️ ❓). */
  reactions?: string[];
}

export interface Contact {
  id: string;
  name: string;
  emoji?: string;
  lane: Lane;
  closeness: Ring;
  /** days since the last message in the thread */
  age: number;
  /** last message time (ms epoch); used to tie a "handled" mark to that message */
  lastDate?: number | null;
  last: LastWho;
  unread: boolean;
  snippet: string;
  thread: Message[];
}

export interface Group {
  name: string;
  ids: string[];
}

export interface PersonMeta {
  cadence?: Cadence;
  birthday?: string;
  notes?: string;
  /** Free-form user tags, e.g. "work:Deloitte", "Sydney's husband", "book club". */
  tags?: string[];
}

export interface CirclePos {
  c: Ring;
  a: number; // angle in radians
}
