// Shared text/list parsing + validation limits for brand forms (AddBrandForm's "Try your own"
// and the brand details edit form). Mirrors backend brands/registry.py (_validate_spec /
// _clean_list) — keep these in sync if the backend limits change.

export const MAX_NAME = 80;
export const MAX_ITEM = 120;
export const MAX_ITEMS = 10;

export const clean = (s: string): string => s.trim().replace(/\s+/g, " ");

/** One comma/newline separated field -> a de-duplicated, cleaned list, in first-seen order. */
export function splitList(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[,\n]/)) {
    const s = clean(raw);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

// Names may be in any script (the backend derives a key for Devanagari-only names); they just
// need at least one letter or digit.
export const hasLetters = (s: string): boolean => /[\p{L}\p{N}]/u.test(s);

// Same as backend slugify() for Latin names (accents folded: "Café Mocha" -> "cafe_mocha"),
// used to spot duplicate competitors.
export const slug = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
