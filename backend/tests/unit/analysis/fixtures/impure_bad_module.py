"""Deliberately impure fixture used only by test_purity.py to prove the checker can fail.

This file is NOT part of `app.analysis` — it lives under tests/fixtures and is never
imported, only read as source text and AST-parsed by the purity checker. It mixes a
disallowed import, a disallowed import target under an otherwise-fine module, and
disallowed I/O calls so the checker's several rules are all exercised.
"""

from __future__ import annotations

import os
import subprocess

import httpx
from pathlib import Path


def do_something_impure(path: str) -> str:
    os.environ.get("SECRET")
    subprocess.run(["echo", "hi"])
    httpx.get("https://example.com")
    with open(path) as f:
        data = f.read()
    Path(path).write_text(data)
    return data
