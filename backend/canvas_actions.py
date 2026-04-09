import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from canvas_state import _is_number, validate_canvas_state

FRAME_PADDING = {
    "left": 16,
    "top": 44,
    "right": 16,
    "bottom": 16,
}

HANDLE_VALUES = ("left", "top", "right", "bottom")
ACTION_ORDER = (
    "Create",
    "Select",
    "Move",
    "Resize",
    "GroupIntoFrame",
    "Connect",
    "Annotate",
    "Delete",
)

NON_EMPTY_STRING_SCHEMA = {"type": "string", "minLength": 1}
NUMBER_SCHEMA = {"type": "number"}
POSITIVE_NUMBER_SCHEMA = {"type": "number", "exclusiveMinimum": 0}
HANDLE_SCHEMA = {"type": "string", "enum": list(HANDLE_VALUES)}
ID_LIST_SCHEMA = {
    "type": "array",
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
        "dry_run": {"type": "boolean"},
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
                "enum": ["sticky-note", "text-label", "frame"],
            },
            "geometry": GEOMETRY_SCHEMA,
            "text": {"type": "string"},
            "title": {"type": "string"},
            "parent_frame_id": NON_EMPTY_STRING_SCHEMA,
            "selected": {"type": "boolean"},
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
            "targets": {
                "type": "array",
                "minItems": 1,
                "items": NON_EMPTY_STRING_SCHEMA,
                "uniqueItems": True,
            },
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
    "GroupIntoFrame": {
        "type": "object",
        "properties": {
            "op": {"const": "GroupIntoFrame"},
            "targets": {
                "type": "array",
                "minItems": 1,
                "items": NON_EMPTY_STRING_SCHEMA,
                "uniqueItems": True,
            },
            "frame_id": NON_EMPTY_STRING_SCHEMA,
            "title": {"type": "string"},
            "geometry": GEOMETRY_SCHEMA,
        },
        "required": ["op", "targets", "frame_id"],
        "additionalProperties": False,
    },
    "Connect": {
        "type": "object",
        "properties": {
            "op": {"const": "Connect"},
            "id": NON_EMPTY_STRING_SCHEMA,
            "source": NON_EMPTY_STRING_SCHEMA,
            "target": NON_EMPTY_STRING_SCHEMA,
            "label": {"type": "string"},
            "source_handle": HANDLE_SCHEMA,
            "target_handle": HANDLE_SCHEMA,
            "selected": {"type": "boolean"},
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
            "field": {"type": "string", "enum": ["text", "title", "label"]},
        },
        "required": ["op", "target", "text"],
        "additionalProperties": False,
    },
    "Delete": {
        "type": "object",
        "properties": {
            "op": {"const": "Delete"},
            "targets": {
                "type": "array",
                "minItems": 1,
                "items": NON_EMPTY_STRING_SCHEMA,
                "uniqueItems": True,
            },
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


def _schema_type_matches(expected_type: str, value: Any) -> bool:
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
    return False


def validate_against_schema(schema: dict, value: Any, path: str = "$") -> None:
    if "const" in schema and value != schema["const"]:
        raise CanvasActionSchemaError(
            f"{path} must equal {schema['const']!r}."
        )

    expected_type = schema.get("type")
    if expected_type and not _schema_type_matches(expected_type, value):
        raise CanvasActionSchemaError(
            f"{path} must be of type '{expected_type}'."
        )

    enum_values = schema.get("enum")
    if enum_values is not None and value not in enum_values:
        raise CanvasActionSchemaError(
            f"{path} must be one of {enum_values}."
        )

    if expected_type == "string":
        min_length = schema.get("minLength")
        if min_length is not None and len(value) < min_length:
            raise CanvasActionSchemaError(
                f"{path} must have at least {min_length} characters."
            )

    if expected_type == "number":
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

    if expected_type == "array":
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

    if expected_type == "object":
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
        raise CanvasActionSchemaError(
            f"Unsupported action op {op!r}."
        )

    validate_against_schema(ACTION_SCHEMAS[op], action)
    return action


def _find_entity(
    state: dict,
    entity_id: str,
) -> Optional[Tuple[str, int, dict]]:
    for collection_name in ("objects", "frames", "connectors"):
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
        raise CanvasActionPreconditionError(
            f"Entity {entity_id!r} does not exist."
        )

    collection_name, index, entity = result
    if allowed_collections and collection_name not in allowed_collections:
        raise CanvasActionPreconditionError(
            f"Entity {entity_id!r} is not valid for this action."
        )

    return collection_name, index, entity


def _entity_ids(state: dict) -> set:
    ids = set()
    for collection_name in ("objects", "frames", "connectors"):
        ids.update(entity["id"] for entity in state[collection_name])
    return ids


def _node_ids(state: dict) -> set:
    ids = set()
    ids.update(entity["id"] for entity in state["objects"])
    ids.update(entity["id"] for entity in state["frames"])
    return ids


def _canonical_selection(state: dict) -> List[str]:
    existing_ids = _entity_ids(state)
    selection = []
    seen = set()
    for entity_id in state["selection"]:
        if entity_id in existing_ids and entity_id not in seen:
            seen.add(entity_id)
            selection.append(entity_id)
    return selection


def _frame_child_ids(state: dict, frame_id: str) -> List[str]:
    return [
        entity["id"]
        for entity in state["objects"]
        if entity.get("parentFrameId") == frame_id
    ]


def _rebuild_frame_children(state: dict) -> None:
    frame_ids = {frame["id"] for frame in state["frames"]}
    for entity in state["objects"]:
        parent_frame_id = entity.get("parentFrameId")
        if parent_frame_id not in frame_ids:
            entity["parentFrameId"] = None

    for frame in state["frames"]:
        frame["childIds"] = _frame_child_ids(state, frame["id"])


def _handle_point(geometry: dict, handle: str) -> dict:
    if handle == "left":
        return {"x": geometry["x"], "y": geometry["y"] + geometry["h"] / 2}
    if handle == "top":
        return {"x": geometry["x"] + geometry["w"] / 2, "y": geometry["y"]}
    if handle == "bottom":
        return {"x": geometry["x"] + geometry["w"] / 2, "y": geometry["y"] + geometry["h"]}

    return {"x": geometry["x"] + geometry["w"], "y": geometry["y"] + geometry["h"] / 2}


def _compute_connector_geometry(state: dict, connector: dict) -> Optional[dict]:
    source = _find_entity(state, connector["source"])
    target = _find_entity(state, connector["target"])
    if source is None or target is None:
        return None

    source_geometry = source[2]["geometry"]
    target_geometry = target[2]["geometry"]

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
    _rebuild_frame_children(state)
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


def _frame_inner_bounds(frame_geometry: dict) -> dict:
    return {
        "left": frame_geometry["x"] + FRAME_PADDING["left"],
        "top": frame_geometry["y"] + FRAME_PADDING["top"],
        "right": frame_geometry["x"] + frame_geometry["w"] - FRAME_PADDING["right"],
        "bottom": frame_geometry["y"] + frame_geometry["h"] - FRAME_PADDING["bottom"],
    }


def _object_fits_frame(frame_geometry: dict, object_geometry: dict) -> bool:
    bounds = _frame_inner_bounds(frame_geometry)
    return (
        object_geometry["x"] >= bounds["left"]
        and object_geometry["y"] >= bounds["top"]
        and object_geometry["x"] + object_geometry["w"] <= bounds["right"]
        and object_geometry["y"] + object_geometry["h"] <= bounds["bottom"]
    )


def _object_size_fits_frame(frame_geometry: dict, object_geometry: dict) -> bool:
    bounds = _frame_inner_bounds(frame_geometry)
    return (
        object_geometry["w"] <= bounds["right"] - bounds["left"]
        and object_geometry["h"] <= bounds["bottom"] - bounds["top"]
    )


def _clamp_object_geometry_to_frame(frame_geometry: dict, object_geometry: dict) -> dict:
    bounds = _frame_inner_bounds(frame_geometry)
    return {
        "x": min(
            max(object_geometry["x"], bounds["left"]),
            bounds["right"] - object_geometry["w"],
        ),
        "y": min(
            max(object_geometry["y"], bounds["top"]),
            bounds["bottom"] - object_geometry["h"],
        ),
        "w": object_geometry["w"],
        "h": object_geometry["h"],
    }


def _compute_group_frame_geometry(state: dict, target_ids: List[str]) -> dict:
    geometries = [
        deepcopy(_require_entity(state, entity_id, ("objects",))[2]["geometry"])
        for entity_id in target_ids
    ]
    left = min(geometry["x"] for geometry in geometries)
    top = min(geometry["y"] for geometry in geometries)
    right = max(geometry["x"] + geometry["w"] for geometry in geometries)
    bottom = max(geometry["y"] + geometry["h"] for geometry in geometries)

    return {
        "x": left - 28,
        "y": top - 56,
        "w": max(280, (right - left) + 56),
        "h": max(190, (bottom - top) + 84),
    }


def _frame_descendant_object_ids(state: dict, frame_ids: set) -> set:
    return {
        entity["id"]
        for entity in state["objects"]
        if entity.get("parentFrameId") in frame_ids
    }


def _effective_move_ids(state: dict, target_ids: List[str]) -> List[str]:
    targeted_frames = {
        entity_id
        for entity_id in target_ids
        if _require_entity(state, entity_id)[0] == "frames"
    }
    descendant_ids = _frame_descendant_object_ids(state, targeted_frames)
    move_ids = []

    for entity_id in target_ids:
        collection_name, _index, entity = _require_entity(state, entity_id)
        if collection_name == "connectors":
            raise CanvasActionPreconditionError(
                "Connectors cannot be moved directly."
            )
        if collection_name == "objects" and entity.get("parentFrameId") in targeted_frames:
            continue
        move_ids.append(entity_id)

    for entity_id in descendant_ids:
        if entity_id not in move_ids:
            move_ids.append(entity_id)

    return move_ids


def _restore_entities(collection: List[dict], removed_entities: List[Tuple[int, dict]]) -> None:
    for index, entity in sorted(removed_entities, key=lambda item: item[0]):
        collection.insert(min(index, len(collection)), deepcopy(entity))


def _resolve_annotation_target(state: dict, action: dict) -> Tuple[str, dict, str]:
    collection_name, _index, entity = _require_entity(state, action["target"])
    requested_field = action.get("field")

    expected_field = "label"
    if collection_name == "objects":
        expected_field = "text"
    elif collection_name == "frames":
        expected_field = "title"

    if requested_field is not None and requested_field != expected_field:
        raise CanvasActionPreconditionError(
            f"Field {requested_field!r} is not valid for target {action['target']!r}."
        )

    return collection_name, entity, expected_field


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

    if action["object_type"] == "frame":
        if "parent_frame_id" in action:
            raise CanvasActionPreconditionError(
                "Frames cannot be created inside another frame."
            )
        if "text" in action:
            raise CanvasActionPreconditionError(
                "Frame creation does not accept a 'text' field."
            )
    else:
        if "title" in action:
            raise CanvasActionPreconditionError(
                "Only frames accept a 'title' field."
            )
        parent_frame_id = action.get("parent_frame_id")
        if parent_frame_id is not None:
            frame = _require_entity(state, parent_frame_id, ("frames",))[2]
            if not _object_fits_frame(frame["geometry"], action["geometry"]):
                raise CanvasActionPreconditionError(
                    f"New object {action['id']!r} does not fit inside frame {parent_frame_id!r}."
                )


def _check_select_preconditions(state: dict, action: dict) -> None:
    for entity_id in action["targets"]:
        _require_entity(state, entity_id)


def _check_move_preconditions(state: dict, action: dict) -> None:
    move_ids = _effective_move_ids(state, action["targets"])
    target_frames = set(action["targets"]) & {
        frame["id"] for frame in state["frames"]
    }

    for entity_id in move_ids:
        collection_name, _index, entity = _require_entity(
            state,
            entity_id,
            ("objects", "frames"),
        )
        if collection_name != "objects":
            continue

        parent_frame_id = entity.get("parentFrameId")
        if not parent_frame_id or parent_frame_id in target_frames:
            continue

        parent_frame = _require_entity(state, parent_frame_id, ("frames",))[2]
        next_geometry = deepcopy(entity["geometry"])
        next_geometry["x"] += action["delta"]["dx"]
        next_geometry["y"] += action["delta"]["dy"]
        if not _object_fits_frame(parent_frame["geometry"], next_geometry):
            raise CanvasActionPreconditionError(
                f"Move would place object {entity_id!r} outside frame {parent_frame_id!r}."
            )


def _check_resize_preconditions(state: dict, action: dict) -> None:
    collection_name, _index, entity = _require_entity(
        state,
        action["target"],
        ("objects", "frames"),
    )
    next_geometry = action["geometry"]

    if collection_name == "objects":
        parent_frame_id = entity.get("parentFrameId")
        if parent_frame_id:
            parent_frame = _require_entity(state, parent_frame_id, ("frames",))[2]
            if not _object_fits_frame(parent_frame["geometry"], next_geometry):
                raise CanvasActionPreconditionError(
                    f"Resize would place object {action['target']!r} outside frame {parent_frame_id!r}."
                )
        return

    for child_id in entity.get("childIds", []):
        child = _require_entity(state, child_id, ("objects",))[2]
        if not _object_fits_frame(next_geometry, child["geometry"]):
            raise CanvasActionPreconditionError(
                f"Frame resize would exclude child object {child_id!r}."
            )


def _check_group_into_frame_preconditions(state: dict, action: dict) -> None:
    for entity_id in action["targets"]:
        _require_entity(state, entity_id, ("objects",))

    existing_entity = _find_entity(state, action["frame_id"])
    if existing_entity is not None and existing_entity[0] != "frames":
        raise CanvasActionPreconditionError(
            f"frame_id {action['frame_id']!r} is already used by a non-frame entity."
        )

    if existing_entity is not None and "geometry" in action:
        raise CanvasActionPreconditionError(
            "Grouping into an existing frame does not accept a geometry override."
        )

    frame_geometry = action.get("geometry")
    if existing_entity is None and frame_geometry is None:
        frame_geometry = _compute_group_frame_geometry(state, action["targets"])
    elif existing_entity is not None:
        frame_geometry = existing_entity[2]["geometry"]

    for entity_id in action["targets"]:
        entity = _require_entity(state, entity_id, ("objects",))[2]
        if not _object_size_fits_frame(frame_geometry, entity["geometry"]):
            raise CanvasActionPreconditionError(
                f"Object {entity_id!r} is too large for frame {action['frame_id']!r}."
            )


def _check_connect_preconditions(state: dict, action: dict) -> None:
    if action["id"] in _entity_ids(state):
        raise CanvasActionPreconditionError(
            f"Connector {action['id']!r} already exists."
        )

    _require_entity(state, action["source"], ("objects", "frames"))
    _require_entity(state, action["target"], ("objects", "frames"))

    if action["source"] == action["target"]:
        raise CanvasActionPreconditionError(
            "Connect requires different source and target ids."
        )


def _check_annotate_preconditions(state: dict, action: dict) -> None:
    _resolve_annotation_target(state, action)


def _check_delete_preconditions(state: dict, action: dict) -> None:
    for entity_id in action["targets"]:
        _require_entity(state, entity_id)


def _execute_create(state: dict, action: dict) -> dict:
    context = {
        "previous_selection": deepcopy(state["selection"]),
        "created_id": action["id"],
        "collection_name": "frames" if action["object_type"] == "frame" else "objects",
    }

    if action["object_type"] == "frame":
        state["frames"].append(
            {
                "id": action["id"],
                "type": "frame",
                "content": {"title": action.get("title", "New frame")},
                "geometry": deepcopy(action["geometry"]),
                "childIds": [],
            }
        )
    else:
        state["objects"].append(
            {
                "id": action["id"],
                "type": action["object_type"],
                "content": {"text": action.get("text", "")},
                "geometry": deepcopy(action["geometry"]),
                "parentFrameId": action.get("parent_frame_id"),
            }
        )

    if action.get("selected"):
        state["selection"] = [action["id"]]

    return context


def _execute_select(state: dict, action: dict) -> dict:
    previous_selection = deepcopy(state["selection"])
    mode = action.get("mode", "replace")

    if mode == "replace":
        selection = list(action["targets"])
    elif mode == "add":
        selection = previous_selection + [
            entity_id
            for entity_id in action["targets"]
            if entity_id not in previous_selection
        ]
    elif mode == "remove":
        selection = [
            entity_id
            for entity_id in previous_selection
            if entity_id not in set(action["targets"])
        ]
    else:
        toggle_ids = set(action["targets"])
        selection = [
            entity_id
            for entity_id in previous_selection
            if entity_id not in toggle_ids
        ]
        selection.extend(
            entity_id
            for entity_id in action["targets"]
            if entity_id not in previous_selection
        )

    state["selection"] = selection
    return {
        "previous_selection": previous_selection,
        "expected_selection": selection,
    }


def _execute_move(state: dict, action: dict) -> dict:
    move_ids = _effective_move_ids(state, action["targets"])
    previous_geometries = {}

    for collection_name in ("objects", "frames"):
        for entity in state[collection_name]:
            if entity["id"] not in move_ids:
                continue
            previous_geometries[entity["id"]] = deepcopy(entity["geometry"])
            entity["geometry"]["x"] += action["delta"]["dx"]
            entity["geometry"]["y"] += action["delta"]["dy"]

    return {
        "moved_ids": move_ids,
        "previous_geometries": previous_geometries,
    }


def _execute_resize(state: dict, action: dict) -> dict:
    collection_name, _index, entity = _require_entity(
        state,
        action["target"],
        ("objects", "frames"),
    )
    previous_geometry = deepcopy(entity["geometry"])
    entity["geometry"] = deepcopy(action["geometry"])

    return {
        "collection_name": collection_name,
        "target": action["target"],
        "previous_geometry": previous_geometry,
    }


def _execute_group_into_frame(state: dict, action: dict) -> dict:
    previous_selection = deepcopy(state["selection"])
    frame_lookup = _find_entity(state, action["frame_id"])
    previous_parent_frame_ids = {}
    previous_frame = None
    frame_created = False

    if frame_lookup is None:
        frame_created = True
        state["frames"].append(
            {
                "id": action["frame_id"],
                "type": "frame",
                "content": {
                    "title": action.get("title", "New frame"),
                },
                "geometry": deepcopy(
                    action.get("geometry")
                    or _compute_group_frame_geometry(state, action["targets"])
                ),
                "childIds": [],
            }
        )
        frame_entity = state["frames"][-1]
    else:
        frame_entity = frame_lookup[2]
        previous_frame = deepcopy(frame_entity)
        if "title" in action:
            frame_entity["content"]["title"] = action["title"]

    for entity_id in action["targets"]:
        entity = _require_entity(state, entity_id, ("objects",))[2]
        previous_parent_frame_ids[entity_id] = entity.get("parentFrameId")
        entity["parentFrameId"] = action["frame_id"]
        entity["geometry"] = _clamp_object_geometry_to_frame(
            frame_entity["geometry"],
            entity["geometry"],
        )

    state["selection"] = [action["frame_id"]]
    return {
        "frame_created": frame_created,
        "frame_id": action["frame_id"],
        "previous_frame": previous_frame,
        "previous_parent_frame_ids": previous_parent_frame_ids,
        "previous_selection": previous_selection,
    }


def _execute_connect(state: dict, action: dict) -> dict:
    previous_selection = deepcopy(state["selection"])
    state["connectors"].append(
        {
            "id": action["id"],
            "type": "connector",
            "content": {"label": action.get("label", "")},
            "source": action["source"],
            "target": action["target"],
            "sourceHandle": action.get("source_handle", "right"),
            "targetHandle": action.get("target_handle", "left"),
            "geometry": None,
        }
    )

    if action.get("selected"):
        state["selection"] = [action["id"]]

    return {
        "connector_id": action["id"],
        "previous_selection": previous_selection,
    }


def _execute_annotate(state: dict, action: dict) -> dict:
    collection_name, entity, field_name = _resolve_annotation_target(state, action)
    previous_content = deepcopy(entity["content"])
    entity["content"][field_name] = action["text"]

    return {
        "collection_name": collection_name,
        "target": action["target"],
        "field_name": field_name,
        "previous_content": previous_content,
    }


def _execute_delete(state: dict, action: dict) -> dict:
    previous_selection = deepcopy(state["selection"])
    target_ids = set(action["targets"])
    frame_ids = {
        entity_id
        for entity_id in target_ids
        if _require_entity(state, entity_id)[0] == "frames"
    }
    object_ids = {
        entity_id
        for entity_id in target_ids
        if _require_entity(state, entity_id)[0] == "objects"
    }
    object_ids.update(_frame_descendant_object_ids(state, frame_ids))

    connector_ids = {
        entity_id
        for entity_id in target_ids
        if _require_entity(state, entity_id)[0] == "connectors"
    }
    connector_ids.update(
        connector["id"]
        for connector in state["connectors"]
        if connector["source"] in frame_ids | object_ids
        or connector["target"] in frame_ids | object_ids
    )

    removed_objects = [
        (index, deepcopy(entity))
        for index, entity in enumerate(state["objects"])
        if entity["id"] in object_ids
    ]
    removed_frames = [
        (index, deepcopy(entity))
        for index, entity in enumerate(state["frames"])
        if entity["id"] in frame_ids
    ]
    removed_connectors = [
        (index, deepcopy(entity))
        for index, entity in enumerate(state["connectors"])
        if entity["id"] in connector_ids
    ]

    state["objects"] = [
        entity for entity in state["objects"] if entity["id"] not in object_ids
    ]
    state["frames"] = [
        entity for entity in state["frames"] if entity["id"] not in frame_ids
    ]
    state["connectors"] = [
        entity
        for entity in state["connectors"]
        if entity["id"] not in connector_ids
    ]

    return {
        "removed_ids": sorted(frame_ids | object_ids | connector_ids),
        "removed_objects": removed_objects,
        "removed_frames": removed_frames,
        "removed_connectors": removed_connectors,
        "previous_selection": previous_selection,
    }


def _check_create_postcondition(state: dict, action: dict, context: dict) -> None:
    collection_name = context["collection_name"]
    created = _require_entity(state, action["id"], (collection_name,))[2]
    if created["geometry"] != action["geometry"]:
        raise CanvasActionPostconditionError(
            f"Created entity {action['id']!r} geometry does not match the request."
        )


def _check_select_postcondition(state: dict, action: dict, context: dict) -> None:
    if state["selection"] != context["expected_selection"]:
        raise CanvasActionPostconditionError(
            "Selection state does not match the requested selection."
        )


def _check_move_postcondition(state: dict, action: dict, context: dict) -> None:
    for entity_id in context["moved_ids"]:
        entity = _require_entity(state, entity_id, ("objects", "frames"))[2]
        previous_geometry = context["previous_geometries"][entity_id]
        expected_geometry = {
            "x": previous_geometry["x"] + action["delta"]["dx"],
            "y": previous_geometry["y"] + action["delta"]["dy"],
            "w": previous_geometry["w"],
            "h": previous_geometry["h"],
        }
        if entity["geometry"] != expected_geometry:
            raise CanvasActionPostconditionError(
                f"Move postcondition failed for {entity_id!r}."
            )


def _check_resize_postcondition(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(
        state,
        action["target"],
        ("objects", "frames"),
    )[2]
    if entity["geometry"] != action["geometry"]:
        raise CanvasActionPostconditionError(
            f"Resize postcondition failed for {action['target']!r}."
        )


def _check_group_into_frame_postcondition(state: dict, action: dict, context: dict) -> None:
    frame = _require_entity(state, action["frame_id"], ("frames",))[2]
    if "title" in action and frame["content"].get("title") != action["title"]:
        raise CanvasActionPostconditionError(
            f"Frame title was not updated for {action['frame_id']!r}."
        )

    for entity_id in action["targets"]:
        entity = _require_entity(state, entity_id, ("objects",))[2]
        if entity.get("parentFrameId") != action["frame_id"]:
            raise CanvasActionPostconditionError(
                f"Object {entity_id!r} was not grouped into frame {action['frame_id']!r}."
            )


def _check_connect_postcondition(state: dict, action: dict, context: dict) -> None:
    connector = _require_entity(state, action["id"], ("connectors",))[2]
    if connector["source"] != action["source"] or connector["target"] != action["target"]:
        raise CanvasActionPostconditionError(
            f"Connector {action['id']!r} does not match the requested endpoints."
        )


def _check_annotate_postcondition(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(state, action["target"])[2]
    if entity["content"].get(context["field_name"]) != action["text"]:
        raise CanvasActionPostconditionError(
            f"Annotation postcondition failed for {action['target']!r}."
        )


def _check_delete_postcondition(state: dict, action: dict, context: dict) -> None:
    for entity_id in context["removed_ids"]:
        if _find_entity(state, entity_id) is not None:
            raise CanvasActionPostconditionError(
                f"Delete postcondition failed for {entity_id!r}."
            )


def _undo_create(state: dict, action: dict, context: dict) -> None:
    collection_name = context["collection_name"]
    state[collection_name] = [
        entity
        for entity in state[collection_name]
        if entity["id"] != context["created_id"]
    ]
    state["selection"] = deepcopy(context["previous_selection"])


def _undo_select(state: dict, action: dict, context: dict) -> None:
    state["selection"] = deepcopy(context["previous_selection"])


def _undo_move(state: dict, action: dict, context: dict) -> None:
    previous_geometries = context["previous_geometries"]
    for collection_name in ("objects", "frames"):
        for entity in state[collection_name]:
            if entity["id"] in previous_geometries:
                entity["geometry"] = deepcopy(previous_geometries[entity["id"]])


def _undo_resize(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(
        state,
        context["target"],
        ("objects", "frames"),
    )[2]
    entity["geometry"] = deepcopy(context["previous_geometry"])


def _undo_group_into_frame(state: dict, action: dict, context: dict) -> None:
    if context["frame_created"]:
        state["frames"] = [
            frame
            for frame in state["frames"]
            if frame["id"] != context["frame_id"]
        ]
    else:
        frame_index, _index, _entity = 0, 0, {}
        result = _find_entity(state, context["frame_id"])
        if result is not None:
            frame_index = result[1]
            state["frames"][frame_index] = deepcopy(context["previous_frame"])

    for entity in state["objects"]:
        if entity["id"] in context["previous_parent_frame_ids"]:
            entity["parentFrameId"] = context["previous_parent_frame_ids"][entity["id"]]

    state["selection"] = deepcopy(context["previous_selection"])


def _undo_connect(state: dict, action: dict, context: dict) -> None:
    state["connectors"] = [
        connector
        for connector in state["connectors"]
        if connector["id"] != context["connector_id"]
    ]
    state["selection"] = deepcopy(context["previous_selection"])


def _undo_annotate(state: dict, action: dict, context: dict) -> None:
    entity = _require_entity(state, context["target"])[2]
    entity["content"] = deepcopy(context["previous_content"])


def _undo_delete(state: dict, action: dict, context: dict) -> None:
    _restore_entities(state["objects"], context["removed_objects"])
    _restore_entities(state["frames"], context["removed_frames"])
    _restore_entities(state["connectors"], context["removed_connectors"])
    state["selection"] = deepcopy(context["previous_selection"])


ACTION_HANDLERS = {
    "Create": ActionHandler(
        schema=ACTION_SCHEMAS["Create"],
        required_fields=["op", "id", "object_type", "geometry"],
        optional_fields=["text", "title", "parent_frame_id", "selected"],
        preconditions=[
            "id must be globally unique",
            "frame creation cannot specify parent_frame_id",
            "non-frame creation can target an existing frame only if geometry fits inside it",
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
        preconditions=["all target ids must already exist"],
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
            "all targets must be existing objects or frames",
            "moving a child object cannot place it outside its parent frame",
            "moving a frame also moves its child objects by the same delta",
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
            "target must be an existing object or frame",
            "resized objects must still fit inside their parent frame",
            "resized frames must still contain their current child objects",
        ],
        deterministic_executor="_execute_resize",
        postcondition_checker="_check_resize_postcondition",
        undo_handler="_undo_resize",
        execute=_execute_resize,
        check_postcondition=_check_resize_postcondition,
        undo=_undo_resize,
    ),
    "GroupIntoFrame": ActionHandler(
        schema=ACTION_SCHEMAS["GroupIntoFrame"],
        required_fields=["op", "targets", "frame_id"],
        optional_fields=["title", "geometry"],
        preconditions=[
            "targets must all be existing objects",
            "frame_id must reference an existing frame or a new unused id",
            "all targets must fit inside the destination frame geometry",
        ],
        deterministic_executor="_execute_group_into_frame",
        postcondition_checker="_check_group_into_frame_postcondition",
        undo_handler="_undo_group_into_frame",
        execute=_execute_group_into_frame,
        check_postcondition=_check_group_into_frame_postcondition,
        undo=_undo_group_into_frame,
    ),
    "Connect": ActionHandler(
        schema=ACTION_SCHEMAS["Connect"],
        required_fields=["op", "id", "source", "target"],
        optional_fields=["label", "source_handle", "target_handle", "selected"],
        preconditions=[
            "connector id must be unused",
            "source and target must be existing objects or frames",
            "source and target must be different ids",
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
            "target must exist",
            "field must match the target kind: text for objects, title for frames, label for connectors",
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
        preconditions=["all targets must already exist"],
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
                "schema": handler.schema,
                "required_fields": handler.required_fields,
                "optional_fields": handler.optional_fields,
                "preconditions": handler.preconditions,
                "deterministic_executor": handler.deterministic_executor,
                "postcondition_checker": handler.postcondition_checker,
                "undo_handler": handler.undo_handler,
            }
        )
    return catalog


def execute_action_batch(initial_state: dict, actions: List[dict]) -> dict:
    working_state = deepcopy(initial_state)
    _check_state_valid(working_state)
    normalize_canvas_state(working_state)

    executed_actions = []
    execution_log = []

    for index, raw_action in enumerate(actions):
        try:
            action = validate_action_payload(raw_action)
            op = action["op"]
            handler = ACTION_HANDLERS[op]

            if op == "Create":
                _check_create_preconditions(working_state, action)
            elif op == "Select":
                _check_select_preconditions(working_state, action)
            elif op == "Move":
                _check_move_preconditions(working_state, action)
            elif op == "Resize":
                _check_resize_preconditions(working_state, action)
            elif op == "GroupIntoFrame":
                _check_group_into_frame_preconditions(working_state, action)
            elif op == "Connect":
                _check_connect_preconditions(working_state, action)
            elif op == "Annotate":
                _check_annotate_preconditions(working_state, action)
            elif op == "Delete":
                _check_delete_preconditions(working_state, action)

            undo_context = handler.execute(working_state, action)
            normalize_canvas_state(working_state)
            handler.check_postcondition(working_state, action, undo_context)

            executed_actions.append(
                {
                    "op": op,
                    "undo_handler": handler.undo_handler,
                    "undo_context": undo_context,
                    "action": deepcopy(action),
                }
            )
            execution_log.append(
                {
                    "index": index,
                    "op": op,
                    "status": "ok",
                    "postcondition_checker": handler.postcondition_checker,
                    "undo_handler": handler.undo_handler,
                }
            )
        except CanvasActionError as exc:
            raise CanvasActionError(
                f"Action {index} ({raw_action.get('op', 'unknown')}) failed: {exc}"
            ) from exc

    return {
        "canvas_state": working_state,
        "executed_actions": executed_actions,
        "execution_log": execution_log,
    }


def undo_executed_actions(state: dict, executed_actions: List[dict]) -> dict:
    working_state = deepcopy(state)
    for executed_action in reversed(executed_actions):
        handler = ACTION_HANDLERS[executed_action["op"]]
        handler.undo(
            working_state,
            executed_action["action"],
            executed_action["undo_context"],
        )
        normalize_canvas_state(working_state)

    return working_state
