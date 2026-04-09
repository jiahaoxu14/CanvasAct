import unittest
from unittest.mock import patch

from app import create_app
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
        self.assertIn("Connect actions must include both source and target.", prompt)
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
        )

        self.assertIn("Repair the previous atomic whiteboard action plan.", prompt)
        self.assertIn("VALIDATION_ERROR:", prompt)
        self.assertIn("FAILURE_LOG_JSON:", prompt)
        self.assertIn("PREVIOUS_INVALID_ACTIONS_JSON:", prompt)
        self.assertIn("CURRENT_CANVAS_CONTEXT_FOR_REPAIR:", prompt)
        self.assertIn("CURRENT_CANVAS_STATE_JSON:", prompt)
        self.assertIn("REPAIR_HINT: Connect actions must include both source and target.", prompt)


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
