import { describe, it, expect } from "vitest";
import { normalizeBoard } from "./board";
import type { Contact, Group } from "../types";

const person = (id: string): Contact => ({
  id, name: id, lane: "people", closeness: 3, age: 0, last: "them", unread: false, snippet: "", thread: [],
});

describe("normalizeBoard", () => {
  it("appends people in no group to the last group", () => {
    const board: Group[] = [{ name: "Fam", ids: [] }, { name: "Friends", ids: [] }];
    const out = normalizeBoard(board, [person("a"), person("b")]);
    expect(out.find((g) => g.name === "Friends")!.ids.sort()).toEqual(["a", "b"]);
    expect(out.find((g) => g.name === "Fam")!.ids).toEqual([]);
  });

  it("drops ids that aren't known people", () => {
    const board: Group[] = [{ name: "Fam", ids: ["ghost"] }, { name: "Friends", ids: [] }];
    const out = normalizeBoard(board, [person("a")]);
    expect(out.find((g) => g.name === "Fam")!.ids).toEqual([]);
    expect(out.find((g) => g.name === "Friends")!.ids).toEqual(["a"]);
  });

  it("keeps each person in exactly one group", () => {
    const board: Group[] = [{ name: "Fam", ids: ["a"] }, { name: "Friends", ids: [] }];
    const out = normalizeBoard(board, [person("a"), person("b")]);
    const all = out.flatMap((g) => g.ids);
    expect(all.filter((x) => x === "a")).toHaveLength(1);
    expect(all.sort()).toEqual(["a", "b"]);
  });
});
