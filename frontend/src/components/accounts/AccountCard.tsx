import type { AccountStatus } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import { ChannelIcon } from "./ChannelIcon";
import { SETUP_DOC_PATH, accountView, platformKey, setupDocUrl } from "./accountsModel";
import type { AccountTone } from "./accountsModel";

export interface CardNote {
  tone: "ok" | "err";
  text: string;
}

const PILL_CLASS: Record<AccountTone, string> = {
  ok: "pill-ok",
  warn: "pill-warn",
  err: "pill-err",
  info: "pill-info",
  muted: "badge-muted",
};

export type CardAction = "connect" | "manual" | "test" | "disconnect";

/** One platform on Details → Connected accounts: state pill, one plain sentence, its actions. */
export function AccountCard({
  status,
  busy,
  note,
  onAction,
  onDismissNote,
}: {
  status: AccountStatus;
  busy: string | null;
  note: CardNote | null;
  onAction: (action: CardAction) => void;
  onDismissNote: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const view = accountView(status);
  const platform = t(platformKey(status.channel));
  const name = status.account_name || platform;
  const headingId = `acc-card-${status.channel}`;
  const disabled = busy !== null;

  return (
    <li className={`acc-card acc-tone-${view.tone}`} aria-busy={disabled || undefined}>
      <div className="acc-card-head">
        <span className="acc-card-icon">
          <ChannelIcon channel={status.channel} />
        </span>
        <h3 id={headingId} className="acc-card-name" tabIndex={-1}>
          {platform}
        </h3>
        <span className={`pill ${PILL_CLASS[view.tone]} acc-pill`}>{t(view.pill)}</span>
      </div>

      <p className="acc-card-line">{t(view.line, { name, platform })}</p>
      {view.expiry !== "none" && status.expires_at && (
        <p className={`acc-card-sub${view.expiry === "soon" ? " is-warn" : ""}`}>
          {t(view.expiry === "soon" ? "brandinfo.accounts.expiresSoon" : "brandinfo.accounts.expiresOn", { date: fmt.date(status.expires_at) })}
        </p>
      )}
      {status.state === "connected" && (status.method === "oauth" || status.method === "manual") && (
        <p className="acc-card-sub">{t(status.method === "oauth" ? "brandinfo.accounts.via.oauth" : "brandinfo.accounts.via.manual", { platform })}</p>
      )}
      {view.showDetail && status.detail && (
        <details className="acc-card-sub acc-tech">
          <summary>{t("brandinfo.accounts.techDetail")}</summary>
          <p>{status.detail}</p>
        </details>
      )}
      {view.docs && (
        <p className="acc-card-sub">
          {t("brandinfo.accounts.docs")}{" "}
          <a href={setupDocUrl(status.channel)} target="_blank" rel="noreferrer">
            {SETUP_DOC_PATH}
          </a>
        </p>
      )}

      {note && (
        <div className={`acc-note acc-note-${note.tone}`} role={note.tone === "err" ? "alert" : "status"}>
          <span>{note.text}</span>
          <button type="button" className="btn btn-link acc-note-close" onClick={onDismissNote}>
            {t("brandinfo.accounts.dismiss")}
          </button>
        </div>
      )}
      {busy && (
        <p className="acc-card-sub acc-busy" role="status">
          {busy}
        </p>
      )}

      {(view.primary || view.manual || view.test || view.disconnect) && (
        <div className="acc-actions">
          {view.primary && (
            <button
              type="button"
              className={`btn btn-small ${view.primary === "connect" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => onAction("connect")}
              disabled={disabled}
              aria-label={t(view.primary === "connect" ? "brandinfo.accounts.action.connectAria" : "brandinfo.accounts.action.reconnectAria", { platform })}
            >
              {t(view.primary === "connect" ? "brandinfo.accounts.action.connect" : "brandinfo.accounts.action.reconnect")}
            </button>
          )}
          {view.manual && (
            <button
              type="button"
              className={`btn btn-small ${!view.primary && status.state !== "connected" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => onAction("manual")}
              disabled={disabled}
              aria-label={t(view.manual === "enter" ? "brandinfo.accounts.action.manualAria" : "brandinfo.accounts.action.updateAria", { platform })}
            >
              {t(view.manual === "enter" ? "brandinfo.accounts.action.manual" : "brandinfo.accounts.action.update")}
            </button>
          )}
          {view.test && (
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => onAction("test")}
              disabled={disabled}
              aria-label={t("brandinfo.accounts.action.testAria", { platform })}
            >
              {t("brandinfo.accounts.action.test")}
            </button>
          )}
          {view.disconnect && (
            <button
              type="button"
              className="btn btn-small btn-danger acc-disconnect"
              onClick={() => onAction("disconnect")}
              disabled={disabled}
              aria-label={t("brandinfo.accounts.action.disconnectAria", { platform })}
            >
              {t("brandinfo.accounts.action.disconnect")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
