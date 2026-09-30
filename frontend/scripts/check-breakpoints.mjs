#!/usr/bin/env node
// Breakpoint guard: every width in an @media query must be one of the standard breakpoints
// (tokens.css): max-width 480 / 640 / 900 / 1100px, or min-width one pixel above (481 / 641 / 901
// / 1101px). Scans src/styles/*.css plus any @media / matchMedia(...) written inside .ts/.tsx.
// Run by `npm run lint`. Exits 1 on any violation outside the temporary allowlist.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const MAX = new Set([480, 640, 900, 1100]);
const MIN = new Set([481, 641, 901, 1101]);

/**
 * Temporary escape hatch: {file, feature, value} entries for widths that can't be migrated yet
 * (say, a file another in-flight change owns). Each entry needs a TODO naming its owner. Keep it empty.
 */
const ALLOW = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every (feature, px) width condition in a media query's text, e.g. "(max-width: 640px)". */
function widths(query) {
  const found = [];
  const re = /\(\s*(min|max)-width\s*:\s*([\d.]+)(px|em|rem)?\s*\)|\(\s*width\s*(<=|>=|<|>)\s*([\d.]+)(px|em|rem)?\s*\)/g;
  for (const m of query.matchAll(re)) {
    if (m[1]) found.push({ feature: `${m[1]}-width`, value: Number(m[2]), unit: m[3] ?? "" });
    else found.push({ feature: `width ${m[4]}`, value: Number(m[5]), unit: m[6] ?? "" });
  }
  return found;
}

function allowed({ feature, value, unit }) {
  if (unit !== "px") return false;
  if (feature === "max-width" || feature === "width <=") return MAX.has(value);
  if (feature === "min-width" || feature === "width >=") return MIN.has(value);
  if (feature === "width <") return MIN.has(value); // width < 641px ≡ max-width: 640px
  if (feature === "width >") return MAX.has(value); // width > 640px ≡ min-width: 641px
  return false;
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

const files = [
  ...readdirSync(join(SRC, "styles"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => join(SRC, "styles", f)),
  ...walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)),
];

const errors = [];
const tolerated = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const queries = file.endsWith(".css")
    ? [...src.matchAll(/@media\b([^{]*)\{/g)].map((m) => ({ text: m[1], index: m.index }))
    : [
        ...src.matchAll(/@media\b([^{`"']*)/g),
        ...src.matchAll(/matchMedia\s*\(\s*["'`]([^"'`]*)["'`]/g),
      ].map((m) => ({ text: m[1], index: m.index }));
  for (const q of queries) {
    for (const w of widths(q.text)) {
      if (allowed(w)) continue;
      const where = `${rel}:${lineOf(src, q.index)}`;
      const what = `${w.feature} ${w.value}${w.unit}`;
      if (ALLOW.some((a) => a.file === rel && a.feature === w.feature && a.value === w.value)) {
        tolerated.push(`${where}  ${what}`);
      } else {
        errors.push(`${where}  ${what}  (use max-width 480/640/900/1100px or min-width 481/641/901/1101px)`);
      }
    }
  }
}

if (tolerated.length) {
  console.warn(`check-breakpoints: ${tolerated.length} allowlisted non-standard width(s) — TODO migrate:`);
  for (const t of tolerated) console.warn(`  ${t}`);
}
if (errors.length) {
  console.error(`check-breakpoints: ${errors.length} non-standard media width(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-breakpoints: OK (${files.length} files)`);
