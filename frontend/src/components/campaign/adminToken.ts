// The admin token the backend checks on approve / publish / delete (X-Admin-Token). Asked for once
// per tab and kept in sessionStorage (never localStorage: it should not outlive the session).
import { ApiError } from "../../api/client";

const KEY = "bv.adminToken";

/** The stored token; "" = the user chose to go without one; null = never asked this session. */
export function readAdminToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveAdminToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable: the token lives only for this call */
  }
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The server has no ADMIN_TOKEN configured, so only sandbox / export / WhatsApp are allowed. */
export function isTokenUnsetError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 403 && err.status !== 401 && err.status !== 503) return false;
  // Backend: 403 "Set ADMIN_TOKEN to publish to real channels".
  return /ADMIN_TOKEN/.test(err.message) && /(\bset ADMIN_TOKEN\b|unset|not set|not configured)/i.test(err.message);
}

/** The token was missing or wrong (ask again). A 403 from the approval gate itself ("not approved")
 * is not a token problem, so a plain 403 only counts when it talks about the token/admin. */
export function isTokenRejected(err: unknown): boolean {
  if (!(err instanceof ApiError) || isTokenUnsetError(err)) return false;
  if (err.status === 401) return true;
  return err.status === 403 && /(token|admin|unauthori[sz]ed|forbidden)/i.test(err.message);
}
