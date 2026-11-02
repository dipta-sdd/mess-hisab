import { expect } from "vitest";

/** Fixture data (member, category and mess names, notes) that is user content, not UI copy. Longest first. */
export const FIXTURE_WORDS = [
  "November rent", "Rohu fish", "Old Timer", "Rahim", "Karim", "Salma", "Nilu", "Rina", "Rent", "Gas", "Fish", "Green",
];

const ATTRS = ["aria-label", "title", "placeholder", "alt", "aria-description"];

/** Visible text plus the user-facing attributes (aria-label, title, placeholder, alt) of everything under root. */
export function collectUserText(root: ParentNode = document.body): string[] {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = (node as Text).parentElement;
    if (parent && ["SCRIPT", "STYLE"].includes(parent.tagName)) continue;
    const text = node.textContent?.trim();
    if (text) parts.push(text);
  }
  for (const el of Array.from(root.querySelectorAll("*"))) {
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (value?.trim()) parts.push(value.trim());
    }
  }
  return parts;
}

/**
 * Guards a Bangla render: no Latin letters (outside fixture data in `allow`) and no ASCII digits
 * anywhere user-visible. Catches hard-coded English and numbers that skipped lib/format.
 */
export function expectBanglaOnly(allow: string[] = [], root: ParentNode = document.body) {
  const offenders = collectUserText(root).filter((text) => {
    let rest = text;
    for (const word of [...allow, ...FIXTURE_WORDS]) rest = rest.split(word).join("");
    return /[A-Za-z0-9]/.test(rest);
  });
  expect(offenders).toEqual([]);
}
