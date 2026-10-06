import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { saveAccount, testAccount } from "../../api/client";
import type { AccountStatus, ChannelId } from "../../api/types";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n";
import { AccountDialog } from "./AccountDialog";
import { accountErrorText } from "./accountErrors";
import { collectFields, fieldMeta, isAccountChannel, platformKey } from "./accountsModel";

type Phase = { kind: "edit" } | { kind: "saving" } | { kind: "testing" } | { kind: "ok" } | { kind: "testFailed"; detail: string };

/**
 * Guided manual entry for one platform: the fields the backend asks for (manual_fields), each with
 * a friendly label and a one-line hint, secrets as password inputs, the "Where do I find this?"
 * steps inline, then save → test. A failed test keeps the form open to fix the values.
 */
export function ManualEntryDialog({
  brandKey,
  status,
  runAdmin,
  onSaved,
  onClose,
  fallbackFocus,
}: {
  brandKey: string;
  status: AccountStatus;
  runAdmin: <T>(fn: (token: string) => Promise<T>) => Promise<T | null>;
  onSaved: (s: AccountStatus) => void;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const t = useT();
  const uid = useId();
  const channel: ChannelId = status.channel;
  const platform = t(platformKey(channel));
  const metas = useMemo(() => status.manual_fields.map(fieldMeta), [status.manual_fields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const busy = phase.kind === "saving" || phase.kind === "testing";
  const howto = isAccountChannel(channel) ? t(`brandinfo.accounts.howto.${channel}` as MessageKey).split("\n") : [];

  const labelOf = (name: string) => {
    const m = fieldMeta(name);
    return m.label ? t(m.label) : m.fallbackLabel;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const { fields, missing, invalid: badShape } = collectFields(status.manual_fields, values);
    const wrong = missing ?? badShape;
    if (wrong) {
      setInvalid(wrong);
      setError(
        missing
          ? t("brandinfo.accounts.manual.required", { field: labelOf(wrong) })
          : t("brandinfo.accounts.err.invalidUrn", { field: labelOf(wrong) }),
      );
      document.getElementById(`${uid}-${wrong}`)?.focus();
      return;
    }
    setInvalid(null);
    setError(null);
    setPhase({ kind: "saving" });
    try {
      const saved = await runAdmin((token) => saveAccount(brandKey, channel, fields, token));
      if (!saved) {
        setPhase({ kind: "edit" });
        return;
      }
      onSaved(saved);
      // Secrets never come back from the server; clear them from memory once stored.
      setValues({});
      setPhase({ kind: "testing" });
      const result = await runAdmin((token) => testAccount(brandKey, channel, token)).catch((err: unknown) => ({
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      }));
      if (!result) setPhase({ kind: "ok" });
      else setPhase(result.ok ? { kind: "ok" } : { kind: "testFailed", detail: result.detail });
    } catch (err) {
      setPhase({ kind: "edit" });
      setError(accountErrorText(t, err));
    }
  };

  return (
    <AccountDialog title={t("brandinfo.accounts.manual.title", { platform })} onClose={onClose} wide fallbackFocus={fallbackFocus}>
      {phase.kind === "ok" ? (
        <div className="acc-form">
          <p className="alert alert-ok" role="status">
            {t("brandinfo.accounts.manual.savedOk")}
          </p>
          <div className="sheet-actions">
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- moves focus to the only action after the form is replaced */}
            <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
              {t("brandinfo.accounts.done")}
            </button>
          </div>
        </div>
      ) : (
        <form className="acc-form" onSubmit={submit} noValidate aria-busy={busy}>
          <p className="muted small">{t("brandinfo.accounts.manual.intro", { platform })}</p>

          {howto.length > 0 && (
            <details className="acc-howto">
              <summary>{t("brandinfo.accounts.manual.howTitle")}</summary>
              <ol>
                {howto.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </details>
          )}

          {metas.length === 0 && <p className="muted">{t("brandinfo.accounts.manual.noFields")}</p>}
          {metas.map((m, i) => {
            const id = `${uid}-${m.name}`;
            const hintId = `${id}-hint`;
            return (
              <div key={m.name} className="field">
                <label htmlFor={id}>{labelOf(m.name)}</label>
                <input
                  id={id}
                  name={m.name}
                  type={m.secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  required={m.required}
                  aria-required={m.required}
                  aria-invalid={invalid === m.name || undefined}
                  aria-describedby={hintId}
                  value={values[m.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [m.name]: e.target.value }))}
                  disabled={busy}
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- first field of a modal the user just opened
                  autoFocus={i === 0}
                />
                <span id={hintId} className="field-hint">
                  {t(m.help)}
                </span>
              </div>
            );
          })}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {phase.kind === "testFailed" && (
            <p className="alert alert-warn" role="alert">
              {t("brandinfo.accounts.manual.savedFail", { detail: phase.detail.replace(/[.\s]+$/, "") })}
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            {phase.kind === "saving" ? t("brandinfo.accounts.manual.saving") : phase.kind === "testing" ? t("brandinfo.accounts.manual.testing") : ""}
          </p>

          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {phase.kind === "testFailed" ? t("brandinfo.accounts.close") : t("brandinfo.accounts.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || metas.length === 0}>
              {phase.kind === "saving"
                ? t("brandinfo.accounts.manual.saving")
                : phase.kind === "testing"
                  ? t("brandinfo.accounts.manual.testing")
                  : t("brandinfo.accounts.manual.save")}
            </button>
          </div>
        </form>
      )}
    </AccountDialog>
  );
}
