import unittest
from unittest.mock import patch

from app import create_app
from llm_planner import (
    LLMPlannerUpstreamError,
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
                "parentFrameId": None,
            },
            {
                "id": "n2",
                "type": "sticky-note",
                "content": {"text": "evaluation checklist"},
                "geometry": {"x": 360, "y": 110, "w": 180, "h": 100},
                "parentFrameId": None,
            },
            {
                "id": "n3",
                "type": "sticky-note",
                "content": {"text": "evaluation rubric"},
                "geometry": {"x": 220, "y": 280, "w": 180, "h": 100},
                "parentFrameId": None,
            },
        ],
        "frames": [
            {
                "id": "f1",
                "type": "frame",
                "content": {"title": "Methods"},
                "geometry": {"x": 80, "y": 60, "w": 520, "h": 280},
                "childIds": [],
            },
            {
                "id": "f2",
                "type": "frame",
                "content": {"title": "Results"},
                "geometry": {"x": 760, "y": 90, "w": 360, "h": 260},
                "childIds": [],
            }
        ],
        "connectors": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
        "selection": ["n1", "n2"],
    }


class PromptContractTests(unittest.TestCase):
    def test_subgoal_prompt_includes_checklist_rules(self):
        prompt = build_subgoal_system_prompt(sample_canvas_state())
        user_prompt = build_subgoal_user_prompt(
            "Group these notes into themes and make a simple pipeline."
        )

        self.assertIn("Prompt 1 returns subgoals only.", prompt)
        self.assertIn("Allowed action set:", prompt)
        self.assertIn("Never invent nonexistent objects, frames, connectors, or IDs.", prompt)
        self.assertIn("valid ID from the current canvas state", prompt)
        self.assertIn("Create", prompt)
        self.assertIn("GroupIntoFrame", prompt)
        self.assertIn("Connect", prompt)
        self.assertIn("Decompose this whiteboard instruction into subgoals:", user_prompt)

    def test_action_prompt_includes_checklist_rules(self):
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
        )

        self.assertIn("Prompt 2 returns atomic actions only.", prompt)
        self.assertIn("Allowed action set:", prompt)
        self.assertIn("Emit actions only from the allowed action set.", prompt)
        self.assertIn("Never invent nonexistent objects, frames, connectors, or IDs.", prompt)
        self.assertIn("valid ID from the current canvas state", prompt)
        self.assertIn("AVAILABLE_NEW_OBJECT_IDS", prompt)
        self.assertIn("Create", prompt)
        self.assertIn("Delete", prompt)
        self.assertIn("use an existing frame only if every target object fits", prompt)
        self.assertIn("Convert this single subgoal into atomic whiteboard actions:", user_prompt)
        self.assertIn('"candidateIds": [', user_prompt)
        self.assertIn('"n1"', user_prompt)
        self.assertIn("AMBIGUOUS_REFERENCES_JSON", user_prompt)


