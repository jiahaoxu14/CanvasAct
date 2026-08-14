#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/.venv"
ENV_FILE="$ROOT_DIR/.env"
FRONTEND_DEV_VARS="$FRONTEND_DIR/.dev.vars"
DEFAULT_BACKEND_PORT=5000
DEFAULT_FRONTEND_PORT=5173
MAX_PORT=5199
BACKEND_PORT="${BACKEND_PORT:-}"
FRONTEND_PORT="${FRONTEND_PORT:-}"

port_is_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

choose_port() {
  requested_port=$1
  default_port=$2
  label=$3

  if [ -n "$requested_port" ]; then
    if port_is_in_use "$requested_port"; then
      echo "Requested ${label}_PORT=$requested_port is already in use."
      exit 1
    fi
    printf '%s\n' "$requested_port"
    return
  fi

  chosen_port=$default_port
  while port_is_in_use "$chosen_port"; do
    chosen_port=$((chosen_port + 1))
    if [ "$chosen_port" -gt "$MAX_PORT" ]; then
      echo "Could not find an available $label port in ${default_port}-${MAX_PORT}." >&2
      exit 1
    fi
  done

  if [ "$chosen_port" -ne "$default_port" ]; then
    echo "$label port $default_port is busy; using $chosen_port instead." >&2
  fi

  printf '%s\n' "$chosen_port"
}

sync_agent_env() {
  # frontend/.dev.vars is the worker's credential source of truth. Never overwrite an
  # existing file: it may contain a newer key than the root backend environment.
  if [ -f "$FRONTEND_DEV_VARS" ]; then
    return
  fi

  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  umask 077
  grep -E '^(OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)=' "$ENV_FILE" > "$FRONTEND_DEV_VARS" || true
}

cleanup() {
  if [ -n "${backend_pid:-}" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi

  if [ -n "${frontend_pid:-}" ] && kill -0 "$frontend_pid" 2>/dev/null; then
    kill "$frontend_pid" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

if [ ! -x "$BACKEND_VENV/bin/flask" ]; then
  echo "Missing backend virtual environment or Flask install."
  echo "Run: cd backend && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Missing frontend dependencies."
  echo "Run: cd frontend && npm install"
  exit 1
fi

sync_agent_env

BACKEND_PORT=$(choose_port "$BACKEND_PORT" "$DEFAULT_BACKEND_PORT" "BACKEND")
FRONTEND_PORT=$(choose_port "$FRONTEND_PORT" "$DEFAULT_FRONTEND_PORT" "FRONTEND")

echo "Starting Flask API on http://127.0.0.1:$BACKEND_PORT"
(
  cd "$BACKEND_DIR"
  exec "$BACKEND_VENV/bin/flask" --app app run --debug --port "$BACKEND_PORT"
) &
backend_pid=$!

echo "Starting Vite frontend on http://127.0.0.1:$FRONTEND_PORT"
(
  cd "$FRONTEND_DIR"
  BACKEND_PORT="$BACKEND_PORT" exec npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort
) &
frontend_pid=$!

echo "Dev servers are running. Press Ctrl+C to stop both."
wait
