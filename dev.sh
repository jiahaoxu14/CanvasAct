#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/.venv"

backend_pid=""
frontend_pid=""

cleanup() {
  if [ -n "$frontend_pid" ] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

if [ ! -x "$BACKEND_VENV/bin/flask" ]; then
  echo "Missing backend virtual environment."
  echo "Run: cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Missing frontend dependencies."
  echo "Run: cd frontend && npm install"
  exit 1
fi

echo "Starting Flask API on http://127.0.0.1:5000"
(
  cd "$BACKEND_DIR"
  "$BACKEND_VENV/bin/flask" --app app run --debug --port 5000
) &
backend_pid=$!

echo "Starting Vite frontend on http://127.0.0.1:5173"
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 127.0.0.1
) &
frontend_pid=$!

echo "Dev servers are running. Refresh the page to see changes."
echo "Press Ctrl+C to stop both processes."

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done

