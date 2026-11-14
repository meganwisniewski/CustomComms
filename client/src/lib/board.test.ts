import { describe, it, expect } from "vitest";
import { normalizeBoard, addGroup, removeGroup } from "./board";
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

describe("addGroup / removeGroup", () => {
  const ppl = [person("a"), person("b")];

  it("inserts a new empty category before the catch-all group", () => {
    const board: Group[] = [{ name: "Fam", ids: [] }, { name: "Friends", ids: [] }];
    const out = addGroup(board, ppl, "Work");
    expect(out.map((g) => g.name)).toEqual(["Fam", "Work", "Friends"]);
    expect(out.find((g) => g.name === "Work")!.ids).toEqual([]);
    // strays still land in the last (catch-all) group, not the new one
    expect(out.find((g) => g.name === "Friends")!.ids.sort()).toEqual(["a", "b"]);
  });

  it("ignores blank and duplicate category names", () => {
    const board: Group[] = [{ name: "Fam", ids: [] }, { name: "Friends", ids: [] }];
    expect(addGroup(board, ppl, "  ").map((g) => g.name)).toEqual(["Fam", "Friends"]);
    expect(addGroup(board, ppl, "fam").map((g) => g.name)).toEqual(["Fam", "Friends"]);
  });

  it("removes a category and re-buckets its people", () => {
    const board: Group[] = [{ name: "Fam", ids: ["a"] }, { name: "Friends", ids: ["b"] }];
    const out = removeGroup(board, ppl, "Fam");
    expect(out.map((g) => g.name)).toEqual(["Friends"]);
    expect(out[0].ids.sort()).toEqual(["a", "b"]); // 'a' re-bucketed
  });

  it("won't remove the final group", () => {
    const board: Group[] = [{ name: "Only", ids: [] }];
    expect(removeGroup(board, ppl, "Only").map((g) => g.name)).toEqual(["Only"]);
  });
});
