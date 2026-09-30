// Pure helpers for Details → Connected accounts: which platforms are shown, how each account state
// reads (pill + one plain sentence + which buttons), the manual-entry field copy, and the query
// params the backend adds when a platform sign-in sends the browser back here. No I/O.
import type { AccountStatus, ChannelId } from "../../api/types";
import type { MessageKey } from "../../i18n";

/** Cards on the Details page, in this order. WhatsApp is a share link: shown, but no account. */
export const ACCOUNT_CHANNELS = ["facebook_page", "instagram", "x", "linkedin", "google_business", "whatsapp"] as const;
export type AccountChannel = (typeof ACCOUNT_CHANNELS)[number];

/** Platforms that need a real account ("N of 5 connected"). */
export const POSTING_CHANNELS: readonly ChannelId[] = ["facebook_page", "instagram", "x", "linkedin", "google_business"];

export function isAccountChannel(v: string | null | undefined): v is AccountChannel {
  return !!v && (ACCOUNT_CHANNELS as readonly string[]).includes(v);
}

export function platformKey(channel: ChannelId): MessageKey {
  return isAccountChannel(channel) ? `brandinfo.accounts.channel.${channel}` : "brandinfo.accounts.channel.whatsapp";
}

/** How many of the five posting platforms can post right now (a shared .env account counts). */
export function countConnected(accounts: readonly AccountStatus[] | null | undefined): number {
  if (!accounts) return 0;
  return accounts.filter((a) => POSTING_CHANNELS.includes(a.channel) && a.state === "connected").length;
}

/** The status the API returned for a channel, or a plain "not connected" stand-in. */
export function statusFor(accounts: readonly AccountStatus[] | null, channel: ChannelId): AccountStatus {
  return (
    accounts?.find((a) => a.channel === channel) ?? {
      channel,
      state: "not_connected",
      method: null,
      account_name: null,
      account_id: null,
      connected_at: null,
      expires_at: null,
      oauth_available: false,
      manual_fields: [],
      detail: "",
    }
  );
}

// ---------------------------------------------------------------------------
// State → copy + actions
// ---------------------------------------------------------------------------

export type AccountTone = "ok" | "warn" | "err" | "info" | "muted";

export interface AccountView {
  tone: AccountTone;
  pill: MessageKey;
  line: MessageKey;
  /** Needs {name} (account name, or the platform name when unknown). */
  usesName: boolean;
  /** One-click sign-in button (OAuth). */
  primary: "connect" | "reconnect" | null;
  /** Manual-entry button, and whether it reads "Enter details manually" or "Update details". */
  manual: "enter" | "update" | null;
  test: boolean;
  disconnect: boolean;
  /** Link to docs/CHANNEL_SETUP.md. */
  docs: boolean;
  /** Show the backend's own `detail` line (admin-facing hint such as which .env keys are missing). */
  showDetail: boolean;
  /** "Access expires on …" line: none, informational, or a warning (within EXPIRY_WARN_DAYS). */
  expiry: "none" | "info" | "soon";
}

export const EXPIRY_WARN_DAYS = 7;

export function expiryLevel(expiresAt: string | null, now: number): "none" | "info" | "soon" {
  if (!expiresAt) return "none";
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return "none";
  return at - now <= EXPIRY_WARN_DAYS * 86_400_000 ? "soon" : "info";
}

