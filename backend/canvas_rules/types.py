from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Sequence, Tuple


@dataclass
class RuleEffect:
    rule: str
    phase: str
    kind: str
    undo_payload: Dict[str, Any] = field(default_factory=dict)
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RuleViolation:
    code: str
    rule: str
    phase: str
    op: Optional[str]
    message: str
    details: Dict[str, Any] = field(default_factory=dict)
    repair_hint: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        payload = {
            "code": self.code,
            "rule": self.rule,
            "phase": self.phase,
            "op": self.op,
            "message": self.message,
            "details": dict(self.details),
        }
        if self.repair_hint:
            payload["repairHint"] = self.repair_hint
        return payload


class RuleViolationError(Exception):
    def __init__(self, violation: RuleViolation):
        self.violation = violation
        super().__init__(violation.message)


@dataclass
class RuleContext:
    phase: str
    state: dict
    action: Optional[dict] = None
    action_index: Optional[int] = None
    handler: Any = None
    action_context: Optional[dict] = None
    batch_metadata: Dict[str, Any] = field(default_factory=dict)
    options: Dict[str, Any] = field(default_factory=dict)

    @property
    def op(self) -> Optional[str]:
        if not isinstance(self.action, dict):
            return None
        return self.action.get("op")


@dataclass(frozen=True)
class CanvasRule:
    name: str
    phase: str
    ops: Optional[Tuple[str, ...]]
    kind: str
    priority: int
    planner_guidance: Tuple[str, ...] = ()
    repair_hint: Optional[str] = None
    run: Callable[[RuleContext], Optional[Sequence[RuleEffect]]] = lambda _context: ()

    def applies_to(self, op: Optional[str]) -> bool:
        return self.ops is None or op in self.ops
