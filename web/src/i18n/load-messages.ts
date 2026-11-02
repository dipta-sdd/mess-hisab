import fs from "node:fs";
import path from "node:path";
import type { AppLocale } from "./config";

/**
 * Merges every messages/<locale>/<namespace>.json into one object keyed by namespace
 * (file name). Adding a feature file needs no config change. Server/test only (uses fs).
 */
export function loadMessages(locale: AppLocale): Record<string, unknown> {
  const dir = path.join(process.cwd(), "messages", locale);
  const messages: Record<string, unknown> = {};
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    messages[file.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return messages;
}
