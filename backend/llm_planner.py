import json
import logging
import os
import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error, request

from canvas_actions import (
    ACTION_ORDER,
    ACTION_SCHEMAS,
    CANVAS_BOUNDS,
    HANDLE_VALUES,
    CanvasActionError,
    execute_action_batch,
    validate_against_schema,
)
from canvas_state import empty_canvas_state, validate_canvas_state

DEFAULT_SUBGOAL_MODEL = "gpt-5.4-mini"
DEFAULT_ACTION_MODEL = "gpt-5.4"
ACTION_PLANNING_MAX_ATTEMPTS = 3

logger = logging.getLogger(__name__)

REFERENCE_KIND_PATTERN = (
    r"notes?|objects?|items?|cards?|labels?|text labels?|connectors?|arrows?|edges?"
)
SELECTION_REFERENCE_RE = re.compile(
    rf"\b(?:(these|selected)\s+(?P<kind>{REFERENCE_KIND_PATTERN})|current selection)\b",
    re.IGNORECASE,
)
KEYWORD_REFERENCE_RE = re.compile(
    rf"\b(?P<kind>{REFERENCE_KIND_PATTERN})\s+(?:about|with|on)\s+"
    r"(?P<keywords>[a-z0-9][a-z0-9\s-]*?)"
    r"(?=(?:\s+(?:and|then|into|to|from|near|next|closest|nearest|"
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
        "op": {"type": "string", "enum": list(ACTION_ORDER)},
        "id": _nullable_string_schema(),
        "object_type": _nullable_string_schema(
            enum=["sticky-note", "text-label", None],
        ),
        "geometry": _nullable_geometry_schema(),
        "text": _nullable_string_schema(),
        "selected": _nullable_boolean_schema(),
        "targets": _nullable_array_of_strings_schema(),
        "mode": _nullable_string_schema(
            enum=["replace", "add", "remove", "toggle", None],
        ),
        "delta": _nullable_delta_schema(),
        "target": _nullable_string_schema(),
        "source": _nullable_string_schema(),
        "target_handle": _nullable_string_schema(enum=[*HANDLE_VALUES, None]),
        "source_handle": _nullable_string_schema(enum=[*HANDLE_VALUES, None]),
        "label": _nullable_string_schema(),
        "field": _nullable_string_schema(enum=["text", "label", None]),
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

ACTION_OUTPUT_ITEM_KEYS = list(_build_action_output_item_schema()["properties"].keys())


def validate_subgoal_request(payload: object) -> None:
    try:
        validate_against_schema(SUBGOAL_REQUEST_SCHEMA, payload)
    except Exception as exc:  # pragma: no cover - narrowed by caller tests
        raise LLMPlannerValidationError(str(exc)) from exc


def validate_action_planner_request(payload: object) -> None:
    try:
        validate_against_schema(ACTION_PLANNER_REQUEST_SCHEMA, payload)
    except Exception as exc:  # pragma: no cover - narrowed by caller tests
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
    for collection_name in ("objects", "connectors"):
        ids.extend(entity["id"] for entity in canvas_state[collection_name])
    return sorted(ids)


def _next_available_id(existing_ids: set, prefix: str, width: int = 5) -> List[str]:
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    highest_index = 0
    for entity_id in existing_ids:
        match = pattern.match(entity_id)
        if match:
            highest_index = max(highest_index, int(match.group(1)))
    return [f"{prefix}-{highest_index + offset}" for offset in range(1, width + 1)]


def suggest_available_ids(canvas_state: dict) -> dict:
    existing_ids = set(_existing_entity_ids(canvas_state))
    return {
        "objects": _next_available_id(existing_ids, "node"),
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
        "connectors": "connector",
        "arrows": "arrow",
        "edges": "edge",
    }
    return singular_map.get(normalized, normalized)


def _scope_from_kind_term(term: Optional[str]) -> str:
    normalized = _normalize_kind_term(term)
    if normalized in ("connector", "arrow", "edge"):
        return "connectors"
    if normalized in ("label", "text label"):
        return "text-labels"
    return "objects"


def _is_plural_reference(term: Optional[str], surface_text: str) -> bool:
    normalized = (term or "").lower().strip()
    return surface_text.lower() == "current selection" or normalized.endswith("s")


def _entity_content_text(entity: dict, collection_name: str) -> str:
    if collection_name == "objects":
        return entity.get("content", {}).get("text", "")
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
    for collection_name in ("objects", "connectors"):
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
                entity["geometry"]["y"] if entity["geometry"] else 0,
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
    if scope == "connectors":
        return [entity for entity in selected_entities if entity["collection"] == "connectors"]
    if scope == "text-labels":
        return [
            entity
            for entity in selected_entities
            if entity["collection"] == "objects" and entity["type"] == "text-label"
        ]
    if scope == "selection":
        return selected_entities
    return [entity for entity in selected_entities if entity["collection"] == "objects"]


def _selection_centroid(canvas_state: dict, entities: List[dict]) -> Optional[dict]:
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

        candidate_entities = _selection_reference_candidates(canvas_state, entities, scope)
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
            scope = (
                _scope_from_kind_term(match.group("kind"))
                if match.groupdict().get("kind")
                else "objects"
            )
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
                anchor_entities = _entities_by_ids(entities, anchor_ids)
                if anchor_entities and anchor_entities[0]["center"] is not None:
                    anchor_point = anchor_entities[0]["center"]
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
                reason="Resolved deterministically by Euclidean distance.",
                anchor_ids=anchor_ids,
                anchor_source=anchor_source,
            )
        )

    resolution = empty_reference_resolution()
    for entry in resolution_log:
        if entry["status"] == "resolved":
            resolution["resolvedReferences"].append(entry)
        elif entry["status"] == "ambiguous":
            resolution["ambiguousReferences"].append(entry)
        else:
            resolution["unresolvedReferences"].append(entry)
    return resolution


