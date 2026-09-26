import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLatestSnapshot, listBrands } from "../api/client";
import type { BrandSummary } from "../api/types";
import { evidenceHref } from "../format";
import { useT } from "../i18n";

type Item = { label: string; hint: string; to: string; group: string };

// Subsequence match with a score that favours word starts and contiguous runs.
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0;
  let s = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    s += found === ti ? 3 : 1;
    ti = found + 1;
  }
  return s;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  // brand_key -> latest run id, for the "AI answers" entries.
  const [latestRuns, setLatestRuns] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setQuery("");
        setActive(0);
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listBrands()
      .then((list) => {
        if (cancelled) return;
        setBrands(list);
        return Promise.all(
          list
            .filter((b) => b.has_data)
            .map((b) =>
              getLatestSnapshot(b.brand_key)
                .then((snap) => [b.brand_key, snap.run_id] as const)
                .catch(() => null),
            ),
        ).then((pairs) => {
          if (!cancelled) setLatestRuns(Object.fromEntries(pairs.filter((p) => p !== null)));
        });
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    const focus = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      clearTimeout(focus);
    };
  }, [open]);

  const items = useMemo(() => {
    const all: Item[] = [
      ...brands.map((b) => ({
        label: b.brand,
        hint: b.has_data ? t("pages.palette.brandHint") : t("pages.palette.brandHintNew"),
        to: `/brands/${encodeURIComponent(b.brand_key)}`,
        group: t("pages.palette.group.brands"),
      })),
      ...brands.map((b) => ({
        label: t("pages.palette.questionsFor", { brand: b.brand }),
        hint: t("pages.palette.questionsHint"),
        to: `/brands/${encodeURIComponent(b.brand_key)}/questions`,
        group: t("pages.palette.group.questions"),
      })),
      ...brands
        .filter((b) => latestRuns[b.brand_key])
        .map((b) => ({
          label: t("pages.palette.answersFor", { brand: b.brand }),
          hint: t("pages.palette.answersHint"),
          to: evidenceHref(b.brand_key, latestRuns[b.brand_key]),
          group: t("pages.palette.group.answers"),
        })),
      { label: t("common.nav.brands"), hint: t("pages.palette.brandsHint"), to: "/", group: t("pages.palette.group.pages") },
      {
        label: t("common.nav.providers"),
        hint: t("pages.palette.aisHint"),
        to: "/providers",
        group: t("pages.palette.group.pages"),
      },
    ];
    return all
      .map((it) => ({ it, s: score(query, `${it.label} ${it.hint}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  }, [brands, latestRuns, query, t]);

  if (!open) return null;

  const go = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    navigate(it.to);
  };

  const activeId = items[active] ? `palette-opt-${active}` : undefined;

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("pages.palette.label")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={t("pages.palette.label")}
            placeholder={t("pages.palette.placeholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") go(items[active]);
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox" aria-label={t("pages.palette.label")}>
          {items.length === 0 && (
            <li className="palette-empty" role="presentation">
              {t("pages.palette.empty")}
            </li>
          )}
          {items.map((it, i) => (
            <li
              key={it.to}
              id={`palette-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it)}
            >
              <span className="palette-group">{it.group}</span>
              <span className="palette-label">{it.label}</span>
              <span className="palette-hint">{it.hint}</span>
            </li>
          ))}
        </ul>
        <div className="palette-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("pages.palette.navigate")}
          </span>
          <span>
            <kbd>↵</kbd> {t("pages.palette.open")}
          </span>
          <span>
            <kbd>esc</kbd> {t("pages.palette.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
