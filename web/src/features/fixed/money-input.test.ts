import { describe, expect, it } from "vitest";
import { centiToInput, paisaToTakaInput, parseMealsToCenti, parseTakaToPaisa } from "./money-input";

const paisa = (s: string) => {
  const r = parseTakaToPaisa(s);
  return r.ok ? r.paisa : r.reason;
};

describe("parseTakaToPaisa", () => {
  it.each([
    ["0.5", 50],
    ["10", 1000],
    ["1,000.25", 100025],
    ["0", 0],
    ["500.5", 50050],
    ["12.05", 1205],
    ["০.৫", 50],
    ["১,০০০", 100000],
    ["  7  ", 700],
    ["0007", 700],
  ])("%j -> %i paisa", (input, expected) => {
    expect(paisa(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["abc", "invalid"],
    ["1.234", "invalid"],
    ["-5", "invalid"],
    ["1e3", "invalid"],
    ["5.", "invalid"],
    [".5", "invalid"],
    ["1 000", "invalid"],
    ["99999999999999", "tooLarge"],
    ["90000000001", "tooLarge"],
  ])("%j is rejected as %s", (input, reason) => {
    expect(paisa(input)).toBe(reason);
  });

  it("does not suffer float drift", () => {
    expect(paisa("0.07")).toBe(7);
    expect(paisa("1.15")).toBe(115);
    expect(paisa("19.99")).toBe(1999);
  });
});

describe("paisaToTakaInput", () => {
  it("formats for editing and round-trips", () => {
    expect(paisaToTakaInput(52150)).toBe("521.5");
    expect(paisaToTakaInput(5)).toBe("0.05");
    expect(paisaToTakaInput(50000)).toBe("500");
    for (const p of [0, 5, 50, 100025, 1999]) expect(paisa(paisaToTakaInput(p))).toBe(p);
  });
});

describe("minimum meals", () => {
  it("parses to centi-meals with string math", () => {
    expect(parseMealsToCenti("20")).toEqual({ ok: true, centi: 2000 });
    expect(parseMealsToCenti("12.5")).toEqual({ ok: true, centi: 1250 });
    expect(parseMealsToCenti("12.25")).toEqual({ ok: true, centi: 1225 });
    expect(parseMealsToCenti("")).toEqual({ ok: false, reason: "empty" });
    expect(parseMealsToCenti("x")).toEqual({ ok: false, reason: "invalid" });
    expect(parseMealsToCenti("1.234")).toEqual({ ok: false, reason: "invalid" });
    expect(parseMealsToCenti("10001")).toEqual({ ok: false, reason: "tooLarge" });
    expect(centiToInput(1250)).toBe("12.5");
    expect(centiToInput(2000)).toBe("20");
  });
});
