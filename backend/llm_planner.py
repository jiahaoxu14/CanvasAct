import json
import os
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error, request

from canvas_actions import (
    ACTION_ORDER,
    ACTION_SCHEMAS,
    execute_action_batch,
    get_action_catalog,
    validate_action_request,
    validate_against_schema,
)
from canvas_state import empty_canvas_state, validate_canvas_state

DEFAULT_SUBGOAL_MODEL = "gpt-5.4-mini"
DEFAULT_ACTION_MODEL = "gpt-5.4"


class LLMPlannerError(Exception):
    pass


class LLMPlannerValidationError(LLMPlannerError):
    pass


class LLMPlannerConfigError(LLMPlannerError):
    pass


class LLMPlannerUpstreamError(LLMPlannerError):
    pass


def _build_action_output_item_schema() -> dict:
    properties = {
        "op": {
            "type": "string",
            "enum": list(ACTION_ORDER),
        },
    }

    for action_schema in ACTION_SCHEMAS.values():
        for key, value in action_schema["properties"].items():
            if key == "op" or key in properties:
                continue
            properties[key] = deepcopy(value)

    return {
        "type": "object",
        "properties": properties,
        "required": ["op"],
        "additionalProperties": False,
    }


SUBGOAL_REQUEST_SCHEMA = {
    "type": "object",
    "properties": {
        "prompt": {"type": "string", "minLength": 1},
        "canvasState": {"type": "object"},
    },
    "required": ["prompt"],
    "additionalProperties": False,
}

ACTION_PLANNER_REQUEST_SCHEMA = {
    "type": "object",
    "properties": {
        "subgoal": {"type": "string", "minLength": 1},
        "canvasState": {"type": "object"},
    },
    "required": ["subgoal"],
    "additionalProperties": False,
}

SUBGOAL_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "subgoals": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "subgoal": {"type": "string", "minLength": 1},
                },
                "required": ["subgoal"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["subgoals"],
    "additionalProperties": False,
}

ACTION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "minItems": 1,
            "items": _build_action_output_item_schema(),
        },
    },
    "required": ["actions"],
    "additionalProperties": False,
}


def validate_subgoal_request(payload: object) -> None:
    try:
        validate_against_schema(SUBGOAL_REQUEST_SCHEMA, payload)
    except Exception as exc:
        raise LLMPlannerValidationError(str(exc)) from exc


def validate_action_planner_request(payload: object) -> None:
    try:
        validate_against_schema(ACTION_PLANNER_REQUEST_SCHEMA, payload)
    except Exception as exc:
        raise LLMPlannerValidationError(str(exc)) from exc


def resolve_canvas_state(
    provided_canvas_state: Optional[dict],
    fallback_canvas_state: Optional[dict] = None,
) -> dict:
    canvas_state = deepcopy(
        provided_canvas_state
        if provided_canvas_state is not None
        else fallback_canvas_state
        if fallback_canvas_state is not None
        else empty_canvas_state()
    )
    validation_error = validate_canvas_state(canvas_state)
    if validation_error:
        raise LLMPlannerValidationError(validation_error)
    return canvas_state


def _load_env_file() -> None:
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(("'", '"')) and value.endswith(("'", '"')):
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _get_required_env(name: str) -> str:
    _load_env_file()
    value = os.environ.get(name, "").strip()
    if not value or value.startswith("your_"):
        raise LLMPlannerConfigError(
            f"Environment variable {name!r} is required."
        )
    return value


def _get_model(env_name: str, default: str) -> str:
    _load_env_file()
    value = os.environ.get(env_name, "").strip()
    return value or default


def _existing_entity_ids(canvas_state: dict) -> List[str]:
    ids = []
    for collection_name in ("objects", "frames", "connectors"):
        ids.extend(entity["id"] for entity in canvas_state[collection_name])
    return sorted(ids)


def _next_available_id(existing_ids: set, prefix: str, width: int = 5) -> List[str]:
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    highest_index = 0

    for entity_id in existing_ids:
        match = pattern.match(entity_id)
        if match:
            highest_index = max(highest_index, int(match.group(1)))

    return [
        f"{prefix}-{highest_index + offset}"
        for offset in range(1, width + 1)
    ]


