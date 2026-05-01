# Model-in-the-Loop Canvas Agent Eval Report

Generated: 2026-05-01T21:58:18.992Z
Model: `gpt-5.4-mini`
JSON artifact: `frontend/.tsbuild/evals/model-in-loop.json`

## Scope

This is a live model-in-the-loop smoke eval. It calls the configured model through `AgentService`, feeds fixed canvas observations, collects completed structured actions, and scores whether the returned actions target the expected objects.

The configs are prompt/action ablations in the current codebase. They are not exact historical binaries for P0/P1/P2/P3, and P4 is not implemented in this repo yet.

## Summary

| Config | Cases | Passed | Pass Rate | Avg Score | Errors | Avg Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Legacy shape-list prompt | 3 | 1 | 33% | 2.67 / 4 | 0 | 3170 ms |
| P0 CanvasObservation prompt | 3 | 1 | 33% | 2.67 / 4 | 0 | 1878 ms |
| Current semantic/chunk prompt | 3 | 3 | 100% | 4.00 / 4 | 0 | 1870 ms |

## Task Results

| Task | Config | Score | Passed | Action Types | Reason | Error |
| --- | --- | ---: | --- | --- | --- | --- |
| `selected_offscreen_move` | Legacy shape-list prompt | 4 | yes | `move` | Returned a move action for the selected offscreen shape. | - |
| `fix_unbound_arrows` | Legacy shape-list prompt | 2 | no | `update` | Referenced relevant arrow objects without a complete repair action. | - |
| `clean_cluster` | Legacy shape-list prompt | 2 | no | `move`, `move`, `move` | Used primitive moves for all cluster shapes instead of a semantic layout action. | - |
| `selected_offscreen_move` | P0 CanvasObservation prompt | 4 | yes | `move` | Returned a move action for the selected offscreen shape. | - |
| `fix_unbound_arrows` | P0 CanvasObservation prompt | 2 | no | `update` | Referenced relevant arrow objects without a complete repair action. | - |
| `clean_cluster` | P0 CanvasObservation prompt | 2 | no | `move`, `move`, `move` | Used primitive moves for all cluster shapes instead of a semantic layout action. | - |
| `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | `move` | Returned a move action for the selected offscreen shape. | - |
| `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | `connect` | Returned a connect-style repair and referenced the unbound arrow context. | - |
| `clean_cluster` | Current semantic/chunk prompt | 4 | yes | `cleanupLayout` | Used a semantic layout action for the messy cluster. | - |

## Tasks

- `selected_offscreen_move`: Move the selected offscreen shape 20 pixels to the right.
  Expected ids: `selected-offscreen`
- `fix_unbound_arrows`: Fix the arrows that are not connected.
  Expected ids: `start`, `end`, `unbound-arrow`
- `clean_cluster`: Clean up this messy cluster without changing the text.
  Expected ids: `cluster-a`, `cluster-b`, `cluster-c`

## Configs

- `legacy_shape_list`: Approximates the pre-P0 prompt using legacy blurry/peripheral shape text and primitive actions.
- `p0_observation`: Uses CanvasObservation but keeps the primitive-heavy action set.
- `p2_p3_semantic_chunk_loop`: Uses CanvasObservation, selector-aware schemas, semantic actions, and the current chunk-preferring response path.

## Interpretation

Best average score among configs without model-call errors: `p2_p3_semantic_chunk_loop` with 4.00 / 4.
Use this as a directional signal only. A stronger experiment should run more tasks, multiple repetitions per task, and exact git worktrees or feature flags for each P0-P3 phase.

## Limitations

- This run uses one sample per task/config.
- It scores returned actions structurally; it does not yet replay every model action into the editor and visually inspect the final canvas.
- The config labels approximate refinement levels using prompt/action ablations in the current codebase.
- P4 has not been defined or implemented in `canvas_agent_refinement_plan.md`, so it is not evaluated here.

