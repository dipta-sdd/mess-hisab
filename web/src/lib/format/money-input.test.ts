import { describe, expect, it } from "vitest";
import { centiToInput, MAX_PAISA, paisaToTakaInput, parseMealsToCenti, parseTakaToPaisa } from "./money-input";

const paisa = (s: string, options?: Parameters<typeof parseTakaToPaisa>[1]) => {
  const r = parseTakaToPaisa(s, options);
  return r.ok ? r.paisa : r.reason;
};

describe("parseTakaToPaisa", () => {
  it.each([
    ["521.5", 52150],
    ["0.05", 5],
    ["0.5", 50],
    ["10", 1000],
    ["1,000", 100000],
    ["1,000.25", 100025],
    ["500", 50000],
    ["  12.34 ", 1234],
    ["1,00,000.50", 10000050],
    ["007", 700],
    ["0007", 700],
    ["১,০০০.৫", 100050],
    ["০.০৫", 5],
    ["0.1", 10],
  ])("%j -> %i", (input, expected) => {
    expect(paisa(input)).toBe(expected);
  });

  it("avoids float error", () => {
    expect(paisa("0.07")).toBe(7);
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
    ["1,", "invalid"],
    ["1,,000", "invalid"],
    ["৳500", "invalid"],
    ["1 000", "invalid"],
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

  it("allowZero accepts 0 but still rejects bad input", () => {
    expect(parseTakaToPaisa("0", { allowZero: true })).toEqual({ ok: true, paisa: 0 });
    expect(parseTakaToPaisa("0.00", { allowZero: true })).toEqual({ ok: true, paisa: 0 });
    expect(paisa("", { allowZero: true })).toBe("empty");
    expect(paisa("-1", { allowZero: true })).toBe("invalid");
  });

  it("max can be lifted", () => {
    expect(paisa("90000000000.01", { max: Number.MAX_SAFE_INTEGER })).toBe(9_000_000_000_001);
    expect(paisa("99999999999999", { max: Number.MAX_SAFE_INTEGER })).toBe("tooLarge"); // still capped at 13 whole digits
  });
});

describe("paisaToTakaInput / centiToInput", () => {
  it.each([
    [52150, "521.5"],
    [5, "0.05"],
    [50000, "500"],
    [1234, "12.34"],
    [0, "0"],
  ])("%i -> %s", (input, expected) => {
    expect(paisaToTakaInput(input)).toBe(expected);
  });

  it("round-trips", () => {
    for (const p of [0, 1, 5, 10, 99, 100, 1999, 52150, 100025, 100050]) {
      expect(paisa(paisaToTakaInput(p), { allowZero: true })).toBe(p);
    }
  });

  it("centiToInput formats meals", () => {
    expect(centiToInput(1250)).toBe("12.5");
    expect(centiToInput(2000)).toBe("20");
  });
});

describe("parseMealsToCenti", () => {
  it("parses to centi-meals with string math", () => {
    expect(parseMealsToCenti("20")).toEqual({ ok: true, centi: 2000 });
    expect(parseMealsToCenti("12.5")).toEqual({ ok: true, centi: 1250 });
    expect(parseMealsToCenti("12.25")).toEqual({ ok: true, centi: 1225 });
    expect(parseMealsToCenti("০.৫")).toEqual({ ok: true, centi: 50 });
    expect(parseMealsToCenti("")).toEqual({ ok: false, reason: "empty" });
    expect(parseMealsToCenti("x")).toEqual({ ok: false, reason: "invalid" });
    expect(parseMealsToCenti("1.234")).toEqual({ ok: false, reason: "invalid" });
    expect(parseMealsToCenti("10001")).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("max and maxWholeDigits can be lifted", () => {
    expect(parseMealsToCenti("1234567", { max: Number.MAX_SAFE_INTEGER, maxWholeDigits: 13 })).toEqual({ ok: true, centi: 123456700 });
  });
});
