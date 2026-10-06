/* oxlint-disable react/only-export-components -- the hook renders its own private dialog */
import { useCallback, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useT } from "../../i18n";
import { clearAdminToken, isTokenRejected, readAdminToken, saveAdminToken } from "../campaign/adminToken";
import { AccountDialog } from "./AccountDialog";

/**
 * Runs an account change (connect, disconnect, manual save, test, choose) with the admin token
 * (X-Admin-Token). Same token and storage as the Campaign Studio (campaign/adminToken.ts): tried
 * without asking first, and the user is asked only when the server rejects it. Resolves null when
 * the user cancels the prompt.
 */
export function useAccountAdmin(): {
  runAdmin: <T>(fn: (token: string) => Promise<T>) => Promise<T | null>;
  dialog: ReactNode;
} {
  const [ask, setAsk] = useState<{ rejected: boolean; resolve: (token: string | null) => void } | null>(null);

  const prompt = useCallback((rejected: boolean) => new Promise<string | null>((resolve) => setAsk({ rejected, resolve })), []);

  const runAdmin = useCallback(
    async <T,>(fn: (token: string) => Promise<T>): Promise<T | null> => {
      let token = readAdminToken() ?? "";
      for (;;) {
        try {
          const out = await fn(token);
          if (readAdminToken() === null) saveAdminToken(token);
          return out;
        } catch (err) {
          if (!isTokenRejected(err)) throw err;
          clearAdminToken();
          const answer = await prompt(token !== "");
          if (answer === null) return null;
          token = answer;
          saveAdminToken(token);
        }
      }
    },
    [prompt],
  );

  const close = (value: string | null) => {
    ask?.resolve(value);
    setAsk(null);
  };

  return { runAdmin, dialog: ask ? <TokenDialog rejected={ask.rejected} onClose={close} /> : null };
}

function TokenDialog({ rejected, onClose }: { rejected: boolean; onClose: (token: string | null) => void }) {
  const t = useT();
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onClose(value.trim());
  };
  return (
    <AccountDialog title={t("brandinfo.accounts.token.title")} onClose={() => onClose(null)}>
      <form onSubmit={submit} className="acc-form">
        {rejected && (
          <p className="field-error" role="alert">
            {t("brandinfo.accounts.token.rejected")}
          </p>
        )}
        <p className="muted small">{t("brandinfo.accounts.token.hint")}</p>
        <label className="field">
          {t("brandinfo.accounts.token.label")}
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the only field of a modal the user just opened
            autoFocus
          />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(null)}>
            {t("brandinfo.accounts.cancel")}
          </button>
          <button type="submit" className="btn btn-primary">
            {t("brandinfo.accounts.token.submit")}
          </button>
        </div>
      </form>
    </AccountDialog>
  );
}