class PlannerValidationTests(unittest.TestCase):
    def test_validate_subgoal_response_accepts_subgoals_only_shape(self):
        payload = {
            "subgoals": [
                {"subgoal": "cluster selected notes into themes"},
                {"subgoal": "create a title for each cluster"},
            ]
        }

        validated = validate_subgoal_response(payload)
        self.assertEqual(validated["subgoals"][0]["subgoal"], "cluster selected notes into themes")

    def test_validate_action_response_rejects_nonexistent_ids(self):
        with self.assertRaises(LLMPlannerUpstreamError):
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

    def test_reference_resolver_handles_selection_keyword_and_geometry_rules(self):
        resolution = resolve_action_references(
            "Group these notes about evaluation into the right group.",
            sample_canvas_state(),
        )

        resolved_by_surface = {
            entry["surfaceText"]: entry
            for entry in resolution["resolvedReferences"]
        }
        self.assertEqual(
            resolved_by_surface["these notes"]["candidateIds"],
            ["n1", "n2"],
        )
        self.assertEqual(
            resolved_by_surface["notes about evaluation"]["candidateIds"],
            ["n2", "n3"],
        )
        self.assertEqual(
            resolved_by_surface["right group"]["candidateIds"],
            ["f2"],
        )

    def test_reference_resolver_logs_ambiguous_keyword_reference(self):
        resolution = resolve_action_references(
            "Connect note about evaluation to the right group.",
            sample_canvas_state(),
        )

        self.assertEqual(len(resolution["ambiguousReferences"]), 1)
        self.assertEqual(
            resolution["ambiguousReferences"][0]["surfaceText"],
            "note about evaluation",
        )

    def test_reference_resolver_uses_selection_centroid_for_closest(self):
        resolution = resolve_action_references(
            "Connect these notes to the closest note.",
            sample_canvas_state(),
        )

        resolved_by_surface = {
            entry["surfaceText"]: entry
            for entry in resolution["resolvedReferences"]
        }
        self.assertEqual(
            resolved_by_surface["closest note"]["candidateIds"],
            ["n3"],
        )
        self.assertEqual(
            resolved_by_surface["closest note"]["anchorSource"],
            "selection-centroid",
        )

    @patch(
        "llm_planner._call_openai_json",
        return_value={
            "subgoals": [
                {"subgoal": "cluster selected notes into themes"},
                {"subgoal": "connect clusters from left to right"},
            ]
        },
    )
    def test_plan_subgoals_uses_structured_result(self, _mock_call):
        result = plan_subgoals_with_llm(
            "Group these notes into themes and make a simple pipeline.",
            sample_canvas_state(),
        )
        self.assertEqual(len(result["subgoals"]), 2)

    @patch(
        "llm_planner._call_openai_json",
        return_value={
            "actions": [
                {
                    "op": "GroupIntoFrame",
                    "targets": ["n1", "n2"],
                    "frame_id": "f1",
                    "title": "Themes",
                }
            ]
        },
    )
    def test_plan_actions_validates_llm_output(self, _mock_call):
        result = plan_actions_with_llm(
            "cluster selected notes into themes",
            sample_canvas_state(),
        )
        self.assertEqual(result["actions"][0]["op"], "GroupIntoFrame")
        self.assertIn("referenceResolution", result)

    def test_validate_action_response_repairs_frame_ids_in_group_targets(self):
        validated = validate_action_response(
            {
                "actions": [
                    {
                        "op": "GroupIntoFrame",
                        "targets": ["f1", "n1", "n2"],
                        "frame_id": "f1",
                        "title": "Themes",
                    }
                ]
            },
            sample_canvas_state(),
        )

        self.assertEqual(
            validated["actions"][0]["targets"],
            ["n1", "n2"],
        )

    @patch(
        "llm_planner._call_openai_json",
        side_effect=[
            {
                "actions": [
                    {
                        "op": "GroupIntoFrame",
                        "targets": ["n1", "n2"],
                        "frame_id": "f1",
                        "title": "Themes",
                    }
                ]
            },
            {
                "actions": [
                    {
                        "op": "GroupIntoFrame",
                        "targets": ["n1", "n2"],
                        "frame_id": "frame-3",
                        "title": "Themes",
                    }
                ]
            },
        ],
    )
    def test_plan_actions_repairs_invalid_group_into_frame(self, mock_call):
        constrained_state = sample_canvas_state()
        constrained_state["frames"][0]["geometry"] = {
            "x": 80,
            "y": 60,
            "w": 200,
            "h": 150,
        }

        result = plan_actions_with_llm(
            "group these notes into themes",
            constrained_state,
        )

        self.assertEqual(mock_call.call_count, 2)
        self.assertEqual(result["actions"][0]["frame_id"], "frame-3")
        self.assertTrue(result["repairAttempted"])


class PlannerEndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["LATEST_CANVAS_STATE"] = sample_canvas_state()
        self.client = self.app.test_client()

    @patch(
        "app.plan_subgoals_with_llm",
        return_value={
            "subgoals": [
                {"subgoal": "cluster selected notes into themes"},
            ]
        },
    )
    def test_subgoal_endpoint_returns_subgoals(self, _mock_plan):
        response = self.client.post(
            "/api/llm/subgoals",
            json={
                "prompt": "Group these notes into themes and make a simple pipeline."
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "status": "ok",
                "subgoals": [
                    {"subgoal": "cluster selected notes into themes"},
                ],
            },
        )

    @patch(
        "app.plan_actions_with_llm",
        return_value={
            "actions": [
                {
                    "op": "GroupIntoFrame",
                    "targets": ["n1", "n2"],
                    "frame_id": "f1",
                    "title": "Themes",
                }
            ],
            "referenceResolution": {
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
        },
    )
    def test_action_endpoint_returns_actions(self, _mock_plan):
        response = self.client.post(
            "/api/llm/actions",
            json={"subgoal": "cluster selected notes into themes"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "status": "ok",
                "actions": [
                    {
                        "op": "GroupIntoFrame",
                        "targets": ["n1", "n2"],
                        "frame_id": "f1",
                        "title": "Themes",
                    }
                ],
                "referenceResolution": {
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
                "ambiguousReferences": [],
            },
        )

    def test_canvas_actions_accepts_canvas_state_override_for_preview(self):
        response = self.client.post(
            "/api/canvas-actions",
            json={
                "dry_run": True,
                "canvasState": sample_canvas_state(),
                "actions": [
                    {
                        "op": "Move",
                        "targets": ["n1"],
                        "delta": {"dx": 40, "dy": 0},
                    }
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["canvasState"]["objects"][0]["geometry"]["x"],
            160,
        )


if __name__ == "__main__":
    unittest.main()
