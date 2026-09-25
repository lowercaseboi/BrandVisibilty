import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getQuestions, listBrands, resetQuestions, saveQuestions } from "../api/client";
import type { QuestionInput, QuestionSet, QuestionSource } from "../api/types";
import { intentLabel } from "../format";

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

export function QuestionsPage() {
  const { brandKey = "" } = useParams<{ brandKey: string }>();
  const [server, setServer] = useState<QuestionSet | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load questions.");
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
      setError("That question is already in the list.");
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
      setNotice(
        set.customized
          ? "Saved. The next run will use these questions."
          : "Saved. This matches the suggested questions, so runs stay comparable with earlier ones.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save questions.");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm("Reset to the suggested questions? Your own questions and edits will be removed.")) return;
    setBusy("reset");
    setError(null);
    setNotice(null);
    try {
      const set = await resetQuestions(brandKey);
      setServer(set);
      setRows(toRows(set));
      setNotice("Reset to the suggested questions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset questions.");
    } finally {
      setBusy(null);
    }
  }

  const dashboardHref = `/brands/${encodeURIComponent(brandKey)}`;

  return (
    <div className="questions-page">
      <p className="crumbs">
        <Link to={dashboardHref}>← Back to {brandName ?? "dashboard"}</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>What the AI models are asked</h1>
          <p className="lede">
            These are the questions a real customer would type into an AI assistant when looking for
            {brandName ? ` something like ${brandName}` : " a business like yours"}. Each run asks every enabled
            question and checks whether the answer mentions you. Questions that name your brand are still asked
            and shown in Evidence, but they don't count toward scores, since a mention is guaranteed.
          </p>
        </div>
      </div>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {!server && !loadError && <p className="status">Loading questions…</p>}

      {server && (
        <>
          <div className="card q-summary">
            <div className="kv">
              <span className="kv-label">Asked</span>
              <span className="kv-value">{enabled.length}</span>
            </div>
            <div className="kv">
              <span className="kv-label">Scored</span>
              <span className="kv-value">{scored}</span>
            </div>
            <div className="kv">
              <span className="kv-label">Not scored</span>
              <span className="kv-value">{unscored}</span>
            </div>
            <div className="kv">
              <span className="kv-label">Turned off</span>
              <span className="kv-value">{rows.length - enabled.length}</span>
            </div>
            <div className="q-summary-state">
              {dirty ? (
                <span className="badge badge-job-partial">Unsaved changes</span>
              ) : server.customized ? (
                <span className="badge badge-accent">Customised</span>
              ) : (
                <span className="badge badge-muted">Suggested questions</span>
              )}
              {unchecked > 0 && (
                <span className="muted small">
                  {unchecked} new or edited question{unchecked === 1 ? "" : "s"} will be checked for your brand
                  name on save.
                </span>
              )}
            </div>
          </div>

          <div className="alert alert-info small">
            Changing the questions starts a new baseline — the trend chart won't compare runs across this change.
          </div>

          {groups.map(([intent, list]) => (
            <section key={intent} className="q-group">
              <h2>
                {intentLabel(intent)} <span className="count">{list.filter((r) => r.enabled).length}/{list.length}</span>
              </h2>
              <div className="card card-flush">
                <ul className="q-list">
                  {list.map((r) => {
                    const nb = namesBrand(r);
                    return (
                      <li key={r.key} className={`q-row${r.enabled ? "" : " is-off"}`}>
                        <label className="switch" title={r.enabled ? "Asked in runs" : "Not asked"}>
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) => update(r.key, { enabled: e.target.checked })}
                            aria-label={`Ask "${r.text}"`}
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
                              aria-label="Question text"
                            />
                          ) : (
                            <span>{r.text}</span>
                          )}
                          <span className="q-badges">
                            {nb === true && <span className="badge badge-job-partial">Not scored — mentions your brand</span>}
                            {nb === null && <span className="badge badge-muted">Unsaved</span>}
                            {r.source === "custom" && <span className="badge">Yours</span>}
                          </span>
                        </div>
                        {r.source === "custom" && (
                          <button
                            type="button"
                            className="btn btn-link q-delete"
                            onClick={() => remove(r.key)}
                            aria-label={`Delete "${r.text}"`}
                          >
                            Delete
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
            <h2>Add a question</h2>
            <p className="section-note">
              Write it the way a customer would, without your brand name, so it counts toward your scores.
            </p>
            <form
              className="card q-add"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                value={newText}
                maxLength={200}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="e.g. best vada pav near Dadar station"
                aria-label="New question"
              />
              <select value={newIntent} onChange={(e) => setNewIntent(e.target.value)} aria-label="Question type">
                {ADDABLE_INTENTS.map((i) => (
                  <option key={i} value={i}>
                    {intentLabel(i)}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary" disabled={!newText.trim()}>
                Add
              </button>
            </form>
          </section>

          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-ok">{notice}</div>}

          <div className="q-actions">
            <button type="button" className="btn btn-secondary" onClick={reset} disabled={busy !== null}>
              {busy === "reset" ? "Resetting…" : "Reset to suggested questions"}
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || busy !== null}>
              {busy === "save" ? "Saving…" : "Save questions"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
