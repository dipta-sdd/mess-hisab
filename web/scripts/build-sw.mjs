// Runs after `next build`: lists every file in out/ and writes out/sw.js from sw.template.js.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("out");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push("/" + path.relative(out, full).split(path.sep).join("/"));
  }
})(out);

const skip = (f) => f === "/sw.js" || f === "/404.html" || f.endsWith(".map");
const precache = files.filter((f) => !skip(f)).sort();
precache.unshift("/");
const hash = createHash("sha256");
for (const f of precache.slice(1)) hash.update(f).update(fs.readFileSync(path.join(out, f)));
const version = hash.digest("hex").slice(0, 12);

const template = fs.readFileSync(path.resolve("scripts/sw.template.js"), "utf8");
fs.writeFileSync(path.join(out, "sw.js"), template.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache)));
console.log(`sw.js: ${precache.length} files precached (v${version})`);
