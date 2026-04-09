import math
from copy import deepcopy
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .common import raise_rule_violation, restore_connector_handles_effect
from .helpers import (
    ALIGNMENT_CLUSTER_TOLERANCE,
    CANVAS_BOUNDS,
    CLUSTER_ADJACENCY_THRESHOLD,
    HANDLE_VALUES,
    HEADING_VERTICAL_OFFSET,
    INTRACLUSTER_GAP,
    NO_OVERLAP_GRID_SIZE,
    geometry_fits_canvas,
    geometry_signature,
    handle_point,
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


def _grid_gap(value: float) -> int:
    return max(
        INTRACLUSTER_GAP,
        int(round(value / NO_OVERLAP_GRID_SIZE) * NO_OVERLAP_GRID_SIZE),
    )


def _layout_sort_key(entity: dict) -> Tuple[float, float, str]:
    return (
        entity["geometry"]["y"],
        entity["geometry"]["x"],
        entity["id"],
    )


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
    object_ids: Sequence[str],
    order_map: Dict[str, int],
) -> List[str]:
    return sorted(
        object_ids,
        key=lambda object_id: (
            order_map.get(object_id, math.inf),
            object_id,
        ),
    )


def _append_layout_adjusted_ids(context: RuleContext, changed_ids: Sequence[str]) -> None:
    adjusted_ids = context.batch_metadata.setdefault("layout_adjusted_ids", [])
    seen = set(adjusted_ids)
    for object_id in changed_ids:
        if object_id in seen:
            continue
        adjusted_ids.append(object_id)
        seen.add(object_id)


def _layout_target_ids(
    context: RuleContext,
    *,
    object_type: Optional[str] = None,
) -> List[str]:
    lookup = object_lookup(context.state)
    order_map = context.batch_metadata.get("layout_affected_order_map", {})
    ordered_targets = _sort_ids_by_layout_priority(
        [object_id for object_id in object_ids_in_order(context.state) if object_id in order_map],
        order_map,
    )

    seen = set()
    targets = []
    for object_id in ordered_targets:
        entity = lookup.get(object_id)
        if entity is None or object_id in seen:
            continue
        if object_type is not None and entity["type"] != object_type:
            continue
        targets.append(object_id)
        seen.add(object_id)

    for object_id in context.batch_metadata.get("layout_adjusted_ids", []):
        entity = lookup.get(object_id)
        if entity is None or object_id in seen:
            continue
        if object_type is not None and entity["type"] != object_type:
            continue
        targets.append(object_id)
        seen.add(object_id)

    return targets


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


