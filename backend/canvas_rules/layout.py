import math
from copy import deepcopy
from typing import Dict, Iterable, List, Tuple

from .common import raise_rule_violation
from .helpers import (
    ALIGNMENT_CLUSTER_TOLERANCE,
    CANVAS_BOUNDS,
    NO_OVERLAP_GRID_SIZE,
    geometry_fits_canvas,
    geometry_signature,
    object_ids_in_order,
    object_lookup,
    rectangles_overlap,
)
from .types import CanvasRule, RuleContext, RuleEffect


def _find_remaining_overlap_ids(state: dict) -> List[Tuple[str, str]]:
    overlaps = []
    objects = state["objects"]
    for index, first in enumerate(objects):
        for second in objects[index + 1 :]:
            if rectangles_overlap(first["geometry"], second["geometry"]):
                overlaps.append((first["id"], second["id"]))
    return overlaps


def _grid_anchor(value: float) -> int:
    return int(round(value / NO_OVERLAP_GRID_SIZE) * NO_OVERLAP_GRID_SIZE)


def _candidate_geometries_on_grid(geometry: dict):
    attempted_signatures = set()

    desired_geometry = deepcopy(geometry)
    if geometry_fits_canvas(desired_geometry):
        attempted_signatures.add(geometry_signature(desired_geometry))
        yield desired_geometry

    anchor_x = _grid_anchor(geometry["x"])
    anchor_y = _grid_anchor(geometry["y"])
    min_step_x = math.floor(
        (CANVAS_BOUNDS["left"] - anchor_x) / NO_OVERLAP_GRID_SIZE
    )
    max_step_x = math.floor(
        (CANVAS_BOUNDS["right"] - geometry["w"] - anchor_x) / NO_OVERLAP_GRID_SIZE
    )
    min_step_y = math.floor(
        (CANVAS_BOUNDS["top"] - anchor_y) / NO_OVERLAP_GRID_SIZE
    )
    max_step_y = math.floor(
        (CANVAS_BOUNDS["bottom"] - geometry["h"] - anchor_y) / NO_OVERLAP_GRID_SIZE
    )
    max_ring = max(
        abs(min_step_x),
        abs(max_step_x),
        abs(min_step_y),
        abs(max_step_y),
    )

    for ring_distance in range(max_ring + 1):
        candidates = []
        for step_x in range(-ring_distance, ring_distance + 1):
            remaining = ring_distance - abs(step_x)
            for step_y in {remaining, -remaining}:
                if step_x < min_step_x or step_x > max_step_x:
                    continue
                if step_y < min_step_y or step_y > max_step_y:
                    continue
                candidate_geometry = {
                    **deepcopy(geometry),
                    "x": anchor_x + step_x * NO_OVERLAP_GRID_SIZE,
                    "y": anchor_y + step_y * NO_OVERLAP_GRID_SIZE,
                }
                signature = geometry_signature(candidate_geometry)
                if signature in attempted_signatures:
                    continue
                if not geometry_fits_canvas(candidate_geometry):
                    continue
                attempted_signatures.add(signature)
                candidates.append(candidate_geometry)

        for candidate in sorted(candidates, key=lambda item: (item["y"], item["x"])):
            yield candidate


def _find_non_overlapping_geometry(
    rule: CanvasRule,
    context: RuleContext,
    object_id: str,
    desired_geometries: Iterable[dict],
    occupied_geometries: List[Tuple[str, dict]],
) -> dict:
    attempted_signatures = set()
    for desired_geometry in desired_geometries:
        for candidate_geometry in _candidate_geometries_on_grid(desired_geometry):
            signature = geometry_signature(candidate_geometry)
            if signature in attempted_signatures:
                continue
            attempted_signatures.add(signature)
            overlaps = any(
                other_id != object_id
                and rectangles_overlap(candidate_geometry, other_geometry)
                for other_id, other_geometry in occupied_geometries
            )
            if not overlaps:
                return candidate_geometry

    raise_rule_violation(
        rule,
        context,
        code="layout_resolution_failed",
        message=(
            "Layout resolution failed: no non-overlapping position found for "
            f"object {object_id!r} within canvas bounds."
        ),
        details={"entityId": object_id},
    )


def _sort_ids_by_layout_priority(
    object_ids: List[str],
    order_map: Dict[str, int],
) -> List[str]:
    return sorted(
        object_ids,
        key=lambda object_id: (
            order_map.get(object_id, math.inf),
            object_id,
        ),
    )


def _layout_sort_key(entity: dict) -> Tuple[float, float, str]:
    return (
        entity["geometry"]["y"],
        entity["geometry"]["x"],
        entity["id"],
    )


