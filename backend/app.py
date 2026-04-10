from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, current_app, jsonify, request

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SNAPSHOT_PATH = DATA_DIR / "canvas_snapshot.json"

BOOTSTRAP_PAYLOAD = {
    "appName": "CanvasAct",
    "defaultBoardName": "Infinite Planning Board",
    "capabilities": [
        "React + Vite frontend shell",
        "tldraw infinite canvas workspace",
        "Flask JSON API",
        "Local canvas snapshot persistence endpoint",
    ],
    "starterNotes": [
        {
            "title": "Theme Map",
            "prompt": "Cluster research notes into themes, then connect the strongest relationships.",
        },
        {
            "title": "Workflow Draft",
            "prompt": "Sketch the rough steps of a new user flow before refining it.",
        },
        {
            "title": "Retro Board",
            "prompt": "Drop sticky notes for wins, friction points, and follow-up actions.",
        },
    ],
    "palette": ["#17324d", "#f46e27", "#f6efe5", "#57b894"],
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _load_snapshot(snapshot_path: Path) -> dict[str, Any] | None:
    if not snapshot_path.exists():
        return None

    return json.loads(snapshot_path.read_text(encoding="utf-8"))


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        SNAPSHOT_PATH=SNAPSHOT_PATH,
        BOOTSTRAP_PAYLOAD=BOOTSTRAP_PAYLOAD,
    )

    if test_config:
        app.config.update(test_config)

    @app.get("/api/health")
    def health() -> Any:
        return jsonify(
            {
                "status": "ok",
                "service": "canvasact-backend",
                "message": "Flask backend is ready.",
                "timestamp": _utc_now_iso(),
            }
        )

    @app.get("/api/bootstrap")
    def bootstrap() -> Any:
        payload = dict(current_app.config["BOOTSTRAP_PAYLOAD"])
        payload["timestamp"] = _utc_now_iso()
        return jsonify(payload)

    @app.get("/api/canvas-snapshot")
    def get_canvas_snapshot() -> Any:
        snapshot_path = Path(current_app.config["SNAPSHOT_PATH"])
        snapshot_record = _load_snapshot(snapshot_path)

        return jsonify(
            {
                "hasSavedState": snapshot_record is not None,
                "snapshot": None if snapshot_record is None else snapshot_record.get("snapshot"),
                "savedAt": None if snapshot_record is None else snapshot_record.get("savedAt"),
            }
        )

    @app.put("/api/canvas-snapshot")
    def save_canvas_snapshot() -> Any:
        payload = request.get_json(silent=True)
        if not payload or not isinstance(payload.get("snapshot"), dict):
            return (
                jsonify({"error": "Expected a JSON body with a top-level 'snapshot' object."}),
                400,
            )

        snapshot_path = Path(current_app.config["SNAPSHOT_PATH"])
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)

        snapshot_record = {
            "savedAt": _utc_now_iso(),
            "snapshot": payload["snapshot"],
        }
        snapshot_path.write_text(
            json.dumps(snapshot_record, indent=2, sort_keys=True),
            encoding="utf-8",
        )

        return jsonify(
            {
                "hasSavedState": True,
                "savedAt": snapshot_record["savedAt"],
            }
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
