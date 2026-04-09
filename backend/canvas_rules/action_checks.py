from copy import deepcopy

from .common import raise_rule_violation
from .helpers import (
    canonical_selection,
    entity_ids,
    find_entity,
    fit_text_label_geometry,
    geometry_fits_canvas,
    prospective_create_geometry,
)
from .types import CanvasRule, RuleContext


def _find_required_entity(context: RuleContext, entity_id: str, *, collections=None):
    result = find_entity(context.state, entity_id)
    if result is None:
        return None
    if collections and result[0] not in collections:
        return None
    return result


def _run_create_semantics(context: RuleContext):
    action = context.action
    rule = CREATE_SEMANTICS_RULE
    if action["id"] in entity_ids(context.state):
        raise_rule_violation(
            rule,
            context,
            code="duplicate_entity_id",
            message=f"Entity {action['id']!r} already exists.",
            details={"entityId": action["id"]},
        )

    geometry = prospective_create_geometry(action)
    if not geometry_fits_canvas(geometry):
        raise_rule_violation(
            rule,
            context,
            code="create_out_of_bounds",
            message=f"Create would place entity {action['id']!r} outside canvas bounds.",
            details={"entityId": action["id"], "geometry": geometry},
        )

    return []


def _run_select_semantics(context: RuleContext):
    rule = SELECT_SEMANTICS_RULE
    for entity_id in context.action["targets"]:
        if find_entity(context.state, entity_id) is None:
            raise_rule_violation(
                rule,
                context,
                code="invalid_selection_target",
                message=f"Entity {entity_id!r} does not exist.",
                details={"entityId": entity_id},
            )
    return []


def _run_move_semantics(context: RuleContext):
    rule = MOVE_SEMANTICS_RULE
    for entity_id in context.action["targets"]:
        result = find_entity(context.state, entity_id)
        if result is None:
            raise_rule_violation(
                rule,
                context,
                code="invalid_move_target",
                message=f"Entity {entity_id!r} does not exist.",
                details={"entityId": entity_id},
            )
        if result[0] != "objects":
            raise_rule_violation(
                rule,
                context,
                code="invalid_move_target",
                message=f"Entity {entity_id!r} is not valid for this action.",
                details={"entityId": entity_id},
            )

        entity = result[2]
        next_geometry = deepcopy(entity["geometry"])
        next_geometry["x"] += context.action["delta"]["dx"]
        next_geometry["y"] += context.action["delta"]["dy"]
        if not geometry_fits_canvas(next_geometry):
            raise_rule_violation(
                rule,
                context,
                code="move_out_of_bounds",
                message=f"Move would place object {entity_id!r} outside canvas bounds.",
                details={"entityId": entity_id, "geometry": next_geometry},
            )
    return []


def _run_resize_semantics(context: RuleContext):
    rule = RESIZE_SEMANTICS_RULE
    target = context.action["target"]
    result = find_entity(context.state, target)
    if result is None:
        raise_rule_violation(
            rule,
            context,
            code="invalid_resize_target",
            message=f"Entity {target!r} does not exist.",
            details={"entityId": target},
        )
    if result[0] != "objects":
        raise_rule_violation(
            rule,
            context,
            code="invalid_resize_target",
            message=f"Entity {target!r} is not valid for this action.",
            details={"entityId": target},
        )
    if not geometry_fits_canvas(context.action["geometry"]):
        raise_rule_violation(
            rule,
            context,
            code="resize_out_of_bounds",
            message=f"Resize would place object {target!r} outside canvas bounds.",
            details={"entityId": target, "geometry": context.action["geometry"]},
        )
    return []


def _run_connect_semantics(context: RuleContext):
    rule = CONNECT_SEMANTICS_RULE
    action = context.action
    if action["id"] in entity_ids(context.state):
        raise_rule_violation(
            rule,
            context,
            code="duplicate_entity_id",
            message=f"Entity {action['id']!r} already exists.",
            details={"entityId": action["id"]},
        )
    source_result = find_entity(context.state, action["source"])
    if source_result is None:
        raise_rule_violation(
            rule,
            context,
            code="invalid_connector_source",
            message=f"Entity {action['source']!r} does not exist.",
            details={"entityId": action["source"]},
        )
    if source_result[0] != "objects":
        raise_rule_violation(
            rule,
            context,
            code="invalid_connector_source",
            message=f"Entity {action['source']!r} is not valid for this action.",
            details={"entityId": action["source"]},
        )
    target_result = find_entity(context.state, action["target"])
    if target_result is None:
        raise_rule_violation(
            rule,
            context,
            code="invalid_connector_target",
            message=f"Entity {action['target']!r} does not exist.",
            details={"entityId": action["target"]},
        )
    if target_result[0] != "objects":
        raise_rule_violation(
            rule,
            context,
            code="invalid_connector_target",
            message=f"Entity {action['target']!r} is not valid for this action.",
            details={"entityId": action["target"]},
        )
    if action["source"] == action["target"]:
        raise_rule_violation(
            rule,
            context,
            code="connector_same_endpoint",
            message="Connect source and target must be different.",
            details={"source": action["source"], "target": action["target"]},
        )
    return []