def _compact_canvas_context(canvas_state: dict) -> dict:
    return {
        "objects": canvas_state["objects"],
        "connectors": canvas_state["connectors"],
        "viewport": canvas_state["viewport"],
        "selection": canvas_state["selection"],
    }


def build_subgoal_system_prompt(canvas_state: dict) -> str:
    return "\n".join(
        [
            "You decompose a whiteboard command into a short ordered list of subgoals.",
            "Prompt 1 returns subgoals only.",
            "Allowed action set: Create, Select, Move, Resize, Connect, Annotate, Delete.",
            "Do not emit atomic actions, explanations, markdown, or extra keys.",
            "Never invent nonexistent objects, connectors, or IDs.",
            "If you mention existing entities conceptually, rely only on CURRENT_CANVAS_STATE_JSON.",
            "Selection is explicit in the canvas state and should guide references like 'these notes'.",
            "CURRENT_CANVAS_STATE_JSON:",
            json.dumps(_compact_canvas_context(canvas_state), indent=2, sort_keys=True),
        ]
    )


def build_subgoal_user_prompt(prompt: str) -> str:
    return "\n".join(
        [
            "Decompose this whiteboard instruction into subgoals:",
            prompt,
        ]
    )


def build_action_system_prompt(canvas_state: dict) -> str:
    available_ids = suggest_available_ids(canvas_state)
    return "\n".join(
        [
            "You convert one whiteboard subgoal into executable atomic actions.",
            "Prompt 2 returns atomic actions only.",
            "Emit actions only from the allowed action set.",
            "Allowed action set: Create, Select, Move, Resize, Connect, Annotate, Delete.",
            "Never invent nonexistent objects, connectors, or IDs.",
            "Every reference to an existing entity must use a valid ID from the current canvas state.",
            "Create may only create object_type 'sticky-note' or 'text-label'.",
            "Use AVAILABLE_NEW_IDS_JSON for any new object or connector ID.",
            "Every targets array must be non-empty.",
            "Connect actions must include both source and target.",
            "Move actions must include delta with numeric dx and dy.",
            "Move, Resize, and Create must keep object geometry inside CANVAS_BOUNDS.",
            "Annotate on a text-label automatically resizes the label to fit the updated text.",
            "Do not include fields that are irrelevant for the chosen op.",
            "Do not reference an entity after deleting it in the same response.",
            "CURRENT_CANVAS_STATE_JSON:",
            json.dumps(_compact_canvas_context(canvas_state), indent=2, sort_keys=True),
            "EXISTING_ENTITY_IDS_JSON:",
            json.dumps(_existing_entity_ids(canvas_state), indent=2),
            "AVAILABLE_NEW_IDS_JSON:",
            json.dumps(available_ids, indent=2, sort_keys=True),
            "CANVAS_BOUNDS:",
            json.dumps(CANVAS_BOUNDS, indent=2, sort_keys=True),
        ]
    )


