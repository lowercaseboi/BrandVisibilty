import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { chooseAccount, disconnectAccount, listAccountChoices, startAccountOAuth, testAccount } from "../../api/client";
import type { AccountChoice } from "../../api/client";
import type { AccountStatus, ChannelId } from "../../api/types";
import { useFormat, useT } from "../../i18n";
import { EmptyState } from "../EmptyState";
import { toast } from "../Toaster";
import { AccountCard } from "./AccountCard";
import type { CardAction, CardNote } from "./AccountCard";
import { AccountDialog } from "./AccountDialog";
import { ChannelIcon } from "./ChannelIcon";
import { accountErrorText } from "./accountErrors";
import { ChooseAccountDialog } from "./ChooseAccountDialog";
import { ManualEntryDialog } from "./ManualEntryDialog";
import {
  ACCOUNT_CHANNELS,
  POSTING_CHANNELS,
  connectReasonKey,
  countConnected,
  parseConnectReturn,
  platformKey,
  statusFor,
  stripConnectParams,
} from "./accountsModel";
import { safeReturnPath, withConnected } from "./accountsModel";
import { putAccountStatus, useAccounts } from "./useAccounts";
import { useAccountAdmin } from "./useAccountAdmin";

type Open =
  | { kind: "manual"; status: AccountStatus }
  | { kind: "choose"; channel: ChannelId }
  | { kind: "disconnect"; status: AccountStatus }
  | null;

const cardHeading = (channel: ChannelId) => () => document.getElementById(`acc-card-${channel}`);

/**
 * Details → Connected accounts: one card per platform with its state and actions, the manual-entry
 * / picker / disconnect dialogs, and the return from a platform sign-in (the backend redirects
 * back with ?connected= / ?connect_choose= / ?connect_error=&reason=, which is handled once and
 * then removed from the address bar).
 */