export function accountView(a: AccountStatus, now: number = Date.now()): AccountView {
  const canManual = a.manual_fields.length > 0;
  const base: AccountView = {
    tone: "muted",
    pill: "brandinfo.accounts.pill.not_connected",
    line: "brandinfo.accounts.line.not_connected",
    usesName: false,
    primary: null,
    manual: null,
    test: false,
    disconnect: false,
    docs: false,
    showDetail: false,
    expiry: "none",
  };

  // WhatsApp posts through a share link: nothing to connect unless the backend asks for fields.
  if (a.channel === "whatsapp" && !canManual && !a.oauth_available) {
    return { ...base, tone: "ok", pill: "brandinfo.accounts.pill.ready", line: "brandinfo.accounts.line.whatsapp" };
  }

  switch (a.state) {
    case "connected": {
      if (a.method === "env") {
        // The server's global .env credentials: works, but isn't this brand's own account.
        return {
          ...base,
          tone: "info",
          pill: "brandinfo.accounts.pill.shared",
          line: a.account_name ? "brandinfo.accounts.line.sharedAs" : "brandinfo.accounts.line.shared",
          usesName: !!a.account_name,
          primary: a.oauth_available ? "connect" : null,
          manual: canManual ? "enter" : null,
          test: true,
        };
      }
      const expiry = expiryLevel(a.expires_at, now);
      return {
        ...base,
        tone: expiry === "soon" ? "warn" : "ok",
        pill: "brandinfo.accounts.pill.connected",
        line: a.account_name ? "brandinfo.accounts.line.connectedAs" : "brandinfo.accounts.line.connected",
        usesName: !!a.account_name,
        primary: a.oauth_available ? "reconnect" : null,
        manual: canManual ? "update" : null,
        test: true,
        disconnect: true,
        expiry,
      };
    }
    case "expired":
      return {
        ...base,
        tone: "err",
        pill: "brandinfo.accounts.pill.expired",
        line: "brandinfo.accounts.line.expired",
        usesName: true,
        primary: a.oauth_available ? "reconnect" : null,
        manual: canManual ? "update" : null,
        disconnect: true,
      };
    case "needs_setup":
      return {
        ...base,
        tone: "warn",
        pill: "brandinfo.accounts.pill.needs_setup",
        line: "brandinfo.accounts.line.needs_setup",
        manual: canManual ? "enter" : null,
        docs: true,
        showDetail: true,
      };
    case "pending_approval":
      return {
        ...base,
        tone: "info",
        pill: "brandinfo.accounts.pill.pending_approval",
        line: "brandinfo.accounts.line.pending_approval",
        manual: canManual ? "enter" : null,
        docs: true,
        showDetail: true,
      };
    case "not_connected":
    default:
      return {
        ...base,
        primary: a.oauth_available ? "connect" : null,
        manual: canManual ? "enter" : null,
      };
  }
}

// ---------------------------------------------------------------------------
// Setup guide links (docs/CHANNEL_SETUP.md on GitHub)
// ---------------------------------------------------------------------------

export const SETUP_DOC_PATH = "docs/CHANNEL_SETUP.md";
const SETUP_DOC_URL = `https://github.com/lowercaseboi/BrandVisibilty/blob/master/${SETUP_DOC_PATH}`;
const SETUP_ANCHORS: Partial<Record<ChannelId, string>> = {
  facebook_page: "2-meta-facebook-page--instagram",
  instagram: "2-meta-facebook-page--instagram",
  x: "3-x-twitter",
  google_business: "4-google-business-profile-gbp",
};

export function setupDocUrl(channel: ChannelId): string {
  const anchor = SETUP_ANCHORS[channel];
  return anchor ? `${SETUP_DOC_URL}#${anchor}` : SETUP_DOC_URL;
}

// ---------------------------------------------------------------------------
// Manual-entry fields
// ---------------------------------------------------------------------------

const KNOWN_FIELDS = [
  "page_id",
  "page_token",
  "ig_user_id",
  "api_key",
  "api_secret",
  "access_token",
  "access_secret",
  "refresh_token",
  "author_urn",
  "organization_id",
  "person_id",
  "account_id",
  "location_id",
] as const;
type KnownField = (typeof KNOWN_FIELDS)[number];

/** Optional on the form (everything else must be filled in). */
const OPTIONAL_FIELDS: readonly string[] = ["refresh_token"];

export interface FieldMeta {
  name: string;
  /** i18n key, or null → show `fallbackLabel`. */
  label: MessageKey | null;
  fallbackLabel: string;
  help: MessageKey;
  secret: boolean;
  required: boolean;
}

/** Tokens, secrets, keys and passwords get a password input; ids stay readable. */
export function isSecretField(name: string): boolean {
  return /(token|secret|password|api_key|(^|_)key$)/i.test(name);
}

export function fieldMeta(name: string): FieldMeta {
  const known = (KNOWN_FIELDS as readonly string[]).includes(name) ? (name as KnownField) : null;
  const words = name.replace(/[_-]+/g, " ").trim();
  return {
    name,
    label: known ? `brandinfo.accounts.field.${known}.label` : null,
    fallbackLabel: words.charAt(0).toUpperCase() + words.slice(1),
    help: known ? `brandinfo.accounts.field.${known}.help` : "brandinfo.accounts.field.generic.help",
    secret: isSecretField(name),
    required: !OPTIONAL_FIELDS.includes(name),
  };
}

/** Fields with a fixed shape, checked before sending (the backend checks again). */
const FIELD_PATTERNS: Record<string, RegExp> = {
  author_urn: /^urn:li:(person|organization):[A-Za-z0-9_-]+$/,
};

/** Trimmed values of the filled-in fields, the first required field left empty, and the first
 * field whose value has the wrong shape (e.g. a LinkedIn author that isn't urn:li:person:… /
 * urn:li:organization:…). */
