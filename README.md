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
- `POST /api/canvas-actions`: validates an action batch before execution, applies the actions to the stored canvas state, runs postcondition checks, and returns the resulting canvas state. It also accepts an optional `canvasState` override for dry-run previews against an explicit scene graph.
- `POST /api/llm/subgoals`: converts a user prompt into subgoals only, using the current canvas state and the allowed action set as context.
- `POST /api/llm/actions`: converts one subgoal into atomic actions only, validated against the current canvas state.

Example batch:

```json
{
  "actions": [
    {
      "op": "Select",
      "targets": ["n1", "n2"]
    },
    {
      "op": "Connect",
      "id": "c1",
      "source": "n1",
      "target": "n2",
      "label": "next"
    }
  ]
}
```

LLM planner request examples:

```json
{
  "prompt": "Group these notes into themes and make a simple pipeline."
}
```

```json
{
  "subgoal": "cluster selected notes into themes"
}
```

The LLM planner reads `OPENAI_API_KEY` from `backend/.env`. Optional model overrides:

- `OPENAI_SUBGOAL_MODEL`
- `OPENAI_ACTION_MODEL`

Before `POST /api/llm/actions` calls the model, it runs a deterministic reference resolver for common GUI-grounding phrases such as current selection, keyword-matched notes, left/right/top/bottom filters, and nearest-note lookups. The action response includes `referenceResolution` and `failureLog` so the caller can inspect what was grounded and whether the planner needed a repair pass before returning actions.