def build_action_user_prompt(
    subgoal: str,
    reference_resolution: dict,
    canvas_state: dict,
) -> str:
    return "\n".join(
        [
            "Convert this single subgoal into atomic whiteboard actions:",
            f"SUBGOAL: {subgoal}",
            "RESOLVED_REFERENCES_JSON:",
            json.dumps(reference_resolution["resolvedReferences"], indent=2, sort_keys=True),
            "AMBIGUOUS_REFERENCES_JSON:",
            json.dumps(reference_resolution["ambiguousReferences"], indent=2, sort_keys=True),
            "UNRESOLVED_REFERENCES_JSON:",
            json.dumps(reference_resolution["unresolvedReferences"], indent=2, sort_keys=True),
            "CURRENT_CANVAS_STATE_JSON:",
            json.dumps(_compact_canvas_context(canvas_state), indent=2, sort_keys=True),
        ]
    )


def _repair_hints_for_error(validation_error: str) -> List[str]:
    hints = []
    lowered = validation_error.lower()
    if ".delta is required" in validation_error or "delta is required" in lowered:
        hints.append(
            "Move actions must include delta as an object with numeric dx and dy."
        )
    if "outside canvas bounds" in lowered:
        hints.append(
            "Move, Resize, and Create actions must keep object geometry inside CANVAS_BOUNDS."
        )
    if ".target is required" in lowered or ".source is required" in lowered:
        hints.append(
            "Connect actions must include both source and target."
        )
    if "does not exist" in lowered or "not valid for this action" in lowered:
        hints.append(
            "Use only existing valid object or connector IDs from CURRENT_CANVAS_STATE_JSON, or a suggested unused ID for Create and Connect."
        )
    if "at least 1 item" in lowered or "targets" in lowered and "required" in lowered:
        hints.append("Every targets array must be non-empty.")
    if "unsupported field" in lowered:
        hints.append("Do not include fields that are not allowed for the selected op.")
    return hints or ["Return only executable actions for the current scene graph."]


def build_action_repair_prompt(
    subgoal: str,
    reference_resolution: dict,
    canvas_state: dict,
    previous_actions: List[dict],
    validation_error: str,
    failure_log: List[dict],
) -> str:
    hint_lines = [
        f"REPAIR_HINT: {hint}" for hint in _repair_hints_for_error(validation_error)
    ]
    return "\n".join(
        [
            "Repair the previous atomic whiteboard action plan.",
            f"SUBGOAL: {subgoal}",
            "RESOLVED_REFERENCES_JSON:",
            json.dumps(reference_resolution["resolvedReferences"], indent=2, sort_keys=True),
            "AMBIGUOUS_REFERENCES_JSON:",
            json.dumps(reference_resolution["ambiguousReferences"], indent=2, sort_keys=True),
            "UNRESOLVED_REFERENCES_JSON:",
            json.dumps(reference_resolution["unresolvedReferences"], indent=2, sort_keys=True),
            "CURRENT_CANVAS_CONTEXT_FOR_REPAIR:",
            "CURRENT_CANVAS_STATE_JSON:",
            json.dumps(_compact_canvas_context(canvas_state), indent=2, sort_keys=True),
            "PREVIOUS_INVALID_ACTIONS_JSON:",
            json.dumps(previous_actions, indent=2, sort_keys=True),
            "VALIDATION_ERROR:",
            validation_error,
            "FAILURE_LOG_JSON:",
            json.dumps(failure_log, indent=2, sort_keys=True),
            *hint_lines,
        ]
    )


def _request_payload_for_structured_output(
    model: str,
    system_prompt: str,
    user_prompt: str,
    schema_name: str,
    schema: dict,
) -> dict:
    return {
        "model": model,
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_prompt}],
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": schema,
                "strict": True,
            }
        },
    }


def _extract_response_text(payload: dict) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    for output in payload.get("output", []):
        for content in output.get("content", []):
            text_value = content.get("text")
            if isinstance(text_value, str) and text_value.strip():
                return text_value
    raise LLMPlannerUpstreamError("OpenAI response did not include structured JSON text.")


def _call_openai_structured_json(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    schema_name: str,
    schema: dict,
) -> dict:
    api_key = _get_required_env("OPENAI_API_KEY")
    payload = _request_payload_for_structured_output(
        model,
        system_prompt,
        user_prompt,
        schema_name,
        schema,
    )
    request_body = json.dumps(payload).encode("utf-8")
    http_request = request.Request(
        "https://api.openai.com/v1/responses",
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=60) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            error_payload = json.loads(body)
            message = error_payload.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            message = body or str(exc)
        raise LLMPlannerUpstreamError(
            f"OpenAI API request failed with status {exc.code}: {message}"
        ) from exc
    except error.URLError as exc:
        raise LLMPlannerUpstreamError(
            f"OpenAI API request failed: {exc.reason}"
        ) from exc

    raw_text = _extract_response_text(response_payload)
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise LLMPlannerUpstreamError(
            f"OpenAI response was not valid JSON: {exc}"
        ) from exc


