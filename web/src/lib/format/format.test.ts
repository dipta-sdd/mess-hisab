import { describe, expect, it } from "vitest";
import { formatBalance, formatDate, formatMeals, formatMoney, formatNumber, toBanglaDigits } from "./index";

describe("toBanglaDigits", () => {
  it("converts digits only", () => {
    expect(toBanglaDigits("0123456789")).toBe("০১২৩৪৫৬৭৮৯");
    expect(toBanglaDigits("৳1,00,000.50")).toBe("৳১,০০,০০০.৫০");
    expect(toBanglaDigits(42)).toBe("৪২");
  });
});

describe("formatNumber", () => {
  it("groups South-Asian", () => {
    expect(formatNumber(0, "en")).toBe("0");
    expect(formatNumber(999, "en")).toBe("999");
    expect(formatNumber(1000, "en")).toBe("1,000");
    expect(formatNumber(100000, "en")).toBe("1,00,000");
    expect(formatNumber(12345678, "en")).toBe("1,23,45,678");
    expect(formatNumber(-100000, "en")).toBe("-1,00,000");
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber("1234567", "en")).toBe("12,34,567");
  });
  it("uses Bangla digits for bn", () => {
    expect(formatNumber(100000, "bn")).toBe("১,০০,০০০");
  });
});

describe("formatMoney", () => {
  it("two decimals shows paisa", () => {
    expect(formatMoney(0, "en", "two_decimals")).toBe("৳0.00");
    expect(formatMoney(5, "en", "two_decimals")).toBe("৳0.05");
    expect(formatMoney(123450, "en", "two_decimals")).toBe("৳1,234.50");
    expect(formatMoney(10000000, "en", "two_decimals")).toBe("৳1,00,000.00");
    expect(formatMoney(-52115, "en", "two_decimals")).toBe("-৳521.15");
  });
  it("whole_taka rounds half away from zero", () => {
    expect(formatMoney(52100, "en", "whole_taka")).toBe("৳521");
    expect(formatMoney(52149, "en", "whole_taka")).toBe("৳521");
    expect(formatMoney(52150, "en", "whole_taka")).toBe("৳522");
    expect(formatMoney(-52150, "en", "whole_taka")).toBe("-৳522");
  });
  it("round_up rounds any remainder up", () => {
    expect(formatMoney(52115, "en", "round_up")).toBe("৳522");
    expect(formatMoney(52100, "en", "round_up")).toBe("৳521");
    expect(formatMoney(-52101, "en", "round_up")).toBe("-৳522");
  });
  it("groups lakh and crore", () => {
    expect(formatMoney(10000000, "en", "whole_taka")).toBe("৳1,00,000");
    expect(formatMoney(100000000000, "en", "whole_taka")).toBe("৳1,00,00,00,000");
    expect(formatMoney(99900, "en", "whole_taka")).toBe("৳999");
    expect(formatMoney(100000, "en", "whole_taka")).toBe("৳1,000");
  });
  it("never shows -0", () => {
    expect(formatMoney(-20, "en", "whole_taka")).toBe("৳0");
    expect(formatMoney(0, "en", "whole_taka")).toBe("৳0");
  });
  it("uses Bangla digits for bn", () => {
    expect(formatMoney(10000050, "bn", "two_decimals")).toBe("৳১,০০,০০০.৫০");
    expect(formatMoney(-40000, "bn", "whole_taka")).toBe("-৳৪০০");
  });
  it("is exact for large integers (no float drift)", () => {
    expect(formatMoney(900719925474099, "en", "two_decimals")).toBe("৳90,07,19,92,54,740.99");
  });
});

describe("formatMeals", () => {
  it("renders centi-meals", () => {
    expect(formatMeals(250, "en")).toBe("2.5");
    expect(formatMeals(200, "en")).toBe("2");
    expect(formatMeals(205, "en")).toBe("2.05");
    expect(formatMeals(5, "en")).toBe("0.05");
    expect(formatMeals(0, "en")).toBe("0");
    expect(formatMeals(-150, "en")).toBe("-1.5");
    expect(formatMeals(1234550, "en")).toBe("12,345.5");
    expect(formatMeals(250, "bn")).toBe("২.৫");
  });
});

describe("formatDate", () => {
  it("formats date-only strings without timezone shift", () => {
    expect(formatDate("2026-11-02", "en")).toBe("2 Nov 2026");
    expect(formatDate("2026-01-31", "en")).toBe("31 Jan 2026");
  });
  it("formats Bangla", () => {
    const out = formatDate("2026-11-02", "bn");
    expect(out).toContain("২০২৬");
    expect(out).toContain("নভেম্বর");
  });
  it("shows timestamps in Asia/Dhaka", () => {
    // 20:00 UTC on 1 Nov is already 2 Nov in Dhaka (UTC+6)
    expect(formatDate("2026-11-01T20:00:00Z", "en")).toBe("2 Nov 2026");
    expect(formatDate("2026-11-01T17:59:00Z", "en")).toBe("1 Nov 2026");
  });
  it("returns input for garbage", () => {
    expect(formatDate("nope", "en")).toBe("nope");
  });
});

describe("formatBalance", () => {
  const t = (key: "balance.due" | "balance.credit" | "balance.settled", v: { amount: string }) =>
    ({ "balance.due": `Due ${v.amount}`, "balance.credit": `Credit ${v.amount}`, "balance.settled": "Settled" })[key];
  it("negative is due, positive is credit", () => {
    expect(formatBalance(-40000, "en", "whole_taka", t)).toBe("Due ৳400");
    expect(formatBalance(70000, "en", "whole_taka", t)).toBe("Credit ৳700");
    expect(formatBalance(0, "en", "whole_taka", t)).toBe("Settled");
  });
});
