from typing import Optional


OBJECT_TYPES = {"sticky-note", "text-label"}


def empty_canvas_state() -> dict:
    return {
        "objects": [],
        "connectors": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "selection": [],
    }


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_geometry(geometry: object, path: str) -> Optional[str]:
    if not isinstance(geometry, dict):
        return f"'{path}' must be an object."

    for key in ("x", "y", "w", "h"):
        if not _is_number(geometry.get(key)):
            return f"'{path}.{key}' must be numeric."

    return None


def _validate_point(point: object, path: str) -> Optional[str]:
    if not isinstance(point, dict):
        return f"'{path}' must be an object."

    for key in ("x", "y"):
        if not _is_number(point.get(key)):
            return f"'{path}.{key}' must be numeric."

    return None


def validate_canvas_state(payload: object) -> Optional[str]:
    if not isinstance(payload, dict):
        return "Canvas state must be a JSON object."

    for key in ("objects", "connectors", "selection"):
        if not isinstance(payload.get(key), list):
            return f"'{key}' must be a list."

    viewport = payload.get("viewport")
    if not isinstance(viewport, dict):
        return "'viewport' must be an object."

    for key in ("x", "y", "zoom"):
        if not _is_number(viewport.get(key)):
            return f"'viewport.{key}' must be numeric."

    for index, item in enumerate(payload["objects"]):
        if not isinstance(item, dict):
            return f"'objects[{index}]' must be an object."
        if not isinstance(item.get("id"), str) or not item["id"]:
            return f"'objects[{index}].id' is required."
        if item.get("type") not in OBJECT_TYPES:
            return (
                f"'objects[{index}].type' must be one of "
                f"{sorted(OBJECT_TYPES)}."
            )
        if not isinstance(item.get("content"), dict):
            return f"'objects[{index}].content' must be an object."

        geometry_error = _validate_geometry(
            item.get("geometry"),
            f"objects[{index}].geometry",
        )
        if geometry_error:
            return geometry_error

    for index, item in enumerate(payload["connectors"]):
        if not isinstance(item, dict):
            return f"'connectors[{index}]' must be an object."
        for key in ("id", "type", "source", "target"):
            if not isinstance(item.get(key), str) or not item[key]:
                return f"'connectors[{index}].{key}' is required."
        if item["type"] != "connector":
            return f"'connectors[{index}].type' must be 'connector'."
        if not isinstance(item.get("content"), dict):
            return f"'connectors[{index}].content' must be an object."

        for key in ("sourceHandle", "targetHandle"):
            value = item.get(key)
            if value is not None and (not isinstance(value, str) or not value):
                return (
                    f"'connectors[{index}].{key}' must be a non-empty string "
                    "when provided."
                )

        geometry = item.get("geometry")
        if geometry is not None:
            if not isinstance(geometry, dict):
                return (
                    f"'connectors[{index}].geometry' must be an object "
                    "when provided."
                )
            for key in ("sourcePoint", "targetPoint"):
                point_error = _validate_point(
                    geometry.get(key),
                    f"connectors[{index}].geometry.{key}",
                )
                if point_error:
                    return point_error

    for index, item in enumerate(payload["selection"]):
        if not isinstance(item, str) or not item:
            return f"'selection[{index}]' must be a non-empty string."

    return None
