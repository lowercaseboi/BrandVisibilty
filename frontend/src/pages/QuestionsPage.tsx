import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getQuestions, listBrands, resetQuestions, saveQuestions } from "../api/client";
import type { QuestionInput, QuestionSet, QuestionSource } from "../api/types";
import { useIntentLabel } from "../format";
import { T, useFormat, useT } from "../i18n";
import { Details } from "../settings/details";

// Unprompted intents a customer can file a new question under (templates.py), plus "custom".
const ADDABLE_INTENTS = [
  "custom",
  "category_discovery",
  "problem_first",
  "alternative_seeking",
  "attribute_constrained",
  "local_contextual",
  "recommendation_seeking",
];

interface Row {
  key: string;
  text: string;
  intent_type: string;
  source: QuestionSource;
  enabled: boolean;
  // Known only for text the server has checked; null for new or edited rows.
  names_brand: boolean | null;
  serverText: string | null;
}

let nextKey = 0;
const newKey = () => `row-${nextKey++}`;

function toRows(set: QuestionSet): Row[] {
  return set.questions.map((q) => ({
    key: newKey(),
    text: q.text,
    intent_type: q.intent_type,
    source: q.source,
    enabled: q.enabled,
    names_brand: q.names_brand,
    serverText: q.text,
  }));
}

function toInputs(rows: Row[]): QuestionInput[] {
  return rows.map((r) => ({
    text: r.text.trim().replace(/\s+/g, " "),
    intent_type: r.intent_type,
    source: r.source,
    enabled: r.enabled,
  }));
}

