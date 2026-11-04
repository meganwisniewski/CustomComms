export type LastWho = "them" | "you" | "group";
export type Lane = "people" | "feed" | "trail";
export type ViewId = "circles" | "board" | "focus" | "lanes";
export type Ring = 1 | 2 | 3;
export type Cadence = "weekly" | "2w" | "monthly" | "fewmonths" | "none";

export interface Message {
  from: "me" | "them";
  text: string;
  time: string;
}

export interface Contact {
  id: string;
  name: string;
  emoji?: string;
  lane: Lane;
  closeness: Ring;
  /** days since the last message in the thread */
  age: number;
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
}

export interface CirclePos {
  c: Ring;
  a: number; // angle in radians
}
