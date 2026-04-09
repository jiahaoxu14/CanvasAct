from copy import deepcopy
from typing import Optional

from flask import Flask, jsonify, request


def empty_canvas_state() -> dict:
    return {
        "objects": [],
        "frames": [],
        "connectors": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "selection": [],
    }


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_canvas_state(payload: object) -> Optional[str]:
    if not isinstance(payload, dict):
        return "Canvas state must be a JSON object."

    for key in ("objects", "frames", "connectors", "selection"):
        if not isinstance(payload.get(key), list):
            return f"'{key}' must be a list."

    viewport = payload.get("viewport")
    if not isinstance(viewport, dict):
        return "'viewport' must be an object."

    for key in ("x", "y", "zoom"):
        if not _is_number(viewport.get(key)):
            return f"'viewport.{key}' must be numeric."

    for index, item in enumerate(payload["objects"]):
        if not isinstance(item, dict):
            return f"'objects[{index}]' must be an object."
        if not isinstance(item.get("id"), str) or not item["id"]:
            return f"'objects[{index}].id' is required."
        if not isinstance(item.get("type"), str) or not item["type"]:
            return f"'objects[{index}].type' is required."
        if not isinstance(item.get("content"), dict):
            return f"'objects[{index}].content' must be an object."
        geometry = item.get("geometry")
        if not isinstance(geometry, dict):
            return f"'objects[{index}].geometry' must be an object."
        for key in ("x", "y", "w", "h"):
            if not _is_number(geometry.get(key)):
                return f"'objects[{index}].geometry.{key}' must be numeric."

    for index, item in enumerate(payload["frames"]):
        if not isinstance(item, dict):
            return f"'frames[{index}]' must be an object."
        if not isinstance(item.get("id"), str) or not item["id"]:
            return f"'frames[{index}].id' is required."
        if not isinstance(item.get("type"), str) or not item["type"]:
            return f"'frames[{index}].type' is required."
        if not isinstance(item.get("content"), dict):
            return f"'frames[{index}].content' must be an object."
        geometry = item.get("geometry")
        if not isinstance(geometry, dict):
            return f"'frames[{index}].geometry' must be an object."
        for key in ("x", "y", "w", "h"):
            if not _is_number(geometry.get(key)):
                return f"'frames[{index}].geometry.{key}' must be numeric."

    for index, item in enumerate(payload["connectors"]):
        if not isinstance(item, dict):
            return f"'connectors[{index}]' must be an object."
        for key in ("id", "type", "source", "target"):
            if not isinstance(item.get(key), str) or not item[key]:
                return f"'connectors[{index}].{key}' is required."
        if not isinstance(item.get("content"), dict):
            return f"'connectors[{index}].content' must be an object."
        geometry = item.get("geometry")
        if geometry is not None and not isinstance(geometry, dict):
            return f"'connectors[{index}].geometry' must be an object when provided."

    for index, item in enumerate(payload["selection"]):
        if not isinstance(item, str) or not item:
            return f"'selection[{index}]' must be a non-empty string."

    return None


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["LATEST_CANVAS_STATE"] = empty_canvas_state()

    @app.get("/api/health")
    def healthcheck():
        return jsonify(
            {
                "status": "ok",
                "service": "backend",
                "message": "Flask API is running.",
            }
        )

    @app.get("/api/canvas-state")
    def get_canvas_state():
        return jsonify(app.config["LATEST_CANVAS_STATE"])

    @app.post("/api/canvas-state")
    def save_canvas_state():
        payload = request.get_json(silent=True)
        validation_error = validate_canvas_state(payload)
        if validation_error:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": validation_error,
                    }
                ),
                400,
            )

        app.config["LATEST_CANVAS_STATE"] = deepcopy(payload)

        return jsonify(
            {
                "status": "ok",
                "message": "Canvas state saved.",
                "counts": {
                    "objects": len(payload["objects"]),
                    "frames": len(payload["frames"]),
                    "connectors": len(payload["connectors"]),
                    "selection": len(payload["selection"]),
                },
                "canvasState": app.config["LATEST_CANVAS_STATE"],
            }
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
