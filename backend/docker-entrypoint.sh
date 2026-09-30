#!/bin/sh
# Runs as root only long enough to fix ownership of $DATA_DIR — covering both a fresh
# named volume (root-owned until something writes to it) and an existing volume from an
# older, root-only image — then drops to the unprivileged "app" user via setpriv
# (util-linux; present by default on python:3.11-slim/Debian) before touching any
# application code. If the container is *already* non-root (e.g. a platform that forces
# a UID), this whole branch is skipped and we're already the right user.
#
# After that: check/upgrade the snapshot storage layout, then seed offline synthetic demo
# data on first start (empty data volume) so the dashboard is never blank. Disable seeding
# with SEED_DEMO=0. Real runs are triggered from the UI / API / CLI and use whatever
# provider keys are in .env.local.
set -e

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R app:app "$DATA_DIR"
  exec setpriv --reuid=app --regid=app --init-groups /usr/local/bin/docker-entrypoint.sh "$@"
fi

# From here on we're always the unprivileged "app" user.

echo "[entrypoint] Checking snapshot storage layout in ${DATA_DIR}..."
python scripts/migrate_split_observations.py --data-dir "$DATA_DIR" \
  || echo "[entrypoint] storage migration check failed (continuing; startup is not blocked)"

if [ "${SEED_DEMO:-1}" = "1" ] && [ -z "$(ls -A "${DATA_DIR}/tracking" 2>/dev/null)" ]; then
  echo "[entrypoint] No snapshots in ${DATA_DIR}; seeding synthetic demo data (3 rounds)..."
  for round in 1 2 3; do
    python scripts/run_tracking_loop.py --brand all --providers synthetic --samples 3 --round "$round" \
      || echo "[entrypoint] seeding round $round failed (continuing)"
  done
fi

exec "$@"
