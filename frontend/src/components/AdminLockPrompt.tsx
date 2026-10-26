import { useEffect, useState } from "react";
import { setAdminLockHandler } from "../api/client";
import { useT } from "../i18n";
import { clearAdminToken, readAdminToken, saveAdminToken } from "./campaign/adminToken";
import { TokenDialog } from "./campaign/useAdminGate";

interface Ask {
  rejected: boolean;
  resolve: (token: string | null) => void;
}

/**
 * The demo lock's password prompt (api/client.ts `lockable`). Mounted once in App: when a costly
 * or destructive request comes back 401, it asks for the admin password, keeps it for this tab
 * (sessionStorage, shared with Campaign Studio's posting password) and the request is retried.
 */
export function AdminLockPrompt() {
  const t = useT();
  const [ask, setAsk] = useState<Ask | null>(null);

  useEffect(() => {
    setAdminLockHandler({
      token: () => readAdminToken() || null,
      ask: (rejected) => {
        if (rejected) clearAdminToken();
        return new Promise((resolve) => setAsk({ rejected, resolve }));
      },
    });
    return () => setAdminLockHandler(null);
  }, []);

  if (!ask) return null;
  const close = (value: string | null) => {
    if (value) saveAdminToken(value);
    ask.resolve(value || null);
    setAsk(null);
  };
  return (
    <TokenDialog
      rejected={ask.rejected}
      onClose={close}
      text={{ title: t("common.lock.title"), hint: t("common.lock.hint"), hintDetail: t("common.lock.hintDetail") }}
    />
  );
}
