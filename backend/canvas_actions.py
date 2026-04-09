import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from canvas_rules import DEFAULT_RULE_REGISTRY, RuleEffect, RuleRegistry, RuleViolationError
from canvas_rules.helpers import (
    CANVAS_BOUNDS,
    HANDLE_VALUES,
    LAYOUT_POLICY_VALUES,
    canonical_selection,
    compute_connector_geometry,
    entity_ids,
    find_entity,
    geometry_fits_canvas,
    node_ids,
)
from canvas_state import _is_number, validate_canvas_state

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
        "layoutPolicy": {
            "type": "string",
            "enum": list(LAYOUT_POLICY_VALUES),
        },
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
    def __init__(
        self,
        message: str,
        *,
        error_code: Optional[str] = None,
        error_rule: Optional[str] = None,
        error_details: Optional[dict] = None,
        repair_hint: Optional[str] = None,
    ):
        super().__init__(message)
        self.error_code = error_code
        self.error_rule = error_rule
        self.error_details = dict(error_details or {})
        self.repair_hint = repair_hint


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
    undo: Callable[[dict, dict, dict], None]


def _json_signature(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _schema_repair_hint(
    *,
    reason: str,
    path: str,
) -> Optional[str]:
    if reason in {"required", "type"} and path == "$.delta":
        return "Move actions must include delta as an object with numeric dx and dy."
    if reason == "required" and path in {"$.source", "$.target"}:
        return "Connect actions must include both source and target."
    if reason == "min_items" and path == "$.targets":
        return "Every targets array must be non-empty."
    if reason == "unsupported_fields":
        return "Do not include fields that are not allowed for the selected op."
    return None


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
        raise CanvasActionSchemaError(
            f"{path} must equal {schema['const']!r}.",
            error_code="schema_const_mismatch",
            error_details={"path": path, "expected": schema["const"]},
        )

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
        raise CanvasActionSchemaError(
            f"{path} must be of type '{expected_type}'.",
            error_code="schema_type_mismatch",
            error_details={"path": path, "expectedType": expected_type},
            repair_hint=_schema_repair_hint(reason="type", path=path),
        )

    enum_values = schema.get("enum")
    if enum_values is not None and value not in enum_values:
        raise CanvasActionSchemaError(
            f"{path} must be one of {enum_values}.",
            error_code="schema_enum_mismatch",
            error_details={"path": path, "allowedValues": enum_values},
        )

    if resolved_type == "string":
        min_length = schema.get("minLength")
        if min_length is not None and len(value) < min_length:
            raise CanvasActionSchemaError(
                f"{path} must have at least {min_length} characters.",
                error_code="schema_string_too_short",
                error_details={"path": path, "minLength": min_length},
            )

    if resolved_type == "number":
        minimum = schema.get("minimum")
        if minimum is not None and value < minimum:
            raise CanvasActionSchemaError(
                f"{path} must be greater than or equal to {minimum}.",
                error_code="schema_number_below_minimum",
                error_details={"path": path, "minimum": minimum},
            )
        exclusive_minimum = schema.get("exclusiveMinimum")
        if exclusive_minimum is not None and value <= exclusive_minimum:
            raise CanvasActionSchemaError(
                f"{path} must be greater than {exclusive_minimum}.",
                error_code="schema_number_below_exclusive_minimum",
                error_details={"path": path, "exclusiveMinimum": exclusive_minimum},
            )

    if resolved_type == "array":
        min_items = schema.get("minItems")
        if min_items is not None and len(value) < min_items:
            raise CanvasActionSchemaError(
                f"{path} must contain at least {min_items} item(s).",
                error_code="schema_array_too_short",
                error_details={"path": path, "minItems": min_items},
                repair_hint=_schema_repair_hint(reason="min_items", path=path),
            )

        if schema.get("uniqueItems"):
            signatures = [_json_signature(item) for item in value]
            if len(signatures) != len(set(signatures)):
                raise CanvasActionSchemaError(
                    f"{path} must not contain duplicate items.",
                    error_code="schema_array_duplicate_items",
                    error_details={"path": path},
                )

        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(value):
                validate_against_schema(item_schema, item, f"{path}[{index}]")

    if resolved_type == "object":
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                full_path = f"{path}.{key}"
                raise CanvasActionSchemaError(
                    f"{full_path} is required.",
                    error_code="schema_required_field_missing",
                    error_details={"path": full_path, "field": key},
                    repair_hint=_schema_repair_hint(reason="required", path=full_path),
                )

        properties = schema.get("properties", {})
        additional_properties = schema.get("additionalProperties", True)
        if additional_properties is False:
            extra_keys = [key for key in value.keys() if key not in properties]
            if extra_keys:
                raise CanvasActionSchemaError(
                    f"{path} contains unsupported field(s): {', '.join(extra_keys)}.",
                    error_code="schema_unsupported_fields",
                    error_details={"path": path, "fields": extra_keys},
                    repair_hint=_schema_repair_hint(reason="unsupported_fields", path=path),
                )

        for key, subschema in properties.items():
            if key in value:
                validate_against_schema(subschema, value[key], f"{path}.{key}")


def validate_action_request(payload: object) -> None:
    validate_against_schema(ACTIONS_REQUEST_SCHEMA, payload)


def validate_action_payload(action: object) -> dict:
    if not isinstance(action, dict):
        raise CanvasActionSchemaError(
            "Each action must be a JSON object.",
            error_code="schema_action_not_object",
        )

    op = action.get("op")
    if not isinstance(op, str) or op not in ACTION_SCHEMAS:
        raise CanvasActionSchemaError(
            f"Unsupported action op {op!r}.",
            error_code="schema_unsupported_action_op",
            error_details={"op": op},
        )

    validate_against_schema(ACTION_SCHEMAS[op], action)
    return action


def action_error_payload(
    error: CanvasActionError,
    *,
    include_status: bool = False,
) -> dict:
    payload = {"message": str(error)}
    if include_status:
        payload["status"] = "error"
    if error.error_code:
        payload["errorCode"] = error.error_code
    if error.error_rule:
        payload["errorRule"] = error.error_rule
    if error.error_details:
        payload["errorDetails"] = deepcopy(error.error_details)
    if error.repair_hint:
        payload["repairHint"] = error.repair_hint
    return payload


def _require_entity(
    state: dict,
    entity_id: str,
    allowed_collections: Optional[Tuple[str, ...]] = None,
) -> Tuple[str, int, dict]:
    result = find_entity(state, entity_id)
    if result is None:
        raise CanvasActionPreconditionError(
            f"Entity {entity_id!r} does not exist.",
            error_code="invalid_entity_reference",
            error_details={"entityId": entity_id},
        )

    collection_name, index, entity = result
    if allowed_collections and collection_name not in allowed_collections:
        raise CanvasActionPreconditionError(
            f"Entity {entity_id!r} is not valid for this action.",
            error_code="invalid_entity_kind",
            error_details={
                "entityId": entity_id,
                "allowedCollections": list(allowed_collections),
            },
        )

    return collection_name, index, entity


def normalize_canvas_state(state: dict) -> dict:
    valid_node_id_set = node_ids(state)
    normalized_connectors = []
    for connector in state["connectors"]:
        if connector["source"] not in valid_node_id_set:
            continue
        if connector["target"] not in valid_node_id_set:
            continue
        connector["geometry"] = compute_connector_geometry(state, connector)
        normalized_connectors.append(connector)

    state["connectors"] = normalized_connectors
    state["selection"] = canonical_selection(state)
    return state


def _check_state_valid(state: dict) -> None:
    validation_error = validate_canvas_state(state)
    if validation_error:
        raise CanvasActionPreconditionError(
            f"Canvas state is invalid: {validation_error}",
            error_code="invalid_canvas_state",
            error_details={"validationError": validation_error},
        )


def _execute_create(state: dict, action: dict) -> dict:
    entity = {
        "id": action["id"],
        "type": action["object_type"],
        "content": {"text": action.get("text", "")},
        "geometry": deepcopy(action["geometry"]),
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


def _resolve_annotation_target_for_execution(state: dict, action: dict) -> Tuple[str, dict, str]:
    collection_name, _index, entity = _require_entity(state, action["target"])
    expected_field = "text" if collection_name == "objects" else "label"
    requested_field = action.get("field")
    if requested_field is not None and requested_field != expected_field:
        raise CanvasActionPreconditionError(
            f"Field {requested_field!r} is not valid for target {action['target']!r}.",
            error_code="annotation_field_mismatch",
            error_details={
                "entityId": action["target"],
                "expectedField": expected_field,
                "requestedField": requested_field,
            },
        )
    return collection_name, entity, expected_field


def _execute_annotate(state: dict, action: dict) -> dict:
    collection_name, entity, field = _resolve_annotation_target_for_execution(state, action)
    previous_value = entity["content"].get(field, "")
    previous_geometry = deepcopy(entity["geometry"]) if collection_name == "objects" else None
    entity["content"][field] = action["text"]
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
        entity for entity in state["connectors"] if entity["id"] not in connector_ids
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
    collection_name, entity, field = _resolve_annotation_target_for_execution(state, action)
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_create",
        execute=_execute_create,
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_select",
        execute=_execute_select,
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_move",
        execute=_execute_move,
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_resize",
        execute=_execute_resize,
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_connect",
        execute=_execute_connect,
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_annotate",
        execute=_execute_annotate,
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
        postcondition_checker="rule_registry.post_action",
        undo_handler="_undo_delete",
        execute=_execute_delete,
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


def _run_rule_phase(
    *,
    rule_registry: RuleRegistry,
    phase: str,
    state: dict,
    action: Optional[dict],
    action_index: Optional[int],
    handler: Optional[ActionHandler],
    action_context: Optional[dict],
    batch_metadata: dict,
    options: dict,
) -> List[RuleEffect]:
    from canvas_rules import RuleContext

    context = RuleContext(
        phase=phase,
        state=state,
        action=action,
        action_index=action_index,
        handler=handler,
        action_context=action_context,
        batch_metadata=batch_metadata,
        options=options,
    )
    return rule_registry.run(context)


def _decorate_action_error(error: CanvasActionError, index: int, raw_action: dict) -> CanvasActionError:
    details = deepcopy(getattr(error, "error_details", {}) or {})
    details.setdefault("actionIndex", index)
    details.setdefault("op", raw_action.get("op"))
    error_cls = error.__class__
    return error_cls(
        f"Action {index} ({raw_action.get('op', 'unknown')}) failed: {error}",
        error_code=getattr(error, "error_code", None),
        error_rule=getattr(error, "error_rule", None),
        error_details=details,
        repair_hint=getattr(error, "repair_hint", None),
    )


def _error_from_rule_violation(
    violation_error: RuleViolationError,
    *,
    action_index: Optional[int] = None,
    raw_action: Optional[dict] = None,
) -> CanvasActionError:
    violation = violation_error.violation
    details = deepcopy(violation.details)
    message = violation.message
    if action_index is not None:
        message = (
            f"Action {action_index} ({raw_action.get('op', 'unknown')}) failed: "
            f"{violation.message}"
        )
        details.setdefault("actionIndex", action_index)
    if raw_action is not None:
        details.setdefault("op", raw_action.get("op"))

    error_cls = (
        CanvasActionPostconditionError
        if violation.phase == "post_action"
        else CanvasActionPreconditionError
    )
    return error_cls(
        message,
        error_code=violation.code,
        error_rule=violation.rule,
        error_details=details,
        repair_hint=violation.repair_hint,
    )


def _record_layout_affected_object_ids(
    action: dict,
    action_context: dict,
    rule_effects: List[RuleEffect],
    batch_metadata: dict,
    action_index: int,
    state: dict,
) -> None:
    order_map = batch_metadata["layout_affected_order_map"]
    connector_order_map = batch_metadata["connector_affected_order_map"]
    affected_ids = []
    if action["op"] == "Create":
        affected_ids = [action["id"]]
    elif action["op"] == "Move":
        affected_ids = list(action["targets"])
    elif action["op"] == "Resize":
        affected_ids = [action["target"]]
    elif action["op"] == "Annotate":
        if any(effect.rule == "text_label_auto_fit" for effect in rule_effects):
            result = find_entity(state, action["target"])
            if result is not None and result[0] == "objects":
                affected_ids = [action["target"]]
    elif action["op"] == "Connect":
        connector_order_map.setdefault(action["id"], action_index)

    for object_id in affected_ids:
        order_map.setdefault(object_id, action_index)


def _extract_layout_adjustments(rule_effects: List[RuleEffect]) -> List[dict]:
    adjustments_by_id = {}
    ordered_ids = []

    for effect in rule_effects:
        if effect.rule not in {
            "no_overlap_layout",
            "alignment_layout",
            "equalize_cluster_spacing",
            "heading_placement",
        }:
            continue
        if "id" not in effect.details or "from" not in effect.details or "to" not in effect.details:
            continue

        object_id = effect.details["id"]
        if object_id not in adjustments_by_id:
            adjustments_by_id[object_id] = {
                "id": object_id,
                "from": deepcopy(effect.details["from"]),
                "to": deepcopy(effect.details["to"]),
                "rules": [effect.rule],
            }
            ordered_ids.append(object_id)
            continue

        adjustments_by_id[object_id]["to"] = deepcopy(effect.details["to"])
        adjustments_by_id[object_id]["rules"].append(effect.rule)

    return [adjustments_by_id[object_id] for object_id in ordered_ids]


def execute_action_batch(
    initial_state: dict,
    actions: List[dict],
    layout_policy: str = "none",
    rule_registry: Optional[RuleRegistry] = None,
) -> dict:
    if layout_policy not in LAYOUT_POLICY_VALUES:
        raise CanvasActionSchemaError(
            f"Unsupported layout policy {layout_policy!r}.",
            error_code="schema_unsupported_layout_policy",
            error_details={"layoutPolicy": layout_policy},
        )

    registry = rule_registry or DEFAULT_RULE_REGISTRY
    working_state = normalize_canvas_state(deepcopy(initial_state))
    _check_state_valid(working_state)

    execution_log = []
    executed_actions = []
    batch_rule_effects: List[RuleEffect] = []
    batch_metadata = {
        "layout_affected_order_map": {},
        "connector_affected_order_map": {},
        "layout_adjusted_ids": [],
    }
    options = {
        "layoutPolicy": layout_policy,
    }

    for index, raw_action in enumerate(actions):
        try:
            action = validate_action_payload(raw_action)
            handler = ACTION_HANDLERS[action["op"]]
            _run_rule_phase(
                rule_registry=registry,
                phase="pre_action",
                state=working_state,
                action=action,
                action_index=index,
                handler=handler,
                action_context=None,
                batch_metadata=batch_metadata,
                options=options,
            )
            action_context = handler.execute(working_state, action)
            normalize_canvas_state(working_state)
            action_rule_effects = _run_rule_phase(
                rule_registry=registry,
                phase="post_action",
                state=working_state,
                action=action,
                action_index=index,
                handler=handler,
                action_context=action_context,
                batch_metadata=batch_metadata,
                options=options,
            )
            if action_rule_effects:
                batch_rule_effects.extend(action_rule_effects)
            normalize_canvas_state(working_state)
            _check_state_valid(working_state)
            _record_layout_affected_object_ids(
                action,
                action_context,
                action_rule_effects,
                batch_metadata,
                index,
                working_state,
            )
        except RuleViolationError as exc:
            raise _error_from_rule_violation(
                exc,
                action_index=index,
                raw_action=raw_action,
            ) from exc
        except CanvasActionError as exc:
            raise _decorate_action_error(exc, index, raw_action) from exc

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
                "context": deepcopy(action_context),
                "rule_effects": deepcopy(action_rule_effects),
                "undo_handler": handler.undo_handler,
            }
        )

    try:
        batch_phase_effects = _run_rule_phase(
            rule_registry=registry,
            phase="post_batch",
            state=working_state,
            action=None,
            action_index=None,
            handler=None,
            action_context=None,
            batch_metadata=batch_metadata,
            options=options,
        )
        if batch_phase_effects:
            batch_rule_effects.extend(batch_phase_effects)
        normalize_canvas_state(working_state)
        _check_state_valid(working_state)
    except RuleViolationError as exc:
        raise _error_from_rule_violation(exc) from exc
    except CanvasActionError as exc:
        raise exc

    return {
        "canvas_state": working_state,
        "execution_log": execution_log,
        "executed_actions": executed_actions,
        "rule_effects": deepcopy(batch_rule_effects),
        "layout_policy_applied": layout_policy,
        "layout_adjustments": _extract_layout_adjustments(batch_rule_effects),
    }


