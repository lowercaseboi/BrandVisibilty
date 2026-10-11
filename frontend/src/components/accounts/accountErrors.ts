import { ApiError } from "../../api/client";
import type { TFunction } from "../../i18n";
import { accountErrorCopy } from "./accountsModel";

/**
 * Any error from the accounts API as one plain sentence for the card / dialog. `technical` (the
 * Analytical view) swaps the setup hints for the ones naming the server settings, and adds the
 * server's own message to a generic failure.
 */
export function accountErrorText(t: TFunction, err: unknown, technical = false): string {
  const message = err instanceof Error ? err.message : String(err);
  const copy = accountErrorCopy(err instanceof ApiError ? err.status : null, message);
  switch (copy.key) {
    case "brandinfo.accounts.err.noSecretKey":
      return t(technical ? "brandinfo.accounts.err.noSecretKeyTech" : copy.key);
    case "brandinfo.accounts.err.noAdminToken":
      return t(technical ? "brandinfo.accounts.err.noAdminTokenTech" : copy.key);
    default:
      return technical ? t(copy.key, { message: copy.message }) : t("brandinfo.accounts.err.actionPlain");
  }
}
