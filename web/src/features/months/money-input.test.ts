import { describe, expect, it } from "vitest";
import { parseTakaToPaisa } from "./money-input";

describe("parseTakaToPaisa", () => {
  it("parses taka strings without float maths", () => {
    expect(parseTakaToPaisa("521.5")).toEqual({ ok: true, paisa: 52150 });
    expect(parseTakaToPaisa("1,000")).toEqual({ ok: true, paisa: 100000 });
    expect(parseTakaToPaisa("০.০৫")).toEqual({ ok: true, paisa: 5 });
    expect(parseTakaToPaisa("1050.10")).toEqual({ ok: true, paisa: 105010 });
  });
  it("refuses bad input", () => {
    expect(parseTakaToPaisa("")).toEqual({ ok: false, reason: "empty" });
    expect(parseTakaToPaisa("1.234")).toEqual({ ok: false, reason: "invalid" });
    expect(parseTakaToPaisa("-5")).toEqual({ ok: false, reason: "invalid" });
    expect(parseTakaToPaisa("0")).toEqual({ ok: false, reason: "zero" });
    expect(parseTakaToPaisa("0", { allowZero: true })).toEqual({ ok: true, paisa: 0 });
    expect(parseTakaToPaisa("99999999999999")).toEqual({ ok: false, reason: "tooLarge" });
  });
});
