import { describe, expect, it } from "vitest";
import { parseMealsOrNull, parseTakaOrNull, scaledToInput, signedPaisa, splitSigned } from "./money";

describe("parseTakaOrNull", () => {
  it.each([
    ["521.5", 52150],
    ["0.05", 5],
    ["1,000", 100000],
    ["1,00,000", 10000000],
    ["0", 0],
    ["12", 1200],
    ["  7.25 ", 725],
    ["০.৫", 50],
    ["১,২৩৪.৫০", 123450],
    ["007", 700],
    ["19.99", 1999],
    ["0.1", 10],
  ])("%s -> %d", (input, expected) => {
    expect(parseTakaOrNull(input)).toBe(expected);
  });

  it.each(["", "  ", "abc", "-5", "1.234", "1.2.3", "1,", ",1", ".5", "5.", "1e3", "৳500", "12 34", "99999999999999"])(
    "rejects %j",
    (input) => {
      expect(parseTakaOrNull(input)).toBeNull();
    },
  );

  it("is exact where floats are not", () => {
    expect(parseTakaOrNull("1.15")).toBe(115);
    expect(parseTakaOrNull("0.29")).toBe(29);
    expect(parseTakaOrNull("4.35")).toBe(435);
  });
});

describe("parseMealsOrNull", () => {
  it("converts meals to centi-meals", () => {
    expect(parseMealsOrNull("2.5")).toBe(250);
    expect(parseMealsOrNull("0.5")).toBe(50);
    expect(parseMealsOrNull("20")).toBe(2000);
    expect(parseMealsOrNull("0.255")).toBeNull();
  });
});

describe("scaledToInput / signedPaisa", () => {
  it("formats for editing", () => {
    expect(scaledToInput(52150)).toBe("521.5");
    expect(scaledToInput(5)).toBe("0.05");
    expect(scaledToInput(50000)).toBe("500");
    expect(scaledToInput(0)).toBe("0");
  });

  it("signs by direction (positive = credit, negative = due)", () => {
    expect(signedPaisa(50000, "credit")).toBe(50000);
    expect(signedPaisa(50000, "owes")).toBe(-50000);
    expect(Object.is(signedPaisa(0, "owes"), 0)).toBe(true);
  });

  it("splits a signed value back", () => {
    expect(splitSigned(-1550)).toEqual({ amount: "15.5", direction: "owes" });
    expect(splitSigned(200)).toEqual({ amount: "2", direction: "credit" });
  });
});
