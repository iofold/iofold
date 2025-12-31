#!/usr/bin/env bash
set -euo pipefail

# Copy the Docker backend's "main" local D1 SQLite (the one with `traces`) into
# notebooks/data for notebook analysis.
#
# Output files:
# - notebooks/data/iofold_d1_main.sqlite
# - notebooks/data/iofold_d1_main.sqlite-wal (if present)
# - notebooks/data/iofold_d1_main.sqlite-shm (if present)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/notebooks/data"
OUT_DB="$OUT_DIR/iofold_d1_main.sqlite"

CONTAINER="${IOFOLD_BACKEND_CONTAINER:-iofold-backend}"
CONTAINER_D1_DIR="/app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

mkdir -p "$OUT_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: Docker container '$CONTAINER' is not running."
  echo "Start it (e.g. docker compose up -d) and retry."
  exit 1
fi

echo "Finding best D1 sqlite (contains 'traces') inside '$CONTAINER'..."

BEST_FILE="$(
  docker exec -i "$CONTAINER" node - <<'NODE'
const fs = require("fs");
const path = require("path");

const D1_DIR = process.env.CONTAINER_D1_DIR || "/app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";

let Database;
try {
  Database = require("better-sqlite3");
} catch (e) {
  console.error("ERROR: better-sqlite3 not available inside container.");
  console.error(String(e));
  process.exit(2);
}

const files = fs.readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite"));
if (files.length === 0) {
  console.error(`ERROR: No *.sqlite files found in ${D1_DIR}`);
  process.exit(3);
}

let best = null; // { file, traceCount }
for (const f of files) {
  const full = path.join(D1_DIR, f);
  try {
    const db = new Database(full, { readonly: true, fileMustExist: true });
    const hasTraces = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='traces' LIMIT 1")
      .get();
    if (!hasTraces) {
      db.close();
      continue;
    }
    const row = db.prepare("SELECT COUNT(*) AS c FROM traces").get();
    const c = Number(row?.c ?? 0);
    db.close();
    if (!best || c > best.traceCount) {
      best = { file: f, traceCount: c };
    }
  } catch {
    // ignore non-compatible sqlite files
  }
}

if (!best) {
  console.error("ERROR: Couldn't find any sqlite containing a 'traces' table.");
  process.exit(4);
}

process.stdout.write(best.file);
NODE
)"

echo "Selected: $BEST_FILE"

echo "Copying snapshot out of Docker volume..."
docker exec \
  -e "BEST_FILE=$BEST_FILE" \
  -e "CONTAINER_D1_DIR=$CONTAINER_D1_DIR" \
  "$CONTAINER" sh -lc 'set -e; src="$CONTAINER_D1_DIR/$BEST_FILE"; cp -f "$src" /tmp/iofold_d1_main.sqlite; [ -f "${src}-wal" ] && cp -f "${src}-wal" /tmp/iofold_d1_main.sqlite-wal || true; [ -f "${src}-shm" ] && cp -f "${src}-shm" /tmp/iofold_d1_main.sqlite-shm || true'

docker cp "$CONTAINER:/tmp/iofold_d1_main.sqlite" "$OUT_DB"
docker cp "$CONTAINER:/tmp/iofold_d1_main.sqlite-wal" "$OUT_DB-wal" 2>/dev/null || true
docker cp "$CONTAINER:/tmp/iofold_d1_main.sqlite-shm" "$OUT_DB-shm" 2>/dev/null || true

echo "Wrote:"
ls -lah "$OUT_DB" "$OUT_DB-wal" "$OUT_DB-shm" 2>/dev/null || true

echo "Done. Use from notebooks with:"
echo "  export IOFOLD_D1_DB_PATH=\"$OUT_DB\""

