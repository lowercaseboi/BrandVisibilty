"""Pilot-brand key -> display name, for the read-only tracking API.

Deliberately a thin duplicate of `scripts/run_tracking_loop.PILOT_BRANDS`, which carries
full `BrandParams`/`EntityAlias` collection config the API has no use for and shouldn't
import (a request-serving package importing a CLI script is the wrong dependency direction).
Keep the key set in sync with that dict when a pilot brand is added or removed.
"""

from __future__ import annotations

PILOT_BRANDS: dict[str, str] = {
    "gajanan_vada_pav": "Gajanan Vada Pav",
    "mayekar_opticians": "V.A. Mayekar Opticians",
}
