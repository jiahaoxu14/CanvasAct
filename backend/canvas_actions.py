import json
import math
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from canvas_state import _is_number, validate_canvas_state

CANVAS_BOUNDS = {
    "left": -2000,
    "top": -2000,
    "right": 6000,
    "bottom": 6000,
}

HANDLE_VALUES = ("left", "top", "right", "bottom")
TEXT_LABEL_AUTO_SIZE = {
    "min_width": 170,
    "max_width": 460,
    "min_height": 58,
    "padding_x": 36,
    "padding_y": 28,
    "line_height": 28,
    "char_width": 9.5,
}
ACTION_ORDER = (
    "Create",
    "Select",
    "Move",
    "Resize",
    "Connect",
    "Annotate",
    "Delete",
)

NON_EMPTY_STRING_SCHEMA = {"type": "string", "minLength": 1}
NUMBER_SCHEMA = {"type": "number"}
POSITIVE_NUMBER_SCHEMA = {"type": "number", "exclusiveMinimum": 0}
BOOLEAN_SCHEMA = {"type": "boolean"}
HANDLE_SCHEMA = {"type": "string", "enum": list(HANDLE_VALUES)}
ID_LIST_SCHEMA = {
    "type": "array",
    "minItems": 1,
    "items": NON_EMPTY_STRING_SCHEMA,
    "uniqueItems": True,
}
GEOMETRY_SCHEMA = {
    "type": "object",
    "properties": {
        "x": NUMBER_SCHEMA,
        "y": NUMBER_SCHEMA,
        "w": POSITIVE_NUMBER_SCHEMA,
        "h": POSITIVE_NUMBER_SCHEMA,
    },
    "required": ["x", "y", "w", "h"],
    "additionalProperties": False,
}
DELTA_SCHEMA = {
    "type": "object",
    "properties": {
        "dx": NUMBER_SCHEMA,
        "dy": NUMBER_SCHEMA,
    },
    "required": ["dx", "dy"],
    "additionalProperties": False,
}

ACTIONS_REQUEST_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "minItems": 1,
            "items": {"type": "object"},
        },
        "dry_run": BOOLEAN_SCHEMA,
        "canvasState": {"type": "object"},
    },
    "required": ["actions"],
    "additionalProperties": False,
}

ACTION_SCHEMAS = {
    "Create": {
        "type": "object",
        "properties": {
            "op": {"const": "Create"},
            "id": NON_EMPTY_STRING_SCHEMA,
            "object_type": {
                "type": "string",
                "enum": ["sticky-note", "text-label"],
            },
            "geometry": GEOMETRY_SCHEMA,
            "text": {"type": "string"},
            "selected": BOOLEAN_SCHEMA,
        },
        "required": ["op", "id", "object_type", "geometry"],
        "additionalProperties": False,
    },
    "Select": {
        "type": "object",
        "properties": {
            "op": {"const": "Select"},
            "targets": ID_LIST_SCHEMA,
            "mode": {
                "type": "string",
                "enum": ["replace", "add", "remove", "toggle"],
            },
        },
        "required": ["op", "targets"],
        "additionalProperties": False,
    },
    "Move": {
        "type": "object",
        "properties": {
            "op": {"const": "Move"},
            "targets": ID_LIST_SCHEMA,
            "delta": DELTA_SCHEMA,
        },
        "required": ["op", "targets", "delta"],
        "additionalProperties": False,
    },
    "Resize": {
        "type": "object",
        "properties": {
            "op": {"const": "Resize"},
            "target": NON_EMPTY_STRING_SCHEMA,
            "geometry": GEOMETRY_SCHEMA,
        },
        "required": ["op", "target", "geometry"],
        "additionalProperties": False,
    },
    "Connect": {
        "type": "object",
        "properties": {
            "op": {"const": "Connect"},
            "id": NON_EMPTY_STRING_SCHEMA,
            "source": NON_EMPTY_STRING_SCHEMA,
            "target": NON_EMPTY_STRING_SCHEMA,
            "source_handle": HANDLE_SCHEMA,
            "target_handle": HANDLE_SCHEMA,
            "label": {"type": "string"},
            "selected": BOOLEAN_SCHEMA,
        },
        "required": ["op", "id", "source", "target"],
        "additionalProperties": False,
    },
    "Annotate": {
        "type": "object",
        "properties": {
            "op": {"const": "Annotate"},
            "target": NON_EMPTY_STRING_SCHEMA,
            "text": {"type": "string"},
            "field": {"type": "string", "enum": ["text", "label"]},
        },
        "required": ["op", "target", "text"],
        "additionalProperties": False,
    },
    "Delete": {
        "type": "object",
        "properties": {
            "op": {"const": "Delete"},
            "targets": ID_LIST_SCHEMA,
        },
        "required": ["op", "targets"],
        "additionalProperties": False,
    },
}


