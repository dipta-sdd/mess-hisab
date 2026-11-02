import { describe, expect, it } from "vitest";
import { centiToInput, MAX_DAY_CENTI, parseMealsToCenti } from "./centi";

const centi = (s: string, max?: number) => {
  const r = parseMealsToCenti(s, max);
  return r.ok ? r.centi : r.reason;
};

describe("parseMealsToCenti", () => {
  it.each([
    ["2", 200],
    ["2.5", 250],
    ["0.5", 50],
    ["0", 0],
    ["", 0],
    ["  1.0 ", 100],
    ["2.50", 250],
    ["২.৫", 250],
    ["10", 1000],
  ])("%j -> %i", (input, expected) => {
    expect(centi(input)).toBe(expected);
  });

  it.each([
    ["2.3", "step"],
    ["2.25", "step"],
    ["0.05", "step"],
    ["abc", "invalid"],
    ["-1", "invalid"],
    ["1,5", "invalid"],
    ["1.234", "invalid"],
    ["2.", "invalid"],
    ["11", "tooLarge"],
  ])("%j is rejected as %s", (input, reason) => {
    expect(centi(input)).toBe(reason);
  });

  it("allows up to the month maximum when asked", () => {
    expect(centi("310", 31000)).toBe(31000);
    expect(centi("311", 31000)).toBe("tooLarge");
    expect(MAX_DAY_CENTI).toBe(1000);
  });

  it("round-trips through the input string without floats", () => {
    for (const value of [0, 50, 100, 250, 1000, 31000]) {
      expect(centi(centiToInput(value), 31000)).toBe(value);
    }
    expect(centiToInput(250)).toBe("2.5");
    expect(centiToInput(200)).toBe("2");
  });
});