def _layout_effect_for_geometry(
    rule: CanvasRule,
    context: RuleContext,
    *,
    object_id: str,
    before_geometry: dict,
    after_geometry: dict,
) -> RuleEffect:
    return RuleEffect(
        rule=rule.name,
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


def _object_geometry_effects(
    rule: CanvasRule,
    context: RuleContext,
    original_geometries: Dict[str, dict],
    current_lookup: Dict[str, dict],
    ordered_ids: Optional[Sequence[str]] = None,
) -> List[RuleEffect]:
    changed_ids = []
    effects = []
    ids = ordered_ids or list(original_geometries.keys())
    for object_id in ids:
        before_geometry = original_geometries[object_id]
        after_geometry = current_lookup[object_id]["geometry"]
        if before_geometry == after_geometry:
            continue
        changed_ids.append(object_id)
        effects.append(
            _layout_effect_for_geometry(
                rule,
                context,
                object_id=object_id,
                before_geometry=before_geometry,
                after_geometry=after_geometry,
            )
        )
    _append_layout_adjusted_ids(context, changed_ids)
    return effects


def _rect_gap(first: dict, second: dict, axis: str) -> float:
    if axis == "x":
        return second["geometry"]["x"] - (first["geometry"]["x"] + first["geometry"]["w"])
    return second["geometry"]["y"] - (first["geometry"]["y"] + first["geometry"]["h"])


def _cluster_bbox(cluster: Sequence[dict]) -> dict:
    left = min(item["geometry"]["x"] for item in cluster)
    top = min(item["geometry"]["y"] for item in cluster)
    right = max(item["geometry"]["x"] + item["geometry"]["w"] for item in cluster)
    bottom = max(item["geometry"]["y"] + item["geometry"]["h"] for item in cluster)
    return {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "w": right - left,
        "h": bottom - top,
    }


def _split_axis_clusters(
    entities: Sequence[dict],
    *,
    axis: str,
    orth_axis: str,
    anchors: List[int],
) -> List[List[dict]]:
    clusters_by_anchor: Dict[int, List[dict]] = {}
    for entity in entities:
        anchor = _nearest_alignment_anchor(entity["geometry"][orth_axis], anchors)
        clusters_by_anchor.setdefault(anchor, []).append(entity)

    output = []
    sort_axis = "x" if axis == "x" else "y"
    for anchor in sorted(clusters_by_anchor):
        items = sorted(
            clusters_by_anchor[anchor],
            key=lambda item: (
                item["geometry"][sort_axis],
                item["id"],
            ),
        )
        current_cluster = [items[0]]
        for entity in items[1:]:
            gap = _rect_gap(current_cluster[-1], entity, axis)
            if gap > CLUSTER_ADJACENCY_THRESHOLD:
                output.append(current_cluster)
                current_cluster = [entity]
            else:
                current_cluster.append(entity)
        output.append(current_cluster)

    return [cluster for cluster in output if len(cluster) >= 2]


def _note_layout_clusters(notes: Sequence[dict], state: dict) -> List[Tuple[str, List[dict]]]:
    if len(notes) < 2:
        return []

    y_spread = max(item["geometry"]["y"] for item in notes) - min(
        item["geometry"]["y"] for item in notes
    )
    x_spread = max(item["geometry"]["x"] for item in notes) - min(
        item["geometry"]["x"] for item in notes
    )
    if y_spread <= ALIGNMENT_CLUSTER_TOLERANCE and x_spread > y_spread:
        return [
            (
                "row",
                sorted(notes, key=lambda item: (item["geometry"]["x"], item["id"])),
            )
        ]
    if x_spread <= ALIGNMENT_CLUSTER_TOLERANCE and y_spread > x_spread:
        return [
            (
                "column",
                sorted(notes, key=lambda item: (item["geometry"]["y"], item["id"])),
            )
        ]

    row_anchors = _build_axis_anchors(state, "y")
    column_anchors = _build_axis_anchors(state, "x")
    remaining = {entity["id"]: entity for entity in notes}
    clusters: List[Tuple[str, List[dict]]] = []

    row_clusters = sorted(
        _split_axis_clusters(notes, axis="x", orth_axis="y", anchors=row_anchors),
        key=lambda cluster: (
            _cluster_bbox(cluster)["top"],
            _cluster_bbox(cluster)["left"],
            tuple(item["id"] for item in cluster),
        ),
    )
    for cluster in row_clusters:
        cluster_ids = [item["id"] for item in cluster]
        if any(item_id not in remaining for item_id in cluster_ids):
            continue
        clusters.append(("row", cluster))
        for item_id in cluster_ids:
            remaining.pop(item_id, None)

    if len(remaining) >= 2:
        column_clusters = sorted(
            _split_axis_clusters(
                list(remaining.values()),
                axis="y",
                orth_axis="x",
                anchors=column_anchors,
            ),
            key=lambda cluster: (
                _cluster_bbox(cluster)["left"],
                _cluster_bbox(cluster)["top"],
                tuple(item["id"] for item in cluster),
            ),
        )
        for cluster in column_clusters:
            cluster_ids = [item["id"] for item in cluster]
            if any(item_id not in remaining for item_id in cluster_ids):
                continue
            clusters.append(("column", cluster))
            for item_id in cluster_ids:
                remaining.pop(item_id, None)

    return clusters


def _spacing_target_gap(cluster: Sequence[dict], orientation: str) -> int:
    axis = "x" if orientation == "row" else "y"
    ordered = sorted(
        cluster,
        key=lambda item: (
            item["geometry"][axis],
            item["id"],
        ),
    )
    if len(ordered) < 2:
        return INTRACLUSTER_GAP

    gaps = []
    for index in range(len(ordered) - 1):
        gap = _rect_gap(ordered[index], ordered[index + 1], axis)
        gaps.append(max(INTRACLUSTER_GAP, gap))

    gaps.sort()
    median_gap = gaps[len(gaps) // 2]
    return _grid_gap(median_gap)


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

    adjustment_sort_key = {}
    for index, object_id in enumerate(affected_ids):
        adjustment_sort_key[object_id] = (0, index, object_id)
    untouched_index = 0
    for entity in sorted(state["objects"], key=_layout_sort_key):
        if entity["id"] not in adjustment_sort_key:
            adjustment_sort_key[entity["id"]] = (1, untouched_index, entity["id"])
            untouched_index += 1

    effects = _object_geometry_effects(
        NO_OVERLAP_LAYOUT_RULE,
        context,
        original_geometries,
        lookup,
        ordered_ids=sorted(
            original_geometries.keys(),
            key=lambda object_id: adjustment_sort_key[object_id],
        ),
    )
    return effects


def _run_no_overlap_layout(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_no_overlap_layout(context)


def _apply_alignment_layout(context: RuleContext) -> List[RuleEffect]:
    state = context.state
    target_ids = _layout_target_ids(context)
    if not target_ids:
        return []

    lookup = object_lookup(state)
    original_geometries = {
        object_id: deepcopy(lookup[object_id]["geometry"])
        for object_id in target_ids
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

    return _object_geometry_effects(
        ALIGNMENT_LAYOUT_RULE,
        context,
        original_geometries,
        lookup,
        ordered_ids=target_ids,
    )


def _run_alignment_layout(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_alignment_layout(context)


def _apply_equalize_cluster_spacing(context: RuleContext) -> List[RuleEffect]:
    state = context.state
    target_note_ids = _layout_target_ids(context, object_type="sticky-note")
    if len(target_note_ids) < 2:
        return []

    lookup = object_lookup(state)
    target_notes = [lookup[object_id] for object_id in target_note_ids]
    clusters = _note_layout_clusters(target_notes, state)
    if not clusters:
        return []

    original_geometries = {
        object_id: deepcopy(lookup[object_id]["geometry"])
        for object_id in target_note_ids
    }
    cluster_target_ids = {
        item["id"]
        for _orientation, cluster in clusters
        for item in cluster
    }
    floating_label_ids = set(_layout_target_ids(context, object_type="text-label"))
    occupied_geometries = [
        (object_id, deepcopy(entity["geometry"]))
        for object_id, entity in lookup.items()
        if object_id not in cluster_target_ids and object_id not in floating_label_ids
    ]
    row_anchors = _build_axis_anchors(state, "y")
    column_anchors = _build_axis_anchors(state, "x")

    ordered_cluster_ids = []
    for orientation, cluster in clusters:
        cluster = sorted(
            cluster,
            key=lambda item: (
                item["geometry"]["x"] if orientation == "row" else item["geometry"]["y"],
                item["id"],
            ),
        )
        gap = _spacing_target_gap(cluster, orientation)
        if orientation == "row":
            anchor_y = _nearest_alignment_anchor(
                sum(item["geometry"]["y"] for item in cluster) / len(cluster),
                row_anchors,
            )
            cursor_x = min(item["geometry"]["x"] for item in cluster)
            for entity in cluster:
                desired_geometry = {
                    **deepcopy(entity["geometry"]),
                    "x": cursor_x,
                    "y": anchor_y,
                }
                entity["geometry"] = _find_non_overlapping_geometry(
                    EQUALIZE_CLUSTER_SPACING_RULE,
                    context,
                    entity["id"],
                    [desired_geometry],
                    occupied_geometries,
                )
                occupied_geometries.append((entity["id"], deepcopy(entity["geometry"])))
                cursor_x = entity["geometry"]["x"] + entity["geometry"]["w"] + gap
                ordered_cluster_ids.append(entity["id"])
        else:
            anchor_x = _nearest_alignment_anchor(
                sum(item["geometry"]["x"] for item in cluster) / len(cluster),
                column_anchors,
            )
            cursor_y = min(item["geometry"]["y"] for item in cluster)
            for entity in cluster:
                desired_geometry = {
                    **deepcopy(entity["geometry"]),
                    "x": anchor_x,
                    "y": cursor_y,
                }
                entity["geometry"] = _find_non_overlapping_geometry(
                    EQUALIZE_CLUSTER_SPACING_RULE,
                    context,
                    entity["id"],
                    [desired_geometry],
                    occupied_geometries,
                )
                occupied_geometries.append((entity["id"], deepcopy(entity["geometry"])))
                cursor_y = entity["geometry"]["y"] + entity["geometry"]["h"] + gap
                ordered_cluster_ids.append(entity["id"])

    return _object_geometry_effects(
        EQUALIZE_CLUSTER_SPACING_RULE,
        context,
        original_geometries,
        lookup,
        ordered_ids=ordered_cluster_ids,
    )


def _run_equalize_cluster_spacing(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_equalize_cluster_spacing(context)


def _heading_candidate_clusters(context: RuleContext) -> List[List[dict]]:
    lookup = object_lookup(context.state)
    target_note_ids = _layout_target_ids(context, object_type="sticky-note")
    if target_note_ids:
        clusters = _note_layout_clusters(
            [lookup[object_id] for object_id in target_note_ids],
            context.state,
        )
        if clusters:
            return [cluster for _orientation, cluster in clusters]

    all_notes = [entity for entity in context.state["objects"] if entity["type"] == "sticky-note"]
    return [cluster for _orientation, cluster in _note_layout_clusters(all_notes, context.state)]


def _heading_desired_geometries(label_geometry: dict, cluster: Sequence[dict]) -> List[dict]:
    bbox = _cluster_bbox(cluster)
    desired_geometries = [
        {
            **deepcopy(label_geometry),
            "x": bbox["left"],
            "y": bbox["top"] - label_geometry["h"] - HEADING_VERTICAL_OFFSET,
        },
        {
            **deepcopy(label_geometry),
            "x": bbox["left"] + (bbox["w"] - label_geometry["w"]) / 2,
            "y": bbox["top"] - label_geometry["h"] - HEADING_VERTICAL_OFFSET,
        },
        {
            **deepcopy(label_geometry),
            "x": bbox["left"],
            "y": bbox["bottom"] + HEADING_VERTICAL_OFFSET,
        },
    ]
    filtered = []
    seen = set()
    for geometry in desired_geometries:
        signature = geometry_signature(geometry)
        if signature in seen:
            continue
        seen.add(signature)
        if geometry_fits_canvas(geometry):
            filtered.append(geometry)
    return filtered or [deepcopy(label_geometry)]


def _cluster_heading_distance(label: dict, cluster: Sequence[dict]) -> Tuple[float, float, float]:
    bbox = _cluster_bbox(cluster)
    desired_x = bbox["left"]
    desired_y = bbox["top"] - label["geometry"]["h"] - HEADING_VERTICAL_OFFSET
    return (
        abs(label["geometry"]["x"] - desired_x) + abs(label["geometry"]["y"] - desired_y),
        bbox["top"],
        bbox["left"],
    )


def _apply_heading_placement(context: RuleContext) -> List[RuleEffect]:
    state = context.state
    target_label_ids = _layout_target_ids(context, object_type="text-label")
    if not target_label_ids:
        return []

    lookup = object_lookup(state)
    clusters = _heading_candidate_clusters(context)
    if not clusters:
        return []

    original_geometries = {
        object_id: deepcopy(lookup[object_id]["geometry"])
        for object_id in target_label_ids
    }
    occupied_geometries = [
        (object_id, deepcopy(entity["geometry"]))
        for object_id, entity in lookup.items()
        if object_id not in target_label_ids
    ]
    remaining_clusters = list(clusters)

    for object_id in target_label_ids:
        if not remaining_clusters:
            break
        label = lookup[object_id]
        cluster = min(
            remaining_clusters,
            key=lambda candidate: _cluster_heading_distance(label, candidate),
        )
        remaining_clusters.remove(cluster)
        desired_geometries = _heading_desired_geometries(label["geometry"], cluster)
        label["geometry"] = _find_non_overlapping_geometry(
            HEADING_PLACEMENT_RULE,
            context,
            object_id,
            desired_geometries,
            occupied_geometries,
        )
        occupied_geometries.append((object_id, deepcopy(label["geometry"])))

    return _object_geometry_effects(
        HEADING_PLACEMENT_RULE,
        context,
        original_geometries,
        lookup,
        ordered_ids=target_label_ids,
    )


def _run_heading_placement(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_heading_placement(context)


def _connector_segment(
    state: dict,
    connector: dict,
    *,
    source_handle: Optional[str] = None,
    target_handle: Optional[str] = None,
) -> Optional[Tuple[dict, dict]]:
    lookup = object_lookup(state)
    source = lookup.get(connector["source"])
    target = lookup.get(connector["target"])
    if source is None or target is None:
        return None

    source_point = handle_point(
        source["geometry"],
        source_handle or connector.get("sourceHandle", "right"),
    )
    target_point = handle_point(
        target["geometry"],
        target_handle or connector.get("targetHandle", "left"),
    )
    return source_point, target_point


def _point_equal(first: dict, second: dict, epsilon: float = 1e-6) -> bool:
    return abs(first["x"] - second["x"]) <= epsilon and abs(first["y"] - second["y"]) <= epsilon


def _orientation(first: dict, second: dict, third: dict) -> float:
    return (
        (second["y"] - first["y"]) * (third["x"] - second["x"])
        - (second["x"] - first["x"]) * (third["y"] - second["y"])
    )


def _segments_strictly_intersect(first: Tuple[dict, dict], second: Tuple[dict, dict]) -> bool:
    first_start, first_end = first
    second_start, second_end = second
    if any(
        _point_equal(point_a, point_b)
        for point_a in (first_start, first_end)
        for point_b in (second_start, second_end)
    ):
        return False

    o1 = _orientation(first_start, first_end, second_start)
    o2 = _orientation(first_start, first_end, second_end)
    o3 = _orientation(second_start, second_end, first_start)
    o4 = _orientation(second_start, second_end, first_end)
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


def _crossing_angle_degrees(first: Tuple[dict, dict], second: Tuple[dict, dict]) -> float:
    first_dx = first[1]["x"] - first[0]["x"]
    first_dy = first[1]["y"] - first[0]["y"]
    second_dx = second[1]["x"] - second[0]["x"]
    second_dy = second[1]["y"] - second[0]["y"]
    first_length = math.hypot(first_dx, first_dy)
    second_length = math.hypot(second_dx, second_dy)
    if first_length == 0 or second_length == 0:
        return 0.0

    cosine = abs(
        (first_dx * second_dx + first_dy * second_dy) / (first_length * second_length)
    )
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def _segment_length(segment: Tuple[dict, dict]) -> float:
    return math.hypot(
        segment[1]["x"] - segment[0]["x"],
        segment[1]["y"] - segment[0]["y"],
    )


def _target_connector_ids(context: RuleContext) -> List[str]:
    state = context.state
    connector_order_map = context.batch_metadata.get("connector_affected_order_map", {})
    target_object_ids = set(_layout_target_ids(context))

    connector_ids = []
    for connector in state["connectors"]:
        if connector["id"] in connector_order_map:
            connector_ids.append(connector["id"])
            continue
        if connector["source"] in target_object_ids or connector["target"] in target_object_ids:
            connector_ids.append(connector["id"])

    return sorted(
        connector_ids,
        key=lambda connector_id: (
            connector_order_map.get(connector_id, math.inf),
            connector_id,
        ),
    )


def _connector_candidate_score(
    state: dict,
    connector: dict,
    *,
    source_handle: str,
    target_handle: str,
    other_connectors: Sequence[dict],
) -> Tuple[float, float, int, int, int]:
    segment = _connector_segment(
        state,
        connector,
        source_handle=source_handle,
        target_handle=target_handle,
    )
    if segment is None:
        return (math.inf, math.inf, math.inf, math.inf, math.inf)

    crossings = 0
    minimum_angle = 90.0
    for other in other_connectors:
        if connector["id"] == other["id"]:
            continue
        if (
            connector["source"] in {other["source"], other["target"]}
            or connector["target"] in {other["source"], other["target"]}
        ):
            continue
        other_segment = _connector_segment(state, other)
        if other_segment is None or not _segments_strictly_intersect(segment, other_segment):
            continue
        crossings += 1
        minimum_angle = min(minimum_angle, _crossing_angle_degrees(segment, other_segment))

    crossing_score = crossings
    angle_score = -minimum_angle if crossings else -90.0
    length_score = _segment_length(segment)
    return (
        crossing_score,
        angle_score,
        int(round(length_score)),
        HANDLE_VALUES.index(source_handle),
        HANDLE_VALUES.index(target_handle),
    )


def _apply_connector_readability(context: RuleContext) -> List[RuleEffect]:
    state = context.state
    target_connector_ids = _target_connector_ids(context)
    if not target_connector_ids:
        return []

    connectors_by_id = {connector["id"]: connector for connector in state["connectors"]}
    baseline_connectors = {
        connector["id"]: {
            "sourceHandle": connector.get("sourceHandle", "right"),
            "targetHandle": connector.get("targetHandle", "left"),
        }
        for connector in state["connectors"]
    }
    locked_connectors = [
        deepcopy(connector)
        for connector in state["connectors"]
        if connector["id"] not in target_connector_ids
    ]
    effects = []

    for connector_id in target_connector_ids:
        connector = connectors_by_id[connector_id]
        current_handles = {
            "sourceHandle": connector.get("sourceHandle", "right"),
            "targetHandle": connector.get("targetHandle", "left"),
        }
        locked_ids = {item["id"] for item in locked_connectors}
        comparison_connectors = locked_connectors + [
            deepcopy(connectors_by_id[item_id])
            for item_id in target_connector_ids
            if (
                item_id != connector_id
                and item_id in connectors_by_id
                and item_id not in locked_ids
            )
        ]
        current_score = _connector_candidate_score(
            state,
            connector,
            source_handle=current_handles["sourceHandle"],
            target_handle=current_handles["targetHandle"],
            other_connectors=comparison_connectors,
        )

        best_handles = dict(current_handles)
        best_score = (
            *current_score[:2],
            0,
            current_score[2],
            current_score[3],
            current_score[4],
        )
        for source_handle in HANDLE_VALUES:
            for target_handle in HANDLE_VALUES:
                score = _connector_candidate_score(
                    state,
                    connector,
                    source_handle=source_handle,
                    target_handle=target_handle,
                    other_connectors=comparison_connectors,
                )
                candidate_score = (
                    score[0],
                    score[1],
                    0 if (
                        source_handle == current_handles["sourceHandle"]
                        and target_handle == current_handles["targetHandle"]
                    ) else 1,
                    score[2],
                    score[3],
                    score[4],
                )
                if candidate_score < best_score:
                    best_score = candidate_score
                    best_handles = {
                        "sourceHandle": source_handle,
                        "targetHandle": target_handle,
                    }

        if best_handles == current_handles:
            locked_connectors.append(deepcopy(connector))
            continue

        connector["sourceHandle"] = best_handles["sourceHandle"]
        connector["targetHandle"] = best_handles["targetHandle"]
        effects.append(
            restore_connector_handles_effect(
                CONNECTOR_READABILITY_RULE,
                context,
                connector_id=connector_id,
                before_handles=current_handles,
                after_handles=best_handles,
            )
        )
        locked_connectors.append(deepcopy(connector))

    return effects


def _run_connector_readability(context: RuleContext):
    if context.options.get("layoutPolicy", "none") != "no-overlap":
        return []
    return _apply_connector_readability(context)


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

EQUALIZE_CLUSTER_SPACING_RULE = CanvasRule(
    name="equalize_cluster_spacing",
    phase="post_batch",
    ops=None,
    kind="auto_fix",
    priority=120,
    planner_guidance=(
        "Within a group, keep note spacing consistent instead of uneven gaps.",
    ),
    repair_hint="Use more even spacing within each note cluster.",
    run=_run_equalize_cluster_spacing,
)

HEADING_PLACEMENT_RULE = CanvasRule(
    name="heading_placement",
    phase="post_batch",
    ops=None,
    kind="auto_fix",
    priority=130,
    planner_guidance=(
        "Place text labels as headings above the clusters they describe, aligned to the cluster edge.",
    ),
    repair_hint="Place labels above the groups they describe instead of leaving them floating inside the layout.",
    run=_run_heading_placement,
)

CONNECTOR_READABILITY_RULE = CanvasRule(
    name="connector_readability",
    phase="post_batch",
    ops=None,
    kind="auto_fix",
    priority=140,
    planner_guidance=(
        "Reduce connector crossings when possible, and if crossings remain, prefer larger crossing angles.",
    ),
    repair_hint="Route connectors with cleaner attachment sides to reduce crossings and make the remaining crossings steeper.",
    run=_run_connector_readability,
)

LAYOUT_RULES = (
    NO_OVERLAP_LAYOUT_RULE,
    ALIGNMENT_LAYOUT_RULE,
    EQUALIZE_CLUSTER_SPACING_RULE,
    HEADING_PLACEMENT_RULE,
    CONNECTOR_READABILITY_RULE,
)
