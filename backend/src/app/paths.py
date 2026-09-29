"""Leaf module owning `DATA_DIR` — the one data root shared by the tracking store, the
custom question-set store, the recommendation board and the brand registry.

Imports nothing from `app`, so anything in the app can depend on it without creating an
import cycle (architecture review point #3: `brands/registry.py` and
`collection/registry.py` used to reach `DATA_DIR` through `app.tracking.store`, which made
those modules depend on storage infrastructure, and one of them needed a lazy import just
to avoid the cycle).

Callers read `paths.DATA_DIR` as a module attribute at call time (`import app.paths as
paths; ... paths.DATA_DIR ...`), never via `from app.paths import DATA_DIR`, so tests can
redirect it with `monkeypatch.setattr(paths, "DATA_DIR", tmp_path)` and every caller sees
the new value.
"""

from __future__ import annotations

import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[2]  # backend/src/app/paths.py -> backend
DATA_DIR = Path(os.environ.get("DATA_DIR", _BACKEND_DIR / "data"))
