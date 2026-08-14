# CanvasAct

This repo contains a Vite + React frontend with the official `tldraw` agent starter kit UI and a Flask backend managed with a local Python virtual environment.

## Structure

- `frontend/`: React app powered by Vite, `tldraw`, and the official agent starter kit
- `backend/`: Flask API, tests, and a local `.venv`

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run --debug --port 5000
```

Useful API routes:

- `GET /api/health`: backend status check
- `GET /api/bootstrap`: starter content for the frontend shell
- `GET /api/canvas-snapshot`: read the most recently saved canvas snapshot
- `PUT /api/canvas-snapshot`: persist a canvas snapshot payload

Run backend tests:

```bash
cd backend
source .venv/bin/activate
python -m unittest discover -s tests -v
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

For agent requests, put provider keys in `frontend/.dev.vars`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

If `frontend/.dev.vars` does not exist, `dev.sh` seeds it once from the root `.env`.
It never overwrites an existing `.dev.vars`, so restarting the prototype cannot replace a newer key.

The frontend runs on `http://127.0.0.1:5173`. It serves the `tldraw` agent UI and worker-backed `/stream` endpoint locally, and it proxies `/api/*` calls to the Flask server on `http://127.0.0.1:5000`.

### Agent variants

Use the switch in the chat-panel header to choose which implementation handles the next prompt:

- **CanvasAct** adds `CanvasObservation` to the model's prompt while reusing the original tldraw action schemas, action-list response, immediate editor execution, `review` action, and lint follow-up.
- **Original** uses the same actions and lifecycle without `CanvasObservation`.

This keeps the comparison observation-only: CanvasAct has no separate semantic actions, target selectors, action chunks, postcondition verifier, repair budget, or automatic final-review service.

Switching variants starts a fresh chat so prompt histories do not contaminate the comparison. It preserves the canvas, selected model, and recorded trajectories. The selected variant is saved locally and each new trajectory records which variant produced it.

Verify the two prompt/schema contracts without making model calls:

```bash
cd frontend
npm run check:agent-variants
```

## Start both in dev mode

```bash
./dev.sh
```

`dev.sh` expects:

- Python dependencies installed inside `backend/.venv`
- frontend dependencies installed inside `frontend/node_modules`

If the default ports are busy, `dev.sh` automatically picks the next available backend port starting at `5000` and the next available frontend port starting at `5173`.

You can also force specific ports explicitly:

```bash
BACKEND_PORT=5001 ./dev.sh
FRONTEND_PORT=5174 ./dev.sh
```