def validate_subgoal_response(payload: object) -> dict:
    try:
        validate_against_schema(SUBGOAL_RESPONSE_SCHEMA, payload)
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Subgoal response was invalid: {exc}"
        ) from exc

    subgoals = []
    for item in payload["subgoals"]:
        subgoal = item["subgoal"].strip()
        if not subgoal:
            raise LLMPlannerUpstreamError(
                "Subgoal response was invalid: subgoal text must be non-empty."
            )
        subgoals.append({"subgoal": subgoal})
    return {"subgoals": subgoals}


def _canonicalize_action_payload(action: dict) -> dict:
    canonical = deepcopy(action)
    if "sourceHandle" in canonical and "source_handle" not in canonical:
        canonical["source_handle"] = canonical.pop("sourceHandle")
    if "targetHandle" in canonical and "target_handle" not in canonical:
        canonical["target_handle"] = canonical.pop("targetHandle")

    op = canonical.get("op")
    if not isinstance(op, str) or op not in ACTION_SCHEMAS:
        return canonical

    allowed_fields = set(ACTION_SCHEMAS[op]["properties"].keys())
    canonical = {
        key: value
        for key, value in canonical.items()
        if key in allowed_fields and value is not None
    }
    return canonical


def _normalize_action_output_payload(payload: object) -> object:
    if not isinstance(payload, dict) or not isinstance(payload.get("actions"), list):
        return payload

    normalized_actions = []
    for action in payload["actions"]:
        if not isinstance(action, dict):
            normalized_actions.append(action)
            continue

        normalized_action = {key: None for key in ACTION_OUTPUT_ITEM_KEYS}
        normalized_action.update(action)
        normalized_actions.append(normalized_action)

    return {
        **payload,
        "actions": normalized_actions,
    }


def validate_action_response(payload: object, canvas_state: dict) -> dict:
    normalized_payload = _normalize_action_output_payload(payload)
    try:
        validate_against_schema(ACTION_RESPONSE_SCHEMA, normalized_payload)
    except Exception as exc:
        raise LLMPlannerUpstreamError(
            f"Atomic action response was invalid: {exc}"
        ) from exc

    canonical_actions = [
        _canonicalize_action_payload(action)
        for action in normalized_payload["actions"]
    ]

    try:
        execute_action_batch(deepcopy(canvas_state), canonical_actions)
    except CanvasActionError as exc:
        raise LLMPlannerUpstreamError(
            f"Atomic action response was invalid for the current canvas state: {exc}"
        ) from exc

    return {"actions": canonical_actions}


def plan_subgoals_with_llm(prompt: str, canvas_state: dict) -> dict:
    system_prompt = build_subgoal_system_prompt(canvas_state)
    user_prompt = build_subgoal_user_prompt(prompt)
    payload = _call_openai_structured_json(
        model=_get_model("OPENAI_SUBGOAL_MODEL", DEFAULT_SUBGOAL_MODEL),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema_name="whiteboard_subgoals",
        schema=SUBGOAL_RESPONSE_SCHEMA,
    )
    return validate_subgoal_response(payload)


def plan_actions_with_llm(subgoal: str, canvas_state: dict) -> dict:
    reference_resolution = resolve_action_references(subgoal, canvas_state)
    system_prompt = build_action_system_prompt(canvas_state)
    user_prompt = build_action_user_prompt(
        subgoal,
        reference_resolution,
        canvas_state,
    )
    failure_log = []
    previous_actions = []
    model = _get_model("OPENAI_ACTION_MODEL", DEFAULT_ACTION_MODEL)

    for attempt in range(1, ACTION_PLANNING_MAX_ATTEMPTS + 1):
        payload = _call_openai_structured_json(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema_name="whiteboard_actions",
            schema=ACTION_RESPONSE_SCHEMA,
        )
        previous_actions = payload.get("actions", [])

        try:
            validated = validate_action_response(payload, canvas_state)
            return {
                "actions": validated["actions"],
                "referenceResolution": reference_resolution,
                "failureLog": failure_log,
            }
        except LLMPlannerUpstreamError as exc:
            failure_log.append(
                {
                    "attempt": attempt,
                    "error": str(exc),
                    "actions": deepcopy(previous_actions),
                }
            )
            if attempt >= ACTION_PLANNING_MAX_ATTEMPTS:
                raise
            user_prompt = build_action_repair_prompt(
                subgoal,
                reference_resolution,
                canvas_state,
                previous_actions=previous_actions,
                validation_error=str(exc),
                failure_log=failure_log,
            )

    raise LLMPlannerUpstreamError("Action planning failed without a result.")
