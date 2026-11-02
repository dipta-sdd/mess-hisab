import { describe, expect, it } from "vitest";
import { safeNext } from "./next-path";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/12/expenses?month_id=3#x")).toBe("/12/expenses?month_id=3#x");
    expect(safeNext("/")).toBe("/");
  });

  it.each([
    null,
    "",
    "expenses",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/%0a/x\u0000",
    "javascript:alert(1)",
  ])("refuses %j", (value) => {
    expect(safeNext(value)).toBeNull();
  });
});
