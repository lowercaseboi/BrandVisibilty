"""ReplayProvider — replays previously recorded *real* LLM responses (no network).

Cache file format (JSON):
    {"<sha1(prompt)>": {"prompt": "...", "responses": [{"payload", "model_version", "source_id"}, ...]}}

Responses for a prompt are served in order and cycle when exhausted (per-prompt call
counter). A prompt with no recorded response raises `ReplayMiss` (a KeyError).
`record_response` appends a live result to the cache — the pipeline's `record=True` mode.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
from collections import defaultdict
from pathlib import Path

from app.collection.types import CollectionResult, LLMProvider, QuotaState, SamplingParams

_WRITE_LOCK = threading.Lock()


class ReplayMiss(KeyError):
    """No recorded response for this prompt in the replay cache."""


def prompt_key(prompt: str) -> str:
    return hashlib.sha1(prompt.encode("utf-8")).hexdigest()


def _load(cache_path: Path) -> dict:
    try:
        with open(cache_path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def record_response(cache_path: str | os.PathLike, prompt: str, result: CollectionResult) -> None:
    """Append `result` to the replay cache for `prompt` (atomic write, thread-safe in-process)."""
    path = Path(cache_path)
    with _WRITE_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = _load(path)
        entry = data.setdefault(prompt_key(prompt), {"prompt": prompt, "responses": []})
        entry["responses"].append(
            {"payload": result.payload, "model_version": result.model_version, "source_id": result.source_id}
        )
        fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, path)


class ReplayProvider(LLMProvider):
    def __init__(self, cache_path: str | os.PathLike):
        self._cache_path = Path(cache_path)
        self._cache = _load(self._cache_path)
        self._calls: dict[str, int] = defaultdict(int)

    @property
    def model(self) -> str | None:
        return None

    def query(self, prompt: str, params: SamplingParams) -> CollectionResult:
        key = prompt_key(prompt)
        responses = (self._cache.get(key) or {}).get("responses") or []
        if not responses:
            raise ReplayMiss(f"no recorded response for prompt {prompt!r} in {self._cache_path.name}")
        index = self._calls[key] % len(responses)
        self._calls[key] += 1
        recorded = responses[index]
        return CollectionResult(
            source_id="replay",
            source_kind="llm",
            model_version=recorded.get("model_version"),
            payload=recorded.get("payload", ""),
            latency_ms=0,
            token_usage=None,
            raw_meta={"replay": True, "recorded_source_id": recorded.get("source_id")},
        )

    def quota_state(self) -> QuotaState:
        return QuotaState(remaining_today=None, daily_limit=None, exhausted=False)