function namesBrand(r: Row): boolean | null {
  return r.serverText !== null && r.text === r.serverText ? r.names_brand : null;
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Notice = "savedCustom" | "savedDefault" | "resetDone";
type ErrorState = { kind: "duplicate" } | { kind: "save" | "reset"; message: string };

export function QuestionsPage() {
  const t = useT();
  const fmt = useFormat();
  const intentLabel = useIntentLabel();
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  const [server, setServer] = useState<QuestionSet | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [newText, setNewText] = useState("");
  const [newIntent, setNewIntent] = useState("custom");

  useEffect(() => {
    let cancelled = false;
    getQuestions(brandKey)
      .then((set) => {
        if (cancelled) return;
        setServer(set);
        setRows(toRows(set));
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errMessage(err));
      });
    listBrands()
      .then((brands) => {
        if (!cancelled) setBrandName(brands.find((b) => b.brand_key === brandKey)?.brand ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  const dirty = useMemo(
    () => !!server && JSON.stringify(toInputs(rows)) !== JSON.stringify(toInputs(toRows(server))),
    [rows, server],
  );

  // Warn before leaving the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // Group by intent in first-seen order; the customer's own questions go last.
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.intent_type) ?? [];
      list.push(r);
      map.set(r.intent_type, list);
    }
    const entries = [...map.entries()];
    return [...entries.filter(([k]) => k !== "custom"), ...entries.filter(([k]) => k === "custom")];
  }, [rows]);

  const enabled = rows.filter((r) => r.enabled);
  const unscored = enabled.filter((r) => namesBrand(r) === true).length;
  const unchecked = enabled.filter((r) => namesBrand(r) === null).length;
  const scored = enabled.length - unscored - unchecked;

  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setNotice(null);
  }

  function remove(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setNotice(null);
  }

  function add() {
    const text = newText.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (rows.some((r) => r.text.trim().toLowerCase() === text.toLowerCase())) {
      setError({ kind: "duplicate" });
      return;
    }
    setRows((rs) => [
      ...rs,
      { key: newKey(), text, intent_type: newIntent, source: "custom", enabled: true, names_brand: null, serverText: null },
    ]);
    setNewText("");
    setError(null);
    setNotice(null);
  }

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const set = await saveQuestions(brandKey, toInputs(rows));
      setServer(set);
      setRows(toRows(set));
      setNotice(set.customized ? "savedCustom" : "savedDefault");
    } catch (err) {
      setError({ kind: "save", message: errMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm(t("pages.q.resetConfirm"))) return;
    setBusy("reset");
    setError(null);
    setNotice(null);
    try {
      const set = await resetQuestions(brandKey);
      setServer(set);
      setRows(toRows(set));
      setNotice("resetDone");
    } catch (err) {
      setError({ kind: "reset", message: errMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const dashboardHref = `/brands/${encodeURIComponent(brandKey)}`;
  const n = (x: number) => fmt.number(x);

  return (
    <div className="questions-page">
      <p className="crumbs">
        <Link to={dashboardHref}>
          {brandName ? t("pages.q.back", { brand: brandName }) : t("pages.q.backGeneric")}
        </Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{t("pages.q.title")}</h1>
          <p className="lede">{t("pages.q.lede")}</p>
          <p className="lede pg-lede-2">{t("pages.q.namedNote")}</p>
        </div>
      </div>

      {loadError && (
        <div className="alert alert-error" role="alert">
          <p>{t("pages.q.loadError")}</p>
          <Details>
            <p className="small">{loadError}</p>
          </Details>
        </div>
      )}
      {!server && !loadError && <p className="status">{t("pages.q.loading")}</p>}

      {server && (
        <>
          <div className="card q-summary">
            <div className="kv">
              <span className="kv-label">{t("pages.q.asked")}</span>
              <span className="kv-value">{n(enabled.length)}</span>
            </div>
            <div className="kv">
              <span className="kv-label">{t("pages.q.counted")}</span>
              <span className="kv-value">{n(scored)}</span>
            </div>
            <div className="kv">
              <span className="kv-label">{t("pages.q.notCounted")}</span>
              <span className="kv-value">{n(unscored)}</span>
            </div>
            <div className="kv">
              <span className="kv-label">{t("pages.q.off")}</span>
              <span className="kv-value">{n(rows.length - enabled.length)}</span>
            </div>
            <div className="q-summary-state">
              {dirty ? (
                <span className="badge badge-job-partial">{t("pages.q.unsaved")}</span>
              ) : server.customized ? (
                <span className="badge badge-accent">{t("pages.q.customized")}</span>
              ) : (
                <span className="badge badge-muted">{t("pages.q.suggested")}</span>
              )}
              {unchecked > 0 && <span className="muted small">{t.n("pages.q.unchecked", unchecked)}</span>}
            </div>
            <Details>
              <div className="pg-tech small muted">
                <code>{brandKey}</code>
                {server.content_hash && <code title="content_hash">{server.content_hash.slice(0, 12)}</code>}
              </div>
            </Details>
          </div>

          <div className="alert alert-info small">{t("pages.q.baseline")}</div>

          {groups.map(([intent, list]) => (
            <section key={intent} className="q-group">
              <h2>
                {intentLabel(intent)}{" "}
                <span className="count">
                  {t("pages.q.groupCount", { on: n(list.filter((r) => r.enabled).length), total: n(list.length) })}
                </span>
                <Details>
                  <code className="pg-code-muted">{intent}</code>
                </Details>
              </h2>
              <div className="card card-flush">
                <ul className="q-list">
                  {list.map((r) => {
                    const nb = namesBrand(r);
                    return (
                      <li key={r.key} className={`q-row${r.enabled ? "" : " is-off"}`}>
                        <label className="switch" title={r.enabled ? t("pages.q.askedTitle") : t("pages.q.notAskedTitle")}>
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) => update(r.key, { enabled: e.target.checked })}
                            aria-label={t("pages.q.toggleLabel", { text: r.text })}
                          />
                          <span className="switch-track" aria-hidden="true" />
                        </label>
                        <div className="q-text">
                          {r.source === "custom" ? (
                            <input
                              className="q-edit"
                              value={r.text}
                              maxLength={200}
                              onChange={(e) => update(r.key, { text: e.target.value })}
                              aria-label={t("pages.q.textLabel")}
                            />
                          ) : (
                            <span>{r.text}</span>
                          )}
                          <span className="q-badges">
                            {nb === true && <span className="badge badge-job-partial">{t("pages.q.badgeNamed")}</span>}
                            {nb === null && <span className="badge badge-muted">{t("pages.q.badgeUnsaved")}</span>}
                            {r.source === "custom" && <span className="badge">{t("pages.q.badgeYours")}</span>}
                          </span>
                        </div>
                        {r.source === "custom" && (
                          <button
                            type="button"
                            className="btn btn-link q-delete"
                            onClick={() => remove(r.key)}
                            aria-label={t("pages.q.deleteLabel", { text: r.text })}
                          >
                            {t("common.delete")}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}

          <section>
            <h2 id="q-add-title">{t("pages.q.addTitle")}</h2>
            <p className="section-note">{t("pages.q.addNote")}</p>
            <form
              className="card q-add"
              aria-labelledby="q-add-title"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <label className="pg-q-field">
                <span className="pg-field-label">{t("pages.q.newLabel")}</span>
                <input
                  value={newText}
                  maxLength={200}
                  onChange={(e) => {
                    setNewText(e.target.value);
                    if (error?.kind === "duplicate") setError(null);
                  }}
                  placeholder={t("pages.q.newPlaceholder")}
                  aria-invalid={error?.kind === "duplicate" ? true : undefined}
                  aria-describedby={error?.kind === "duplicate" ? "q-add-error" : undefined}
                />
              </label>
              <label className="pg-q-type">
                <span className="pg-field-label">{t("pages.q.typeLabel")}</span>
                <select value={newIntent} onChange={(e) => setNewIntent(e.target.value)}>
                  {ADDABLE_INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {intentLabel(i)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-secondary" disabled={!newText.trim()}>
                {t("common.add")}
              </button>
              {error?.kind === "duplicate" && (
                <span id="q-add-error" className="field-error pg-q-error">
                  {t("pages.q.duplicate")}
                </span>
              )}
            </form>
          </section>

          {error && error.kind !== "duplicate" && (
            <div className="alert alert-error" role="alert">
              <T k={error.kind === "save" ? "pages.q.saveError" : "pages.q.resetError"} vars={{ message: error.message }} />
            </div>
          )}
          {notice && (
            <div className="alert alert-ok" role="status">
              {t(`pages.q.${notice}`)}
            </div>
          )}

          <div className="q-actions">
            <button type="button" className="btn btn-secondary" onClick={reset} disabled={busy !== null}>
              {busy === "reset" ? t("pages.q.resetting") : t("pages.q.reset")}
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || busy !== null}>
              {busy === "save" ? t("common.saving") : t("pages.q.save")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