export function collectFields(
  names: readonly string[],
  values: Record<string, string>,
): { fields: Record<string, string>; missing: string | null; invalid: string | null } {
  const fields: Record<string, string> = {};
  let missing: string | null = null;
  let invalid: string | null = null;
  for (const name of names) {
    const v = (values[name] ?? "").trim();
    if (v) {
      fields[name] = v;
      if (invalid === null && FIELD_PATTERNS[name] && !FIELD_PATTERNS[name].test(v)) invalid = name;
    } else if (missing === null && fieldMeta(name).required) missing = name;
  }
  return { fields, missing, invalid };
}

// ---------------------------------------------------------------------------
// Errors from the accounts API, in plain words
// ---------------------------------------------------------------------------

export type AccountErrorCopy =
  | { key: "brandinfo.accounts.err.noSecretKey" }
  | { key: "brandinfo.accounts.err.noAdminToken" }
  | { key: "brandinfo.accounts.err.action"; message: string };

/** 503 + SECRET_KEY → a setup hint; "set ADMIN_TOKEN" → the admin-token hint; else the server's message. */
export function accountErrorCopy(status: number | null, message: string): AccountErrorCopy {
  if (/SECRET_KEY/.test(message) && (status === 503 || status === null)) return { key: "brandinfo.accounts.err.noSecretKey" };
  if (/ADMIN_TOKEN/.test(message) && /(\bset ADMIN_TOKEN\b|unset|not set|not configured)/i.test(message)) {
    return { key: "brandinfo.accounts.err.noAdminToken" };
  }
  return { key: "brandinfo.accounts.err.action", message };
}

// ---------------------------------------------------------------------------
// Picker choices
// ---------------------------------------------------------------------------

const CHOICE_KINDS = ["page", "instagram", "member", "organization", "location", "user"] as const;

export function choiceKindKey(kind: string): MessageKey | null {
  return (CHOICE_KINDS as readonly string[]).includes(kind) ? (`brandinfo.accounts.kind.${kind as (typeof CHOICE_KINDS)[number]}` as const) : null;
}

// ---------------------------------------------------------------------------
// Return from a platform sign-in
// ---------------------------------------------------------------------------

export type ConnectReturn =
  /** `offer`: another channel the same sign-in can connect in one click (Facebook → Instagram). */
  | { kind: "connected"; channel: ChannelId; offer: ChannelId | null }
  | { kind: "choose"; channel: ChannelId }
  | { kind: "error"; channel: ChannelId; reason: string | null };

const RETURN_PARAMS = ["connected", "connect_choose", "connect_error", "reason", "offer"] as const;
const KNOWN_CHANNELS: readonly string[] = [...ACCOUNT_CHANNELS, "export", "sandbox"];

/** What the backend's OAuth redirect told us (`?connected=` / `?connect_choose=` / `?connect_error=&reason=`). */
export function parseConnectReturn(search: string): ConnectReturn | null {
  const q = new URLSearchParams(search);
  const pick = (key: string): ChannelId | null => {
    const v = q.get(key);
    return v && KNOWN_CHANNELS.includes(v) ? (v as ChannelId) : null;
  };
  const err = pick("connect_error");
  if (err) {
    const reason = (q.get("reason") ?? "").trim();
    return { kind: "error", channel: err, reason: reason ? reason.slice(0, 300) : null };
  }
  const choose = pick("connect_choose");
  if (choose) return { kind: "choose", channel: choose };
  const ok = pick("connected");
  if (ok) {
    const offer = pick("offer");
    return { kind: "connected", channel: ok, offer: offer && offer !== ok ? offer : null };
  }
  return null;
}

const REASONS = [
  "denied",
  "bad_state",
  "expired",
  "no_code",
  "token_exchange",
  "no_pages",
  "no_instagram",
  "no_locations",
  "api_error",
  "network",
  "not_configured",
  "no_secret_key",
] as const;

/** Plain-language copy for a known `reason` code, or null (then the raw reason is shown). */
export function connectReasonKey(reason: string | null): MessageKey | null {
  return reason && (REASONS as readonly string[]).includes(reason) ? (`brandinfo.accounts.reason.${reason as (typeof REASONS)[number]}` as const) : null;
}

/** The query string with the sign-in return params removed ("" when nothing else is left). */
export function stripConnectParams(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of RETURN_PARAMS) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** A `?return=` target (e.g. back to the Campaign Studio): only relative paths inside this brand. */
export function safeReturnPath(brandKey: string, raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300 || raw.includes("//") || raw.includes("\\")) return null;
  return raw.startsWith(`/brands/${encodeURIComponent(brandKey)}/`) || raw.startsWith(`/brands/${brandKey}/`) ? raw : null;
}

/** Append `connected=<channel>` to a return path (keeps its own query). */
export function withConnected(path: string, channel: string | null): string {
  if (!channel) return path;
  const [base, hash = ""] = path.split("#", 2);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connected=${encodeURIComponent(channel)}${hash ? `#${hash}` : ""}`;
}
