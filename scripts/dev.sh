#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ] || [ ! -d node_modules ]; then
  echo 'Run bash scripts/setup.sh first.' >&2
  exit 1
fi
.venv/bin/python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 &
api_pid=$!
cleanup() { kill "$api_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
npm run dev -- --port 5173 --strictPort
