from typing import Any, Dict, Optional

from .types import CanvasRule, RuleContext, RuleEffect, RuleViolation, RuleViolationError


def raise_rule_violation(
    rule: CanvasRule,
    context: RuleContext,
    *,
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    raise RuleViolationError(
        RuleViolation(
            code=code,
            rule=rule.name,
            phase=context.phase,
            op=context.op,
            message=message,
            details=dict(details or {}),
            repair_hint=rule.repair_hint,
        )
    )


def restore_geometry_effect(
    rule: CanvasRule,
    context: RuleContext,
    *,
    entity_id: str,
    before_geometry: dict,
    after_geometry: dict,
    detail_key: str = "entityId",
) -> RuleEffect:
    return RuleEffect(
        rule=rule.name,
        phase=context.phase,
        kind="restore_geometry",
        undo_payload={
            "entityId": entity_id,
            "geometry": before_geometry,
        },
        details={
            detail_key: entity_id,
            "beforeGeometry": before_geometry,
            "afterGeometry": after_geometry,
        },
    )


def restore_connector_handles_effect(
    rule: CanvasRule,
    context: RuleContext,
    *,
    connector_id: str,
    before_handles: dict,
    after_handles: dict,
) -> RuleEffect:
    return RuleEffect(
        rule=rule.name,
        phase=context.phase,
        kind="restore_connector_handles",
        undo_payload={
            "connectorId": connector_id,
            "sourceHandle": before_handles["sourceHandle"],
            "targetHandle": before_handles["targetHandle"],
        },
        details={
            "connectorId": connector_id,
            "beforeHandles": dict(before_handles),
            "afterHandles": dict(after_handles),
        },
    )