def _run_annotate_semantics(context: RuleContext):
    rule = ANNOTATE_SEMANTICS_RULE
    action = context.action
    result = find_entity(context.state, action["target"])
    if result is None:
        raise_rule_violation(
            rule,
            context,
            code="invalid_annotation_target",
            message=f"Entity {action['target']!r} does not exist.",
            details={"entityId": action["target"]},
        )

    collection_name, _index, entity = result
    expected_field = "text" if collection_name == "objects" else "label"
    requested_field = action.get("field")
    if requested_field is not None and requested_field != expected_field:
        raise_rule_violation(
            rule,
            context,
            code="annotation_field_mismatch",
            message=f"Field {requested_field!r} is not valid for target {action['target']!r}.",
            details={
                "entityId": action["target"],
                "expectedField": expected_field,
                "requestedField": requested_field,
            },
        )

    if collection_name == "objects" and entity["type"] == "text-label" and expected_field == "text":
        next_geometry = fit_text_label_geometry(entity["geometry"], action["text"])
        if not geometry_fits_canvas(next_geometry):
            raise_rule_violation(
                rule,
                context,
                code="annotate_out_of_bounds",
                message=(
                    f"Annotate would resize text label {action['target']!r} "
                    "outside canvas bounds."
                ),
                details={"entityId": action["target"], "geometry": next_geometry},
            )

    return []


def _run_delete_semantics(context: RuleContext):
    rule = DELETE_SEMANTICS_RULE
    for entity_id in context.action["targets"]:
        if find_entity(context.state, entity_id) is None:
            raise_rule_violation(
                rule,
                context,
                code="invalid_delete_target",
                message=f"Entity {entity_id!r} does not exist.",
                details={"entityId": entity_id},
            )
    return []


def _run_create_postcondition(context: RuleContext):
    rule = CREATE_POSTCONDITION_RULE
    entity_result = _find_required_entity(
        context,
        context.action["id"],
        collections=("objects",),
    )
    if entity_result is None:
        raise_rule_violation(
            rule,
            context,
            code="create_postcondition_missing_entity",
            message=f"Created object {context.action['id']!r} is missing.",
            details={"entityId": context.action["id"]},
        )

    entity = entity_result[2]
    if entity["type"] != context.action["object_type"]:
        raise_rule_violation(
            rule,
            context,
            code="create_postcondition_wrong_type",
            message=f"Created object {context.action['id']!r} has the wrong type.",
            details={
                "entityId": context.action["id"],
                "expectedType": context.action["object_type"],
                "actualType": entity["type"],
            },
        )
    return []


def _run_select_postcondition(context: RuleContext):
    rule = SELECT_POSTCONDITION_RULE
    expected_selection = canonical_selection(context.state)
    if context.state["selection"] != expected_selection:
        raise_rule_violation(
            rule,
            context,
            code="selection_contains_invalid_ids",
            message="Selection contains invalid ids.",
            details={"selection": context.state["selection"]},
        )
    return []


def _run_move_postcondition(context: RuleContext):
    rule = MOVE_POSTCONDITION_RULE
    for entity_id in context.action["targets"]:
        entity_result = _find_required_entity(
            context,
            entity_id,
            collections=("objects",),
        )
        if entity_result is None:
            raise_rule_violation(
                rule,
                context,
                code="move_postcondition_missing_entity",
                message=f"Moved object {entity_id!r} is missing.",
                details={"entityId": entity_id},
            )

        entity = entity_result[2]
        previous_geometry = context.action_context["previous_geometries"][entity_id]
        if entity["geometry"]["x"] != previous_geometry["x"] + context.action["delta"]["dx"]:
            raise_rule_violation(
                rule,
                context,
                code="move_postcondition_wrong_x",
                message=f"Move did not update x for object {entity_id!r}.",
                details={"entityId": entity_id},
            )
        if entity["geometry"]["y"] != previous_geometry["y"] + context.action["delta"]["dy"]:
            raise_rule_violation(
                rule,
                context,
                code="move_postcondition_wrong_y",
                message=f"Move did not update y for object {entity_id!r}.",
                details={"entityId": entity_id},
            )
    return []