def _build_axis_anchors(state: dict, axis: str) -> List[int]:
    if axis not in {"x", "y"}:
        return []

    if axis == "x":
        sorted_objects = sorted(
            state["objects"],
            key=lambda item: (
                item["geometry"]["x"],
                item["geometry"]["y"],
                item["id"],
            ),
        )
    else:
        sorted_objects = sorted(state["objects"], key=_layout_sort_key)

    if not sorted_objects:
        return []

    anchors = []
    current_cluster = [sorted_objects[0]]
    current_total = float(sorted_objects[0]["geometry"][axis])

    for entity in sorted_objects[1:]:
        current_value = entity["geometry"][axis]
        current_anchor = current_total / len(current_cluster)
        if abs(current_value - current_anchor) <= ALIGNMENT_CLUSTER_TOLERANCE:
            current_cluster.append(entity)
            current_total += current_value
            continue

        anchors.append(_grid_anchor(current_total / len(current_cluster)))
        current_cluster = [entity]
        current_total = float(current_value)

    anchors.append(_grid_anchor(current_total / len(current_cluster)))
    return anchors


def _nearest_alignment_anchor(value: float, anchors: List[int]) -> int:
    if not anchors:
        return _grid_anchor(value)

    anchor = min(anchors, key=lambda item: (abs(item - value), item))
    if abs(anchor - value) > ALIGNMENT_CLUSTER_TOLERANCE:
        return _grid_anchor(value)
    return anchor


def _aligned_desired_geometries(
    geometry: dict,
    *,
    row_anchors: List[int],
    column_anchors: List[int],
) -> List[dict]:
    snapped_x = _grid_anchor(geometry["x"])
    snapped_y = _grid_anchor(geometry["y"])
    aligned_x = _nearest_alignment_anchor(geometry["x"], column_anchors)
    aligned_y = _nearest_alignment_anchor(geometry["y"], row_anchors)

    raw_candidates = [
        {
            **deepcopy(geometry),
            "x": aligned_x,
            "y": aligned_y,
        },
        {
            **deepcopy(geometry),
            "x": snapped_x,
            "y": aligned_y,
        },
        {
            **deepcopy(geometry),
            "x": aligned_x,
            "y": snapped_y,
        },
        {
            **deepcopy(geometry),
            "x": snapped_x,
            "y": snapped_y,
        },
    ]

    unique_candidates = []
    seen = set()
    for candidate in sorted(
        raw_candidates,
        key=lambda item: (
            abs(item["x"] - geometry["x"]) + abs(item["y"] - geometry["y"]),
            item["y"],
            item["x"],
        ),
    ):
        signature = geometry_signature(candidate)
        if signature in seen:
            continue
        seen.add(signature)
        if geometry_fits_canvas(candidate):
            unique_candidates.append(candidate)
    return unique_candidates or [deepcopy(geometry)]


def _apply_no_overlap_layout(context: RuleContext) -> List[RuleEffect]:
    state = context.state
    if not state["objects"]:
        return []

    order_map = context.batch_metadata.get("layout_affected_order_map", {})
    lookup = object_lookup(state)
    original_geometries = {
        object_id: deepcopy(entity["geometry"])
        for object_id, entity in lookup.items()
    }
    affected_ids = _sort_ids_by_layout_priority(
        [object_id for object_id in object_ids_in_order(state) if object_id in order_map],
        order_map,
    )

    occupied_geometries = [
        (object_id, deepcopy(entity["geometry"]))
        for object_id, entity in lookup.items()
        if object_id not in order_map
    ]
    for object_id in affected_ids:
        entity = lookup[object_id]
        entity["geometry"] = _find_non_overlapping_geometry(
            NO_OVERLAP_LAYOUT_RULE,
            context,
            object_id,
            [deepcopy(entity["geometry"])],
            occupied_geometries,
        )
        occupied_geometries.append((object_id, deepcopy(entity["geometry"])))

    if _find_remaining_overlap_ids(state):
        occupied_geometries = []
        for entity in sorted(state["objects"], key=_layout_sort_key):
            entity["geometry"] = _find_non_overlapping_geometry(
                NO_OVERLAP_LAYOUT_RULE,
                context,
                entity["id"],
                [deepcopy(entity["geometry"])],
                occupied_geometries,
            )
            occupied_geometries.append((entity["id"], deepcopy(entity["geometry"])))

    remaining_overlaps = _find_remaining_overlap_ids(state)
    if remaining_overlaps:
        first_left, first_right = remaining_overlaps[0]
        raise_rule_violation(
            NO_OVERLAP_LAYOUT_RULE,
            context,
            code="layout_overlap_persisted",
            message=(
                "Layout resolution failed: "
                f"objects {first_left!r} and {first_right!r} still overlap after repair."
            ),
            details={"firstEntityId": first_left, "secondEntityId": first_right},
        )

    effects = []
    adjustment_sort_key = {}
    for index, object_id in enumerate(affected_ids):
        adjustment_sort_key[object_id] = (0, index, object_id)
    untouched_index = 0
    for entity in sorted(state["objects"], key=_layout_sort_key):
        if entity["id"] not in adjustment_sort_key:
            adjustment_sort_key[entity["id"]] = (1, untouched_index, entity["id"])
            untouched_index += 1

    adjusted_ids = []
    for entity in state["objects"]:
        before_geometry = original_geometries[entity["id"]]
        after_geometry = entity["geometry"]
        if before_geometry == after_geometry:
            continue
        adjusted_ids.append(entity["id"])
        effects.append(
            RuleEffect(
                rule=NO_OVERLAP_LAYOUT_RULE.name,
                phase=context.phase,
                kind="restore_geometry",
                undo_payload={
                    "entityId": entity["id"],
                    "geometry": before_geometry,
                },
                details={
                    "id": entity["id"],
                    "from": {
                        "x": before_geometry["x"],
                        "y": before_geometry["y"],
                    },
                    "to": {
                        "x": after_geometry["x"],
                        "y": after_geometry["y"],
                    },
                },
            )
        )

    effects.sort(key=lambda item: adjustment_sort_key[item.details["id"]])
    context.batch_metadata["layout_adjusted_ids"] = list(adjusted_ids)
    return effects


