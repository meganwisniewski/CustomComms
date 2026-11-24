import { describe, it, expect } from "vitest";
import { needsTurn, turnMarker } from "./turn";
import type { Contact } from "../types";

const c = (over: Partial<Contact> = {}): Contact => ({
  id: "a", name: "A", lane: "people", closeness: 3, age: 0, lastDate: 1000,
  last: "them", unread: false, snippet: "", thread: [], ...over,
});

describe("needsTurn", () => {
  it("is true when a person wrote last and it isn't handled", () => {
    expect(needsTurn(c(), {})).toBe(true);
  });

  it("is false once handled for the current message", () => {
    expect(needsTurn(c(), { a: 1000 })).toBe(false);
  });

  it("returns when a newer message arrives (handled marker goes stale)", () => {
    expect(needsTurn(c({ lastDate: 2000 }), { a: 1000 })).toBe(true);
  });

  it("is false when you wrote last, or it's a group/trail", () => {
    expect(needsTurn(c({ last: "you" }), {})).toBe(false);
    expect(needsTurn(c({ lane: "feed", last: "them" }), {})).toBe(false);
    expect(needsTurn(c({ lane: "trail", last: "them" }), {})).toBe(false);
  });

  it("turnMarker falls back to 0 without a date", () => {
    expect(turnMarker(c({ lastDate: null }))).toBe(0);
  });
});
