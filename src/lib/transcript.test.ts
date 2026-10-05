import { describe, expect, it } from "vitest";
import { tailWords } from "./transcript";

describe("tailWords", () => {
  it("returns short text unchanged", () => {
    expect(tailWords("hello world", 20)).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(tailWords("  hello \n  world ", 20)).toBe("hello world");
  });

  it("keeps whole trailing words within the budget", () => {
    const result = tailWords("the quick brown fox jumps over the lazy dog", 20);
    expect(result).toBe("…over the lazy dog");
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("truncates a single overlong word from the left", () => {
    expect(tailWords("supercalifragilistic", 8)).toBe("…ilistic");
  });

  it("returns empty for empty input", () => {
    expect(tailWords("   ", 10)).toBe("");
  });
});