def suggest_available_ids(canvas_state: dict) -> dict:
    existing_ids = set(_existing_entity_ids(canvas_state))
    return {
        "objects": _next_available_id(existing_ids, "node"),
        "frames": _next_available_id(existing_ids, "frame"),
        "connectors": _next_available_id(existing_ids, "edge"),
    }


def _format_action_catalog_for_prompt() -> str:
    lines = []
    for action in get_action_catalog():
        optional_fields = ", ".join(action["optional_fields"]) or "none"
        lines.append(
            f"- {action['op']}: required [{', '.join(action['required_fields'])}], "
            f"optional [{optional_fields}]"
        )
    return "\n".join(lines)


def _canvas_context_for_prompt(canvas_state: dict) -> str:
    existing_ids = _existing_entity_ids(canvas_state)
    suggested_ids = suggest_available_ids(canvas_state)
    return "\n".join(
        [
            f"CURRENT_EXISTING_IDS: {json.dumps(existing_ids)}",
            f"CURRENT_SELECTION: {json.dumps(canvas_state['selection'])}",
            f"AVAILABLE_NEW_OBJECT_IDS: {json.dumps(suggested_ids['objects'])}",
            f"AVAILABLE_NEW_FRAME_IDS: {json.dumps(suggested_ids['frames'])}",
            f"AVAILABLE_NEW_CONNECTOR_IDS: {json.dumps(suggested_ids['connectors'])}",
            "CURRENT_CANVAS_STATE_JSON:",
            json.dumps(canvas_state, indent=2, sort_keys=True),
        ]
    )


def build_subgoal_system_prompt(canvas_state: dict) -> str:
    return "\n".join(
        [
            "You are planner stage 1 for a whiteboard assistant.",
            "Prompt 1 returns subgoals only.",
            "Return only JSON that matches the provided schema.",
            "Do not return atomic actions.",
            "Do not return prose, markdown, commentary, or extra keys.",
            "Allowed action set:",
            _format_action_catalog_for_prompt(),
            "Hard rules:",
            "- Never invent nonexistent objects, frames, connectors, or IDs.",
            "- If you mention any object ID, frame ID, or connector ID, it must be a valid ID from the current canvas state.",
            "- Do not mention future IDs or hidden objects.",
            "- Decompose the user request into short executable subgoals that could later be implemented with only the allowed action set.",
            "- Respect the current canvas selection and existing scene graph as the source of truth.",
            "",
            _canvas_context_for_prompt(canvas_state),
        ]
    )


def build_subgoal_user_prompt(user_prompt: str) -> str:
    return "\n".join(
        [
            "Decompose this whiteboard instruction into subgoals:",
            user_prompt,
        ]
    )


def build_action_system_prompt(canvas_state: dict) -> str:
    return "\n".join(
        [
            "You are planner stage 2 for a whiteboard assistant.",
            "Prompt 2 returns atomic actions only.",
            "Return only JSON that matches the provided schema.",
            "Do not return subgoals, prose, markdown, commentary, or extra keys.",
            "Allowed action set:",
            _format_action_catalog_for_prompt(),
            "Hard rules:",
            "- Emit actions only from the allowed action set.",
            "- Never invent nonexistent objects, frames, connectors, or IDs.",
            "- Every reference to an existing object, frame, or connector must use a valid ID from the current canvas state.",
            "- You may introduce a new ID only for Create.id or Connect.id, and it must be unused.",
            "- Prefer the provided available new IDs when creating objects, frames, or connectors.",
            "- source, target, targets, parent_frame_id, and frame_id must refer to IDs that exist in the current canvas or are created earlier in the same action list.",
            "- Keep the action list minimal and valid against the current canvas state.",
            "",
            _canvas_context_for_prompt(canvas_state),
        ]
    )


