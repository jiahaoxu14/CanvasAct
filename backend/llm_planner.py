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
    HANDLE_VALUES,
    validate_action_request,
    validate_against_schema,
)
from canvas_state import empty_canvas_state, validate_canvas_state

DEFAULT_SUBGOAL_MODEL = "gpt-5.4-mini"
DEFAULT_ACTION_MODEL = "gpt-5.4"
ACTION_PLANNING_MAX_ATTEMPTS = 2
REFERENCE_KIND_PATTERN = (
    r"notes?|objects?|items?|cards?|labels?|text labels?|frames?|groups?|boxes?|"
    r"lanes?|connectors?|arrows?|edges?"
)
SELECTION_REFERENCE_RE = re.compile(
    rf"\b(?:(these|selected)\s+(?P<kind>{REFERENCE_KIND_PATTERN})|current selection)\b",
    re.IGNORECASE,
)
KEYWORD_REFERENCE_RE = re.compile(
    rf"\b(?P<kind>{REFERENCE_KIND_PATTERN})\s+(?:about|with|on)\s+"
    r"(?P<keywords>[a-z0-9][a-z0-9\s-]*?)"
    r"(?=(?:\s+(?:and|then|into|to|from|within|inside|near|next|closest|nearest|"
    r"leftmost|rightmost|topmost|bottommost|left|right|top|bottom)\b|[,.!?;:]|$))",
    re.IGNORECASE,
)
ABSOLUTE_GEOMETRY_RE = re.compile(
    rf"\b(?P<direction>leftmost|rightmost|topmost|bottommost)\s*(?P<kind>{REFERENCE_KIND_PATTERN})?\b",
    re.IGNORECASE,
)
RELATIVE_GEOMETRY_RE = re.compile(
    rf"\b(?P<direction>left|right|top|bottom)\s+(?P<kind>{REFERENCE_KIND_PATTERN})\b",
    re.IGNORECASE,
)
NEAREST_REFERENCE_RE = re.compile(
    rf"\b(?P<direction>closest|nearest)\s+(?P<kind>{REFERENCE_KIND_PATTERN})\b",
    re.IGNORECASE,
)


class LLMPlannerError(Exception):
    pass


class LLMPlannerValidationError(LLMPlannerError):
    pass


class LLMPlannerConfigError(LLMPlannerError):
    pass


class LLMPlannerUpstreamError(LLMPlannerError):
    pass


def _nullable_string_schema(*, enum: Optional[List[Optional[str]]] = None) -> dict:
    schema = {"type": ["string", "null"]}
    if enum is not None:
        schema["enum"] = enum
    return schema


def _nullable_number_schema() -> dict:
    return {"type": ["number", "null"]}


def _nullable_boolean_schema() -> dict:
    return {"type": ["boolean", "null"]}


def _nullable_array_of_strings_schema() -> dict:
    return {
        "type": ["array", "null"],
        "items": {"type": "string"},
    }


def _nullable_geometry_schema() -> dict:
    return {
        "type": ["object", "null"],
        "properties": {
            "x": {"type": "number"},
            "y": {"type": "number"},
            "w": {"type": "number"},
            "h": {"type": "number"},
        },
        "required": ["x", "y", "w", "h"],
        "additionalProperties": False,
    }


def _nullable_delta_schema() -> dict:
    return {
        "type": ["object", "null"],
        "properties": {
            "dx": {"type": "number"},
            "dy": {"type": "number"},
        },
        "required": ["dx", "dy"],
        "additionalProperties": False,
    }


