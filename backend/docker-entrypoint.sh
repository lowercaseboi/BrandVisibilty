#!/bin/sh
# Seeds offline synthetic demo snapshots on first start (empty data volume) so the
# dashboard is never blank. Disable with SEED_DEMO=0. Real runs are triggered from the
# UI / API / CLI and use whatever provider keys are in .env.local.
set -e

if [ "${SEED_DEMO:-1}" = "1" ] && [ -z "$(ls -A "${DATA_DIR}/tracking" 2>/dev/null)" ]; then
  echo "[entrypoint] No snapshots in ${DATA_DIR}; seeding synthetic demo data (3 rounds)..."
  for round in 1 2 3; do
    python scripts/run_tracking_loop.py --brand all --providers synthetic --samples 3 --round "$round" \
      || echo "[entrypoint] seeding round $round failed (continuing)"
  done
fi

exec "$@"
