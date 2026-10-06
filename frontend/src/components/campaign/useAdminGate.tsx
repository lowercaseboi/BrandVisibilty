/* oxlint-disable react/only-export-components -- the hook renders its own private dialog */
import { useCallback, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useT } from "../../i18n";
import { Sheet } from "../Sheet";
import { clearAdminToken, isTokenRejected, readAdminToken, saveAdminToken } from "./adminToken";

interface Ask {
  rejected: boolean;
  resolve: (token: string | null) => void;
}

export interface RunAdminOptions {
  /** Ask before the first call when no token is stored (publish: a tokenless attempt at a real
   * channel is logged as blocked). Otherwise the call is tried without a token first, and a server
   * with no ADMIN_TOKEN never asks at all. */
  promptFirst?: boolean;
}

/**
 * Runs approve / publish / delete with the admin token (X-Admin-Token). Asks at most once per tab
 * (a small modal, password field), keeps the answer in sessionStorage and asks again when the
 * server rejects it (401). An empty answer is allowed: a server without ADMIN_TOKEN still accepts
 * approval and the sandbox / export / WhatsApp channels. Returns null when the user cancels.
 */
export function useAdminGate(): {
  runAdmin: <T>(fn: (token: string) => Promise<T>, opts?: RunAdminOptions) => Promise<T | null>;
  dialog: ReactNode;
} {
  const [ask, setAsk] = useState<Ask | null>(null);

  const prompt = useCallback(
    (rejected: boolean) => new Promise<string | null>((resolve) => setAsk({ rejected, resolve })),
    [],
  );

  const runAdmin = useCallback(
    async <T,>(fn: (token: string) => Promise<T>, opts: RunAdminOptions = {}): Promise<T | null> => {
      const stored = readAdminToken();
      let token = stored ?? "";
      if (stored === null && opts.promptFirst) {
        const answer = await prompt(false);
        if (answer === null) return null;
        token = answer;
        saveAdminToken(token);
      }
      for (;;) {
        try {
          const out = await fn(token);
          // Accepted without a token: the server has no ADMIN_TOKEN, so never ask this tab again.
          if (readAdminToken() === null) saveAdminToken(token);
          return out;
        } catch (err) {
          if (!isTokenRejected(err)) throw err;
          clearAdminToken();
          // "Rejected" only when a token was actually sent; a first tokenless try just asks.
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
  const hintId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onClose(value.trim());
  };

  return (
    <Sheet title={t("board.campaign.token.title")} describedBy={hintId} onClose={() => onClose(null)}>
      {(dismiss) => (
        <form onSubmit={submit} className="sheet-form">
          {rejected && (
            <p className="field-error" role="alert">
              {t("board.campaign.token.rejected")}
            </p>
          )}
          <p id={hintId} className="muted small">
            {t("board.campaign.token.hint")}
          </p>
          <label className="field">
            {t("board.campaign.token.label")}
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
            <button type="button" className="btn btn-ghost" onClick={dismiss}>
              {t("board.campaign.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {t("board.campaign.token.submit")}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
