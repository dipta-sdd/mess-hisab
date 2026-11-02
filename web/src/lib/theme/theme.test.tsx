import { fireEvent, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { THEME_STORAGE_KEY, themeInitScript } from "./theme";
import { ThemeToggle } from "./theme-toggle";

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes("dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.unstubAllGlobals());

describe("theme head script", () => {
  it("follows the device when nothing is saved", () => {
    mockSystemDark(true);
    new Function(themeInitScript)();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("a saved choice beats the device setting", () => {
    mockSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(themeInitScript)();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("ThemeToggle", () => {
  it("switches to dark and remembers it, then back to light", async () => {
    mockSystemDark(false);
    renderWithProviders(<ThemeToggle />);
    const button = await screen.findByRole("button", { name: "Dark mode" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("title", "Switch to light mode");

    fireEvent.click(button);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("starts pressed when the device is dark", async () => {
    mockSystemDark(true);
    renderWithProviders(<ThemeToggle />);
    expect(await screen.findByRole("button", { name: "Dark mode" })).toHaveAttribute("aria-pressed", "true");
  });
});

/** Fixed Tailwind palette colours don't change in dark mode; use HeroUI tokens (surface, muted, danger…). */
describe("no fixed palette colours in components", () => {
  const RAW = /\b(?:bg|text|border|ring|divide|outline|fill|stroke|from|via|to|shadow|placeholder|decoration|accent|caret)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/g;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
  }

  it("finds none", () => {
    const hits = files(join(process.cwd(), "src")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(RAW)].map((m) => `${f.replace(process.cwd() + "/", "")}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});
