"""The recommendation engine is pure like the analysis layer (CLAUDE.md, DESIGN §5.1: only an
optional drafter may ever call an LLM): stdlib + app.analysis + its own package, no I/O."""

from pathlib import Path

import pytest

from tests.unit.analysis.test_purity import find_purity_violations

RECOMMENDATION_DIR = Path(__file__).resolve().parents[3] / "src" / "app" / "recommendation"


@pytest.mark.parametrize("name", ["engine.py", "reasoning.py"])
def test_recommendation_module_is_pure(name):
    source = (RECOMMENDATION_DIR / name).read_text(encoding="utf-8")
    violations = [
        v for v in find_purity_violations(source, filename=name)
        if "disallowed import 'app.recommendation" not in v  # its own sibling modules
    ]
    assert violations == [], "\n".join(violations)