def _build_action_output_item_schema() -> dict:
    properties = {
        "op": {
            "type": "string",
            "enum": list(ACTION_ORDER),
        },
        "id": _nullable_string_schema(),
        "object_type": _nullable_string_schema(
            enum=["sticky-note", "text-label", "frame", None],
        ),
        "geometry": _nullable_geometry_schema(),
        "text": _nullable_string_schema(),
        "title": _nullable_string_schema(),
        "parent_frame_id": _nullable_string_schema(),
        "selected": _nullable_boolean_schema(),
        "targets": _nullable_array_of_strings_schema(),
        "mode": _nullable_string_schema(
            enum=["replace", "add", "remove", "toggle", None],
        ),
        "delta": _nullable_delta_schema(),
        "target": _nullable_string_schema(),
        "frame_id": _nullable_string_schema(),
        "source": _nullable_string_schema(),
        "target_handle": _nullable_string_schema(
            enum=[*HANDLE_VALUES, None],
        ),
        "source_handle": _nullable_string_schema(
            enum=[*HANDLE_VALUES, None],
        ),
        "label": _nullable_string_schema(),
        "field": _nullable_string_schema(
            enum=["text", "title", "label", None],
        ),
    }

    return {
        "type": "object",
        "properties": properties,
        "required": list(properties.keys()),
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
                    "subgoal": {"type": "string"},
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


def empty_reference_resolution() -> dict:
    return {
        "resolvedReferences": [],
        "ambiguousReferences": [],
        "unresolvedReferences": [],
    }


def _normalize_kind_term(term: Optional[str]) -> str:
    if not term:
        return ""

    normalized = term.lower().replace("-", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    singular_map = {
        "notes": "note",
        "objects": "object",
        "items": "item",
        "cards": "card",
        "labels": "label",
        "text labels": "text label",
        "frames": "frame",
        "groups": "group",
        "boxes": "box",
        "lanes": "lane",
        "connectors": "connector",
        "arrows": "arrow",
        "edges": "edge",
    }
    return singular_map.get(normalized, normalized)


def _scope_from_kind_term(term: Optional[str]) -> str:
    normalized = _normalize_kind_term(term)
    if normalized in ("frame", "group", "box", "lane"):
        return "frames"
    if normalized in ("connector", "arrow", "edge"):
        return "connectors"
    if normalized in ("label", "text label"):
        return "text-labels"
    return "objects"


def _is_plural_reference(term: Optional[str], surface_text: str) -> bool:
    normalized = (term or "").lower().strip()
    return (
        surface_text.lower() == "current selection"
        or normalized.endswith("s")
    )


def _entity_content_text(entity: dict, collection_name: str) -> str:
    if collection_name == "objects":
        return entity.get("content", {}).get("text", "")
    if collection_name == "frames":
        return entity.get("content", {}).get("title", "")
    return entity.get("content", {}).get("label", "")


def _connector_center(geometry: Optional[dict]) -> Optional[dict]:
    if not isinstance(geometry, dict):
        return None

    source_point = geometry.get("sourcePoint")
    target_point = geometry.get("targetPoint")
    if not isinstance(source_point, dict) or not isinstance(target_point, dict):
        return None

    return {
        "x": (source_point["x"] + target_point["x"]) / 2,
        "y": (source_point["y"] + target_point["y"]) / 2,
    }


def _iter_resolvable_entities(canvas_state: dict) -> List[dict]:
    entities = []

    for collection_name in ("objects", "frames", "connectors"):
        for entity in canvas_state[collection_name]:
            geometry = entity.get("geometry")
            center = None
            if collection_name == "connectors":
                center = _connector_center(geometry)
            elif isinstance(geometry, dict):
                center = {
                    "x": geometry["x"] + geometry["w"] / 2,
                    "y": geometry["y"] + geometry["h"] / 2,
                }

            entities.append(
                {
                    "id": entity["id"],
                    "collection": collection_name,
                    "type": entity.get("type"),
                    "geometry": geometry,
                    "center": center,
                    "contentText": _entity_content_text(entity, collection_name),
                }
            )

    return entities


def _entities_for_scope(entities: List[dict], scope: str) -> List[dict]:
    if scope == "frames":
        return [entity for entity in entities if entity["collection"] == "frames"]
    if scope == "connectors":
        return [entity for entity in entities if entity["collection"] == "connectors"]
    if scope == "text-labels":
        return [
            entity
            for entity in entities
            if entity["collection"] == "objects" and entity["type"] == "text-label"
        ]
    return [entity for entity in entities if entity["collection"] == "objects"]


def _entities_by_ids(entities: List[dict], ids: List[str]) -> List[dict]:
    lookup = {entity["id"]: entity for entity in entities}
    return [lookup[entity_id] for entity_id in ids if entity_id in lookup]


def _keyword_tokens(raw_keywords: str) -> List[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]+", raw_keywords.lower())
        if len(token) > 1
    ]


def _match_keyword_entities(
    entities: List[dict],
    scope: str,
    raw_keywords: str,
) -> List[dict]:
    keywords = _keyword_tokens(raw_keywords)
    if not keywords:
        return []

    matches = []
    for entity in _entities_for_scope(entities, scope):
        haystack = entity["contentText"].lower()
        if all(keyword in haystack for keyword in keywords):
            matches.append(entity)
    return matches


def _reference_record(
    *,
    surface_text: str,
    rule: str,
    candidate_ids: List[str],
    status: str,
    entity_scope: str,
    reason: str,
    anchor_ids: Optional[List[str]] = None,
    anchor_source: Optional[str] = None,
) -> dict:
    record = {
        "surfaceText": surface_text,
        "rule": rule,
        "candidateIds": candidate_ids,
        "status": status,
        "entityScope": entity_scope,
        "reason": reason,
    }
    if anchor_ids:
        record["anchorIds"] = anchor_ids
    if anchor_source:
        record["anchorSource"] = anchor_source
    return record


def _sort_entities_by_direction(entities: List[dict], direction: str) -> List[dict]:
    if direction in ("left", "leftmost"):
        return sorted(
            entities,
            key=lambda entity: (
                entity["geometry"]["x"] if entity["geometry"] else 0,
                entity["center"]["y"] if entity["center"] else 0,
                entity["id"],
            ),
        )
    if direction in ("right", "rightmost"):
        return sorted(
            entities,
            key=lambda entity: (
                -(entity["center"]["x"] if entity["center"] else 0),
                entity["geometry"]["x"] if entity["geometry"] else 0,
                entity["id"],
            ),
        )
    if direction in ("top", "topmost"):
        return sorted(
            entities,
            key=lambda entity: (
                entity["geometry"]["y"],
                entity["center"]["x"] if entity["center"] else 0,
                entity["id"],
            ),
        )
    return sorted(
        entities,
        key=lambda entity: (
            -(entity["center"]["y"] if entity["center"] else 0),
            entity["geometry"]["y"] if entity["geometry"] else 0,
            entity["id"],
        ),
    )


def _selection_reference_candidates(
    canvas_state: dict,
    entities: List[dict],
    scope: str,
) -> List[dict]:
    selected_entities = _entities_by_ids(entities, canvas_state["selection"])
    if scope == "objects":
        return [entity for entity in selected_entities if entity["collection"] == "objects"]
    if scope == "frames":
        return [entity for entity in selected_entities if entity["collection"] == "frames"]
    if scope == "connectors":
        return [entity for entity in selected_entities if entity["collection"] == "connectors"]
    if scope == "text-labels":
        return [
            entity
            for entity in selected_entities
            if entity["collection"] == "objects" and entity["type"] == "text-label"
        ]
    return selected_entities


def _selection_centroid(
    canvas_state: dict,
    entities: List[dict],
) -> Optional[dict]:
    selected_entities = [
        entity
        for entity in _entities_by_ids(entities, canvas_state["selection"])
        if entity["center"] is not None
    ]
    if not selected_entities:
        return None

    count = len(selected_entities)
    return {
        "x": sum(entity["center"]["x"] for entity in selected_entities) / count,
        "y": sum(entity["center"]["y"] for entity in selected_entities) / count,
    }


def resolve_action_references(subgoal: str, canvas_state: dict) -> dict:
    entities = _iter_resolvable_entities(canvas_state)
    resolution_log = []

    for match in SELECTION_REFERENCE_RE.finditer(subgoal):
        surface_text = match.group(0)
        if surface_text.lower() == "current selection":
            scope = "selection"
            plural_reference = True
        else:
            scope = _scope_from_kind_term(match.group("kind"))
            plural_reference = _is_plural_reference(match.group("kind"), surface_text)

        candidate_entities = _selection_reference_candidates(
            canvas_state,
            entities,
            scope,
        )
        candidate_ids = [entity["id"] for entity in candidate_entities]

        if not candidate_ids:
            resolution_log.append(
                _reference_record(
                    surface_text=surface_text,
                    rule="selection",
                    candidate_ids=[],
                    status="unresolved",
                    entity_scope=scope,
                    reason="Current selection did not contain matching entities.",
                )
            )
            continue

        status = "resolved"
        reason = "Resolved from the current selection."
        if len(candidate_ids) > 1 and not plural_reference:
            status = "ambiguous"
            reason = "Selection reference matched multiple entities for a singular phrase."

        resolution_log.append(
            _reference_record(
                surface_text=surface_text,
                rule="selection",
                candidate_ids=candidate_ids,
                status=status,
                entity_scope=scope,
                reason=reason,
            )
        )

    for match in KEYWORD_REFERENCE_RE.finditer(subgoal):
        surface_text = match.group(0)
        scope = _scope_from_kind_term(match.group("kind"))
        plural_reference = _is_plural_reference(match.group("kind"), surface_text)
        candidate_entities = _match_keyword_entities(
            entities,
            scope,
            match.group("keywords"),
        )
        candidate_ids = [entity["id"] for entity in candidate_entities]

        if not candidate_ids:
            resolution_log.append(
                _reference_record(
                    surface_text=surface_text,
                    rule="keyword-match",
                    candidate_ids=[],
                    status="unresolved",
                    entity_scope=scope,
                    reason="No entity text matched the requested keywords.",
                )
            )
            continue

        status = "resolved"
        reason = "Resolved by keyword matching against entity text."
        if len(candidate_ids) > 1 and not plural_reference:
            status = "ambiguous"
            reason = "Keyword match found multiple candidates for a singular phrase."

        resolution_log.append(
            _reference_record(
                surface_text=surface_text,
                rule="keyword-match",
                candidate_ids=candidate_ids,
                status=status,
                entity_scope=scope,
                reason=reason,
            )
        )

    for pattern_name, pattern in (
        ("geometric", ABSOLUTE_GEOMETRY_RE),
        ("geometric", RELATIVE_GEOMETRY_RE),
    ):
        for match in pattern.finditer(subgoal):
            surface_text = match.group(0)
            scope = _scope_from_kind_term(match.group("kind")) if match.groupdict().get("kind") else "objects"
            candidate_entities = _entities_for_scope(entities, scope)

            if not candidate_entities:
                resolution_log.append(
                    _reference_record(
                        surface_text=surface_text,
                        rule=pattern_name,
                        candidate_ids=[],
                        status="unresolved",
                        entity_scope=scope,
                        reason="No entities were available for this geometric filter.",
                    )
                )
                continue

            sorted_entities = _sort_entities_by_direction(
                candidate_entities,
                match.group("direction").lower(),
            )
            resolution_log.append(
                _reference_record(
                    surface_text=surface_text,
                    rule=pattern_name,
                    candidate_ids=[sorted_entities[0]["id"]],
                    status="resolved",
                    entity_scope=scope,
                    reason="Resolved deterministically with a geometric ordering rule.",
                )
            )

    for match in NEAREST_REFERENCE_RE.finditer(subgoal):
        surface_text = match.group(0)
        scope = _scope_from_kind_term(match.group("kind"))
        candidate_entities = _entities_for_scope(entities, scope)

        anchor_ids = []
        anchor_source = None
        anchor_point = None

        for previous_reference in reversed(resolution_log):
            if previous_reference["status"] == "resolved" and len(previous_reference["candidateIds"]) == 1:
                anchor_ids = previous_reference["candidateIds"]
                anchor_source = "prior-resolved-reference"
                anchor_entity = _entities_by_ids(entities, anchor_ids)
                if anchor_entity and anchor_entity[0]["center"] is not None:
                    anchor_point = anchor_entity[0]["center"]
                    break

        if anchor_point is None:
            anchor_point = _selection_centroid(canvas_state, entities)
            if anchor_point is not None:
                anchor_ids = list(canvas_state["selection"])
                anchor_source = "selection-centroid"

        if anchor_point is None:
            resolution_log.append(
                _reference_record(
                    surface_text=surface_text,
                    rule="nearest",
                    candidate_ids=[],
                    status="unresolved",
                    entity_scope=scope,
                    reason="Nearest reference had no deterministic anchor.",
                )
            )
            continue

        excluded_ids = set(anchor_ids)
        candidate_entities = [
            entity
            for entity in candidate_entities
            if entity["center"] is not None and entity["id"] not in excluded_ids
        ]
        if not candidate_entities:
            resolution_log.append(
                _reference_record(
                    surface_text=surface_text,
                    rule="nearest",
                    candidate_ids=[],
                    status="unresolved",
                    entity_scope=scope,
                    reason="No candidates remained after excluding anchor entities.",
                    anchor_ids=anchor_ids,
                    anchor_source=anchor_source,
                )
            )
            continue

        nearest_entity = sorted(
            candidate_entities,
            key=lambda entity: (
                (entity["center"]["x"] - anchor_point["x"]) ** 2
                + (entity["center"]["y"] - anchor_point["y"]) ** 2,
                entity["geometry"]["x"] if entity["geometry"] else 0,
                entity["geometry"]["y"] if entity["geometry"] else 0,
                entity["id"],
            ),
        )[0]
        resolution_log.append(
            _reference_record(
                surface_text=surface_text,
                rule="nearest",
                candidate_ids=[nearest_entity["id"]],
                status="resolved",
                entity_scope=scope,
                reason="Resolved by nearest-neighbor search using Euclidean distance.",
                anchor_ids=anchor_ids,
                anchor_source=anchor_source,
            )
        )

    return {
        "resolvedReferences": [
            record for record in resolution_log if record["status"] == "resolved"
        ],
        "ambiguousReferences": [
            record for record in resolution_log if record["status"] == "ambiguous"
        ],
        "unresolvedReferences": [
            record for record in resolution_log if record["status"] == "unresolved"
        ],
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


def _reference_context_for_prompt(reference_resolution: dict) -> str:
    return "\n".join(
        [
            "RESOLVED_REFERENCES_JSON:",
            json.dumps(
                reference_resolution.get("resolvedReferences", []),
                indent=2,
                sort_keys=True,
            ),
            "AMBIGUOUS_REFERENCES_JSON:",
            json.dumps(
                reference_resolution.get("ambiguousReferences", []),
                indent=2,
                sort_keys=True,
            ),
            "UNRESOLVED_REFERENCES_JSON:",
            json.dumps(
                reference_resolution.get("unresolvedReferences", []),
                indent=2,
                sort_keys=True,
            ),
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
            "- A deterministic reference resolver runs before you. Treat its resolved candidate IDs as grounding hints and do not override them with invented grounding.",
            "- If a reference is ambiguous, stay within the listed candidate IDs. Do not fabricate a different existing object.",
            "- For GroupIntoFrame, use an existing frame only if every target object fits inside that frame. If it does not fit, create a new frame with an unused frame_id instead of forcing the existing one.",
            "- source, target, targets, parent_frame_id, and frame_id must refer to IDs that exist in the current canvas or are created earlier in the same action list.",
            "- Keep the action list minimal and valid against the current canvas state.",
            "",
            _canvas_context_for_prompt(canvas_state),
        ]
    )


def build_action_user_prompt(
    subgoal: str,
    reference_resolution: dict,
    *,
    previous_actions: Optional[List[dict]] = None,
    validation_error: Optional[str] = None,
) -> str:
    prompt_lines = [
        "Convert this single subgoal into atomic whiteboard actions:",
        subgoal,
        "",
        "Use the deterministic grounding output below when resolving references:",
        _reference_context_for_prompt(reference_resolution),
    ]

    if validation_error:
        prompt_lines.extend(
            [
                "",
                "The previous candidate action plan was invalid for the current canvas state.",
                "Return a corrected atomic action list only.",
                f"VALIDATION_ERROR: {validation_error}",
            ]
        )
        repair_hint = _build_validation_repair_hint(validation_error)
        if repair_hint:
            prompt_lines.append(f"REPAIR_HINT: {repair_hint}")

    if previous_actions:
        prompt_lines.extend(
            [
                "PREVIOUS_INVALID_ACTIONS_JSON:",
                json.dumps(previous_actions, indent=2, sort_keys=True),
            ]
        )

    return "\n".join(prompt_lines)


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
    for entry in payload["subgoals"]:
        if not entry["subgoal"].strip():
            raise LLMPlannerUpstreamError(
                "Subgoal response contained an empty subgoal."
            )
    return payload


def _current_entity_collections(canvas_state: dict) -> Dict[str, str]:
    collections = {}
    for collection_name in ("objects", "frames", "connectors"):
        for entity in canvas_state[collection_name]:
            collections[entity["id"]] = collection_name
    return collections


def _collection_for_created_action(action: dict) -> Optional[str]:
    if action.get("op") == "Create":
        if action.get("object_type") == "frame":
            return "frames"
        return "objects"
    if action.get("op") == "Connect":
        return "connectors"
    return None


def _normalize_llm_action_response_payload(payload: dict) -> dict:
    action_properties = ACTION_RESPONSE_SCHEMA["properties"]["actions"]["items"]["properties"]
    normalized_actions = []

    for raw_action in payload.get("actions", []):
        normalized_action = {
            key: raw_action.get(key)
            for key in action_properties.keys()
        }
        normalized_actions.append(normalized_action)

    return {"actions": normalized_actions}


def _canonicalize_action_payload(raw_payload: dict) -> dict:
    actions = []
    for raw_action in raw_payload["actions"]:
        canonical_action = {
            key: value
            for key, value in raw_action.items()
            if value is not None
        }
        actions.append(canonical_action)
    return {"actions": actions}


def _deterministically_repair_actions(
    execution_request: dict,
    canvas_state: dict,
) -> dict:
    repaired_request = deepcopy(execution_request)
    known_entity_collections = _current_entity_collections(canvas_state)

    for action in repaired_request["actions"]:
        if action["op"] == "GroupIntoFrame":
            filtered_targets = [
                entity_id
                for entity_id in action.get("targets", [])
                if known_entity_collections.get(entity_id) == "objects"
            ]
            deduped_targets = list(dict.fromkeys(filtered_targets))
            if deduped_targets:
                action["targets"] = deduped_targets

        created_collection = _collection_for_created_action(action)
        created_id = action.get("id")
        if created_collection and created_id:
            known_entity_collections[created_id] = created_collection

    return repaired_request


def _build_validation_repair_hint(validation_error: str) -> Optional[str]:
    if "GroupIntoFrame" in validation_error and "is not valid for this action" in validation_error:
        return (
            "For GroupIntoFrame, targets must contain object ids only. "
            "Do not include frame ids or connector ids in targets. "
            "Put the destination frame only in frame_id."
        )
    if "GroupIntoFrame" in validation_error and "too large for frame" in validation_error:
        return (
            "Do not group into an existing frame that cannot contain every target object. "
            "Use a new unused frame_id instead."
        )
    return None


def validate_action_response(payload: object, canvas_state: dict) -> dict:
    normalized_payload = _normalize_llm_action_response_payload(payload)
    try:
        validate_against_schema(ACTION_RESPONSE_SCHEMA, normalized_payload)
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Atomic action response did not match the schema: {exc}"
        ) from exc

    execution_request = _canonicalize_action_payload(normalized_payload)
    execution_request = _deterministically_repair_actions(
        execution_request,
        canvas_state,
    )
    try:
        validate_action_request(execution_request)
        execute_action_batch(canvas_state, execution_request["actions"])
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Atomic action response was invalid for the current canvas state: {exc}"
        ) from exc

    return execution_request


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
    reference_resolution = resolve_action_references(
        subgoal,
        validated_canvas_state,
    )
    system_prompt = build_action_system_prompt(validated_canvas_state)
    current_user_prompt = build_action_user_prompt(
        subgoal,
        reference_resolution,
    )
    last_validation_error = None

    for attempt in range(ACTION_PLANNING_MAX_ATTEMPTS):
        response_payload = _call_openai_json(
            model=_get_model("OPENAI_ACTION_MODEL", DEFAULT_ACTION_MODEL),
            schema_name="whiteboard_actions",
            response_schema=ACTION_RESPONSE_SCHEMA,
            system_prompt=system_prompt,
            user_prompt=current_user_prompt,
            max_output_tokens=1400,
        )

        try:
            validated_response = validate_action_response(
                response_payload,
                validated_canvas_state,
            )
            validated_response["referenceResolution"] = reference_resolution
            if last_validation_error is not None:
                validated_response["repairAttempted"] = True
            return validated_response
        except LLMPlannerUpstreamError as exc:
            last_validation_error = str(exc)
            if attempt == ACTION_PLANNING_MAX_ATTEMPTS - 1:
                raise

            current_user_prompt = build_action_user_prompt(
                subgoal,
                reference_resolution,
                previous_actions=response_payload.get("actions", []),
                validation_error=last_validation_error,
            )

    raise LLMPlannerUpstreamError(
        "Atomic action planning failed after all repair attempts."
    )