def _run_resize_postcondition(context: RuleContext):
    rule = RESIZE_POSTCONDITION_RULE
    entity_result = _find_required_entity(
        context,
        context.action["target"],
        collections=("objects",),
    )
    if entity_result is None:
        raise_rule_violation(
            rule,
            context,
            code="resize_postcondition_missing_entity",
            message=f"Resized object {context.action['target']!r} is missing.",
            details={"entityId": context.action["target"]},
        )

    entity = entity_result[2]
    if entity["geometry"] != context.action["geometry"]:
        raise_rule_violation(
            rule,
            context,
            code="resize_postcondition_mismatch",
            message=f"Resize did not apply geometry for {context.action['target']!r}.",
            details={"entityId": context.action["target"]},
        )
    return []


def _run_connect_postcondition(context: RuleContext):
    rule = CONNECT_POSTCONDITION_RULE
    connector_result = _find_required_entity(
        context,
        context.action["id"],
        collections=("connectors",),
    )
    if connector_result is None:
        raise_rule_violation(
            rule,
            context,
            code="connect_postcondition_missing_connector",
            message=f"Connector {context.action['id']!r} is missing.",
            details={"entityId": context.action["id"]},
        )

    connector = connector_result[2]
    if connector["source"] != context.action["source"] or connector["target"] != context.action["target"]:
        raise_rule_violation(
            rule,
            context,
            code="connect_postcondition_endpoint_mismatch",
            message=f"Connector {context.action['id']!r} endpoints do not match the action.",
            details={"entityId": context.action["id"]},
        )
    if connector.get("geometry") is None:
        raise_rule_violation(
            rule,
            context,
            code="connect_postcondition_missing_geometry",
            message=f"Connector {context.action['id']!r} is missing computed geometry.",
            details={"entityId": context.action["id"]},
        )
    return []


def _run_annotate_postcondition(context: RuleContext):
    rule = ANNOTATE_POSTCONDITION_RULE
    action = context.action
    result = find_entity(context.state, action["target"])
    if result is None:
        raise_rule_violation(
            rule,
            context,
            code="annotate_postcondition_missing_target",
            message=f"Annotation target {action['target']!r} is missing.",
            details={"entityId": action["target"]},
        )

    collection_name, _index, entity = result
    field = "text" if collection_name == "objects" else "label"
    if entity["content"].get(field, "") != action["text"]:
        raise_rule_violation(
            rule,
            context,
            code="annotate_postcondition_mismatch",
            message=f"Annotation did not update {field} for {action['target']!r}.",
            details={"entityId": action["target"], "field": field},
        )
    return []


def _run_delete_postcondition(context: RuleContext):
    rule = DELETE_POSTCONDITION_RULE
    for removed_id in context.action_context["removed_ids"]:
        if find_entity(context.state, removed_id) is not None:
            raise_rule_violation(
                rule,
                context,
                code="delete_postcondition_still_exists",
                message=f"Deleted entity {removed_id!r} still exists.",
                details={"entityId": removed_id},
            )
    return []


CREATE_SEMANTICS_RULE = CanvasRule(
    name="create_semantics",
    phase="pre_action",
    ops=("Create",),
    kind="check",
    priority=100,
    planner_guidance=(
        "Create actions must use an unused ID and keep the resulting geometry inside CANVAS_BOUNDS.",
    ),
    repair_hint="Use an unused suggested ID and keep created object geometry inside CANVAS_BOUNDS.",
    run=_run_create_semantics,
)

SELECT_SEMANTICS_RULE = CanvasRule(
    name="select_semantics",
    phase="pre_action",
    ops=("Select",),
    kind="check",
    priority=110,
    planner_guidance=(
        "Select actions must reference existing object or connector IDs from the current canvas state.",
    ),
    repair_hint="Use only existing valid object or connector IDs from CURRENT_CANVAS_STATE_JSON.",
    run=_run_select_semantics,
)

