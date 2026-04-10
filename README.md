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

For agent requests, put provider keys in the root `.env` file:

```bash
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

`dev.sh` copies those keys into `frontend/.dev.vars` automatically for the `tldraw` agent worker.

The frontend runs on `http://127.0.0.1:5173`. It serves the `tldraw` agent UI and worker-backed `/stream` endpoint locally, and it proxies `/api/*` calls to the Flask server on `http://127.0.0.1:5000`.

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