def _run_no_overlap_layout(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_no_overlap_layout(context)


def _alignment_target_ids(context: RuleContext) -> List[str]:
    lookup = object_lookup(context.state)
    order_map = context.batch_metadata.get("layout_affected_order_map", {})
    ordered_targets = _sort_ids_by_layout_priority(
        [object_id for object_id in object_ids_in_order(context.state) if object_id in order_map],
        order_map,
    )

    seen = set()
    targets = []
    for object_id in ordered_targets:
        if object_id in lookup and object_id not in seen:
            targets.append(object_id)
            seen.add(object_id)

    for object_id in context.batch_metadata.get("layout_adjusted_ids", []):
        if object_id in lookup and object_id not in seen:
            targets.append(object_id)
            seen.add(object_id)

    return targets


def _apply_alignment_layout(context: RuleContext) -> List[RuleEffect]:
    state = context.state
    if not state["objects"]:
        return []

    target_ids = _alignment_target_ids(context)
    if not target_ids:
        return []

    lookup = object_lookup(state)
    original_geometries = {
        object_id: deepcopy(entity["geometry"])
        for object_id, entity in lookup.items()
    }
    row_anchors = _build_axis_anchors(state, "y")
    column_anchors = _build_axis_anchors(state, "x")
    occupied_geometries = [
        (object_id, deepcopy(entity["geometry"]))
        for object_id, entity in lookup.items()
        if object_id not in target_ids
    ]

    for object_id in target_ids:
        entity = lookup[object_id]
        desired_geometries = _aligned_desired_geometries(
            entity["geometry"],
            row_anchors=row_anchors,
            column_anchors=column_anchors,
        )
        entity["geometry"] = _find_non_overlapping_geometry(
            ALIGNMENT_LAYOUT_RULE,
            context,
            object_id,
            desired_geometries,
            occupied_geometries,
        )
        occupied_geometries.append((object_id, deepcopy(entity["geometry"])))

    remaining_overlaps = _find_remaining_overlap_ids(state)
    if remaining_overlaps:
        first_left, first_right = remaining_overlaps[0]
        raise_rule_violation(
            ALIGNMENT_LAYOUT_RULE,
            context,
            code="layout_overlap_persisted",
            message=(
                "Alignment resolution failed: "
                f"objects {first_left!r} and {first_right!r} still overlap after repair."
            ),
            details={"firstEntityId": first_left, "secondEntityId": first_right},
        )

    effects = []
    for object_id in target_ids:
        before_geometry = original_geometries[object_id]
        after_geometry = lookup[object_id]["geometry"]
        if before_geometry == after_geometry:
            continue
        effects.append(
            RuleEffect(
                rule=ALIGNMENT_LAYOUT_RULE.name,
                phase=context.phase,
                kind="restore_geometry",
                undo_payload={
                    "entityId": object_id,
                    "geometry": before_geometry,
                },
                details={
                    "id": object_id,
                    "from": {
                        "x": before_geometry["x"],
                        "y": before_geometry["y"],
                    },
                    "to": {
                        "x": after_geometry["x"],
                        "y": after_geometry["y"],
                    },
                },
            )
        )

    return effects


def _run_alignment_layout(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_alignment_layout(context)


NO_OVERLAP_LAYOUT_RULE = CanvasRule(
    name="no_overlap_layout",
    phase="post_batch",
    ops=None,
    kind="auto_fix",
    priority=100,
    planner_guidance=(
        "Avoid overlapping existing objects when placing or moving notes and labels, and leave visible gaps with simple rows or columns.",
    ),
    repair_hint="Spread objects across rows or columns with clear gaps, and avoid reusing occupied positions.",
    run=_run_no_overlap_layout,
)

ALIGNMENT_LAYOUT_RULE = CanvasRule(
    name="alignment_layout",
    phase="post_batch",
    ops=None,
    kind="auto_fix",
    priority=110,
    planner_guidance=(
        "Prefer aligned rows or columns with consistent top or left edges instead of staggered placements.",
    ),
    repair_hint="Align objects into shared rows or columns with consistent edges and even gaps.",
    run=_run_alignment_layout,
)

LAYOUT_RULES = (NO_OVERLAP_LAYOUT_RULE, ALIGNMENT_LAYOUT_RULE)
