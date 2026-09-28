import { useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, updateBrand } from "../../api/client";
import type { BrandProfile, UpdateBrandRequest } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey, Vars } from "../../i18n";
import { useBrandData } from "../../pages/brand/BrandContext";
import { toast } from "../Toaster";
import { MAX_ITEM, MAX_ITEMS, MAX_NAME, clean, hasLetters, slug, splitList } from "./listFields";

type FieldId = "name" | "category" | "cities" | "competitors" | "aliases" | "audiences" | "jobs";

interface FieldSpec {
  id: FieldId;
  list: boolean;
  required: boolean;
  label: MessageKey;
  placeholder: MessageKey;
  hint: MessageKey;
}

// Same field set as AddBrandForm (minus "occasions"/"tasks", which only feed brand-named
// questions and aren't part of the saved profile), reusing its copy — same concepts, same words.
const FIELDS: FieldSpec[] = [
  { id: "name", list: false, required: true, label: "pages.add.name.label", placeholder: "pages.add.name.placeholder", hint: "pages.add.name.hint" },
  { id: "category", list: false, required: true, label: "pages.add.category.label", placeholder: "pages.add.category.placeholder", hint: "pages.add.category.hint" },
  { id: "cities", list: true, required: true, label: "pages.add.cities.label", placeholder: "pages.add.cities.placeholder", hint: "pages.add.cities.hint" },
  { id: "competitors", list: true, required: false, label: "pages.add.competitors.label", placeholder: "pages.add.competitors.placeholder", hint: "pages.add.competitors.hint" },
  { id: "aliases", list: true, required: false, label: "pages.add.aliases.label", placeholder: "pages.add.aliases.placeholder", hint: "pages.add.aliases.hint" },
  { id: "audiences", list: true, required: false, label: "pages.add.audiences.label", placeholder: "pages.add.audiences.placeholder", hint: "pages.add.audiences.hint" },
  { id: "jobs", list: true, required: false, label: "pages.add.jobs.label", placeholder: "pages.add.jobs.placeholder", hint: "pages.add.jobs.hint" },
];

type Values = Record<FieldId, string>;
type FieldError = { key: MessageKey; vars?: Vars };
type Errors = Partial<Record<FieldId, FieldError>>;

function valuesFromProfile(p: BrandProfile): Values {
  return {
    name: p.brand,
    category: p.category,
    cities: p.cities.join(", "),
    competitors: p.competitors.join(", "),
    aliases: p.aliases.join(", "),
    audiences: p.audiences.join(", "),
    jobs: p.jobs_to_be_done.join(", "),
  };
}

// Same rules as AddBrandForm.validateField (backend brands/registry.py _validate_spec).
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

function toUpdateRequest(values: Values): UpdateBrandRequest {
  return {
    name: clean(values.name),
    category: clean(values.category),
    cities: splitList(values.cities),
    competitors: splitList(values.competitors),
    aliases: splitList(values.aliases),
    audiences: splitList(values.audiences),
    jobs_to_be_done: splitList(values.jobs),
  };
}

// Order/case/whitespace-insensitive set compare, so re-saving the same list unchanged (maybe
// re-typed in a different order) never trips the comparability warning.
function sameSet(a: string[], b: string[], norm: (s: string) => string): boolean {
  const na = new Set(a.map(norm));
  const nb = new Set(b.map(norm));
  return na.size === nb.size && [...na].every((x) => nb.has(x));
}

const normCompetitor = (s: string) => slug(s) || s.toLowerCase();
const normAlias = (s: string) => s.toLowerCase();

function Chips({ items }: { items: string[] }) {
  const t = useT();
  if (items.length === 0) return <span className="muted">{t("common.none")}</span>;
  return (
    <ul className="bi-chips">
      {items.map((item) => (
        <li key={item} className="bi-chip">
          {item}
        </li>
      ))}
    </ul>
  );
}

