import { ApiError } from "../../api/client";
import type { TFunction } from "../../i18n";
import { accountErrorCopy } from "./accountsModel";

/** Any error from the accounts API as one plain sentence for the card / dialog. */
export function accountErrorText(t: TFunction, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const copy = accountErrorCopy(err instanceof ApiError ? err.status : null, message);
  return copy.key === "brandinfo.accounts.err.action" ? t(copy.key, { message: copy.message }) : t(copy.key);
}
