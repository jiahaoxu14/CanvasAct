import math
from copy import deepcopy
from typing import Dict, List, Optional, Tuple


CANVAS_BOUNDS = {
    "left": -2000,
    "top": -2000,
    "right": 6000,
    "bottom": 6000,
}
LAYOUT_POLICY_VALUES = ("none", "no-overlap")
NO_OVERLAP_GRID_SIZE = 24
NO_OVERLAP_SPACING = 24
ALIGNMENT_CLUSTER_TOLERANCE = 48
CLUSTER_ADJACENCY_THRESHOLD = 160
INTRACLUSTER_GAP = 24
HEADING_VERTICAL_OFFSET = 48

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


def find_entity(state: dict, entity_id: str) -> Optional[Tuple[str, int, dict]]:
    for collection_name in ("objects", "connectors"):
        for index, entity in enumerate(state[collection_name]):
            if entity["id"] == entity_id:
                return collection_name, index, entity
    return None


def entity_ids(state: dict) -> set:
    ids = set()
    for collection_name in ("objects", "connectors"):
        ids.update(entity["id"] for entity in state[collection_name])
    return ids


def node_ids(state: dict) -> set:
    return {entity["id"] for entity in state["objects"]}


def canonical_selection(state: dict) -> List[str]:
    existing_ids = entity_ids(state)
    selection = []
    seen = set()
    for entity_id in state["selection"]:
        if entity_id in existing_ids and entity_id not in seen:
            selection.append(entity_id)
            seen.add(entity_id)
    return selection


def geometry_fits_canvas(geometry: dict) -> bool:
    return (
        geometry["x"] >= CANVAS_BOUNDS["left"]
        and geometry["y"] >= CANVAS_BOUNDS["top"]
        and geometry["x"] + geometry["w"] <= CANVAS_BOUNDS["right"]
        and geometry["y"] + geometry["h"] <= CANVAS_BOUNDS["bottom"]
    )


def fit_text_label_geometry(geometry: dict, text: Optional[str]) -> dict:
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


def prospective_create_geometry(action: dict) -> dict:
    geometry = deepcopy(action["geometry"])
    if action["object_type"] == "text-label":
        return fit_text_label_geometry(geometry, action.get("text"))
    return geometry


def handle_point(geometry: dict, handle: str) -> dict:
    if handle == "left":
        return {"x": geometry["x"], "y": geometry["y"] + geometry["h"] / 2}
    if handle == "top":
        return {"x": geometry["x"] + geometry["w"] / 2, "y": geometry["y"]}
    if handle == "bottom":
        return {
            "x": geometry["x"] + geometry["w"] / 2,
            "y": geometry["y"] + geometry["h"],
        }
    return {"x": geometry["x"] + geometry["w"], "y": geometry["y"] + geometry["h"] / 2}


def compute_connector_geometry(state: dict, connector: dict) -> Optional[dict]:
    source_result = find_entity(state, connector["source"])
    target_result = find_entity(state, connector["target"])
    if source_result is None or target_result is None:
        return None

    source_geometry = source_result[2]["geometry"]
    target_geometry = target_result[2]["geometry"]
    return {
        "sourcePoint": handle_point(
            source_geometry,
            connector.get("sourceHandle", "right"),
        ),
        "targetPoint": handle_point(
            target_geometry,
            connector.get("targetHandle", "left"),
        ),
    }


def geometry_signature(geometry: dict) -> Tuple[float, float, float, float]:
    return (
        geometry["x"],
        geometry["y"],
        geometry["w"],
        geometry["h"],
    )


def rectangles_overlap(a: dict, b: dict, spacing: int = NO_OVERLAP_SPACING) -> bool:
    return not (
        a["x"] + a["w"] + spacing <= b["x"]
        or b["x"] + b["w"] + spacing <= a["x"]
        or a["y"] + a["h"] + spacing <= b["y"]
        or b["y"] + b["h"] + spacing <= a["y"]
    )


def object_lookup(state: dict) -> Dict[str, dict]:
    return {entity["id"]: entity for entity in state["objects"]}


def object_ids_in_order(state: dict) -> List[str]:
    return [entity["id"] for entity in state["objects"]]