// Long-form fields (customer needs, target audience) read poorly as pills — full sentences don't
// fit a tag shape. Instead: one item per line, a small leading number, generous line-height and a
// hairline divider between rows.
function LongList({ items }: { items: string[] }) {
  const t = useT();
  if (items.length === 0) return <span className="muted">{t("common.none")}</span>;
  return (
    <ol className="bi-longlist">
      {items.map((item, i) => (
        <li key={item} className="bi-longlist-item">
          <span className="bi-longlist-marker" aria-hidden="true">
            {i + 1}
          </span>
          <span className="bi-longlist-text">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The brand's saved profile: a read-only glass card for everyone, plus an inline edit form for
 * non-pilot brands (PUT /brands/{key}). Handles `profile === null` (backend up but this brand has
 * no profile, or the request failed) by showing a small notice instead of the card.
 */
export function ProfilePanel() {
  const t = useT();
  const { brandKey, profile, setProfile, reload } = useBrandData();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldId, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = useMemo(() => (values ? validateAll(values) : {}), [values]);
  const warnComparability = useMemo(() => {
    if (!values || !profile) return false;
    const competitorsChanged = !sameSet(splitList(values.competitors), profile.competitors, normCompetitor);
    const aliasesChanged = !sameSet(splitList(values.aliases), profile.aliases, normAlias);
    return competitorsChanged || aliasesChanged;
  }, [values, profile]);

  if (!profile) {
    return (
      <div className="alert alert-warn" role="status">
        {t("brandinfo.profile.unavailable")}
      </div>
    );
  }

  const startEdit = () => {
    setValues(valuesFromProfile(profile));
    setTouched({});
    setSubmitted(false);
    setServerError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setValues(null);
    setServerError(null);
  };

  const shown = (id: FieldId) => (submitted || touched[id] ? errors[id] : undefined);

  const onChange = (id: FieldId) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setValues((v) => (v ? { ...v, [id]: value } : v));
    setServerError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values) return;
    setSubmitted(true);
    setServerError(null);
    const errs = validateAll(values);
    const first = FIELDS.find((f) => errs[f.id]);
    if (first) {
      formRef.current?.querySelector<HTMLInputElement>(`#bi-${first.id}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const updated = await updateBrand(brandKey, toUpdateRequest(values));
      setProfile(updated);
      reload();
      setEditing(false);
      setValues(null);
      toast(t("brandinfo.toast.saved"));
    } catch (err) {
      let message = t("brandinfo.edit.err.generic");
      if (err instanceof ApiError && err.status === 0) message = t("common.error.network");
      else if (err instanceof ApiError && err.status === 403) message = t("brandinfo.edit.err.forbidden");
      else if (err instanceof ApiError && err.message) message = t("brandinfo.edit.err.server", { message: err.message });
      setServerError(message);
      toast(t("brandinfo.toast.saveError"));
    } finally {
      setBusy(false);
    }
  }

  const renderField = (f: FieldSpec) => {
    const err = shown(f.id);
    const inputId = `bi-${f.id}`;
    const hintId = `${inputId}-hint`;
    const errId = `${inputId}-error`;
    return (
      <div key={f.id} className="field">
        <label htmlFor={inputId}>
          {t(f.label)}
          {!f.required && <span className="pg-optional"> {t("pages.add.optional")}</span>}
        </label>
        <input
          id={inputId}
          name={f.id}
          value={values![f.id]}
          onChange={onChange(f.id)}
          onBlur={() => setTouched((tc) => ({ ...tc, [f.id]: true }))}
          placeholder={t(f.placeholder)}
          required={f.required}
          aria-required={f.required}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${errId} ${hintId}` : hintId}
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
  };

  if (editing && values) {
    return (
      <form className="form bi-edit-form" ref={formRef} onSubmit={submit} noValidate>
        <div className="form-grid">{FIELDS.map(renderField)}</div>
        {warnComparability && (
          <div className="alert alert-warn" role="alert">
            {t("brandinfo.edit.comparabilityWarning")}
          </div>
        )}
        {serverError && (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="bi-profile">
      <div className="bi-profile-head">
        {profile.is_pilot ? (
          <span className="badge badge-muted bi-pilot-badge">{t("brandinfo.profile.pilotBadge")}</span>
        ) : (
          <span />
        )}
        {!profile.is_pilot && (
          <button type="button" className="btn btn-secondary btn-small" onClick={startEdit}>
            {t("brandinfo.profile.edit")}
          </button>
        )}
      </div>
      <section className="bi-section">
        <h3 className="bi-section-title">{t("brandinfo.profile.section.identity")}</h3>
        <dl className="bi-fact-grid">
          <div className="bi-fact">
            <dt>{t("pages.add.name.label")}</dt>
            <dd>{profile.brand}</dd>
          </div>
          <div className="bi-fact">
            <dt>{t("pages.add.category.label")}</dt>
            <dd>{profile.category || <span className="muted">{t("common.none")}</span>}</dd>
          </div>
          <div className="bi-fact">
            <dt>{t("pages.add.cities.label")}</dt>
            <dd>
              <Chips items={profile.cities} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="bi-section">
        <h3 className="bi-section-title">{t("brandinfo.profile.section.competition")}</h3>
        <dl className="bi-fact-grid">
          <div className="bi-fact">
            <dt>{t("pages.add.competitors.label")}</dt>
            <dd>
              <Chips items={profile.competitors} />
            </dd>
          </div>
          <div className="bi-fact">
            <dt>{t("pages.add.aliases.label")}</dt>
            <dd>
              <Chips items={profile.aliases} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="bi-section">
        <h3 className="bi-section-title">{t("brandinfo.profile.section.customers")}</h3>
        <div className="bi-longlist-group">
          <div className="bi-longlist-block">
            <h4 className="bi-longlist-label">{t("pages.add.audiences.label")}</h4>
            <LongList items={profile.audiences} />
          </div>
          <div className="bi-longlist-block">
            <h4 className="bi-longlist-label">{t("pages.add.jobs.label")}</h4>
            <LongList items={profile.jobs_to_be_done} />
          </div>
        </div>
      </section>
    </div>
  );
}
