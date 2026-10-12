#!/usr/bin/env node
// Translation drift guard: every hi/mr dictionary must have exactly the English keys, and each
// translated value must keep the English {placeholders} and the same number of ** bold markers.
// It also fails on English keys that nothing references any more (orphans left behind when a
// component is rewritten) — a key counts as used when its full string appears in the code, when a
// template literal such as `dashboard.gaps.type.${k}` covers its prefix, or when it is a plural
// variant (_one/_other) of a used key.
// Run by `npm run lint`. Exits 1 on any problem.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const I18N = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");
const SRC = join(I18N, "..");
const NAMESPACES = ["common", "dashboard", "pages"];
const ALL_NAMESPACES = ["common", "dashboard", "pages", "hub", "brandinfo", "modules", "board"];
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

// ---- unused English keys ----
function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (full === I18N) continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
const code = sourceFiles(SRC).map((f) => readFileSync(f, "utf8")).join("\n");
// `a.b.${x}` → prefix "a.b." covers every key under it.
const prefixes = [...code.matchAll(/[`"']([\w.]+\.)\$\{/g)].map((m) => m[1]);
const used = (full) => {
  const base = full.replace(/_(one|other|few|many|zero|two)$/, "");
  return code.includes(`"${full}"`) || code.includes(`"${base}"`) || code.includes(`'${base}'`) || code.includes(`\`${base}\``) || prefixes.some((p) => full.startsWith(p));
};
for (const ns of ALL_NAMESPACES) {
  const { file, dict } = loadDict("en", ns);
  for (const key of Object.keys(dict)) {
    if (!used(`${ns}.${key}`)) problems.push(`${file}: unused key "${key}" (nothing references ${ns}.${key})`);
  }
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`i18n check passed (${NAMESPACES.length} namespaces × ${TRANSLATIONS.length} languages).`);
