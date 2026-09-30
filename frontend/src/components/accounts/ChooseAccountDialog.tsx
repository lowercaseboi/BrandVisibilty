import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { chooseAccount, listAccountChoices } from "../../api/client";
import type { AccountChoice } from "../../api/client";
import type { AccountStatus, ChannelId } from "../../api/types";
import { humanize } from "../../format";
import { useT } from "../../i18n";
import { EmptyState } from "../EmptyState";
import { AccountDialog } from "./AccountDialog";
import { choiceKindKey, platformKey } from "./accountsModel";
import { accountErrorText } from "./accountErrors";

/**
 * After a sign-in that can post as several Pages / organisations / locations
 * (`?connect_choose=<channel>`): list them (GET …/choices) and store the one picked (POST …/choose).
 */
export function ChooseAccountDialog({
  brandKey,
  channel,
  runAdmin,
  onChosen,
  onClose,
  fallbackFocus,
}: {
  brandKey: string;
  channel: ChannelId;
  runAdmin: <T>(fn: (token: string) => Promise<T>) => Promise<T | null>;
  onChosen: (s: AccountStatus) => void;
  onClose: () => void;
  fallbackFocus: () => HTMLElement | null;
}) {
  const t = useT();
  const uid = useId();
  const platform = t(platformKey(channel));
  const kindLabel = (kind: string) => {
    const key = choiceKindKey(kind);
    return key ? t(key) : humanize(kind);
  };
  const [choices, setChoices] = useState<AccountChoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listAccountChoices(brandKey, channel)
      .then((list) => {
        if (!live) return;
        setChoices(list);
        if (list.length === 1) setPicked(list[0].id);
      })
      .catch((err: unknown) => live && setLoadError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [brandKey, channel]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await runAdmin((token) => chooseAccount(brandKey, channel, picked, token));
      if (s) onChosen(s);
      else setBusy(false);
    } catch (err) {
      setBusy(false);
      setError(accountErrorText(t, err));
    }
  };

  return (
    <AccountDialog title={t("brandinfo.accounts.choose.title", { platform })} onClose={onClose} fallbackFocus={fallbackFocus}>
      <form className="acc-form" onSubmit={submit} aria-busy={busy || (!choices && !loadError)}>
        {!choices && !loadError && <p className="status">{t("brandinfo.accounts.choose.loading")}</p>}
        {loadError && (
          <EmptyState
            compact
            as="p"
            icon="error"
            tone="error"
            role="alert"
            title={t("brandinfo.accounts.choose.errorTitle")}
            body={t("brandinfo.accounts.choose.error", { message: loadError })}
          />
        )}
        {choices && choices.length === 0 && (
          <EmptyState compact as="p" icon="search" title={t("brandinfo.accounts.choose.emptyTitle")} body={t("brandinfo.accounts.choose.empty")} />
        )}
        {choices && choices.length > 0 && (
          <fieldset className="acc-choices">
            <legend className="sr-only">{t("brandinfo.accounts.choose.legend")}</legend>
            {choices.map((c, i) => (
              <label key={c.id} className={`acc-choice${picked === c.id ? " is-picked" : ""}`}>
                <input
                  type="radio"
                  name={`${uid}-choice`}
                  value={c.id}
                  checked={picked === c.id}
                  onChange={() => setPicked(c.id)}
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- first option of a modal opened on return from sign-in
                  autoFocus={i === 0}
                />
                <span className="acc-choice-name">{c.name}</span>
                {c.kind && <span className="acc-choice-kind muted small">{kindLabel(c.kind)}</span>}
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="acc-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("brandinfo.accounts.cancel")}
          </button>
          {choices && choices.length > 0 && (
            <button type="submit" className="btn btn-primary" disabled={!picked || busy}>
              {busy ? t("brandinfo.accounts.busy") : t("brandinfo.accounts.choose.submit")}
            </button>
          )}
        </div>
      </form>
    </AccountDialog>
  );
}
