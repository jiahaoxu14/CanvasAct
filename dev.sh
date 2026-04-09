#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/.venv"
DEFAULT_BACKEND_PORT=5000
MAX_BACKEND_PORT=5099
BACKEND_PORT="${BACKEND_PORT:-}"

backend_pid=""
frontend_pid_file=""
monitor_pid=""

cleanup() {
  if [ -n "$monitor_pid" ] && kill -0 "$monitor_pid" 2>/dev/null; then
    kill "$monitor_pid" 2>/dev/null || true
  fi

  if [ -n "$frontend_pid_file" ] && [ -f "$frontend_pid_file" ]; then
    frontend_pid=$(cat "$frontend_pid_file" 2>/dev/null || true)
    if [ -n "$frontend_pid" ] && kill -0 "$frontend_pid" 2>/dev/null; then
      kill "$frontend_pid" 2>/dev/null || true
    fi
    rm -f "$frontend_pid_file"
  fi

  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

monitor_backend() {
  frontend_pid=""

  while [ -z "$frontend_pid" ]; do
    if [ -s "$frontend_pid_file" ]; then
      frontend_pid=$(cat "$frontend_pid_file" 2>/dev/null || true)
    else
      sleep 1
      continue
    fi
  done

  while kill -0 "$backend_pid" 2>/dev/null; do
    sleep 1
  done

  if kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi
}

port_is_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

choose_backend_port() {
  if [ -n "$BACKEND_PORT" ]; then
    if port_is_in_use "$BACKEND_PORT"; then
      echo "Requested BACKEND_PORT=$BACKEND_PORT is already in use."
      exit 1
    fi
    return
  fi

  BACKEND_PORT=$DEFAULT_BACKEND_PORT
  while port_is_in_use "$BACKEND_PORT"; do
    BACKEND_PORT=$((BACKEND_PORT + 1))
    if [ "$BACKEND_PORT" -gt "$MAX_BACKEND_PORT" ]; then
      echo "Could not find an available backend port in ${DEFAULT_BACKEND_PORT}-${MAX_BACKEND_PORT}."
      exit 1
    fi
  done

  if [ "$BACKEND_PORT" -ne "$DEFAULT_BACKEND_PORT" ]; then
    echo "Backend port $DEFAULT_BACKEND_PORT is busy; using $BACKEND_PORT instead."
  fi
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

choose_backend_port
export BACKEND_PORT

echo "Starting Flask API on http://127.0.0.1:$BACKEND_PORT"
(
  cd "$BACKEND_DIR"
  exec "$BACKEND_VENV/bin/flask" --app app run --debug --port "$BACKEND_PORT"
) &
backend_pid=$!
frontend_pid_file=$(mktemp "${TMPDIR:-/tmp}/canvasact-frontend.XXXXXX")
monitor_backend &
monitor_pid=$!

sleep 1
if ! kill -0 "$backend_pid" 2>/dev/null; then
  echo "Backend failed to start on port $BACKEND_PORT."
  exit 1
fi

echo "Starting Vite frontend on http://127.0.0.1:5173"
echo "Dev servers are running. Refresh the page to see changes."
echo "Press Ctrl+C to stop both processes."
sh -c '
  echo "$$" > "$1"
  cd "$2"
  exec npm run dev -- --host 127.0.0.1
' sh "$frontend_pid_file" "$FRONTEND_DIR"
