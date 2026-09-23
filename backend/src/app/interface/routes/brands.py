from __future__ import annotations

from fastapi import APIRouter, Request

from app.interface.brand_registry import PILOT_BRANDS
from app.interface.schemas import BrandSummary

router = APIRouter()


@router.get("/brands", response_model=list[BrandSummary])
def list_brands(request: Request) -> list[dict]:
    tracking_root = request.app.state.tracking_root
    return [
        {
            "brand_key": brand_key,
            "brand": brand,
            "has_data": (tracking_root / f"{brand_key}.jsonl").exists(),
        }
        for brand_key, brand in PILOT_BRANDS.items()
    ]
