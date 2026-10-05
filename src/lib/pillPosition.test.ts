import { describe, expect, it } from "vitest";
import { resolvePillPosition } from "./pillPosition";

const size = { width: 240, height: 56 };
const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const right = { x: 1920, y: 0, width: 1280, height: 984 };

describe("resolvePillPosition", () => {
  it("defaults to bottom-center of the primary work area", () => {
    expect(resolvePillPosition(null, size, [primary], primary)).toEqual({
      x: 840,
      y: 1040 - 56 - 64,
    });
  });

  it("keeps a saved position that is fully on screen", () => {
    const saved = { x: 2200, y: 300 };
    expect(resolvePillPosition(saved, size, [primary, right], primary)).toEqual(
      saved,
    );
  });

  it("clamps a partly off-screen position back onto its monitor", () => {
    expect(
      resolvePillPosition({ x: 1800, y: 1020 }, size, [primary], primary),
    ).toEqual({ x: 1680, y: 984 });
  });

  it("falls back to the default when the saved monitor is gone", () => {
    expect(
      resolvePillPosition({ x: 2200, y: 300 }, size, [primary], primary),
    ).toEqual({ x: 840, y: 920 });
  });

  it("returns the saved point when no monitors are reported", () => {
    expect(resolvePillPosition({ x: 5, y: 6 }, size, [], null)).toEqual({
      x: 5,
      y: 6,
    });
  });
});