def build_action_user_prompt(subgoal: str) -> str:
    return "\n".join(
        [
            "Convert this single subgoal into atomic whiteboard actions:",
            subgoal,
        ]
    )


def _extract_response_text(response_payload: dict) -> str:
    if response_payload.get("status") == "incomplete":
        details = response_payload.get("incomplete_details") or {}
        reason = details.get("reason", "unknown")
        raise LLMPlannerUpstreamError(
            f"OpenAI response was incomplete: {reason}."
        )

    for output_item in response_payload.get("output", []):
        for content_item in output_item.get("content", []):
            content_type = content_item.get("type")
            if content_type == "refusal":
                raise LLMPlannerUpstreamError(
                    "OpenAI refused to answer the request."
                )
            if content_type == "output_text":
                text = content_item.get("text", "")
                if text:
                    return text

    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text:
        return output_text

    raise LLMPlannerUpstreamError(
        "OpenAI response did not contain structured text output."
    )


def _call_openai_json(
    *,
    model: str,
    schema_name: str,
    response_schema: dict,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
) -> dict:
    api_key = _get_required_env("OPENAI_API_KEY")
    api_url = os.environ.get("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")

    request_body = {
        "model": model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_output_tokens": max_output_tokens,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": response_schema,
                "strict": True,
            }
        },
    }

    http_request = request.Request(
        api_url,
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=90) as response:
            response_payload = json.loads(
                response.read().decode("utf-8")
            )
    except error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = None

        message = payload
        if isinstance(parsed, dict):
            message = (
                parsed.get("error", {}).get("message")
                or parsed.get("message")
                or payload
            )

        raise LLMPlannerUpstreamError(
            f"OpenAI API request failed with status {exc.code}: {message}"
        ) from exc
    except error.URLError as exc:
        raise LLMPlannerUpstreamError(
            f"OpenAI API request failed: {exc.reason}"
        ) from exc

    try:
        return json.loads(_extract_response_text(response_payload))
    except json.JSONDecodeError as exc:
        raise LLMPlannerUpstreamError(
            "OpenAI returned invalid JSON."
        ) from exc


def validate_subgoal_response(payload: object) -> dict:
    try:
        validate_against_schema(SUBGOAL_RESPONSE_SCHEMA, payload)
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Subgoal response did not match the schema: {exc}"
        ) from exc
    return payload


def validate_action_response(payload: object, canvas_state: dict) -> dict:
    try:
        validate_against_schema(ACTION_RESPONSE_SCHEMA, payload)
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Atomic action response did not match the schema: {exc}"
        ) from exc

    execution_request = {"actions": payload["actions"]}
    try:
        validate_action_request(execution_request)
        execute_action_batch(canvas_state, payload["actions"])
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Atomic action response was invalid for the current canvas state: {exc}"
        ) from exc

    return payload


def plan_subgoals_with_llm(user_prompt: str, canvas_state: dict) -> dict:
    validated_canvas_state = resolve_canvas_state(canvas_state)
    response_payload = _call_openai_json(
        model=_get_model("OPENAI_SUBGOAL_MODEL", DEFAULT_SUBGOAL_MODEL),
        schema_name="whiteboard_subgoals",
        response_schema=SUBGOAL_RESPONSE_SCHEMA,
        system_prompt=build_subgoal_system_prompt(validated_canvas_state),
        user_prompt=build_subgoal_user_prompt(user_prompt),
        max_output_tokens=500,
    )
    return validate_subgoal_response(response_payload)


def plan_actions_with_llm(subgoal: str, canvas_state: dict) -> dict:
    validated_canvas_state = resolve_canvas_state(canvas_state)
    response_payload = _call_openai_json(
        model=_get_model("OPENAI_ACTION_MODEL", DEFAULT_ACTION_MODEL),
        schema_name="whiteboard_actions",
        response_schema=ACTION_RESPONSE_SCHEMA,
        system_prompt=build_action_system_prompt(validated_canvas_state),
        user_prompt=build_action_user_prompt(subgoal),
        max_output_tokens=1400,
    )
    return validate_action_response(response_payload, validated_canvas_state)
