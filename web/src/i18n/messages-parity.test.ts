import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { loadMessages } from "./load-messages";

type Tree = { [key: string]: string | Tree };

/** Words that legitimately stay Latin / identical in Bangla. */
const BRAND_ALLOW = new Set(["Mess Hisab", "Excel", "Google", "CSV", "PDF"]);

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

type Arg = { type: string; arms: string[] };

/** Minimal ICU scanner: argument names, their type and select/plural arm keys (nested arms included). */
function scan(message: string, found: Map<string, Arg> = new Map()): Map<string, Arg> {
  let i = 0;
  while (i < message.length) {
    if (message[i] !== "{") {
      i++;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    while (j < message.length && depth > 0) {
      if (message[j] === "{") depth++;
      else if (message[j] === "}") depth--;
      j++;
    }
    const inner = message.slice(i + 1, j - 1);
    const firstComma = inner.indexOf(",");
    if (firstComma === -1) {
      const name = inner.trim();
      if (!found.has(name)) found.set(name, { type: "simple", arms: [] });
    } else {
      const name = inner.slice(0, firstComma).trim();
      const rest = inner.slice(firstComma + 1);
      const secondComma = rest.indexOf(",");
      const type = (secondComma === -1 ? rest : rest.slice(0, secondComma)).trim();
      const arms: string[] = [];
      if (secondComma !== -1 && (type === "plural" || type === "select" || type === "selectordinal")) {
        const body = rest.slice(secondComma + 1);
        let k = 0;
        while (k < body.length) {
          const open = body.indexOf("{", k);
          if (open === -1) break;
          const key = body.slice(k, open).trim();
          let d = 1;
          let m = open + 1;
          while (m < body.length && d > 0) {
            if (body[m] === "{") d++;
            else if (body[m] === "}") d--;
            m++;
          }
          arms.push(key);
          scan(body.slice(open + 1, m - 1), found);
          k = m;
        }
      }
      const prev = found.get(name);
      found.set(name, { type, arms: [...new Set([...(prev?.arms ?? []), ...arms])] });
    }
    i = j;
  }
  return found;
}

const en = loadMessages("en") as Record<string, Tree>;
const bn = loadMessages("bn") as Record<string, Tree>;
const namespaces = Object.keys(en);

describe("messages parity (en vs bn)", () => {
  it("has the same namespaces", () => {
    expect(Object.keys(bn).sort()).toEqual([...namespaces].sort());
  });

  describe.each(namespaces)("%s", (ns) => {
    const e = flatten(en[ns] ?? {});
    const b = flatten(bn[ns] ?? {});

    it("has the same keys", () => {
      expect(Object.keys(b).sort()).toEqual(Object.keys(e).sort());
    });

    it("has the same ICU arguments, types and select arms", () => {
      const problems: string[] = [];
      for (const key of Object.keys(e)) {
        if (b[key] === undefined) continue;
        const ea = scan(e[key]);
        const ba = scan(b[key]);
        if ([...ea.keys()].sort().join() !== [...ba.keys()].sort().join()) {
          problems.push(`${key}: args en={${[...ea.keys()]}} bn={${[...ba.keys()]}}`);
          continue;
        }
        for (const [name, arg] of ea) {
          const other = ba.get(name)!;
          if (arg.type !== other.type) problems.push(`${key}.${name}: type ${arg.type} vs ${other.type}`);
          if (arg.type === "select" && [...arg.arms].sort().join() !== [...other.arms].sort().join()) {
            problems.push(`${key}.${name}: select arms differ`);
          }
          if ((arg.type === "plural" || arg.type === "selectordinal") && !other.arms.includes("other")) {
            problems.push(`${key}.${name}: bn plural lacks "other"`);
          }
        }
      }
      expect(problems).toEqual([]);
    });

    it("has non-empty bn values that are translated", () => {
      const problems: string[] = [];
      for (const [key, value] of Object.entries(b)) {
        const english = e[key];
        if (!value || !value.trim()) problems.push(`${key}: empty`);
        else if (value === english && /[A-Za-z]/.test(english) && !BRAND_ALLOW.has(english)) {
          problems.push(`${key}: identical to English`);
        }
      }
      expect(problems).toEqual([]);
    });

    it("has no Latin letters in bn prose (outside ICU syntax)", () => {
      const problems: string[] = [];
      for (const [key, value] of Object.entries(b)) {
        // Strip ICU argument names/keywords: anything inside braces up to the first arm body.
        const prose = value
          .replace(/\{[A-Za-z_][A-Za-z0-9_]*\s*,\s*(?:plural|select|selectordinal)\s*,/g, "{")
          .replace(/\b(?:other|one|zero|two|few|many)\s*\{/g, "{")
          .replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, "");
        if (/[A-Za-z]/.test(prose) && !BRAND_ALLOW.has(value)) problems.push(`${key}: ${value}`);
      }
      expect(problems).toEqual([]);
    });

    it.each(["en", "bn"] as const)("compiles every %s message without ICU errors", (locale) => {
      const tree = locale === "en" ? e : b;
      const errors: string[] = [];
      const translator = createTranslator({
        locale,
        messages: locale === "en" ? en : bn,
        onError: (error) => errors.push(error.message),
        getMessageFallback: ({ key }) => key,
      });
      for (const [key, value] of Object.entries(tree)) {
        const values: Record<string, string | number | Date> = {};
        for (const [name, arg] of scan(value)) {
          if (arg.type === "plural" || arg.type === "number" || arg.type === "selectordinal") values[name] = 3;
          else if (arg.type === "select") values[name] = arg.arms.find((a) => a !== "other") ?? "other";
          else if (arg.type === "date" || arg.type === "time") values[name] = new Date(0);
          else values[name] = "x";
        }
        translator(`${ns}.${key}` as never, values as never);
      }
      expect(errors).toEqual([]);
    });
  });
});
