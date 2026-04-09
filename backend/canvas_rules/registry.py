from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from .action_checks import ACTION_RULES
from .layout import LAYOUT_RULES
from .text_labels import TEXT_LABEL_RULES
from .types import CanvasRule, RuleContext, RuleEffect, RuleViolationError

PHASE_ORDER = {
    "pre_action": 0,
    "post_action": 1,
    "post_batch": 2,
}


@dataclass(frozen=True)
class RuleRegistry:
    rules: Tuple[CanvasRule, ...]

    def __post_init__(self):
        object.__setattr__(
            self,
            "rules",
            tuple(
                sorted(
                    self.rules,
                    key=lambda rule: (
                        PHASE_ORDER.get(rule.phase, 99),
                        rule.priority,
                        rule.name,
                    ),
                )
            ),
        )

    def get_rules(self, phase: str, op: Optional[str] = None) -> Tuple[CanvasRule, ...]:
        return tuple(
            rule
            for rule in self.rules
            if rule.phase == phase and rule.applies_to(op)
        )

    def collect_planner_guidance(self) -> List[str]:
        guidance = []
        seen = set()
        for rule in self.rules:
            for line in rule.planner_guidance:
                if not line or line in seen:
                    continue
                guidance.append(line)
                seen.add(line)
        return guidance

    def run(self, context: RuleContext) -> List[RuleEffect]:
        effects: List[RuleEffect] = []
        for rule in self.get_rules(context.phase, context.op):
            produced = rule.run(context)
            if not produced:
                continue
            effects.extend(list(produced))
        return effects


DEFAULT_RULE_REGISTRY = RuleRegistry(
    rules=(
        *ACTION_RULES,
        *TEXT_LABEL_RULES,
        *LAYOUT_RULES,
    )
)


def registry_with_rules(rules: Iterable[CanvasRule]) -> RuleRegistry:
    return RuleRegistry(tuple(rules))
