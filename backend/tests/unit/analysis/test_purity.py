"""Purity guard for `app.analysis` (CLAUDE.md: "Scorer must be a pure function — no I/O,
no LLM calls"; DESIGN §1.6, §4 extend the same requirement to GapDetector, MentionDetector
and friends).

This AST-walks every module under `app/analysis/` and asserts:

  1. every import resolves to a module on an explicit stdlib allowlist, or to `app.analysis`
     itself (so the analysis package may only ever depend on stdlib + its own siblings);
  2. no call or attribute access reaches for I/O or the network: `open`, `os.environ` /
     `os.getenv`, `subprocess.*`, `socket.*`, `httpx.*`, `requests.*`, `urllib.*`, or the
     pathlib I/O methods `Path.read_text` / `Path.write_text` / `Path.open`.

Failures are parametrized per file, so a violation names the offending module directly.
A deliberately impure fixture (tests/unit/analysis/fixtures/impure_bad_module.py, never
imported — only read as text) proves the checker actually flags what it claims to.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

ANALYSIS_DIR = Path(__file__).resolve().parents[3] / "src" / "app" / "analysis"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

# Derived from what app/analysis actually imports today (see module docstrings/imports):
# __future__, dataclasses, typing, math, random, statistics, collections(.abc), itertools,
# datetime, re, hashlib, functools, json.
STDLIB_ALLOWLIST: frozenset[str] = frozenset(
    {
        "__future__",
        "dataclasses",
        "typing",
        "math",
        "random",
        "statistics",
        "collections",
        "itertools",
        "datetime",
        "enum",
        "re",
        "hashlib",
        "functools",
        "json",
    }
)

ANALYSIS_PACKAGE_ROOT = "app.analysis"

# Attribute names that, on any object, indicate I/O — checked regardless of the receiver's
# static type, since the analysis layer has no legitimate reason to call any of these.
_IO_ATTRIBUTE_NAMES: frozenset[str] = frozenset({"read_text", "write_text", "open"})

# (module_root, attribute_name) pairs that indicate I/O/network/env access via attribute
# lookup, e.g. `os.environ`, `os.getenv`, `subprocess.run`, `socket.socket`.
_IO_MODULE_ROOTS: frozenset[str] = frozenset({"subprocess", "socket", "httpx", "requests", "urllib"})
_OS_ENV_ATTRS: frozenset[str] = frozenset({"environ", "getenv"})


def _root_module(dotted: str) -> str:
    return dotted.split(".", 1)[0]


def _is_allowed_import(module: str | None) -> bool:
    if module is None:
        return False
    if module == ANALYSIS_PACKAGE_ROOT or module.startswith(ANALYSIS_PACKAGE_ROOT + "."):
        return True
    return _root_module(module) in STDLIB_ALLOWLIST


def find_purity_violations(source: str, filename: str = "<string>") -> list[str]:
    """Return a list of human-readable violation messages; empty means the source is pure
    by this checker's rules. `filename` is only used to make messages readable."""
    tree = ast.parse(source, filename=filename)
    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if not _is_allowed_import(alias.name):
                    violations.append(f"{filename}:{node.lineno}: disallowed import {alias.name!r}")
        elif isinstance(node, ast.ImportFrom):
            module = node.module
            # `from . import x` / `from .types import Y` inside the package itself: module
            # may be None (relative import with no name) or missing the app.analysis prefix
            # when written relatively. Absolute imports are what the codebase uses, so only
            # `node.level == 0` absolute imports are checked against the allowlist; a
            # relative import (level > 0) is necessarily within the package itself.
            if node.level and node.level > 0:
                continue
            if not _is_allowed_import(module):
                violations.append(f"{filename}:{node.lineno}: disallowed import {module!r}")
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "open":
                violations.append(f"{filename}:{node.lineno}: disallowed call to open(...)")
        elif isinstance(node, ast.Attribute):
            if node.attr in _IO_ATTRIBUTE_NAMES:
                violations.append(f"{filename}:{node.lineno}: disallowed I/O attribute .{node.attr}")
            elif isinstance(node.value, ast.Name):
                if node.value.id == "os" and node.attr in _OS_ENV_ATTRS:
                    violations.append(f"{filename}:{node.lineno}: disallowed os.{node.attr} access")
                elif node.value.id in _IO_MODULE_ROOTS:
                    violations.append(
                        f"{filename}:{node.lineno}: disallowed {node.value.id}.{node.attr} access"
                    )

    return violations


def _analysis_files() -> list[Path]:
    return sorted(ANALYSIS_DIR.glob("*.py"))


@pytest.mark.parametrize("path", _analysis_files(), ids=lambda p: p.name)
def test_analysis_module_is_pure(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    violations = find_purity_violations(source, filename=path.name)
    assert violations == [], "\n".join(violations)


def test_checker_flags_a_deliberately_impure_module() -> None:
    """Proves the checker isn't vacuously passing: a real impure fixture must be flagged,
    with violations attributable to each of its distinct offenses."""
    bad_path = FIXTURES_DIR / "impure_bad_module.py"
    source = bad_path.read_text(encoding="utf-8")
    violations = find_purity_violations(source, filename=bad_path.name)

    assert violations, "expected the impure fixture to be flagged, but it passed cleanly"
    joined = "\n".join(violations)
    assert "disallowed import 'os'" in joined
    assert "disallowed import 'subprocess'" in joined
    assert "disallowed import 'httpx'" in joined
    assert "disallowed call to open(...)" in joined
    assert "disallowed os.environ access" in joined
    assert "disallowed I/O attribute .write_text" in joined


def test_checker_accepts_a_clean_stdlib_only_module() -> None:
    """Sanity check the other direction: legitimate stdlib-only, app.analysis-only code
    is never flagged."""
    clean_source = """
from __future__ import annotations

import statistics
from collections import defaultdict
from app.analysis.types import Gap

def f(xs):
    return statistics.mean(xs)
"""
    assert find_purity_violations(clean_source) == []
