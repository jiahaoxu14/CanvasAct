import unittest
from copy import deepcopy
from unittest.mock import patch

from app import create_app
from canvas_rules import (
    DEFAULT_RULE_REGISTRY,
    CanvasRule,
    RuleContext,
    RuleViolation,
    RuleViolationError,
    registry_with_rules,
)
from canvas_actions import (
    CANVAS_BOUNDS,
    CanvasActionPreconditionError,
    execute_action_batch,
    undo_executed_actions,
)
from llm_planner import (
    LLMPlannerUpstreamError,
    build_action_repair_prompt,
    build_action_system_prompt,
    build_action_user_prompt,
    build_subgoal_system_prompt,
    build_subgoal_user_prompt,
    plan_actions_with_llm,
    plan_subgoals_with_llm,
    resolve_action_references,
    validate_action_response,
    validate_subgoal_response,
)


def sample_canvas_state() -> dict:
    return {
        "objects": [
            {
                "id": "n1",
                "type": "sticky-note",
                "content": {"text": "collect papers"},
                "geometry": {"x": 120, "y": 100, "w": 180, "h": 100},
            },
            {
                "id": "n2",
                "type": "sticky-note",
                "content": {"text": "evaluation checklist"},
                "geometry": {"x": 360, "y": 110, "w": 180, "h": 100},
            },
            {
                "id": "n3",
                "type": "sticky-note",
                "content": {"text": "evaluation rubric"},
                "geometry": {"x": 220, "y": 280, "w": 180, "h": 100},
            },
            {
                "id": "n4",
                "type": "text-label",
                "content": {"text": "Methods"},
                "geometry": {"x": 620, "y": 80, "w": 220, "h": 80},
            },
        ],
        "connectors": [
            {
                "id": "c1",
                "type": "connector",
                "content": {"label": "next"},
                "source": "n1",
                "target": "n2",
                "sourceHandle": "right",
                "targetHandle": "left",
                "geometry": {
                    "sourcePoint": {"x": 300, "y": 150},
                    "targetPoint": {"x": 360, "y": 160},
                },
            }
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "selection": ["n1", "n2"],
    }


def overlapping_canvas_state() -> dict:
    state = sample_canvas_state()
    for item in state["objects"]:
        if item["id"] == "n2":
            item["geometry"]["x"] = 180
            item["geometry"]["y"] = 100
    return state


def full_canvas_state() -> dict:
    return {
        "objects": [
            {
                "id": "n1",
                "type": "sticky-note",
                "content": {"text": "Occupies everything"},
                "geometry": {
                    "x": CANVAS_BOUNDS["left"],
                    "y": CANVAS_BOUNDS["top"],
                    "w": CANVAS_BOUNDS["right"] - CANVAS_BOUNDS["left"],
                    "h": CANVAS_BOUNDS["bottom"] - CANVAS_BOUNDS["top"],
                },
            }
        ],
        "connectors": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "selection": [],
    }


def blank_canvas_state() -> dict:
    return {
        "objects": [],
        "connectors": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "selection": [],
    }


def rectangles_overlap(first: dict, second: dict, spacing: int = 24) -> bool:
    return not (
        first["x"] + first["w"] + spacing <= second["x"]
        or second["x"] + second["w"] + spacing <= first["x"]
        or first["y"] + first["h"] + spacing <= second["y"]
        or second["y"] + second["h"] + spacing <= first["y"]
    )


def assert_no_object_overlap(test_case: unittest.TestCase, canvas_state: dict) -> None:
    objects = canvas_state["objects"]
    for index, first in enumerate(objects):
        for second in objects[index + 1 :]:
            test_case.assertFalse(
                rectangles_overlap(first["geometry"], second["geometry"]),
                f"Objects {first['id']} and {second['id']} overlapped.",
            )


class PromptContractTests(unittest.TestCase):
    def test_subgoal_prompt_includes_allowed_actions_and_forbids_invented_ids(self):
        prompt = build_subgoal_system_prompt(sample_canvas_state())
        user_prompt = build_subgoal_user_prompt(
            "Group these notes into themes and make a simple pipeline."
        )

        self.assertIn("Prompt 1 returns subgoals only.", prompt)
        self.assertIn("Allowed action set:", prompt)
        self.assertIn("Create", prompt)
        self.assertIn("Delete", prompt)
        self.assertIn("Never invent nonexistent objects, connectors, or IDs.", prompt)
        self.assertNotIn("GroupIntoFrame", prompt)
        self.assertNotIn("frames", prompt)
        self.assertIn("CURRENT_CANVAS_STATE_JSON", prompt)
        self.assertIn("Decompose this whiteboard instruction into subgoals:", user_prompt)

    def test_action_prompt_includes_current_ids_candidates_and_bounds(self):
        prompt = build_action_system_prompt(sample_canvas_state())
        user_prompt = build_action_user_prompt(
            "cluster selected notes into themes",
            {
                "resolvedReferences": [
                    {
                        "surfaceText": "selected notes",
                        "candidateIds": ["n1", "n2"],
                        "rule": "selection",
                        "status": "resolved",
                        "entityScope": "objects",
                        "reason": "Resolved from the current selection.",
                    }
                ],
                "ambiguousReferences": [],
                "unresolvedReferences": [],
            },
            sample_canvas_state(),
        )

        self.assertIn("Prompt 2 returns atomic actions only.", prompt)
        self.assertIn("Allowed action set:", prompt)
        self.assertIn("Emit actions only from the allowed action set.", prompt)
        self.assertIn("Never invent nonexistent objects, connectors, or IDs.", prompt)
        self.assertIn("valid ID from the current canvas state", prompt)
        self.assertIn("AVAILABLE_NEW_IDS_JSON", prompt)
        self.assertIn("CANVAS_BOUNDS", prompt)
        self.assertIn("Every targets array must be non-empty.", prompt)
        self.assertIn("both source and target must be different existing object IDs", prompt)
        self.assertIn("Avoid overlapping existing objects", prompt)
        self.assertIn("simple rows or columns", prompt)
        self.assertIn("aligned rows or columns", prompt)
        self.assertIn("keep note spacing consistent", prompt)
        self.assertIn("Place text labels as headings above", prompt)
        self.assertIn("Reduce connector crossings", prompt)
        self.assertNotIn("frame", prompt.lower())
        self.assertIn("Convert this single subgoal into atomic whiteboard actions:", user_prompt)
        self.assertIn('"candidateIds": [', user_prompt)
        self.assertIn('"n1"', user_prompt)
        self.assertIn("AMBIGUOUS_REFERENCES_JSON", user_prompt)

    def test_repair_prompt_includes_scene_graph_failure_log_and_hint(self):
        prompt = build_action_repair_prompt(
            "connect notes into a pipeline",
            {
                "resolvedReferences": [],
                "ambiguousReferences": [],
                "unresolvedReferences": [],
            },
            sample_canvas_state(),
            previous_actions=[
                {
                    "op": "Connect",
                    "id": "edge-1",
                    "source": "n1",
                }
            ],
            validation_error=(
                "Atomic action response was invalid for the current canvas state: "
                "Action 0 (Connect) failed: $.target is required."
            ),
            failure_log=[
                {
                    "attempt": 1,
                    "error": "Atomic action response was invalid for the current canvas state: Action 0 (Connect) failed: $.target is required.",
                    "actions": [{"op": "Connect", "id": "edge-1", "source": "n1"}],
                }
            ],
            structured_error={
                "errorCode": "schema_required_field_missing",
                "errorDetails": {"path": "$.target", "field": "target"},
                "repairHint": "Connect actions must include both source and target.",
            },
        )

        self.assertIn("Repair the previous atomic whiteboard action plan.", prompt)
        self.assertIn("VALIDATION_ERROR:", prompt)
        self.assertIn("FAILURE_LOG_JSON:", prompt)
        self.assertIn("PREVIOUS_INVALID_ACTIONS_JSON:", prompt)
        self.assertIn("CURRENT_CANVAS_CONTEXT_FOR_REPAIR:", prompt)
        self.assertIn("CURRENT_CANVAS_STATE_JSON:", prompt)
        self.assertIn("REPAIR_HINT: Connect actions must include both source and target.", prompt)

    def test_repair_prompt_includes_overlap_hint(self):
        prompt = build_action_repair_prompt(
            "spread notes cleanly",
            {
                "resolvedReferences": [],
                "ambiguousReferences": [],
                "unresolvedReferences": [],
            },
            sample_canvas_state(),
            previous_actions=[
                {
                    "op": "Move",
                    "targets": ["n1"],
                    "delta": {"dx": 40, "dy": 0},
                }
            ],
            validation_error=(
                "Atomic action response was invalid for the current canvas state: "
                "Layout resolution failed: no non-overlapping position found for object 'n1' within canvas bounds."
            ),
            failure_log=[],
            structured_error={
                "errorCode": "layout_resolution_failed",
                "errorRule": "no_overlap_layout",
                "errorDetails": {"entityId": "n1"},
                "repairHint": "Spread objects across rows or columns with clear gaps, and avoid reusing occupied positions.",
            },
        )

        self.assertIn(
            "REPAIR_HINT: Spread objects across rows or columns with clear gaps, and avoid reusing occupied positions.",
            prompt,
        )
        self.assertIn("STRUCTURED_ERROR_JSON:", prompt)


class RuleRegistryTests(unittest.TestCase):
    def test_registry_orders_rules_by_phase_priority_and_name(self):
        first = CanvasRule(
            name="b_rule",
            phase="post_action",
            ops=("Select",),
            kind="check",
            priority=20,
            run=lambda _context: [],
        )
        second = CanvasRule(
            name="a_rule",
            phase="pre_action",
            ops=("Select",),
            kind="check",
            priority=30,
            run=lambda _context: [],
        )
        third = CanvasRule(
            name="a_post_rule",
            phase="post_action",
            ops=("Select",),
            kind="check",
            priority=20,
            run=lambda _context: [],
        )

        registry = registry_with_rules([first, second, third])

        self.assertEqual(
            [rule.name for rule in registry.rules],
            ["a_rule", "a_post_rule", "b_rule"],
        )

    def test_registry_filters_rules_by_phase_and_op(self):
        registry = registry_with_rules(
            [
                CanvasRule(
                    name="move_only",
                    phase="pre_action",
                    ops=("Move",),
                    kind="check",
                    priority=10,
                    run=lambda _context: [],
                ),
                CanvasRule(
                    name="all_batch",
                    phase="post_batch",
                    ops=None,
                    kind="auto_fix",
                    priority=10,
                    run=lambda _context: [],
                ),
            ]
        )

        self.assertEqual(
            [rule.name for rule in registry.get_rules("pre_action", "Move")],
            ["move_only"],
        )
        self.assertEqual(
            [rule.name for rule in registry.get_rules("post_batch", "Move")],
            ["all_batch"],
        )

    def test_custom_rule_can_be_injected_without_executor_dispatch_changes(self):
        def run_dummy_rule(context: RuleContext):
            if context.action["targets"] == ["n1"]:
                raise RuleViolationError(
                    RuleViolation(
                        code="dummy_block",
                        rule="dummy_select_blocker",
                        phase=context.phase,
                        op=context.op,
                        message="Synthetic select blocker fired.",
                        details={"entityId": "n1"},
                        repair_hint="Do not select n1 in this synthetic test.",
                    )
                )
            return []

        custom_rule = CanvasRule(
            name="dummy_select_blocker",
            phase="pre_action",
            ops=("Select",),
            kind="check",
            priority=5,
            planner_guidance=("Dummy guidance",),
            repair_hint="Do not select n1 in this synthetic test.",
            run=run_dummy_rule,
        )

        registry = registry_with_rules([*DEFAULT_RULE_REGISTRY.rules, custom_rule])

        with self.assertRaises(CanvasActionPreconditionError) as context:
            execute_action_batch(
                sample_canvas_state(),
                [{"op": "Select", "targets": ["n1"]}],
                rule_registry=registry,
            )

        self.assertEqual(context.exception.error_code, "dummy_block")
        self.assertEqual(context.exception.error_rule, "dummy_select_blocker")


class PlannerValidationTests(unittest.TestCase):
    def test_validate_subgoal_response_accepts_subgoals_only_shape(self):
        payload = {
            "subgoals": [
                {"subgoal": "cluster selected notes into themes"},
                {"subgoal": "create a title for each cluster"},
            ]
        }

        validated = validate_subgoal_response(payload)
        self.assertEqual(
            validated["subgoals"][0]["subgoal"],
            "cluster selected notes into themes",
        )

    def test_validate_action_response_rejects_nonexistent_ids(self):
        with self.assertRaises(LLMPlannerUpstreamError) as context:
            validate_action_response(
                {
                    "actions": [
                        {
                            "op": "Move",
                            "targets": ["missing-id"],
                            "delta": {"dx": 40, "dy": 0},
                        }
                    ]
                },
                sample_canvas_state(),
            )

        self.assertIn("does not exist", str(context.exception))

    def test_validate_action_response_rejects_deleted_id_references(self):
        with self.assertRaises(LLMPlannerUpstreamError) as context:
            validate_action_response(
                {
                    "actions": [
                        {
                            "op": "Delete",
                            "targets": ["n1"],
                        },
                        {
                            "op": "Move",
                            "targets": ["n1"],
                            "delta": {"dx": 40, "dy": 0},
                        },
                    ]
                },
                sample_canvas_state(),
            )

        self.assertIn("does not exist", str(context.exception))

    def test_validate_action_response_rejects_move_out_of_canvas_bounds(self):
        with self.assertRaises(LLMPlannerUpstreamError) as context:
            validate_action_response(
                {
                    "actions": [
                        {
                            "op": "Move",
                            "targets": ["n1"],
                            "delta": {"dx": -2500, "dy": 0},
                        }
                    ]
                },
                sample_canvas_state(),
            )

        self.assertIn("outside canvas bounds", str(context.exception))

    def test_validate_action_response_requires_connector_target(self):
        with self.assertRaises(LLMPlannerUpstreamError) as context:
            validate_action_response(
                {
                    "actions": [
                        {
                            "op": "Connect",
                            "id": "edge-7",
                            "source": "n1",
                        }
                    ]
                },
                sample_canvas_state(),
            )

        self.assertIn(".target is required", str(context.exception))

    def test_validate_action_response_strips_op_irrelevant_fields(self):
        validated = validate_action_response(
            {
                "actions": [
                    {
                        "op": "Create",
                        "id": "node-7",
                        "object_type": "sticky-note",
                        "geometry": {"x": 120, "y": 100, "w": 180, "h": 100},
                        "text": "Capture interview quotes",
                        "targets": ["n1", "n2"],
                    }
                ]
            },
            sample_canvas_state(),
        )

        self.assertEqual(
            validated["actions"],
            [
                {
                    "op": "Create",
                    "id": "node-7",
                    "object_type": "sticky-note",
                    "geometry": {"x": 120, "y": 100, "w": 180, "h": 100},
                    "text": "Capture interview quotes",
                }
            ],
        )

    def test_validate_action_response_rejects_empty_targets(self):
        with self.assertRaises(LLMPlannerUpstreamError) as context:
            validate_action_response(
                {
                    "actions": [
                        {
                            "op": "Delete",
                            "targets": [],
                        }
                    ]
                },
                sample_canvas_state(),
            )

        self.assertIn("at least 1 item", str(context.exception))

    def test_validate_action_response_accepts_executable_actions(self):
        validated = validate_action_response(
            {
                "actions": [
                    {
                        "op": "Annotate",
                        "target": "n4",
                        "text": "Research methods",
                    },
                    {
                        "op": "Connect",
                        "id": "edge-2",
                        "source": "n3",
                        "target": "n4",
                        "label": "feeds",
                    },
                ]
            },
            sample_canvas_state(),
        )

        self.assertEqual(validated["actions"][0]["op"], "Annotate")
        self.assertEqual(validated["actions"][1]["id"], "edge-2")


class ReferenceResolverTests(unittest.TestCase):
    def test_selection_reference_resolves_to_current_selection(self):
        resolution = resolve_action_references(
            "cluster these notes into themes",
            sample_canvas_state(),
        )

        self.assertEqual(len(resolution["resolvedReferences"]), 1)
        self.assertEqual(
            resolution["resolvedReferences"][0]["candidateIds"],
            ["n1", "n2"],
        )

    def test_keyword_reference_matches_text_content(self):
        resolution = resolve_action_references(
            "summarize notes about evaluation",
            sample_canvas_state(),
        )

        self.assertEqual(
            resolution["resolvedReferences"][0]["candidateIds"],
            ["n2", "n3"],
        )

    def test_geometric_reference_resolves_leftmost_object(self):
        resolution = resolve_action_references(
            "annotate the leftmost note",
            sample_canvas_state(),
        )

        self.assertEqual(
            resolution["resolvedReferences"][0]["candidateIds"],
            ["n1"],
        )

    def test_nearest_reference_uses_selection_centroid(self):
        resolution = resolve_action_references(
            "connect the closest note",
            sample_canvas_state(),
        )

        self.assertEqual(
            resolution["resolvedReferences"][0]["candidateIds"],
            ["n3"],
        )


class PlannerExecutionTests(unittest.TestCase):
    @patch("llm_planner._call_openai_structured_json")
    def test_plan_subgoals_uses_model_response(self, mock_call):
        mock_call.return_value = {
            "subgoals": [
                {"subgoal": "cluster selected notes into themes"},
                {"subgoal": "connect clusters from left to right"},
            ]
        }

        result = plan_subgoals_with_llm(
            "Group these notes into themes and make a simple pipeline.",
            sample_canvas_state(),
        )

        self.assertEqual(len(result["subgoals"]), 2)
        self.assertEqual(
            result["subgoals"][1]["subgoal"],
            "connect clusters from left to right",
        )

    @patch("llm_planner._call_openai_structured_json")
    def test_plan_actions_repairs_invalid_response_once(self, mock_call):
        mock_call.side_effect = [
            {
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["missing-id"],
                        "delta": {"dx": 120, "dy": 0},
                        "id": None,
                        "object_type": None,
                        "geometry": None,
                        "text": None,
                        "selected": None,
                        "mode": None,
                        "target": None,
                        "source": None,
                        "target_handle": None,
                        "source_handle": None,
                        "label": None,
                        "field": None,
                    }
                ]
            },
            {
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["n1", "n2"],
                        "delta": {"dx": 120, "dy": 0},
                        "id": None,
                        "object_type": None,
                        "geometry": None,
                        "text": None,
                        "selected": None,
                        "mode": None,
                        "target": None,
                        "source": None,
                        "target_handle": None,
                        "source_handle": None,
                        "label": None,
                        "field": None,
                    }
                ]
            },
        ]

        result = plan_actions_with_llm(
            "move these notes to the right",
            sample_canvas_state(),
        )

        self.assertEqual(result["actions"][0]["targets"], ["n1", "n2"])
        self.assertEqual(len(result["failureLog"]), 1)
        self.assertIn("does not exist", result["failureLog"][0]["error"])

    @patch("llm_planner._call_openai_structured_json")
    def test_plan_actions_repairs_move_missing_delta(self, mock_call):
        mock_call.side_effect = [
            {
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["n1"],
                        "delta": None,
                        "id": None,
                        "object_type": None,
                        "geometry": None,
                        "text": None,
                        "selected": None,
                        "mode": None,
                        "target": None,
                        "source": None,
                        "target_handle": None,
                        "source_handle": None,
                        "label": None,
                        "field": None,
                    }
                ]
            },
            {
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["n1"],
                        "delta": {"dx": 80, "dy": 0},
                        "id": None,
                        "object_type": None,
                        "geometry": None,
                        "text": None,
                        "selected": None,
                        "mode": None,
                        "target": None,
                        "source": None,
                        "target_handle": None,
                        "source_handle": None,
                        "label": None,
                        "field": None,
                    }
                ]
            },
        ]

        result = plan_actions_with_llm(
            "move the selected note to the right",
            sample_canvas_state(),
        )

        self.assertEqual(result["actions"][0]["delta"], {"dx": 80, "dy": 0})
        self.assertEqual(len(result["failureLog"]), 1)
        self.assertIn("$.delta is required", result["failureLog"][0]["error"])


