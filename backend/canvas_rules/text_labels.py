from copy import deepcopy

from .common import restore_geometry_effect
from .helpers import find_entity, fit_text_label_geometry
from .types import CanvasRule, RuleContext


def _run_text_label_auto_fit(context: RuleContext):
    action = context.action
    target_id = None

    if action["op"] == "Create" and action["object_type"] == "text-label":
        target_id = action["id"]
    elif action["op"] == "Annotate":
        result = find_entity(context.state, action["target"])
        if result is not None and result[0] == "objects" and result[2]["type"] == "text-label":
            target_id = action["target"]

    if target_id is None:
        return []

    result = find_entity(context.state, target_id)
    if result is None or result[0] != "objects":
        return []

    entity = result[2]
    before_geometry = deepcopy(entity["geometry"])
    after_geometry = fit_text_label_geometry(
        entity["geometry"],
        entity["content"].get("text", ""),
    )
    if before_geometry == after_geometry:
        return []

    entity["geometry"] = after_geometry
    return [
        restore_geometry_effect(
            TEXT_LABEL_AUTO_FIT_RULE,
            context,
            entity_id=target_id,
            before_geometry=before_geometry,
            after_geometry=after_geometry,
        )
    ]


TEXT_LABEL_AUTO_FIT_RULE = CanvasRule(
    name="text_label_auto_fit",
    phase="post_action",
    ops=("Create", "Annotate"),
    kind="auto_fix",
    priority=100,
    planner_guidance=(
        "Text-label objects automatically resize to fit their text after Create and Annotate.",
    ),
    run=_run_text_label_auto_fit,
)

TEXT_LABEL_RULES = (TEXT_LABEL_AUTO_FIT_RULE,)
