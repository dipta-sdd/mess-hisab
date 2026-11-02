import { describe, expect, it } from "vitest";
import { MAX_PAISA, paisaToTakaInput, parseTakaToPaisa } from "./money-input";

const paisa = (s: string) => {
  const r = parseTakaToPaisa(s);
  return r.ok ? r.paisa : r.reason;
};

describe("parseTakaToPaisa", () => {
  it.each([
    ["521.5", 52150],
    ["0.05", 5],
    ["1,000", 100000],
    ["500", 50000],
    ["  12.34 ", 1234],
    ["1,00,000.50", 10000050],
    ["007", 700],
    ["১,০০০.৫", 100050],
    ["0.1", 10],
  ])("%s -> %i", (input, expected) => {
    expect(paisa(input)).toBe(expected);
  });

  it("avoids float error", () => {
    expect(paisa("0.29")).toBe(29);
    expect(paisa("1.15")).toBe(115);
    expect(paisa("19.99")).toBe(1999);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["-5", "invalid"],
    ["+5", "invalid"],
    ["1.234", "invalid"],
    ["abc", "invalid"],
    ["1e3", "invalid"],
    [".5", "invalid"],
    ["5.", "invalid"],
    ["1.2.3", "invalid"],
    [",5", "invalid"],
    ["0", "zero"],
    ["0.00", "zero"],
    ["99999999999999", "tooLarge"],
    ["90000000000.01", "tooLarge"],
  ])("rejects %j as %s", (input, reason) => {
    expect(paisa(input)).toBe(reason);
  });

  it("accepts the API maximum", () => {
    expect(paisa("90000000000")).toBe(MAX_PAISA);
  });
});

describe("paisaToTakaInput", () => {
  it.each([
    [52150, "521.5"],
    [5, "0.05"],
    [50000, "500"],
    [1234, "12.34"],
  ])("%i -> %s", (input, expected) => {
    expect(paisaToTakaInput(input)).toBe(expected);
  });

  it("round-trips", () => {
    for (const p of [1, 5, 10, 99, 100, 52150, 100050]) expect(paisa(paisaToTakaInput(p))).toBe(p);
  });
});