class CanvasActionError(Exception):
    pass


class CanvasActionSchemaError(CanvasActionError):
    pass


class CanvasActionPreconditionError(CanvasActionError):
    pass


class CanvasActionPostconditionError(CanvasActionError):
    pass


@dataclass
class ActionHandler:
    schema: Dict[str, Any]
    required_fields: List[str]
    optional_fields: List[str]
    preconditions: List[str]
    deterministic_executor: str
    postcondition_checker: str
    undo_handler: str
    execute: Callable[[dict, dict], dict]
    check_postcondition: Callable[[dict, dict, dict], None]
    undo: Callable[[dict, dict, dict], None]


def _json_signature(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _schema_type_matches(expected_type: Any, value: Any) -> bool:
    if isinstance(expected_type, (list, tuple)):
        return any(_schema_type_matches(item, value) for item in expected_type)
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "number":
        return _is_number(value)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "null":
        return value is None
    return False


def validate_against_schema(schema: dict, value: Any, path: str = "$") -> None:
    if "const" in schema and value != schema["const"]:
        raise CanvasActionSchemaError(f"{path} must equal {schema['const']!r}.")

    expected_type = schema.get("type")
    resolved_type = expected_type
    if isinstance(expected_type, (list, tuple)):
        resolved_type = next(
            (
                candidate
                for candidate in expected_type
                if _schema_type_matches(candidate, value)
            ),
            None,
        )

    if expected_type and not _schema_type_matches(expected_type, value):
        raise CanvasActionSchemaError(f"{path} must be of type '{expected_type}'.")

    enum_values = schema.get("enum")
    if enum_values is not None and value not in enum_values:
        raise CanvasActionSchemaError(f"{path} must be one of {enum_values}.")

    if resolved_type == "string":
        min_length = schema.get("minLength")
        if min_length is not None and len(value) < min_length:
            raise CanvasActionSchemaError(
                f"{path} must have at least {min_length} characters."
            )

    if resolved_type == "number":
        minimum = schema.get("minimum")
        if minimum is not None and value < minimum:
            raise CanvasActionSchemaError(
                f"{path} must be greater than or equal to {minimum}."
            )
        exclusive_minimum = schema.get("exclusiveMinimum")
        if exclusive_minimum is not None and value <= exclusive_minimum:
            raise CanvasActionSchemaError(
                f"{path} must be greater than {exclusive_minimum}."
            )

    if resolved_type == "array":
        min_items = schema.get("minItems")
        if min_items is not None and len(value) < min_items:
            raise CanvasActionSchemaError(
                f"{path} must contain at least {min_items} item(s)."
            )

        if schema.get("uniqueItems"):
            signatures = [_json_signature(item) for item in value]
            if len(signatures) != len(set(signatures)):
                raise CanvasActionSchemaError(
                    f"{path} must not contain duplicate items."
                )

        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(value):
                validate_against_schema(item_schema, item, f"{path}[{index}]")

    if resolved_type == "object":
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                raise CanvasActionSchemaError(f"{path}.{key} is required.")

        properties = schema.get("properties", {})
        additional_properties = schema.get("additionalProperties", True)
        if additional_properties is False:
            extra_keys = [key for key in value.keys() if key not in properties]
            if extra_keys:
                raise CanvasActionSchemaError(
                    f"{path} contains unsupported field(s): {', '.join(extra_keys)}."
                )

        for key, subschema in properties.items():
            if key in value:
                validate_against_schema(subschema, value[key], f"{path}.{key}")


def validate_action_request(payload: object) -> None:
    validate_against_schema(ACTIONS_REQUEST_SCHEMA, payload)


def validate_action_payload(action: object) -> dict:
    if not isinstance(action, dict):
        raise CanvasActionSchemaError("Each action must be a JSON object.")

    op = action.get("op")
    if not isinstance(op, str) or op not in ACTION_SCHEMAS:
        raise CanvasActionSchemaError(f"Unsupported action op {op!r}.")

    validate_against_schema(ACTION_SCHEMAS[op], action)
    return action


def _find_entity(state: dict, entity_id: str) -> Optional[Tuple[str, int, dict]]:
    for collection_name in ("objects", "connectors"):
        for index, entity in enumerate(state[collection_name]):
            if entity["id"] == entity_id:
                return collection_name, index, entity
    return None


def _require_entity(
    state: dict,
    entity_id: str,
    allowed_collections: Optional[Tuple[str, ...]] = None,
) -> Tuple[str, int, dict]:
    result = _find_entity(state, entity_id)
    if result is None:
        raise CanvasActionPreconditionError(f"Entity {entity_id!r} does not exist.")

    collection_name, index, entity = result
    if allowed_collections and collection_name not in allowed_collections:
        raise CanvasActionPreconditionError(
            f"Entity {entity_id!r} is not valid for this action."
        )

    return collection_name, index, entity


def _entity_ids(state: dict) -> set:
    ids = set()
    for collection_name in ("objects", "connectors"):
        ids.update(entity["id"] for entity in state[collection_name])
    return ids


def _node_ids(state: dict) -> set:
    return {entity["id"] for entity in state["objects"]}


def _canonical_selection(state: dict) -> List[str]:
    existing_ids = _entity_ids(state)
    selection = []
    seen = set()
    for entity_id in state["selection"]:
        if entity_id in existing_ids and entity_id not in seen:
            selection.append(entity_id)
            seen.add(entity_id)
    return selection


def _geometry_fits_canvas(geometry: dict) -> bool:
    return (
        geometry["x"] >= CANVAS_BOUNDS["left"]
        and geometry["y"] >= CANVAS_BOUNDS["top"]
        and geometry["x"] + geometry["w"] <= CANVAS_BOUNDS["right"]
        and geometry["y"] + geometry["h"] <= CANVAS_BOUNDS["bottom"]
    )


def _require_geometry_within_canvas(geometry: dict, message: str) -> None:
    if not _geometry_fits_canvas(geometry):
        raise CanvasActionPreconditionError(message)


def _fit_text_label_geometry(geometry: dict, text: Optional[str]) -> dict:
    text_value = text if isinstance(text, str) else ""
    paragraphs = text_value.split("\n") if text_value else [""]
    longest_line_chars = max(max(len(paragraph), 1) for paragraph in paragraphs)

    min_content_width = (
        TEXT_LABEL_AUTO_SIZE["min_width"] - TEXT_LABEL_AUTO_SIZE["padding_x"]
    )
    max_content_width = (
        TEXT_LABEL_AUTO_SIZE["max_width"] - TEXT_LABEL_AUTO_SIZE["padding_x"]
    )
    natural_content_width = math.ceil(
        longest_line_chars * TEXT_LABEL_AUTO_SIZE["char_width"]
    )
    content_width = max(
        min_content_width,
        min(max_content_width, natural_content_width),
    )
    line_count = sum(
        max(
            1,
            math.ceil(
                max(len(paragraph), 1)
                * TEXT_LABEL_AUTO_SIZE["char_width"]
                / content_width
            ),
        )
        for paragraph in paragraphs
    )

    return {
        **deepcopy(geometry),
        "w": content_width + TEXT_LABEL_AUTO_SIZE["padding_x"],
        "h": max(
            TEXT_LABEL_AUTO_SIZE["min_height"],
            math.ceil(
                line_count * TEXT_LABEL_AUTO_SIZE["line_height"]
                + TEXT_LABEL_AUTO_SIZE["padding_y"]
            ),
        ),
    }


def _resolved_create_geometry(action: dict) -> dict:
    geometry = deepcopy(action["geometry"])
    if action["object_type"] == "text-label":
        return _fit_text_label_geometry(geometry, action.get("text"))
    return geometry


def _handle_point(geometry: dict, handle: str) -> dict:
    if handle == "left":
        return {"x": geometry["x"], "y": geometry["y"] + geometry["h"] / 2}
    if handle == "top":
        return {"x": geometry["x"] + geometry["w"] / 2, "y": geometry["y"]}
    if handle == "bottom":
        return {"x": geometry["x"] + geometry["w"] / 2, "y": geometry["y"] + geometry["h"]}
    return {"x": geometry["x"] + geometry["w"], "y": geometry["y"] + geometry["h"] / 2}


def _compute_connector_geometry(state: dict, connector: dict) -> Optional[dict]:
    source_result = _find_entity(state, connector["source"])
    target_result = _find_entity(state, connector["target"])
    if source_result is None or target_result is None:
        return None

    source_geometry = source_result[2]["geometry"]
    target_geometry = target_result[2]["geometry"]
    return {
        "sourcePoint": _handle_point(
            source_geometry,
            connector.get("sourceHandle", "right"),
        ),
        "targetPoint": _handle_point(
            target_geometry,
            connector.get("targetHandle", "left"),
        ),
    }


def normalize_canvas_state(state: dict) -> dict:
    valid_node_ids = _node_ids(state)
    normalized_connectors = []
    for connector in state["connectors"]:
        if connector["source"] not in valid_node_ids:
            continue
        if connector["target"] not in valid_node_ids:
            continue
        connector["geometry"] = _compute_connector_geometry(state, connector)
        normalized_connectors.append(connector)

    state["connectors"] = normalized_connectors
    state["selection"] = _canonical_selection(state)
    return state


def _check_state_valid(state: dict) -> None:
    validation_error = validate_canvas_state(state)
    if validation_error:
        raise CanvasActionPreconditionError(
            f"Canvas state is invalid: {validation_error}"
        )


def _check_create_preconditions(state: dict, action: dict) -> None:
    if action["id"] in _entity_ids(state):
        raise CanvasActionPreconditionError(
            f"Entity {action['id']!r} already exists."
        )
    _require_geometry_within_canvas(
        _resolved_create_geometry(action),
        f"Create would place entity {action['id']!r} outside canvas bounds.",
    )


def _check_select_preconditions(state: dict, action: dict) -> None:
    for entity_id in action["targets"]:
        _require_entity(state, entity_id)


def _check_move_preconditions(state: dict, action: dict) -> None:
    for entity_id in action["targets"]:
        _collection_name, _index, entity = _require_entity(
            state,
            entity_id,
            ("objects",),
        )
        next_geometry = deepcopy(entity["geometry"])
        next_geometry["x"] += action["delta"]["dx"]
        next_geometry["y"] += action["delta"]["dy"]
        _require_geometry_within_canvas(
            next_geometry,
            f"Move would place object {entity_id!r} outside canvas bounds.",
        )


def _check_resize_preconditions(state: dict, action: dict) -> None:
    _require_entity(state, action["target"], ("objects",))
    _require_geometry_within_canvas(
        action["geometry"],
        f"Resize would place object {action['target']!r} outside canvas bounds.",
    )


def _check_connect_preconditions(state: dict, action: dict) -> None:
    if action["id"] in _entity_ids(state):
        raise CanvasActionPreconditionError(
            f"Entity {action['id']!r} already exists."
        )
    _require_entity(state, action["source"], ("objects",))
    _require_entity(state, action["target"], ("objects",))
    if action["source"] == action["target"]:
        raise CanvasActionPreconditionError(
            "Connect source and target must be different."
        )


def _resolve_annotation_target(state: dict, action: dict) -> Tuple[str, dict, str]:
    collection_name, _index, entity = _require_entity(state, action["target"])
    expected_field = "text" if collection_name == "objects" else "label"
    requested_field = action.get("field")
    if requested_field is not None and requested_field != expected_field:
        raise CanvasActionPreconditionError(
            f"Field {requested_field!r} is not valid for target {action['target']!r}."
        )
    return collection_name, entity, expected_field


def _check_annotate_preconditions(state: dict, action: dict) -> None:
    collection_name, entity, field = _resolve_annotation_target(state, action)
    if collection_name != "objects" or field != "text" or entity["type"] != "text-label":
        return

    next_geometry = _fit_text_label_geometry(entity["geometry"], action["text"])
    _require_geometry_within_canvas(
        next_geometry,
        (
            f"Annotate would resize text label {action['target']!r} "
            "outside canvas bounds."
        ),
    )


def _check_delete_preconditions(state: dict, action: dict) -> None:
    for entity_id in action["targets"]:
        _require_entity(state, entity_id)


def _execute_create(state: dict, action: dict) -> dict:
    entity = {
        "id": action["id"],
        "type": action["object_type"],
        "content": {"text": action.get("text", "")},
        "geometry": _resolved_create_geometry(action),
    }
    state["objects"].append(entity)
    previous_selection = deepcopy(state["selection"])
    if action.get("selected"):
        state["selection"] = [action["id"]]
    return {
        "created_entity": deepcopy(entity),
        "previous_selection": previous_selection,
    }


def _execute_select(state: dict, action: dict) -> dict:
    previous_selection = deepcopy(state["selection"])
    targets = list(action["targets"])
    mode = action.get("mode", "replace")

    if mode == "replace":
        state["selection"] = targets
    elif mode == "add":
        state["selection"] = previous_selection + [
            entity_id
            for entity_id in targets
            if entity_id not in previous_selection
        ]
    elif mode == "remove":
        target_set = set(targets)
        state["selection"] = [
            entity_id
            for entity_id in previous_selection
            if entity_id not in target_set
        ]
    elif mode == "toggle":
        next_selection = []
        target_set = set(targets)
        for entity_id in previous_selection:
            if entity_id not in target_set:
                next_selection.append(entity_id)
        for entity_id in targets:
            if entity_id not in previous_selection:
                next_selection.append(entity_id)
        state["selection"] = next_selection

    return {"previous_selection": previous_selection}


def _execute_move(state: dict, action: dict) -> dict:
    previous_geometries = {}
    for entity_id in action["targets"]:
        entity = _require_entity(state, entity_id, ("objects",))[2]
        previous_geometries[entity_id] = deepcopy(entity["geometry"])
        entity["geometry"]["x"] += action["delta"]["dx"]
        entity["geometry"]["y"] += action["delta"]["dy"]
    return {"previous_geometries": previous_geometries}


def _execute_resize(state: dict, action: dict) -> dict:
    entity = _require_entity(state, action["target"], ("objects",))[2]
    previous_geometry = deepcopy(entity["geometry"])
    entity["geometry"] = deepcopy(action["geometry"])
    return {"previous_geometry": previous_geometry}


def _execute_connect(state: dict, action: dict) -> dict:
    connector = {
        "id": action["id"],
        "type": "connector",
        "content": {"label": action.get("label", "")},
        "source": action["source"],
        "target": action["target"],
        "sourceHandle": action.get("source_handle", "right"),
        "targetHandle": action.get("target_handle", "left"),
        "geometry": None,
    }
    state["connectors"].append(connector)
    previous_selection = deepcopy(state["selection"])
    if action.get("selected"):
        state["selection"] = [action["id"]]
    return {
        "created_connector": deepcopy(connector),
        "previous_selection": previous_selection,
    }


def _execute_annotate(state: dict, action: dict) -> dict:
    collection_name, entity, field = _resolve_annotation_target(state, action)
    previous_value = entity["content"].get(field, "")
    previous_geometry = deepcopy(entity["geometry"]) if collection_name == "objects" else None
    entity["content"][field] = action["text"]
    if collection_name == "objects" and entity["type"] == "text-label" and field == "text":
        entity["geometry"] = _fit_text_label_geometry(entity["geometry"], action["text"])
    return {
        "collection_name": collection_name,
        "field": field,
        "previous_value": previous_value,
        "previous_geometry": previous_geometry,
    }


def _execute_delete(state: dict, action: dict) -> dict:
    target_ids = set(action["targets"])
    object_ids = {
        entity_id
        for entity_id in target_ids
        if _require_entity(state, entity_id)[0] == "objects"
    }
    connector_ids = {
        entity_id
        for entity_id in target_ids
        if _require_entity(state, entity_id)[0] == "connectors"
    }
    connector_ids.update(
        connector["id"]
        for connector in state["connectors"]
        if connector["source"] in object_ids or connector["target"] in object_ids
    )

    removed_objects = [
        (index, deepcopy(entity))
        for index, entity in enumerate(state["objects"])
        if entity["id"] in object_ids
    ]
    removed_connectors = [
        (index, deepcopy(entity))
        for index, entity in enumerate(state["connectors"])
        if entity["id"] in connector_ids
    ]
    previous_selection = deepcopy(state["selection"])

    state["objects"] = [
        entity for entity in state["objects"] if entity["id"] not in object_ids
    ]
    state["connectors"] = [
        entity
        for entity in state["connectors"]
        if entity["id"] not in connector_ids
    ]
    state["selection"] = [
        entity_id
        for entity_id in state["selection"]
        if entity_id not in object_ids and entity_id not in connector_ids
    ]

    return {
        "removed_ids": sorted(object_ids | connector_ids),
        "removed_objects": removed_objects,
        "removed_connectors": removed_connectors,
        "previous_selection": previous_selection,
    }


def _check_create_postcondition(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(state, action["id"], ("objects",))[2]
    if entity["type"] != action["object_type"]:
        raise CanvasActionPostconditionError(
            f"Created object {action['id']!r} has the wrong type."
        )
    if entity["type"] == "text-label":
        expected_geometry = _fit_text_label_geometry(
            context["created_entity"]["geometry"],
            entity["content"].get("text", ""),
        )
        if entity["geometry"] != expected_geometry:
            raise CanvasActionPostconditionError(
                f"Created text label {action['id']!r} was not auto-sized."
            )


def _check_select_postcondition(state: dict, action: dict, context: dict) -> None:
    expected_selection = _canonical_selection({"selection": state["selection"], **state})
    if state["selection"] != expected_selection:
        raise CanvasActionPostconditionError("Selection contains invalid ids.")


def _check_move_postcondition(state: dict, action: dict, context: dict) -> None:
    for entity_id in action["targets"]:
        entity = _require_entity(state, entity_id, ("objects",))[2]
        previous_geometry = context["previous_geometries"][entity_id]
        if entity["geometry"]["x"] != previous_geometry["x"] + action["delta"]["dx"]:
            raise CanvasActionPostconditionError(
                f"Move did not update x for object {entity_id!r}."
            )
        if entity["geometry"]["y"] != previous_geometry["y"] + action["delta"]["dy"]:
            raise CanvasActionPostconditionError(
                f"Move did not update y for object {entity_id!r}."
            )


def _check_resize_postcondition(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(state, action["target"], ("objects",))[2]
    if entity["geometry"] != action["geometry"]:
        raise CanvasActionPostconditionError(
            f"Resize did not apply geometry for {action['target']!r}."
        )


def _check_connect_postcondition(state: dict, action: dict, context: dict) -> None:
    connector = _require_entity(state, action["id"], ("connectors",))[2]
    if connector["source"] != action["source"] or connector["target"] != action["target"]:
        raise CanvasActionPostconditionError(
            f"Connector {action['id']!r} endpoints do not match the action."
        )
    if connector.get("geometry") is None:
        raise CanvasActionPostconditionError(
            f"Connector {action['id']!r} is missing computed geometry."
        )


def _check_annotate_postcondition(state: dict, action: dict, context: dict) -> None:
    _collection_name, entity, field = _resolve_annotation_target(state, action)
    if entity["content"].get(field, "") != action["text"]:
        raise CanvasActionPostconditionError(
            f"Annotation did not update {field} for {action['target']!r}."
        )
    if (
        _collection_name == "objects"
        and entity["type"] == "text-label"
        and field == "text"
    ):
        expected_geometry = _fit_text_label_geometry(
            context["previous_geometry"],
            action["text"],
        )
        if entity["geometry"] != expected_geometry:
            raise CanvasActionPostconditionError(
                f"Text label {action['target']!r} was not auto-sized after annotation."
            )


def _check_delete_postcondition(state: dict, action: dict, context: dict) -> None:
    for removed_id in context["removed_ids"]:
        if _find_entity(state, removed_id) is not None:
            raise CanvasActionPostconditionError(
                f"Deleted entity {removed_id!r} still exists."
            )


def _restore_entities(collection: List[dict], removed_entities: List[Tuple[int, dict]]) -> None:
    for index, entity in sorted(removed_entities, key=lambda item: item[0]):
        collection.insert(min(index, len(collection)), deepcopy(entity))


def _undo_create(state: dict, action: dict, context: dict) -> None:
    state["objects"] = [
        entity for entity in state["objects"] if entity["id"] != action["id"]
    ]
    state["selection"] = deepcopy(context["previous_selection"])


def _undo_select(state: dict, action: dict, context: dict) -> None:
    state["selection"] = deepcopy(context["previous_selection"])


def _undo_move(state: dict, action: dict, context: dict) -> None:
    for entity in state["objects"]:
        previous_geometry = context["previous_geometries"].get(entity["id"])
        if previous_geometry is not None:
            entity["geometry"] = deepcopy(previous_geometry)


def _undo_resize(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(state, action["target"], ("objects",))[2]
    entity["geometry"] = deepcopy(context["previous_geometry"])


def _undo_connect(state: dict, action: dict, context: dict) -> None:
    state["connectors"] = [
        entity for entity in state["connectors"] if entity["id"] != action["id"]
    ]
    state["selection"] = deepcopy(context["previous_selection"])


def _undo_annotate(state: dict, action: dict, context: dict) -> None:
    collection_name, entity, field = _resolve_annotation_target(state, action)
    if collection_name not in ("objects", "connectors"):
        raise CanvasActionPreconditionError("Unsupported annotation target during undo.")
    entity["content"][field] = context["previous_value"]
    if collection_name == "objects" and context["previous_geometry"] is not None:
        entity["geometry"] = deepcopy(context["previous_geometry"])


def _undo_delete(state: dict, action: dict, context: dict) -> None:
    _restore_entities(state["objects"], context["removed_objects"])
    _restore_entities(state["connectors"], context["removed_connectors"])
    state["selection"] = deepcopy(context["previous_selection"])


ACTION_HANDLERS: Dict[str, ActionHandler] = {
    "Create": ActionHandler(
        schema=ACTION_SCHEMAS["Create"],
        required_fields=["op", "id", "object_type", "geometry"],
        optional_fields=["text", "selected"],
        preconditions=[
            "id must be unused",
            "geometry must remain inside canvas bounds",
        ],
        deterministic_executor="_execute_create",
        postcondition_checker="_check_create_postcondition",
        undo_handler="_undo_create",
        execute=_execute_create,
        check_postcondition=_check_create_postcondition,
        undo=_undo_create,
    ),
    "Select": ActionHandler(
        schema=ACTION_SCHEMAS["Select"],
        required_fields=["op", "targets"],
        optional_fields=["mode"],
        preconditions=[
            "targets must be existing objects or connectors",
        ],
        deterministic_executor="_execute_select",
        postcondition_checker="_check_select_postcondition",
        undo_handler="_undo_select",
        execute=_execute_select,
        check_postcondition=_check_select_postcondition,
        undo=_undo_select,
    ),
    "Move": ActionHandler(
        schema=ACTION_SCHEMAS["Move"],
        required_fields=["op", "targets", "delta"],
        optional_fields=[],
        preconditions=[
            "all targets must be existing objects",
            "moving must keep every object inside canvas bounds",
        ],
        deterministic_executor="_execute_move",
        postcondition_checker="_check_move_postcondition",
        undo_handler="_undo_move",
        execute=_execute_move,
        check_postcondition=_check_move_postcondition,
        undo=_undo_move,
    ),
    "Resize": ActionHandler(
        schema=ACTION_SCHEMAS["Resize"],
        required_fields=["op", "target", "geometry"],
        optional_fields=[],
        preconditions=[
            "target must be an existing object",
            "resized geometry must remain inside canvas bounds",
        ],
        deterministic_executor="_execute_resize",
        postcondition_checker="_check_resize_postcondition",
        undo_handler="_undo_resize",
        execute=_execute_resize,
        check_postcondition=_check_resize_postcondition,
        undo=_undo_resize,
    ),
    "Connect": ActionHandler(
        schema=ACTION_SCHEMAS["Connect"],
        required_fields=["op", "id", "source", "target"],
        optional_fields=["source_handle", "target_handle", "label", "selected"],
        preconditions=[
            "id must be unused",
            "source and target must be existing objects",
            "source and target must be different",
        ],
        deterministic_executor="_execute_connect",
        postcondition_checker="_check_connect_postcondition",
        undo_handler="_undo_connect",
        execute=_execute_connect,
        check_postcondition=_check_connect_postcondition,
        undo=_undo_connect,
    ),
    "Annotate": ActionHandler(
        schema=ACTION_SCHEMAS["Annotate"],
        required_fields=["op", "target", "text"],
        optional_fields=["field"],
        preconditions=[
            "target must be an existing object or connector",
            "field must match target kind: text for objects, label for connectors",
            "annotating a text label auto-resizes it to fit the updated text",
        ],
        deterministic_executor="_execute_annotate",
        postcondition_checker="_check_annotate_postcondition",
        undo_handler="_undo_annotate",
        execute=_execute_annotate,
        check_postcondition=_check_annotate_postcondition,
        undo=_undo_annotate,
    ),
    "Delete": ActionHandler(
        schema=ACTION_SCHEMAS["Delete"],
        required_fields=["op", "targets"],
        optional_fields=[],
        preconditions=[
            "targets must be existing objects or connectors",
            "deleting objects also deletes any attached connectors",
        ],
        deterministic_executor="_execute_delete",
        postcondition_checker="_check_delete_postcondition",
        undo_handler="_undo_delete",
        execute=_execute_delete,
        check_postcondition=_check_delete_postcondition,
        undo=_undo_delete,
    ),
}


def get_action_catalog() -> List[dict]:
    catalog = []
    for op in ACTION_ORDER:
        handler = ACTION_HANDLERS[op]
        catalog.append(
            {
                "op": op,
                "schema": deepcopy(handler.schema),
                "requiredFields": list(handler.required_fields),
                "optionalFields": list(handler.optional_fields),
                "preconditions": list(handler.preconditions),
                "deterministicExecutor": handler.deterministic_executor,
                "postconditionChecker": handler.postcondition_checker,
                "undoHandler": handler.undo_handler,
            }
        )
    return catalog


def _check_preconditions(state: dict, action: dict) -> None:
    op = action["op"]
    if op == "Create":
        _check_create_preconditions(state, action)
    elif op == "Select":
        _check_select_preconditions(state, action)
    elif op == "Move":
        _check_move_preconditions(state, action)
    elif op == "Resize":
        _check_resize_preconditions(state, action)
    elif op == "Connect":
        _check_connect_preconditions(state, action)
    elif op == "Annotate":
        _check_annotate_preconditions(state, action)
    elif op == "Delete":
        _check_delete_preconditions(state, action)
    else:
        raise CanvasActionSchemaError(f"Unsupported action op {op!r}.")


def execute_action_batch(initial_state: dict, actions: List[dict]) -> dict:
    working_state = normalize_canvas_state(deepcopy(initial_state))
    _check_state_valid(working_state)

    execution_log = []
    executed_actions = []

    for index, raw_action in enumerate(actions):
        try:
            action = validate_action_payload(raw_action)
            handler = ACTION_HANDLERS[action["op"]]
            _check_preconditions(working_state, action)
            context = handler.execute(working_state, action)
            normalize_canvas_state(working_state)
            handler.check_postcondition(working_state, action, context)
            _check_state_valid(working_state)
        except CanvasActionError as exc:
            raise CanvasActionPreconditionError(
                f"Action {index} ({raw_action.get('op', 'unknown')}) failed: {exc}"
            ) from exc

        execution_log.append(
            {
                "index": index,
                "op": action["op"],
                "action": deepcopy(action),
                "undo_handler": handler.undo_handler,
            }
        )
        executed_actions.append(
            {
                "index": index,
                "action": deepcopy(action),
                "context": deepcopy(context),
                "undo_handler": handler.undo_handler,
            }
        )

    return {
        "canvas_state": working_state,
        "execution_log": execution_log,
        "executed_actions": executed_actions,
    }


def undo_executed_actions(state: dict, executed_actions: List[dict]) -> dict:
    working_state = deepcopy(state)
    for entry in reversed(executed_actions):
        action = entry["action"]
        handler = ACTION_HANDLERS[action["op"]]
        handler.undo(working_state, action, deepcopy(entry["context"]))
        normalize_canvas_state(working_state)
        _check_state_valid(working_state)
    return working_state
