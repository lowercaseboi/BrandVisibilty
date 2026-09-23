import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, createBrand } from "../api/client";
import type { BrandSummary } from "../api/types";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMPTY = { name: "", category: "", cities: "", competitors: "", audiences: "" };

// PRD AC-1: invalid brand specs are rejected with a clear message (422 inline).
export function AddBrandForm({ onCreated }: { onCreated: (brand: BrandSummary) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<BrandSummary | null>(null);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const brand = await createBrand({
        name: form.name.trim(),
        category: form.category.trim(),
        cities: splitList(form.cities),
        competitors: splitList(form.competitors),
        audiences: splitList(form.audiences),
      });
      setCreated(brand);
      setForm(EMPTY);
      onCreated(brand);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(`Invalid brand: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Failed to create brand.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          <span>Brand name</span>
          <input value={form.name} onChange={set("name")} placeholder="e.g. Anand Vada Pav" required />
        </label>
        <label>
          <span>Category</span>
          <input value={form.category} onChange={set("category")} placeholder="e.g. vada pav" required />
        </label>
        <label>
          <span>Cities</span>
          <input value={form.cities} onChange={set("cities")} placeholder="Mumbai, Thane" />
          <small>Comma-separated</small>
        </label>
        <label>
          <span>Competitors</span>
          <input value={form.competitors} onChange={set("competitors")} placeholder="Ashok Vada Pav, Kirti College Vada Pav" />
          <small>Comma-separated names</small>
        </label>
        <label className="form-wide">
          <span>Audiences</span>
          <input value={form.audiences} onChange={set("audiences")} placeholder="college students, office workers" />
          <small>Comma-separated</small>
        </label>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {created && (
        <div className="alert alert-ok">
          Created <strong>{created.brand}</strong>.{" "}
          <Link to={`/brands/${encodeURIComponent(created.brand_key)}`}>Open it and run the first analysis →</Link>
        </div>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add brand"}
        </button>
      </div>
    </form>
  );
}
