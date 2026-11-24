import { describe, it, expect } from "vitest";
import { convToContact, hubThreadToMessages, dedupeContacts, daysSince, mergePendingSends } from "./adapt";
import type { Message } from "../types";
import type { HubConversation, HubMessage } from "./hub";
import type { Contact } from "../types";

const conv = (over: Partial<HubConversation> = {}): HubConversation => ({
  guid: "iMessage;-;+15551230001",
  name: "Alex Doe",
  identifier: "+15551230001",
  is_group: false,
  participants: ["+15551230001"],
  archived: false,
  filtered: false,
  last_message: { text: "hey", from_me: false, date: 1_700_000_000_000, is_reaction: false },
  last_date: 1_700_000_000_000,
  unread: true,
  ...over,
});

const msg = (over: Partial<HubMessage>): HubMessage => ({
  guid: "g", text: "", from_me: false, date: 0, delivered: true, read: false, handle: null,
  reply_to: null, effect: null, reaction_to: null, reaction_type: null, has_attachments: false,
  ...over,
});

const person = (id: string, name: string): Contact => ({
  id, name, lane: "people", closeness: 3, age: 0, last: "them", unread: false, snippet: "", thread: [],
});

describe("convToContact", () => {
  it("maps a 1:1 human to the people lane", () => {
    const c = convToContact(conv());
    expect(c.lane).toBe("people");
    expect(c.name).toBe("Alex Doe");
    expect(c.last).toBe("them");
    expect(c.unread).toBe(true);
    expect(c.snippet).toBe("hey");
    expect(c.id).toBe("iMessage;-;+15551230001");
  });

  it("prefixes 'You:' when the last message is from me", () => {
    const c = convToContact(conv({ last_message: { text: "ok", from_me: true, date: 1, is_reaction: false } }));
    expect(c.last).toBe("you");
    expect(c.snippet).toBe("You: ok");
  });

  it("routes groups to the feed lane with last='group'", () => {
    const c = convToContact(conv({ is_group: true, participants: ["+1", "+2"], name: "A, B" }));
    expect(c.lane).toBe("feed");
    expect(c.last).toBe("group");
  });

  it("routes numeric shortcodes to the trail lane", () => {
    expect(convToContact(conv({ identifier: "68805", name: "68805" })).lane).toBe("trail");
  });

  it("shows a reaction preview without a 'You:' prefix", () => {
    const c = convToContact(conv({ last_message: { text: 'Loved "x"', from_me: true, date: 1, is_reaction: true } }));
    expect(c.snippet).toBe('Loved "x"');
  });

  it("handles an empty conversation (no last message)", () => {
    const c = convToContact(conv({ last_message: null, last_date: null }));
    expect(c.snippet).toBe("—");
    expect(c.age).toBe(0);
  });
});

describe("hubThreadToMessages", () => {
  it("sorts out-of-order messages chronologically (iCloud sync order)", () => {
    const out = hubThreadToMessages([
      msg({ text: "third", date: 300 }),
      msg({ text: "first", date: 100, from_me: true }),
      msg({ text: "second", date: 200 }),
    ]);
    expect(out.map((m) => m.text)).toEqual(["first", "second", "third"]);
    expect(out[0].from).toBe("me");
  });

  it("tolerates null dates without throwing", () => {
    const out = hubThreadToMessages([msg({ text: "a", date: null }), msg({ text: "b", date: 100 })]);
    expect(out).toHaveLength(2);
  });

  it("attaches tapbacks to their target bubble and hides the reaction message", () => {
    const out = hubThreadToMessages([
      msg({ guid: "base", text: "hello", date: 100 }),
      msg({ guid: "rx", text: 'Loved "hello"', date: 200, reaction_to: "p:0/base", reaction_type: "love" }),
      msg({ guid: "rx2", text: "Emphasized", date: 250, reaction_to: "base", reaction_type: 2004 }),
    ]);
    expect(out).toHaveLength(1); // reaction messages are not their own bubbles
    expect(out[0].text).toBe("hello");
    expect(out[0].guid).toBe("base"); // carried through so the UI can react/reply
    expect(out[0].reactions).toEqual(["❤️", "‼️"]);
  });

  it("removes a tapback when a 3000-range removal arrives", () => {
    const out = hubThreadToMessages([
      msg({ guid: "base", text: "hi", date: 100 }),
      msg({ guid: "a", text: "x", date: 200, reaction_to: "base", reaction_type: 2000 }),
      msg({ guid: "b", text: "x", date: 300, reaction_to: "base", reaction_type: 3000 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].reactions).toBeUndefined();
  });
});

describe("dedupeContacts", () => {
  it("collapses duplicate names, keeping the first (most recent)", () => {
    const out = dedupeContacts([
      person("g1", "Kurt Schoffstall"),
      person("g2", "Kurt Schoffstall"),
      person("g3", "Beth"),
    ]);
    expect(out.map((c) => c.id)).toEqual(["g1", "g3"]);
  });

  it("is case-insensitive and whitespace-insensitive", () => {
    const out = dedupeContacts([person("g1", "kurt "), person("g2", "KURT"), person("g3", "Ryan")]);
    expect(out.map((c) => c.id)).toEqual(["g1", "g3"]);
  });

  it("keeps unnamed rows as distinct", () => {
    expect(dedupeContacts([person("g1", ""), person("g2", "")])).toHaveLength(2);
  });
});

describe("mergePendingSends", () => {
  const m = (text: string, from: "me" | "them", guid?: string): Message => ({ text, from, time: "Today", guid });

  it("keeps an optimistic sent bubble the server hasn't indexed yet", () => {
    const server = [m("hi", "them", "g1")];
    const current = [m("hi", "them", "g1"), m("on my way", "me")]; // optimistic, no guid
    const out = mergePendingSends(server, current);
    expect(out.map((x) => x.text)).toEqual(["hi", "on my way"]);
  });

  it("drops the optimistic bubble once the real message arrives", () => {
    const server = [m("hi", "them", "g1"), m("on my way", "me", "g2")];
    const current = [m("hi", "them", "g1"), m("on my way", "me")]; // optimistic dup
    const out = mergePendingSends(server, current);
    expect(out.filter((x) => x.text === "on my way")).toHaveLength(1);
    expect(out[1].guid).toBe("g2"); // the real one, not the optimistic
  });

  it("ignores server-side (guid'd) and inbound messages as pending", () => {
    const server: Message[] = [];
    const current = [m("theirs", "them"), m("real", "me", "g9")];
    expect(mergePendingSends(server, current)).toEqual([]);
  });
});

describe("daysSince", () => {
  it("is 0 for null and non-negative otherwise", () => {
    expect(daysSince(null)).toBe(0);
    expect(daysSince(Date.now() - 2 * 86_400_000)).toBe(2);
  });
});