export function ConnectedAccounts({ brandKey }: { brandKey: string }) {
  const t = useT();
  const fmt = useFormat();
  const location = useLocation();
  const navigate = useNavigate();
  const { accounts, state, error, reload } = useAccounts(brandKey);
  const { runAdmin, dialog: tokenDialog } = useAccountAdmin();
  const platform = useCallback((c: ChannelId) => t(platformKey(c)), [t]);

  // Return from a platform sign-in (a full page load from the backend's redirect): read once at
  // mount. The picker opens straight away and an error shows on its card; the effect below adds
  // the toast, refreshes the list and removes the params from the address bar.
  const [ret] = useState(() => parseConnectReturn(location.search));
  const [open, setOpen] = useState<Open>(() => (ret?.kind === "choose" ? { kind: "choose", channel: ret.channel } : null));
  const [busy, setBusy] = useState<Partial<Record<ChannelId, string>>>({});
  const [offer, setOffer] = useState<{ channel: ChannelId; choices: AccountChoice[] } | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [notes, setNotes] = useState<Partial<Record<ChannelId, CardNote>>>(() => {
    if (!ret || ret.kind === "choose") return {};
    const name = t(platformKey(ret.channel));
    if (ret.kind === "connected") return { [ret.channel]: { tone: "ok", text: t("brandinfo.accounts.toast.connected", { platform: name }) } };
    const known = connectReasonKey(ret.reason);
    const reason = known ? t(known) : ret.reason;
    const text = reason
      ? t("brandinfo.accounts.returnError", { platform: name, reason })
      : t("brandinfo.accounts.returnErrorPlain", { platform: name });
    return { [ret.channel]: { tone: "err", text } };
  });

  const setNote = (c: ChannelId, note: CardNote | null) => setNotes((n) => ({ ...n, [c]: note ?? undefined }));
  const setBusyFor = (c: ChannelId, text: string | null) => setBusy((b) => ({ ...b, [c]: text ?? undefined }));
  const describe = (err: unknown) => accountErrorText(t, err);

  const handled = useRef(false);
  const { pathname, search, hash } = location;

  // Came from somewhere that wants the user back after connecting (the Campaign Studio's
  // "Connect" link passes ?return=…). Kept per tab so it survives the OAuth round trip, whose
  // redirect only brings the user back to this page.
  const returnKey = `bv.accountsReturn.${brandKey}`;
  const [returnTo, setReturnTo] = useState<string | null>(() => {
    const fromUrl = safeReturnPath(brandKey, new URLSearchParams(search).get("return"));
    try {
      if (fromUrl) sessionStorage.setItem(returnKey, fromUrl);
      return fromUrl ?? safeReturnPath(brandKey, sessionStorage.getItem(returnKey));
    } catch {
      return fromUrl;
    }
  });
  const [lastConnected, setLastConnected] = useState<ChannelId | null>(null);
  const leaveForReturn = () => {
    try {
      sessionStorage.removeItem(returnKey);
    } catch {
      /* storage unavailable */
    }
    setReturnTo(null);
  };
  useEffect(() => {
    if (!ret || handled.current) return;
    handled.current = true;
    const name = platform(ret.channel);
    if (ret.kind === "connected") {
      toast(t("brandinfo.accounts.toast.connected", { platform: name }));
      setLastConnected(ret.channel);
    }
    if (ret.kind === "error") toast(t("brandinfo.accounts.toast.error", { platform: name }));
    if (ret.kind !== "choose") void reload();
    // Facebook sign-in that also found a linked Instagram account: offer it in one click.
    if (ret.kind === "connected" && ret.offer) {
      const offerChannel = ret.offer;
      listAccountChoices(brandKey, offerChannel)
        .then((choices) => choices.length > 0 && setOffer({ channel: offerChannel, choices }))
        .catch(() => {});
    }
    navigate({ pathname, search: stripConnectParams(search), hash: hash || "#accounts" }, { replace: true, preventScrollReset: true });
  }, [ret, brandKey, platform, t, reload, navigate, pathname, search, hash]);

  const acceptOffer = async () => {
    if (!offer) return;
    if (offer.choices.length > 1) {
      setOpen({ kind: "choose", channel: offer.channel });
      setOffer(null);
      return;
    }
    setOfferBusy(true);
    try {
      const s = await runAdmin((token) => chooseAccount(brandKey, offer.channel, offer.choices[0].id, token));
      if (s) {
        putAccountStatus(brandKey, s);
        toast(t("brandinfo.accounts.toast.connected", { platform: platform(s.channel) }));
        setOffer(null);
      }
    } catch (err) {
      setNote(offer.channel, { tone: "err", text: describe(err) });
      setOffer(null);
    }
    setOfferBusy(false);
  };

  const act = async (status: AccountStatus, action: CardAction) => {
    const c = status.channel;
    setNote(c, null);
    if (action === "manual") return setOpen({ kind: "manual", status });
    if (action === "disconnect") return setOpen({ kind: "disconnect", status });
    if (action === "connect") {
      setBusyFor(c, t("brandinfo.accounts.redirecting", { platform: platform(c) }));
      try {
        // A relative app path: the backend only accepts /brands/<brand>/… and adds its own origin.
        const returnTo = pathname;
        const res = await runAdmin((token) => startAccountOAuth(brandKey, c, token, returnTo));
        if (res?.authorize_url) {
          window.location.assign(res.authorize_url);
          return; // keep the busy line while the browser leaves
        }
      } catch (err) {
        setNote(c, { tone: "err", text: describe(err) });
      }
      setBusyFor(c, null);
      return;
    }
    // test
    setBusyFor(c, t("brandinfo.accounts.busy"));
    try {
      const res = await runAdmin((token) => testAccount(brandKey, c, token));
      if (res) {
        setNote(c, res.ok ? { tone: "ok", text: t("brandinfo.accounts.test.ok") } : { tone: "err", text: t("brandinfo.accounts.test.fail", { detail: res.detail.replace(/[.\s]+$/, "") }) });
      }
    } catch (err) {
      setNote(c, { tone: "err", text: describe(err) });
    }
    setBusyFor(c, null);
  };

  const disconnect = async (status: AccountStatus) => {
    const c = status.channel;
    setOpen(null);
    setBusyFor(c, t("brandinfo.accounts.busy"));
    try {
      const s = await runAdmin((token) => disconnectAccount(brandKey, c, token));
      if (s) {
        putAccountStatus(brandKey, s);
        toast(t("brandinfo.accounts.toast.disconnected", { platform: platform(c) }));
        requestAnimationFrame(() => cardHeading(c)()?.focus());
      }
    } catch (err) {
      setNote(c, { tone: "err", text: describe(err) });
    }
    setBusyFor(c, null);
  };

  const connected = countConnected(accounts);

  return (
    <>
      <div className="module-section-head">
        <div>
          <p className="eyebrow">{t("brandinfo.accounts.eyebrow")}</p>
          <h2 id="bi-accounts-title" tabIndex={-1}>
            {t("brandinfo.accounts.title")}
          </h2>
          <p>{t("brandinfo.accounts.sub")}</p>
        </div>
        {state === "ready" && (
          <p className="acc-count" aria-live="polite">
            {t("brandinfo.accounts.count", { n: fmt.number(connected), total: fmt.number(POSTING_CHANNELS.length) })}
          </p>
        )}
      </div>

      {returnTo && (
        <div className="acc-offer acc-return" role="status">
          <p>{lastConnected ? t("brandinfo.accounts.return.ready") : t("brandinfo.accounts.return.hint")}</p>
          <div className="acc-offer-actions">
            <Link className="btn btn-primary" to={withConnected(returnTo, lastConnected)} onClick={leaveForReturn}>
              {t("brandinfo.accounts.return.back")}
            </Link>
          </div>
        </div>
      )}

      {state === "loading" && !accounts && (
        <p className="status" aria-busy="true">
          {t("brandinfo.accounts.loading")}
        </p>
      )}
      {state === "unavailable" && (
        <EmptyState compact as="h3" title={t("brandinfo.accounts.unavailableTitle")} body={t("brandinfo.accounts.unavailable")} />
      )}
      {state === "error" && (
        <EmptyState
          compact
          as="h3"
          icon="error"
          tone="error"
          role="alert"
          title={t("brandinfo.accounts.errorTitle")}
          body={t("brandinfo.accounts.error", { message: error ?? "" })}
          primary={
            <button type="button" className="btn btn-small btn-secondary" onClick={() => void reload()}>
              {t("brandinfo.accounts.retry")}
            </button>
          }
        />
      )}

      {offer && (
        <div className="acc-offer" role="status">
          <span className="acc-card-icon">
            <ChannelIcon channel={offer.channel} />
          </span>
          <p>
            {offer.choices.length === 1
              ? t("brandinfo.accounts.offer.text", { platform: platform(offer.channel), name: offer.choices[0].name })
              : t("brandinfo.accounts.offer.textPlain", { platform: platform(offer.channel) })}
          </p>
          <div className="acc-offer-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={() => void acceptOffer()} disabled={offerBusy}>
              {offer.choices.length === 1
                ? t("brandinfo.accounts.offer.accept", { platform: platform(offer.channel), name: offer.choices[0].name })
                : t("brandinfo.accounts.offer.acceptPlain", { platform: platform(offer.channel) })}
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setOffer(null)} disabled={offerBusy}>
              {t("brandinfo.accounts.offer.dismiss")}
            </button>
          </div>
        </div>
      )}

      {accounts && (
        <ul className="acc-grid" aria-label={t("brandinfo.accounts.listLabel")}>
          {ACCOUNT_CHANNELS.map((c) => (
            <AccountCard
              key={c}
              status={statusFor(accounts, c)}
              busy={busy[c] ?? null}
              note={notes[c] ?? null}
              onAction={(a) => void act(statusFor(accounts, c), a)}
              onDismissNote={() => setNote(c, null)}
            />
          ))}
        </ul>
      )}

      {open?.kind === "manual" && (
        <ManualEntryDialog
          brandKey={brandKey}
          status={open.status}
          runAdmin={runAdmin}
          onSaved={(s) => {
            putAccountStatus(brandKey, s);
            if (s.state === "connected") setLastConnected(s.channel);
            toast(t("brandinfo.accounts.toast.saved", { platform: platform(s.channel) }));
          }}
          onClose={() => setOpen(null)}
          fallbackFocus={cardHeading(open.status.channel)}
        />
      )}
      {open?.kind === "choose" && (
        <ChooseAccountDialog
          brandKey={brandKey}
          channel={open.channel}
          runAdmin={runAdmin}
          onChosen={(s) => {
            putAccountStatus(brandKey, s);
            setLastConnected(s.channel);
            setOpen(null);
            toast(t("brandinfo.accounts.toast.connected", { platform: platform(s.channel) }));
          }}
          onClose={() => setOpen(null)}
          fallbackFocus={cardHeading(open.channel)}
        />
      )}
      {open?.kind === "disconnect" && (
        <AccountDialog
          title={t("brandinfo.accounts.disconnect.title", { platform: platform(open.status.channel) })}
          onClose={() => setOpen(null)}
          fallbackFocus={cardHeading(open.status.channel)}
        >
          <div className="acc-form">
            <p>
              {t("brandinfo.accounts.disconnect.body", {
                name: open.status.account_name || platform(open.status.channel),
              })}
            </p>
            <div className="sheet-actions">
              {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the safe choice gets focus in a destructive confirm */}
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)} autoFocus>
                {t("brandinfo.accounts.cancel")}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void disconnect(open.status)}>
                {t("brandinfo.accounts.disconnect.confirm")}
              </button>
            </div>
          </div>
        </AccountDialog>
      )}
      {tokenDialog}
    </>
  );
}