def _undo_rule_effect(state: dict, effect: RuleEffect) -> None:
    if effect.kind != "restore_geometry":
        if effect.kind == "restore_connector_handles":
            connector_id = effect.undo_payload.get("connectorId")
            source_handle = effect.undo_payload.get("sourceHandle")
            target_handle = effect.undo_payload.get("targetHandle")
            if not isinstance(connector_id, str):
                raise CanvasActionPreconditionError(
                    "Rule effect undo payload is invalid.",
                    error_code="invalid_rule_effect_payload",
                    error_details={"rule": effect.rule},
                )

            result = find_entity(state, connector_id)
            if result is None or result[0] != "connectors":
                return

            connector = result[2]
            connector["sourceHandle"] = source_handle
            connector["targetHandle"] = target_handle
            return

        raise CanvasActionPreconditionError(
            f"Unsupported rule effect kind {effect.kind!r} during undo.",
            error_code="unsupported_rule_effect",
            error_details={"kind": effect.kind, "rule": effect.rule},
        )

    entity_id = effect.undo_payload.get("entityId")
    geometry = effect.undo_payload.get("geometry")
    if not isinstance(entity_id, str) or not isinstance(geometry, dict):
        raise CanvasActionPreconditionError(
            "Rule effect undo payload is invalid.",
            error_code="invalid_rule_effect_payload",
            error_details={"rule": effect.rule},
        )

    result = find_entity(state, entity_id)
    if result is None or result[0] != "objects":
        return
    result[2]["geometry"] = deepcopy(geometry)


