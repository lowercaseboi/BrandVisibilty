import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, createBrand } from "../api/client";
import type { BrandSummary } from "../api/types";
import { T, useT } from "../i18n";
import type { MessageKey, Vars } from "../i18n";

// Limits mirror backend brands/registry.py (_validate_spec / _clean_list).
const MAX_NAME = 80;
const MAX_ITEM = 120;
const MAX_ITEMS = 10;
const THIN_QUESTIONS = 10;

type FieldId = "name" | "category" | "cities" | "competitors" | "audiences" | "jobs" | "aliases";

type FieldSpec = {
  id: FieldId;
  list: boolean;
  required: boolean;
  wide?: boolean;
  label: MessageKey;
  placeholder: MessageKey;
  hint: MessageKey;
};

// Order = order on screen. "Occasions" (use_cases) is left out on purpose: it only
// feeds brand-named questions, which never count toward the score.
const FIELDS: FieldSpec[] = [
  { id: "name", list: false, required: true, label: "pages.add.name.label", placeholder: "pages.add.name.placeholder", hint: "pages.add.name.hint" },
  { id: "category", list: false, required: true, label: "pages.add.category.label", placeholder: "pages.add.category.placeholder", hint: "pages.add.category.hint" },
  { id: "cities", list: true, required: true, label: "pages.add.cities.label", placeholder: "pages.add.cities.placeholder", hint: "pages.add.cities.hint" },
  { id: "competitors", list: true, required: false, label: "pages.add.competitors.label", placeholder: "pages.add.competitors.placeholder", hint: "pages.add.competitors.hint" },
  { id: "audiences", list: true, required: false, label: "pages.add.audiences.label", placeholder: "pages.add.audiences.placeholder", hint: "pages.add.audiences.hint" },
  { id: "jobs", list: true, required: false, wide: true, label: "pages.add.jobs.label", placeholder: "pages.add.jobs.placeholder", hint: "pages.add.jobs.hint" },
  { id: "aliases", list: true, required: false, wide: true, label: "pages.add.aliases.label", placeholder: "pages.add.aliases.placeholder", hint: "pages.add.aliases.hint" },
];

type Values = Record<FieldId, string>;
type FieldError = { key: MessageKey; vars?: Vars };
type Errors = Partial<Record<FieldId, FieldError>>;

const EMPTY: Values = { name: "", category: "", cities: "", competitors: "", audiences: "", jobs: "", aliases: "" };

