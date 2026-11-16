import { describe, expect, it } from "vitest";
import { diffLines, hasChanges } from "@/diff";

describe("diffLines", () => {
  it("finds no difference between two identical snapshots", () => {
    const diff = diffLines(["a", "b", "c"], ["a", "b", "c"]);
    expect(diff).toEqual({ added: [], removed: [] });
    expect(hasChanges(diff)).toBe(false);
  });

  it("finds a line added in the middle", () => {
    expect(diffLines(["a", "c"], ["a", "b", "c"])).toEqual({ added: ["b"], removed: [] });
  });

  it("finds a removed line", () => {
    expect(diffLines(["a", "b", "c"], ["a", "c"])).toEqual({ added: [], removed: ["b"] });
  });

  it("reports an edited line as one removed and one added", () => {
    expect(diffLines(["Version 24.0", "LTS"], ["Version 24.1", "LTS"])).toEqual({
      added: ["Version 24.1"],
      removed: ["Version 24.0"],
    });
  });

  it("does not treat a repeated line that stays as a change", () => {
    const diff = diffLines(["x", "same", "y", "same"], ["same", "y", "same", "z"]);
    expect(diff).toEqual({ added: ["z"], removed: ["x"] });
  });

  it("reports a line that moved", () => {
    expect(diffLines(["a", "b", "c"], ["b", "c", "a"])).toEqual({ added: ["a"], removed: ["a"] });
  });

  it("handles an empty snapshot on either side", () => {
    expect(diffLines([], ["a"])).toEqual({ added: ["a"], removed: [] });
    expect(diffLines(["a"], [])).toEqual({ added: [], removed: ["a"] });
  });

  it("stays correct for large snapshots that take the coarse path", () => {
    const before = Array.from({ length: 2500 }, (_, i) => `old ${i}`);
    const after = [...Array.from({ length: 2500 }, (_, i) => `new ${i}`), "old 7"];

    const diff = diffLines(before, after);

    expect(diff.added).toHaveLength(2500);
    expect(diff.removed).toHaveLength(2499);
    expect(diff.removed).not.toContain("old 7");
  });
});