def _undo_legacy_layout_adjustments(state: dict, layout_adjustments: List[dict]) -> None:
    for adjustment in layout_adjustments:
        entity_id = adjustment.get("id")
        result = find_entity(state, entity_id)
        if result is None or result[0] != "objects":
            continue
        result[2]["geometry"]["x"] = adjustment["from"]["x"]
        result[2]["geometry"]["y"] = adjustment["from"]["y"]


def undo_executed_actions(
    state: dict,
    executed_actions: List[dict],
    rule_effects: Optional[List[RuleEffect]] = None,
    layout_adjustments: Optional[List[dict]] = None,
) -> dict:
    working_state = deepcopy(state)

    if (
        rule_effects
        and isinstance(rule_effects, list)
        and isinstance(rule_effects[0], dict)
        and {"id", "from", "to"}.issubset(rule_effects[0].keys())
        and "kind" not in rule_effects[0]
    ):
        layout_adjustments = rule_effects
        rule_effects = None

    if rule_effects:
        for effect in reversed(rule_effects):
            _undo_rule_effect(working_state, effect)
        normalize_canvas_state(working_state)
        _check_state_valid(working_state)
    elif layout_adjustments:
        _undo_legacy_layout_adjustments(working_state, layout_adjustments)
        normalize_canvas_state(working_state)
        _check_state_valid(working_state)

    for entry in reversed(executed_actions):
        action = entry["action"]
        handler = ACTION_HANDLERS[action["op"]]
        handler.undo(working_state, action, deepcopy(entry["context"]))
        normalize_canvas_state(working_state)
        _check_state_valid(working_state)
    return working_state
