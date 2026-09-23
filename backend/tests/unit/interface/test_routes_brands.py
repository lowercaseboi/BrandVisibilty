from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.interface.main import create_app


def _client(tracking_root: Path) -> TestClient:
    return TestClient(create_app(tracking_root=tracking_root))


def test_list_brands_reflects_data_presence(tmp_path: Path) -> None:
    (tmp_path / "gajanan_vada_pav.jsonl").write_text('{"run_id": "a"}\n', encoding="utf-8")

    response = _client(tmp_path).get("/brands")

    assert response.status_code == 200
    by_key = {row["brand_key"]: row for row in response.json()}
    assert by_key["gajanan_vada_pav"]["has_data"] is True
    assert by_key["mayekar_opticians"]["has_data"] is False
    assert by_key["gajanan_vada_pav"]["brand"] == "Gajanan Vada Pav"
