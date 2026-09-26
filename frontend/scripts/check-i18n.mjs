#!/usr/bin/env node
// Translation drift guard: every hi/mr dictionary must have exactly the English keys, and each
// translated value must keep the English {placeholders} and the same number of ** bold markers.
// Run by `npm run lint`. Exits 1 on any problem.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const I18N = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");
const NAMESPACES = ["common", "dashboard", "pages"];
const TRANSLATIONS = ["hi", "mr"];

/** Evaluates the object literal of `export const <ns> ... = { ... }` (comments and trailing commas are fine). */
function loadDict(lang, ns) {
  const file = join(I18N, lang, `${ns}.ts`);
  const src = readFileSync(file, "utf8");
  const decl = src.search(new RegExp(`export const ${ns}\\b`));
  if (decl < 0) throw new Error(`${file}: no "export const ${ns}"`);
  const open = src.indexOf("{", src.indexOf("=", decl));
  const close = src.lastIndexOf("}");
  if (open < 0 || close < open) throw new Error(`${file}: can't find the object literal`);
  const dict = new Function(`return (${src.slice(open, close + 1)});`)();
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== "string") throw new Error(`${file}: "${k}" is not a string`);
  }
  return { file: join("src", "i18n", lang, `${ns}.ts`), dict };
}

const placeholders = (s) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(" ");
const boldCount = (s) => s.split("**").length - 1;

const problems = [];
for (const ns of NAMESPACES) {
  const en = loadDict("en", ns).dict;
  for (const lang of TRANSLATIONS) {
    const { file, dict } = loadDict(lang, ns);
    for (const key of Object.keys(en)) {
      if (!(key in dict)) {
        problems.push(`${file}: missing key "${key}"`);
        continue;
      }
      const want = placeholders(en[key]);
      const got = placeholders(dict[key]);
      if (want !== got) problems.push(`${file}: "${key}" placeholders {${got}} ≠ English {${want}}`);
      if (boldCount(en[key]) !== boldCount(dict[key])) {
        problems.push(`${file}: "${key}" has ${boldCount(dict[key])} ** markers, English has ${boldCount(en[key])}`);
      }
    }
    for (const key of Object.keys(dict)) {
      if (!(key in en)) problems.push(`${file}: extra key "${key}" (not in English)`);
    }
  }
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`i18n check passed (${NAMESPACES.length} namespaces × ${TRANSLATIONS.length} languages).`);