MOVE_SEMANTICS_RULE = CanvasRule(
    name="move_semantics",
    phase="pre_action",
    ops=("Move",),
    kind="check",
    priority=120,
    planner_guidance=(
        "Move actions must target existing objects and keep the moved geometry inside CANVAS_BOUNDS.",
    ),
    repair_hint="Use only existing object IDs in Move.targets and keep moved geometry inside CANVAS_BOUNDS.",
    run=_run_move_semantics,
)

RESIZE_SEMANTICS_RULE = CanvasRule(
    name="resize_semantics",
    phase="pre_action",
    ops=("Resize",),
    kind="check",
    priority=130,
    planner_guidance=(
        "Resize actions must target an existing object and keep the resized geometry inside CANVAS_BOUNDS.",
    ),
    repair_hint="Use only existing object IDs for Resize.target and keep resized geometry inside CANVAS_BOUNDS.",
    run=_run_resize_semantics,
)

CONNECT_SEMANTICS_RULE = CanvasRule(
    name="connect_semantics",
    phase="pre_action",
    ops=("Connect",),
    kind="check",
    priority=140,
    planner_guidance=(
        "Connect actions must use an unused connector ID, and both source and target must be different existing object IDs.",
    ),
    repair_hint="Connect actions must use an unused ID and include different existing object IDs for both source and target.",
    run=_run_connect_semantics,
)

ANNOTATE_SEMANTICS_RULE = CanvasRule(
    name="annotate_semantics",
    phase="pre_action",
    ops=("Annotate",),
    kind="check",
    priority=150,
    planner_guidance=(
        "Annotate must target an existing entity, use text for objects and label for connectors, and keep any text-label auto-resize inside CANVAS_BOUNDS.",
    ),
    repair_hint="Annotate must target an existing entity, use the correct field for that entity kind, and keep any text-label resize inside CANVAS_BOUNDS.",
    run=_run_annotate_semantics,
)

DELETE_SEMANTICS_RULE = CanvasRule(
    name="delete_semantics",
    phase="pre_action",
    ops=("Delete",),
    kind="check",
    priority=160,
    planner_guidance=(
        "Delete actions must reference existing object or connector IDs from the current canvas state.",
    ),
    repair_hint="Use only existing valid object or connector IDs in Delete.targets.",
    run=_run_delete_semantics,
)

CREATE_POSTCONDITION_RULE = CanvasRule(
    name="create_postcondition",
    phase="post_action",
    ops=("Create",),
    kind="check",
    priority=200,
    run=_run_create_postcondition,
)

SELECT_POSTCONDITION_RULE = CanvasRule(
    name="select_postcondition",
    phase="post_action",
    ops=("Select",),
    kind="check",
    priority=210,
    run=_run_select_postcondition,
)

MOVE_POSTCONDITION_RULE = CanvasRule(
    name="move_postcondition",
    phase="post_action",
    ops=("Move",),
    kind="check",
    priority=220,
    run=_run_move_postcondition,
)

RESIZE_POSTCONDITION_RULE = CanvasRule(
    name="resize_postcondition",
    phase="post_action",
    ops=("Resize",),
    kind="check",
    priority=230,
    run=_run_resize_postcondition,
)

CONNECT_POSTCONDITION_RULE = CanvasRule(
    name="connect_postcondition",
    phase="post_action",
    ops=("Connect",),
    kind="check",
    priority=240,
    run=_run_connect_postcondition,
)

ANNOTATE_POSTCONDITION_RULE = CanvasRule(
    name="annotate_postcondition",
    phase="post_action",
    ops=("Annotate",),
    kind="check",
    priority=250,
    run=_run_annotate_postcondition,
)

DELETE_POSTCONDITION_RULE = CanvasRule(
    name="delete_postcondition",
    phase="post_action",
    ops=("Delete",),
    kind="check",
    priority=260,
    run=_run_delete_postcondition,
)

ACTION_RULES = (
    CREATE_SEMANTICS_RULE,
    SELECT_SEMANTICS_RULE,
    MOVE_SEMANTICS_RULE,
    RESIZE_SEMANTICS_RULE,
    CONNECT_SEMANTICS_RULE,
    ANNOTATE_SEMANTICS_RULE,
    DELETE_SEMANTICS_RULE,
    CREATE_POSTCONDITION_RULE,
    SELECT_POSTCONDITION_RULE,
    MOVE_POSTCONDITION_RULE,
    RESIZE_POSTCONDITION_RULE,
    CONNECT_POSTCONDITION_RULE,
    ANNOTATE_POSTCONDITION_RULE,
    DELETE_POSTCONDITION_RULE,
)
