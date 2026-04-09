# CanvasAct

This repo is initialized as a React frontend plus a Flask backend.

## Structure

- `frontend/`: React app powered by Vite
- `backend/`: Flask API with a local virtual environment in `backend/.venv`

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run --debug --port 5000
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on port `5173` and proxies `/api/*` requests to the Flask server on port `5000`.

## Start both in dev mode

```bash
./dev.sh
```

This starts the Flask backend and Vite frontend together. Changes in the frontend will appear after refresh, and Vite will usually hot-reload them automatically as well.

## Atomic Action API

The backend exposes an atomic action catalog and an action executor for the canvas scene graph.

- `GET /api/action-schemas`: returns the JSON schema, required fields, optional fields, preconditions, executor name, postcondition checker, and undo handler for each atomic action.
- `POST /api/canvas-actions`: validates an action batch before execution, applies the actions to the stored canvas state, runs postcondition checks, and returns the resulting canvas state.

Example batch:

```json
{
  "actions": [
    {
      "op": "GroupIntoFrame",
      "targets": ["n1", "n2", "n4"],
      "frame_id": "f1",
      "title": "Data Collection"
    },
    {
      "op": "Connect",
      "id": "c1",
      "source": "f1",
      "target": "f2",
      "label": "next"
    }
  ]
}
```