class ExecutorBehaviorTests(unittest.TestCase):
    def test_no_overlap_create_auto_shifts_to_free_slot(self):
        initial_state = sample_canvas_state()

        result = execute_action_batch(
            initial_state,
            [
                {
                    "op": "Create",
                    "id": "node-7",
                    "object_type": "sticky-note",
                    "geometry": {"x": 140, "y": 120, "w": 180, "h": 100},
                    "text": "Overlap candidate",
                }
            ],
            layout_policy="no-overlap",
        )

        self.assertEqual(result["layout_policy_applied"], "no-overlap")
        self.assertEqual(len(result["layout_adjustments"]), 1)
        self.assertTrue(result["rule_effects"])
        created_object = next(
            item for item in result["canvas_state"]["objects"] if item["id"] == "node-7"
        )
        self.assertNotEqual(created_object["geometry"]["x"], 140)
        assert_no_object_overlap(self, result["canvas_state"])

    def test_no_overlap_move_auto_shifts_deterministically(self):
        initial_state = sample_canvas_state()
        actions = [
            {
                "op": "Move",
                "targets": ["n2"],
                "delta": {"dx": -180, "dy": -10},
            }
        ]

        first = execute_action_batch(
            deepcopy(initial_state),
            deepcopy(actions),
            layout_policy="no-overlap",
        )
        second = execute_action_batch(
            deepcopy(initial_state),
            deepcopy(actions),
            layout_policy="no-overlap",
        )

        first_n2 = next(
            item for item in first["canvas_state"]["objects"] if item["id"] == "n2"
        )
        second_n2 = next(
            item for item in second["canvas_state"]["objects"] if item["id"] == "n2"
        )
        self.assertEqual(first_n2["geometry"], second_n2["geometry"])
        self.assertEqual(first["layout_adjustments"], second["layout_adjustments"])
        assert_no_object_overlap(self, first["canvas_state"])

    def test_no_overlap_annotate_repositions_resized_text_label(self):
        initial_state = sample_canvas_state()
        for item in initial_state["objects"]:
            if item["id"] == "n4":
                item["geometry"]["x"] = 310
                item["geometry"]["y"] = 110
                item["geometry"]["w"] = 170
                item["geometry"]["h"] = 58

        result = execute_action_batch(
            initial_state,
            [
                {
                    "op": "Annotate",
                    "target": "n4",
                    "text": (
                        "Longer planning title that forces the text label to grow "
                        "and would overlap nearby notes without layout repair."
                    ),
                }
            ],
            layout_policy="no-overlap",
        )

        self.assertEqual(result["layout_policy_applied"], "no-overlap")
        self.assertGreaterEqual(len(result["layout_adjustments"]), 1)
        updated_label = next(
            item for item in result["canvas_state"]["objects"] if item["id"] == "n4"
        )
        self.assertGreater(updated_label["geometry"]["w"], 170)
        self.assertTrue(result["rule_effects"])
        assert_no_object_overlap(self, result["canvas_state"])

    def test_no_overlap_leaves_clean_scene_unchanged(self):
        result = execute_action_batch(
            sample_canvas_state(),
            [
                {
                    "op": "Select",
                    "targets": ["n1"],
                }
            ],
            layout_policy="no-overlap",
        )

        self.assertEqual(result["layout_adjustments"], [])
        assert_no_object_overlap(self, result["canvas_state"])

    def test_no_overlap_aligns_new_object_to_cleaner_row_and_grid(self):
        result = execute_action_batch(
            sample_canvas_state(),
            [
                {
                    "op": "Create",
                    "id": "node-7",
                    "object_type": "sticky-note",
                    "geometry": {"x": 905, "y": 103, "w": 180, "h": 100},
                    "text": "New planning note",
                }
            ],
            layout_policy="no-overlap",
        )

        created_object = next(
            item for item in result["canvas_state"]["objects"] if item["id"] == "node-7"
        )
        self.assertEqual(created_object["geometry"]["x"] % 24, 0)
        self.assertEqual(created_object["geometry"]["y"], 96)
        self.assertEqual(len(result["layout_adjustments"]), 1)
        self.assertIn("alignment_layout", result["layout_adjustments"][0]["rules"])
        assert_no_object_overlap(self, result["canvas_state"])

    def test_no_overlap_equalizes_spacing_and_places_heading(self):
        result = execute_action_batch(
            blank_canvas_state(),
            [
                {
                    "op": "Create",
                    "id": "n1",
                    "object_type": "sticky-note",
                    "geometry": {"x": 1000, "y": 900, "w": 180, "h": 100},
                    "text": "Flights",
                },
                {
                    "op": "Create",
                    "id": "n2",
                    "object_type": "sticky-note",
                    "geometry": {"x": 1280, "y": 915, "w": 180, "h": 100},
                    "text": "Hotel",
                },
                {
                    "op": "Create",
                    "id": "n3",
                    "object_type": "sticky-note",
                    "geometry": {"x": 1620, "y": 897, "w": 180, "h": 100},
                    "text": "Tickets",
                },
                {
                    "op": "Create",
                    "id": "label-1",
                    "object_type": "text-label",
                    "geometry": {"x": 1500, "y": 950, "w": 220, "h": 80},
                    "text": "Booking",
                },
            ],
            layout_policy="no-overlap",
        )

        objects = {
            item["id"]: item
            for item in result["canvas_state"]["objects"]
        }
        gap_1 = objects["n2"]["geometry"]["x"] - (
            objects["n1"]["geometry"]["x"] + objects["n1"]["geometry"]["w"]
        )
        gap_2 = objects["n3"]["geometry"]["x"] - (
            objects["n2"]["geometry"]["x"] + objects["n2"]["geometry"]["w"]
        )
        self.assertEqual(gap_1, gap_2)
        self.assertLess(
            objects["label-1"]["geometry"]["y"],
            min(objects["n1"]["geometry"]["y"], objects["n2"]["geometry"]["y"], objects["n3"]["geometry"]["y"]),
        )
        self.assertEqual(
            objects["label-1"]["geometry"]["x"],
            min(objects["n1"]["geometry"]["x"], objects["n2"]["geometry"]["x"], objects["n3"]["geometry"]["x"]),
        )
        label_adjustment = next(
            item
            for item in result["layout_adjustments"]
            if item["id"] == "label-1"
        )
        self.assertIn("heading_placement", label_adjustment["rules"])
        assert_no_object_overlap(self, result["canvas_state"])

    def test_no_overlap_improves_connector_handles_and_undo_restores_them(self):
        initial_state = {
            "objects": [
                {
                    "id": "a",
                    "type": "sticky-note",
                    "content": {"text": "A"},
                    "geometry": {"x": 100, "y": 100, "w": 180, "h": 100},
                },
                {
                    "id": "b",
                    "type": "sticky-note",
                    "content": {"text": "B"},
                    "geometry": {"x": 420, "y": 320, "w": 180, "h": 100},
                },
                {
                    "id": "c",
                    "type": "sticky-note",
                    "content": {"text": "C"},
                    "geometry": {"x": 100, "y": 320, "w": 180, "h": 100},
                },
                {
                    "id": "d",
                    "type": "sticky-note",
                    "content": {"text": "D"},
                    "geometry": {"x": 420, "y": 100, "w": 180, "h": 100},
                },
            ],
            "connectors": [
                {
                    "id": "c1",
                    "type": "connector",
                    "content": {"label": ""},
                    "source": "a",
                    "target": "b",
                    "sourceHandle": "right",
                    "targetHandle": "left",
                    "geometry": None,
                },
                {
                    "id": "c2",
                    "type": "connector",
                    "content": {"label": ""},
                    "source": "c",
                    "target": "d",
                    "sourceHandle": "right",
                    "targetHandle": "left",
                    "geometry": None,
                },
            ],
            "viewport": {"x": 0, "y": 0, "zoom": 1.0},
            "selection": [],
        }

        result = execute_action_batch(
            initial_state,
            [
                {
                    "op": "Move",
                    "targets": ["d"],
                    "delta": {"dx": 0, "dy": 0},
                }
            ],
            layout_policy="no-overlap",
        )

        updated_connector = next(
            item for item in result["canvas_state"]["connectors"] if item["id"] == "c2"
        )
        self.assertEqual(updated_connector["sourceHandle"], "left")
        self.assertEqual(updated_connector["targetHandle"], "top")
        self.assertTrue(
            any(effect.rule == "connector_readability" for effect in result["rule_effects"])
        )

        undone_state = undo_executed_actions(
            result["canvas_state"],
            result["executed_actions"],
            result.get("rule_effects"),
        )
        restored_connector = next(
            item for item in undone_state["connectors"] if item["id"] == "c2"
        )
        self.assertEqual(restored_connector["sourceHandle"], "right")
        self.assertEqual(restored_connector["targetHandle"], "left")

    def test_no_overlap_cleans_preexisting_overlap_from_untouched_objects(self):
        result = execute_action_batch(
            overlapping_canvas_state(),
            [
                {
                    "op": "Select",
                    "targets": ["n1"],
                }
            ],
            layout_policy="no-overlap",
        )

        self.assertEqual(result["layout_policy_applied"], "no-overlap")
        self.assertTrue(result["layout_adjustments"])
        adjusted_ids = {item["id"] for item in result["layout_adjustments"]}
        self.assertIn("n2", adjusted_ids)
        assert_no_object_overlap(self, result["canvas_state"])

    def test_no_overlap_reports_impossible_placement(self):
        with self.assertRaises(CanvasActionPreconditionError) as context:
            execute_action_batch(
                full_canvas_state(),
                [
                    {
                        "op": "Create",
                        "id": "node-7",
                        "object_type": "sticky-note",
                        "geometry": {"x": 0, "y": 0, "w": 180, "h": 100},
                        "text": "No room left",
                    }
                ],
                layout_policy="no-overlap",
            )

        self.assertIn("Layout resolution failed", str(context.exception))

    def test_annotate_auto_resizes_text_label_and_undo_restores_geometry(self):
        initial_state = sample_canvas_state()
        original_label = next(
            item for item in initial_state["objects"] if item["id"] == "n4"
        )
        original_geometry = original_label["geometry"].copy()

        result = execute_action_batch(
            initial_state,
            [
                {
                    "op": "Annotate",
                    "target": "n4",
                    "text": (
                        "A much longer methods heading that should wrap and "
                        "grow the text label geometry."
                    ),
                }
            ],
        )

        updated_label = next(
            item for item in result["canvas_state"]["objects"] if item["id"] == "n4"
        )
        self.assertEqual(
            updated_label["content"]["text"],
            "A much longer methods heading that should wrap and grow the text label geometry.",
        )
        self.assertNotEqual(updated_label["geometry"], original_geometry)
        self.assertGreater(updated_label["geometry"]["h"], original_geometry["h"])
        self.assertTrue(result["rule_effects"])

        undone_state = undo_executed_actions(
            result["canvas_state"],
            result["executed_actions"],
            result.get("rule_effects"),
        )
        restored_label = next(
            item for item in undone_state["objects"] if item["id"] == "n4"
        )
        self.assertEqual(restored_label["content"]["text"], "Methods")
        self.assertEqual(restored_label["geometry"], original_geometry)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()

    def test_get_action_schemas_returns_no_group_into_frame(self):
        response = self.client.get("/api/action-schemas")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        ops = [item["op"] for item in payload["actions"]]
        self.assertIn("Create", ops)
        self.assertIn("Connect", ops)
        self.assertNotIn("GroupIntoFrame", ops)

    def test_post_canvas_state_returns_object_and_connector_counts_only(self):
        response = self.client.post(
            "/api/canvas-state",
            json=sample_canvas_state(),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["counts"]["objects"], 4)
        self.assertEqual(payload["counts"]["connectors"], 1)
        self.assertEqual(payload["counts"]["selection"], 2)
        self.assertNotIn("frames", payload["counts"])

    def test_post_canvas_actions_accepts_canvas_state_override(self):
        response = self.client.post(
            "/api/canvas-actions",
            json={
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["n1"],
                        "delta": {"dx": 80, "dy": 0},
                    }
                ],
                "dry_run": True,
                "canvasState": sample_canvas_state(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["dryRun"])
        moved_object = next(
            item for item in payload["canvasState"]["objects"] if item["id"] == "n1"
        )
        self.assertEqual(moved_object["geometry"]["x"], 200)

    def test_post_canvas_actions_accepts_layout_policy_and_returns_adjustments(self):
        response = self.client.post(
            "/api/canvas-actions",
            json={
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["n2"],
                        "delta": {"dx": -180, "dy": -10},
                    }
                ],
                "dry_run": True,
                "canvasState": sample_canvas_state(),
                "layoutPolicy": "no-overlap",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["layoutPolicyApplied"], "no-overlap")
        self.assertTrue(payload["layoutAdjustments"])
        assert_no_object_overlap(self, payload["canvasState"])

    def test_post_canvas_actions_returns_structured_error_fields(self):
        response = self.client.post(
            "/api/canvas-actions",
            json={
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["missing-id"],
                        "delta": {"dx": 10, "dy": 0},
                    }
                ],
                "dry_run": True,
                "canvasState": sample_canvas_state(),
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertEqual(payload["errorCode"], "invalid_move_target")
        self.assertEqual(payload["errorRule"], "move_semantics")
        self.assertEqual(payload["errorDetails"]["entityId"], "missing-id")
        self.assertIn("repairHint", payload)

    @patch("app.plan_actions_with_llm")
    def test_llm_actions_endpoint_returns_actions_and_reference_resolution(self, mock_plan):
        mock_plan.return_value = {
            "actions": [
                {
                    "op": "Select",
                    "targets": ["n1", "n2"],
                }
            ],
            "referenceResolution": {
                "resolvedReferences": [
                    {
                        "surfaceText": "these notes",
                        "candidateIds": ["n1", "n2"],
                        "rule": "selection",
                        "status": "resolved",
                        "entityScope": "objects",
                        "reason": "Resolved from the current selection.",
                    }
                ],
                "ambiguousReferences": [],
                "unresolvedReferences": [],
            },
            "failureLog": [],
        }

        response = self.client.post(
            "/api/llm/actions",
            json={
                "subgoal": "select these notes",
                "canvasState": sample_canvas_state(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["actions"][0]["op"], "Select")
        self.assertEqual(
            payload["referenceResolution"]["resolvedReferences"][0]["candidateIds"],
            ["n1", "n2"],
        )


if __name__ == "__main__":
    unittest.main()