function splitList(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[,\n]/)) {
    const s = raw.trim().replace(/\s+/g, " ");
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

// Names may be in any script (the backend derives a key for Devanagari-only names);
// they just need at least one letter or digit.
const hasLetters = (s: string) => /[\p{L}\p{N}]/u.test(s);

// Same as backend slugify() for Latin names, used to spot duplicate competitors.
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function validateField(id: FieldId, values: Values): FieldError | undefined {
  const spec = FIELDS.find((f) => f.id === id)!;
  if (!spec.list) {
    const v = clean(values[id]);
    if (!v) return spec.required ? { key: "pages.add.err.required" } : undefined;
    if (v.length > MAX_NAME) return { key: "pages.add.err.tooLong", vars: { max: MAX_NAME } };
    if (id === "name" && !hasLetters(v)) return { key: "pages.add.err.latin" };
    return undefined;
  }
  const items = splitList(values[id]);
  if (items.length === 0) return spec.required ? { key: "pages.add.err.required" } : undefined;
  const long = items.find((i) => i.length > MAX_ITEM);
  if (long) return { key: "pages.add.err.itemTooLong", vars: { item: long, max: MAX_ITEM } };
  if (items.length > MAX_ITEMS) return { key: "pages.add.err.tooMany", vars: { max: MAX_ITEMS, n: items.length } };
  if (id === "competitors") {
    const name = clean(values.name).toLowerCase();
    if (name && items.some((c) => c.toLowerCase() === name)) return { key: "pages.add.err.self" };
    const seen = new Set<string>();
    for (const c of items) {
      if (!hasLetters(c)) return { key: "pages.add.err.latin" };
      const k = slug(c) || c.toLowerCase();
      if (seen.has(k)) return { key: "pages.add.err.duplicate", vars: { item: c } };
      seen.add(k);
    }
  }
  return undefined;
}

function validateAll(values: Values): Errors {
  const errors: Errors = {};
  for (const f of FIELDS) {
    const e = validateField(f.id, values);
    if (e) errors[f.id] = e;
  }
  return errors;
}

// PRD AC-1: invalid shop details are rejected with a clear message (checked here first, 422 from the server as a backstop).
export function AddBrandForm({ onCreated }: { onCreated: (brand: BrandSummary) => void }) {
  const t = useT();
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldId, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<BrandSummary | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const errors = validateAll(values);
  const shown = (id: FieldId) => (submitted || touched[id] ? errors[id] : undefined);

  const onChange = (id: FieldId) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [id]: value }));
    setServerError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const errs = validateAll(values);
    const first = FIELDS.find((f) => errs[f.id]);
    if (first) {
      formRef.current?.querySelector<HTMLInputElement>(`#add-${first.id}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const brand = await createBrand({
        name: clean(values.name),
        category: clean(values.category),
        cities: splitList(values.cities),
        competitors: splitList(values.competitors),
        audiences: splitList(values.audiences),
        jobs_to_be_done: splitList(values.jobs),
        aliases: splitList(values.aliases),
      });
      setCreated(brand);
      setValues(EMPTY);
      setTouched({});
      setSubmitted(false);
      onCreated(brand);
      setTimeout(() => doneRef.current?.focus(), 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setServerError(t("common.error.network"));
      else if (err instanceof ApiError && err.message) setServerError(t("pages.add.err.server", { message: err.message }));
      else setServerError(t("pages.add.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const key = encodeURIComponent(created.brand_key);
    const n = created.question_count;
    return (
      <div className="card pg-done" ref={doneRef} tabIndex={-1} role="status">
        <p className="pg-done-title">
          {typeof n === "number" ? (
            <T k={n === 1 ? "pages.add.done_one" : "pages.add.done_other"} vars={{ n, shop: created.brand }} />
          ) : (
            <T k="pages.add.doneNoCount" vars={{ shop: created.brand }} />
          )}
        </p>
        {typeof n === "number" && n < THIN_QUESTIONS && <div className="alert alert-warn">{t("pages.add.thin")}</div>}
        <div className="pg-actions">
          <Link className="btn btn-primary" to={`/brands/${key}`}>
            {t("pages.add.checkNow")}
          </Link>
          <Link className="btn btn-secondary" to={`/brands/${key}/questions`}>
            {t("pages.add.seeQuestions")}
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => setCreated(null)}>
            {t("pages.add.another")}
          </button>
        </div>
      </div>
    );
  }

  const errorCount = submitted ? Object.keys(errors).length : 0;

  return (
    <form className="card form pg-form" onSubmit={submit} noValidate ref={formRef}>
      <p className="section-note">{t("pages.add.intro")}</p>
      <div className="form-grid">
        {FIELDS.map((f) => {
          const err = shown(f.id);
          const inputId = `add-${f.id}`;
          const hintId = `${inputId}-hint`;
          const errId = `${inputId}-error`;
          return (
            <div key={f.id} className={`field${f.wide ? " form-wide" : ""}`}>
              <label htmlFor={inputId}>
                {t(f.label)}
                {!f.required && <span className="pg-optional"> {t("pages.add.optional")}</span>}
              </label>
              <input
                id={inputId}
                name={f.id}
                value={values[f.id]}
                onChange={onChange(f.id)}
                onBlur={() => setTouched((tc) => ({ ...tc, [f.id]: true }))}
                placeholder={t(f.placeholder)}
                required={f.required}
                aria-required={f.required}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `${errId} ${hintId}` : hintId}
                autoComplete={f.id === "name" ? "organization" : "off"}
              />
              <span id={hintId} className="field-hint">
                {t(f.hint)}
              </span>
              {err && (
                <span id={errId} className="field-error">
                  {t(err.key, err.vars)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {errorCount > 0 && (
        <div className="alert alert-error" role="alert">
          {t("pages.add.fixErrors")}
        </div>
      )}
      {serverError && (
        <div className="alert alert-error" role="alert">
          {serverError}
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t("pages.add.submitting") : t("pages.add.submit")}
        </button>
      </div>
    </form>
  );
}
