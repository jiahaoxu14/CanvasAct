from copy import deepcopy

from flask import Flask, jsonify, request

from canvas_actions import (
    CanvasActionError,
    execute_action_batch,
    get_action_catalog,
    validate_action_request,
)
from canvas_state import empty_canvas_state, validate_canvas_state
from llm_planner import (
    LLMPlannerConfigError,
    LLMPlannerError,
    LLMPlannerValidationError,
    plan_actions_with_llm,
    plan_subgoals_with_llm,
    resolve_canvas_state,
    validate_action_planner_request,
    validate_subgoal_request,
)


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

    @app.get("/api/action-schemas")
    def get_action_schemas():
        return jsonify(
            {
                "status": "ok",
                "actions": get_action_catalog(),
            }
        )

    @app.post("/api/canvas-actions")
    def apply_canvas_actions():
        payload = request.get_json(silent=True)
        try:
            validate_action_request(payload)
        except CanvasActionError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                400,
            )

        validation_error = validate_canvas_state(app.config["LATEST_CANVAS_STATE"])
        if validation_error:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": f"Stored canvas state is invalid: {validation_error}",
                    }
                ),
                500,
            )

        try:
            execution_result = execute_action_batch(
                app.config["LATEST_CANVAS_STATE"],
                payload["actions"],
            )
        except CanvasActionError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                400,
            )

        dry_run = payload.get("dry_run", False)
        if not dry_run:
            app.config["LATEST_CANVAS_STATE"] = execution_result["canvas_state"]

        return jsonify(
            {
                "status": "ok",
                "message": f"Executed {len(payload['actions'])} action(s).",
                "dryRun": dry_run,
                "executionLog": execution_result["execution_log"],
                "undoHandlers": [
                    entry["undo_handler"]
                    for entry in execution_result["executed_actions"]
                ],
                "canvasState": execution_result["canvas_state"],
            }
        )

    @app.post("/api/llm/subgoals")
    def get_subgoals_from_prompt():
        payload = request.get_json(silent=True)

        try:
            validate_subgoal_request(payload)
            canvas_state = resolve_canvas_state(
                payload.get("canvasState"),
                app.config["LATEST_CANVAS_STATE"],
            )
            llm_result = plan_subgoals_with_llm(payload["prompt"], canvas_state)
        except LLMPlannerValidationError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                400,
            )
        except LLMPlannerConfigError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                500,
            )
        except LLMPlannerError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                502,
            )

        return jsonify(
            {
                "status": "ok",
                "subgoals": llm_result["subgoals"],
            }
        )

    @app.post("/api/llm/actions")
    def get_actions_from_subgoal():
        payload = request.get_json(silent=True)

        try:
            validate_action_planner_request(payload)
            canvas_state = resolve_canvas_state(
                payload.get("canvasState"),
                app.config["LATEST_CANVAS_STATE"],
            )
            llm_result = plan_actions_with_llm(payload["subgoal"], canvas_state)
        except LLMPlannerValidationError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                400,
            )
        except LLMPlannerConfigError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                500,
            )
        except LLMPlannerError as exc:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": str(exc),
                    }
                ),
                502,
            )

        return jsonify(
            {
                "status": "ok",
                "actions": llm_result["actions"],
            }
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
