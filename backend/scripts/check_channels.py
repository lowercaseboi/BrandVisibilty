"""Verify a brand's social accounts before publishing — posts nothing.

For each channel it prints what the publish path would use (the brand's own account, the server's
.env fallback, or nothing), whether a publish would post / export / be refused and why, and then
makes one cheap read-only call per connected account (the same probe as the "Test" button:
Page name, Instagram username, X user, LinkedIn member, GBP location). An expired token with a
refresh token is refreshed first (and the new token saved), exactly as a publish would.

Run (from backend/, with the same .env the server uses — SECRET_KEY must match or stored tokens
can't be decrypted):
    uv run python scripts/check_channels.py --brand gajanan_vada_pav
    uv run python scripts/check_channels.py --brand gajanan_vada_pav --offline   # no network calls
    uv run python scripts/check_channels.py --brand gajanan_vada_pav --channel instagram

Exit code: 0 when every connected channel's check passed, 1 when any failed, 2 on bad usage.
Tokens are never printed.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from app.config.settings import Settings
from app.distribution import accounts, oauth
from app.distribution.channels import get_adapter
from app.distribution.channels.base import ACCOUNT_CHANNELS

CHANNELS = (*ACCOUNT_CHANNELS, "whatsapp")
_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def _source(state: accounts.AccountStatus) -> str:
    return {"oauth": "brand account (Connect button)", "manual": "brand account (entered manually)",
            "env": "server .env fallback (shared by all brands)"}.get(state.method or "", "nothing configured")


def check(brand: str, channels: list[str], *, offline: bool, out=print) -> int:
    settings = Settings()
    failures = 0
    base = settings.public_base_url or "(not set)"
    out(f"Brand {brand} · PUBLIC_BASE_URL {base} · ADMIN_TOKEN {'set' if settings.admin_token else 'NOT set — real channels are refused'}"
        f" · SECRET_KEY {'set' if settings.secret_key else 'NOT set — brand accounts unusable'}")
    for ch in channels:
        acct = accounts.account_status(brand, ch, settings=settings)  # type: ignore[arg-type]
        status = get_adapter(ch, brand, settings=settings).status()  # type: ignore[arg-type]
        if ch == "whatsapp":
            verdict = _c("36", "SHARE LINK")
        elif status.mode == "connected":
            verdict = _c("32", "WOULD POST")
        elif acct.method is not None or acct.state == "expired":
            verdict = _c("31", "REFUSED")
        else:
            verdict = _c("33", "EXPORT ONLY")
        out(f"\n{_c('1', status.label)} [{ch}]  {verdict}")
        out(f"  credentials : {_source(acct)}" + (f" — {acct.account_name}" if acct.account_name else "")
            + (f" ({acct.account_id})" if acct.account_id and acct.account_id != acct.account_name else ""))
        out(f"  account     : {acct.state} — {acct.detail}")
        out(f"  publish     : {status.mode} — {status.detail}")
        if acct.expires_at:
            out(f"  expires     : {acct.expires_at}")
        if ch == "whatsapp" or status.mode != "connected":
            continue
        if offline:
            out("  test call   : skipped (--offline)")
            continue
        ok, detail = oauth.test_account(brand, ch, settings=settings)
        out(f"  test call   : {_c('32', 'OK') if ok else _c('31', 'FAILED')} — {detail}")
        failures += 0 if ok else 1
    out("")
    out("Nothing was posted. 'WOULD POST' + a passing test call = publishing will reach the platform "
        "(content rules, quotas and platform review can still reject a post).")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check a brand's channel accounts without posting anything.")
    parser.add_argument("--brand", required=True, help="brand key, e.g. gajanan_vada_pav")
    parser.add_argument("--channel", choices=CHANNELS, action="append", help="only these channels (repeatable)")
    parser.add_argument("--offline", action="store_true", help="don't contact any platform; just show resolved state")
    args = parser.parse_args(argv)
    try:
        accounts._safe_brand(args.brand)
    except accounts.AccountError as exc:
        print(exc, file=sys.stderr)
        return 2
    return check(args.brand, list(args.channel or CHANNELS), offline=args.offline)


if __name__ == "__main__":
    raise SystemExit(main())
