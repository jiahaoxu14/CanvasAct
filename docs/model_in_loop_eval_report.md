# Model-in-the-Loop Canvas Agent Eval Report

Generated: 2026-05-02T17:37:53.221Z
Status: `complete`
Models: `gpt-5.4-mini`, `gpt-5.4`, `claude-sonnet-4-5`
Repetitions per task/config: 10
Cases: 630 / 630
JSON artifact: `frontend/.tsbuild/evals/model-in-loop.json`

## Scope

This is a live model-in-the-loop smoke eval. It calls the configured model through `AgentService`, feeds fixed canvas observations, collects completed structured actions, and scores whether the returned actions target the expected objects.

The configs are prompt/action ablations in the current codebase. They are not exact historical binaries for P0/P1/P2/P3.

## Summary

| Model | Config | Cases | Passed | Pass Rate | Avg Score | Errors | Avg Duration | Avg Tokens | Cost/Success |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-mini` | Current semantic/chunk prompt | 210 | 184 | 88% | 3.36 / 4 | 0 | 1261 ms | 20410 | - |
| `gpt-5.4` | Current semantic/chunk prompt | 210 | 148 | 70% | 2.93 / 4 | 0 | 2402 ms | 20458 | - |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | 210 | 169 | 80% | 3.47 / 4 | 0 | 5939 ms | 430 | - |

## Category Summary

| Model | Config | Category | Cases | Pass Rate | Avg Score | Wrong Targets |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `simple_edits` | 30 | 100% | 4.00 / 4 | 0 |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `selection_offscreen` | 30 | 87% | 3.47 / 4 | 0 |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `partial_visibility` | 30 | 100% | 4.00 / 4 | 0 |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `ambiguous_targets` | 30 | 33% | 1.33 / 4 | 10 |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `arrows_connectors` | 30 | 93% | 3.40 / 4 | 0 |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `layout_cleanup` | 30 | 100% | 4.00 / 4 | 0 |
| `gpt-5.4-mini` | Current semantic/chunk prompt | `multi_step_repair` | 30 | 100% | 3.30 / 4 | 0 |
| `gpt-5.4` | Current semantic/chunk prompt | `simple_edits` | 30 | 100% | 4.00 / 4 | 0 |
| `gpt-5.4` | Current semantic/chunk prompt | `selection_offscreen` | 30 | 13% | 0.53 / 4 | 0 |
| `gpt-5.4` | Current semantic/chunk prompt | `partial_visibility` | 30 | 100% | 4.00 / 4 | 0 |
| `gpt-5.4` | Current semantic/chunk prompt | `ambiguous_targets` | 30 | 60% | 2.40 / 4 | 4 |
| `gpt-5.4` | Current semantic/chunk prompt | `arrows_connectors` | 30 | 33% | 2.33 / 4 | 0 |
| `gpt-5.4` | Current semantic/chunk prompt | `layout_cleanup` | 30 | 100% | 4.00 / 4 | 0 |
| `gpt-5.4` | Current semantic/chunk prompt | `multi_step_repair` | 30 | 87% | 3.23 / 4 | 0 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `simple_edits` | 30 | 100% | 4.00 / 4 | 0 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `selection_offscreen` | 30 | 67% | 3.33 / 4 | 0 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `partial_visibility` | 30 | 100% | 4.00 / 4 | 0 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `ambiguous_targets` | 30 | 100% | 4.00 / 4 | 0 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `arrows_connectors` | 30 | 0% | 2.00 / 4 | 10 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `layout_cleanup` | 30 | 100% | 4.00 / 4 | 0 |
| `claude-sonnet-4-5` | Current semantic/chunk prompt | `multi_step_repair` | 30 | 97% | 2.97 / 4 | 0 |

## Task Results

| Run | Model | Task | Config | Score | Passed | Tokens | Reason | Error |
| ---: | --- | --- | --- | ---: | --- | ---: | --- | --- |
| 1 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 1 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 1 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21061 | Returned a label/update action for the title. | - |
| 1 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19314 | Did not target selected-offscreen. | - |
| 1 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19323 | Returned an update action for the selected offscreen shape. | - |
| 1 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19315 | Returned a move/place action for the selected offscreen note. | - |
| 1 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20188 | Returned a move action for the partly visible left shape. | - |
| 1 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 1 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20175 | Returned a label/update action for the partly visible left shape. | - |
| 1 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20236 | Edited an ambiguous target explicitly: partial-left. | - |
| 1 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20245 | Returned a label/update action for the selected Revenue box. | - |
| 1 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 1 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20465 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 1 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 1 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 1 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20519 | Used a semantic layout action for the messy cluster. | - |
| 1 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20528 | Used a semantic layout action for the messy cluster. | - |
| 1 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20528 | Used a layout/alignment action for the process steps. | - |
| 1 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 4 | yes | 21637 | Handled both arrow repair and layout cleanup. | - |
| 1 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20567 | Organized the layout and emitted a fitText repair. | - |
| 1 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 4 | yes | 20516 | Moved the selected offscreen node and repaired the loose arrow. | - |
| 1 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21071 | Returned a move action for the Start box. | - |
| 1 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21139 | Returned a resize/update action for the Decision box. | - |
| 1 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21052 | Returned a label/update action for the title. | - |
| 1 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 1 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19381 | Returned an update action for the selected offscreen shape. | - |
| 1 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19313 | Did not target selected-offscreen. | - |
| 1 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20222 | Returned a move action for the partly visible left shape. | - |
| 1 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20201 | Returned a move action for the partly visible right shape. | - |
| 1 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20227 | Returned a label/update action for the partly visible left shape. | - |
| 1 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20223 | Edited an ambiguous target explicitly: partial-left. | - |
| 1 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 1 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 20276 | Returned a connect action from the left Revenue box to Forecast. | - |
| 1 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20558 | Referenced relevant arrow objects without a complete repair action. | - |
| 1 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 1 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20492 | Referenced relevant arrow objects without a complete repair action. | - |
| 1 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20626 | Used a semantic layout action for the messy cluster. | - |
| 1 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20626 | Used a semantic layout action for the messy cluster. | - |
| 1 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20602 | Used a layout/alignment action for the process steps. | - |
| 1 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21719 | Handled one major part of the multi-step repair. | - |
| 1 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20760 | Organized the layout and emitted a fitText repair. | - |
| 1 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 2 | no | 20618 | Referenced relevant objects but did not complete the multi-step reconnect. | - |
| 1 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 2971 | Returned a move action for the Start box. | - |
| 1 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 2957 | Returned a resize/update action for the Decision box. | - |
| 1 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 2790 | Returned a label/update action for the title. | - |
| 1 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 837 | Returned a move action for the selected offscreen shape. | - |
| 1 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 916 | Returned an update action for the selected offscreen shape. | - |
| 1 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 167 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 1 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 1846 | Returned a move action for the partly visible left shape. | - |
| 1 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 1949 | Returned a move action for the partly visible right shape. | - |
| 1 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 1 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 2002 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 1 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 1886 | Returned a label/update action for the selected Revenue box. | - |
| 1 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 168 | Returned a connect action from the left Revenue box to Forecast. | - |
| 1 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 2219 | Referenced relevant arrow objects without a complete repair action. | - |
| 1 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 3028 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 1 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 2227 | Referenced relevant arrow objects without a complete repair action. | - |
| 1 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 2240 | Used a semantic layout action for the messy cluster. | - |
| 1 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 2384 | Used a semantic layout action for the messy cluster. | - |
| 1 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 381 | Used a layout/alignment action for the process steps. | - |
| 1 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 3680 | Handled one major part of the multi-step repair. | - |
| 1 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 267 | Organized the layout but did not clearly fit labels. | - |
| 1 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 2368 | Handled one major part of the offscreen reconnect task. | - |
| 2 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 2 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21079 | Returned a resize/update action for the Decision box. | - |
| 2 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21061 | Returned a label/update action for the title. | - |
| 2 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19315 | Did not target selected-offscreen. | - |
| 2 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19323 | Returned an update action for the selected offscreen shape. | - |
| 2 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 2 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20189 | Returned a move action for the partly visible left shape. | - |
| 2 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 2 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 2 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20239 | Edited an ambiguous target explicitly: partial-left. | - |
| 2 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 2 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20263 | Did not connect partial-left to visible. | - |
| 2 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20464 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 2 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 2 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 2 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20519 | Used a semantic layout action for the messy cluster. | - |
| 2 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20528 | Used a semantic layout action for the messy cluster. | - |
| 2 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20533 | Used a layout/alignment action for the process steps. | - |
| 2 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21543 | Handled one major part of the multi-step repair. | - |
| 2 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20565 | Organized the layout and emitted a fitText repair. | - |
| 2 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 4 | yes | 20502 | Moved the selected offscreen node and repaired the loose arrow. | - |
| 2 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21070 | Returned a move action for the Start box. | - |
| 2 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21101 | Returned a resize/update action for the Decision box. | - |
| 2 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21051 | Returned a label/update action for the title. | - |
| 2 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 2 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19376 | Returned an update action for the selected offscreen shape. | - |
| 2 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19311 | Did not target selected-offscreen. | - |
| 2 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20224 | Returned a move action for the partly visible left shape. | - |
| 2 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20186 | Returned a move action for the partly visible right shape. | - |
| 2 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20177 | Returned a label/update action for the partly visible left shape. | - |
| 2 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 20241 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 2 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 2 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20238 | Did not connect partial-left to visible. | - |
| 2 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20502 | Referenced relevant arrow objects without a complete repair action. | - |
| 2 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 2 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20493 | Referenced relevant arrow objects without a complete repair action. | - |
| 2 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20729 | Used a semantic layout action for the messy cluster. | - |
| 2 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20627 | Used a semantic layout action for the messy cluster. | - |
| 2 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20644 | Used a layout/alignment action for the process steps. | - |
| 2 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 4 | yes | 21682 | Handled both arrow repair and layout cleanup. | - |
| 2 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20752 | Organized the layout and emitted a fitText repair. | - |
| 2 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 2 | no | 20698 | Referenced relevant objects but did not complete the multi-step reconnect. | - |
| 2 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 2 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 3018 | Returned a resize/update action for the Decision box. | - |
| 2 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 2790 | Returned a label/update action for the title. | - |
| 2 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 2 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 167 | Returned an update action for the selected offscreen shape. | - |
| 2 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 182 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 2 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 2 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 179 | Returned a move action for the partly visible right shape. | - |
| 2 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 2 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 200 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 2 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the selected Revenue box. | - |
| 2 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 2 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 276 | Referenced relevant arrow objects without a complete repair action. | - |
| 2 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 278 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 2 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 234 | Referenced relevant arrow objects without a complete repair action. | - |
| 2 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 220 | Used a semantic layout action for the messy cluster. | - |
| 2 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 315 | Used a semantic layout action for the messy cluster. | - |
| 2 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 431 | Used a layout/alignment action for the process steps. | - |
| 2 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 3708 | Handled one major part of the multi-step repair. | - |
| 2 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 267 | Organized the layout but did not clearly fit labels. | - |
| 2 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 2363 | Handled one major part of the offscreen reconnect task. | - |
| 3 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21047 | Returned a move action for the Start box. | - |
| 3 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 3 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21067 | Returned a label/update action for the title. | - |
| 3 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 19294 | Returned a move action for the selected offscreen shape. | - |
| 3 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19328 | Returned an update action for the selected offscreen shape. | - |
| 3 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 3 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible left shape. | - |
| 3 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 3 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20175 | Returned a label/update action for the partly visible left shape. | - |
| 3 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20235 | Edited an ambiguous target explicitly: partial-left. | - |
| 3 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20244 | Returned a label/update action for the selected Revenue box. | - |
| 3 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 3 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20465 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 3 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 3 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 3 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20521 | Used a semantic layout action for the messy cluster. | - |
| 3 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20523 | Used a semantic layout action for the messy cluster. | - |
| 3 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20532 | Used a layout/alignment action for the process steps. | - |
| 3 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21546 | Handled one major part of the multi-step repair. | - |
| 3 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 20554 | Organized the layout but did not clearly fit labels. | - |
| 3 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20533 | Handled one major part of the offscreen reconnect task. | - |
| 3 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21070 | Returned a move action for the Start box. | - |
| 3 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21120 | Returned a resize/update action for the Decision box. | - |
| 3 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21051 | Returned a label/update action for the title. | - |
| 3 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 3 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 0 | no | 19330 | Did not update selected-offscreen. | - |
| 3 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19304 | Did not target selected-offscreen. | - |
| 3 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 3 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20202 | Returned a move action for the partly visible right shape. | - |
| 3 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20227 | Returned a label/update action for the partly visible left shape. | - |
| 3 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20223 | Edited an ambiguous target explicitly: partial-left. | - |
| 3 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 3 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20235 | Did not connect partial-left to visible. | - |
| 3 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20508 | Referenced relevant arrow objects without a complete repair action. | - |
| 3 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 3 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20494 | Referenced relevant arrow objects without a complete repair action. | - |
| 3 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20726 | Used a semantic layout action for the messy cluster. | - |
| 3 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20648 | Used a semantic layout action for the messy cluster. | - |
| 3 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20608 | Used a layout/alignment action for the process steps. | - |
| 3 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21710 | Handled one major part of the multi-step repair. | - |
| 3 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20789 | Organized the layout and emitted a fitText repair. | - |
| 3 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 2 | no | 20704 | Referenced relevant objects but did not complete the multi-step reconnect. | - |
| 3 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 3 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 267 | Returned a resize/update action for the Decision box. | - |
| 3 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 3 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 3 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 167 | Returned an update action for the selected offscreen shape. | - |
| 3 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 169 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 3 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 3 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 181 | Returned a move action for the partly visible right shape. | - |
| 3 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 3 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 199 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 3 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 3 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 3 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 276 | Referenced relevant arrow objects without a complete repair action. | - |
| 3 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 278 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 3 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 319 | Referenced relevant arrow objects without a complete repair action. | - |
| 3 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 220 | Used a semantic layout action for the messy cluster. | - |
| 3 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 307 | Used a semantic layout action for the messy cluster. | - |
| 3 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 263 | Used a layout/alignment action for the process steps. | - |
| 3 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 433 | Handled one major part of the multi-step repair. | - |
| 3 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 365 | Organized the layout but did not clearly fit labels. | - |
| 3 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 485 | Handled one major part of the offscreen reconnect task. | - |
| 4 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 4 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 4 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21067 | Returned a label/update action for the title. | - |
| 4 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 19294 | Returned a move action for the selected offscreen shape. | - |
| 4 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19323 | Returned an update action for the selected offscreen shape. | - |
| 4 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 4 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible left shape. | - |
| 4 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 4 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 4 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20235 | Edited an ambiguous target explicitly: partial-left. | - |
| 4 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 4 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20272 | Did not connect partial-left to visible. | - |
| 4 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20467 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 4 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 0 | no | 21074 | Did not handle the duplicate-arrow request. | - |
| 4 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 4 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20526 | Used a semantic layout action for the messy cluster. | - |
| 4 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20540 | Used a semantic layout action for the messy cluster. | - |
| 4 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20532 | Used a layout/alignment action for the process steps. | - |
| 4 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21546 | Handled one major part of the multi-step repair. | - |
| 4 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 20566 | Organized the layout but did not clearly fit labels. | - |
| 4 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20543 | Handled one major part of the offscreen reconnect task. | - |
| 4 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21070 | Returned a move action for the Start box. | - |
| 4 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21120 | Returned a resize/update action for the Decision box. | - |
| 4 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21068 | Returned a label/update action for the title. | - |
| 4 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 4 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19356 | Returned an update action for the selected offscreen shape. | - |
| 4 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19304 | Did not target selected-offscreen. | - |
| 4 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 4 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20186 | Returned a move action for the partly visible right shape. | - |
| 4 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20227 | Returned a label/update action for the partly visible left shape. | - |
| 4 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 20241 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 4 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 4 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20238 | Did not connect partial-left to visible. | - |
| 4 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20548 | Referenced relevant arrow objects without a complete repair action. | - |
| 4 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 4 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20494 | Referenced relevant arrow objects without a complete repair action. | - |
| 4 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20688 | Used a semantic layout action for the messy cluster. | - |
| 4 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20626 | Used a semantic layout action for the messy cluster. | - |
| 4 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20605 | Used a layout/alignment action for the process steps. | - |
| 4 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21717 | Handled one major part of the multi-step repair. | - |
| 4 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20852 | Organized the layout and emitted a fitText repair. | - |
| 4 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20662 | Handled one major part of the offscreen reconnect task. | - |
| 4 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 4 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 326 | Returned a resize/update action for the Decision box. | - |
| 4 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 4 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 4 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 160 | Returned an update action for the selected offscreen shape. | - |
| 4 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 166 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 4 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 4 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 181 | Returned a move action for the partly visible right shape. | - |
| 4 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 4 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 199 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 4 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 4 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 4 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 276 | Referenced relevant arrow objects without a complete repair action. | - |
| 4 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 201 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 4 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 219 | Referenced relevant arrow objects without a complete repair action. | - |
| 4 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 218 | Used a semantic layout action for the messy cluster. | - |
| 4 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 307 | Used a semantic layout action for the messy cluster. | - |
| 4 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 263 | Used a layout/alignment action for the process steps. | - |
| 4 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 422 | Handled one major part of the multi-step repair. | - |
| 4 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 270 | Organized the layout but did not clearly fit labels. | - |
| 4 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 481 | Handled one major part of the offscreen reconnect task. | - |
| 5 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 5 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 5 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21067 | Returned a label/update action for the title. | - |
| 5 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 19295 | Returned a move action for the selected offscreen shape. | - |
| 5 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19335 | Returned an update action for the selected offscreen shape. | - |
| 5 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 5 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20188 | Returned a move action for the partly visible left shape. | - |
| 5 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 5 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 5 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20237 | Edited an ambiguous target explicitly: partial-left. | - |
| 5 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 5 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 5 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20465 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 5 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 5 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 5 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20519 | Used a semantic layout action for the messy cluster. | - |
| 5 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20528 | Used a semantic layout action for the messy cluster. | - |
| 5 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20529 | Used a layout/alignment action for the process steps. | - |
| 5 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21546 | Handled one major part of the multi-step repair. | - |
| 5 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20608 | Organized the layout and emitted a fitText repair. | - |
| 5 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20533 | Handled one major part of the offscreen reconnect task. | - |
| 5 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 5 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21142 | Returned a resize/update action for the Decision box. | - |
| 5 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21052 | Returned a label/update action for the title. | - |
| 5 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 5 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 0 | no | 19328 | Did not update selected-offscreen. | - |
| 5 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19308 | Did not target selected-offscreen. | - |
| 5 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 5 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20186 | Returned a move action for the partly visible right shape. | - |
| 5 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20227 | Returned a label/update action for the partly visible left shape. | - |
| 5 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20223 | Edited an ambiguous target explicitly: partial-left. | - |
| 5 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 5 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20234 | Did not connect partial-left to visible. | - |
| 5 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20496 | Referenced relevant arrow objects without a complete repair action. | - |
| 5 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 5 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20494 | Referenced relevant arrow objects without a complete repair action. | - |
| 5 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20651 | Used a semantic layout action for the messy cluster. | - |
| 5 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20648 | Used a semantic layout action for the messy cluster. | - |
| 5 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20599 | Used a layout/alignment action for the process steps. | - |
| 5 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21716 | Handled one major part of the multi-step repair. | - |
| 5 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20741 | Organized the layout and emitted a fitText repair. | - |
| 5 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20682 | Handled one major part of the offscreen reconnect task. | - |
| 5 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 151 | Returned a move action for the Start box. | - |
| 5 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 247 | Returned a resize/update action for the Decision box. | - |
| 5 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 5 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 5 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 195 | Returned an update action for the selected offscreen shape. | - |
| 5 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 167 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 5 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 5 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 185 | Returned a move action for the partly visible right shape. | - |
| 5 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 5 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 199 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 5 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 5 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 168 | Returned a connect action from the left Revenue box to Forecast. | - |
| 5 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 226 | Referenced relevant arrow objects without a complete repair action. | - |
| 5 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 238 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 5 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 319 | Referenced relevant arrow objects without a complete repair action. | - |
| 5 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 185 | Used a semantic layout action for the messy cluster. | - |
| 5 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 301 | Used a semantic layout action for the messy cluster. | - |
| 5 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 433 | Used a layout/alignment action for the process steps. | - |
| 5 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 422 | Handled one major part of the multi-step repair. | - |
| 5 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 406 | Organized the layout but did not clearly fit labels. | - |
| 5 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 551 | Handled one major part of the offscreen reconnect task. | - |
| 6 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21047 | Returned a move action for the Start box. | - |
| 6 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 6 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21065 | Returned a label/update action for the title. | - |
| 6 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19314 | Did not target selected-offscreen. | - |
| 6 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19337 | Returned an update action for the selected offscreen shape. | - |
| 6 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 6 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20188 | Returned a move action for the partly visible left shape. | - |
| 6 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 6 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 6 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20235 | Edited an ambiguous target explicitly: partial-left. | - |
| 6 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20245 | Returned a label/update action for the selected Revenue box. | - |
| 6 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 6 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20467 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 6 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 6 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20438 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 6 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20521 | Used a semantic layout action for the messy cluster. | - |
| 6 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20523 | Used a semantic layout action for the messy cluster. | - |
| 6 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20521 | Used a layout/alignment action for the process steps. | - |
| 6 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21546 | Handled one major part of the multi-step repair. | - |
| 6 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 20562 | Organized the layout but did not clearly fit labels. | - |
| 6 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20543 | Handled one major part of the offscreen reconnect task. | - |
| 6 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21081 | Returned a move action for the Start box. | - |
| 6 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21142 | Returned a resize/update action for the Decision box. | - |
| 6 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21068 | Returned a label/update action for the title. | - |
| 6 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 6 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 0 | no | 19325 | Did not update selected-offscreen. | - |
| 6 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19308 | Did not target selected-offscreen. | - |
| 6 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 6 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20186 | Returned a move action for the partly visible right shape. | - |
| 6 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20225 | Returned a label/update action for the partly visible left shape. | - |
| 6 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 20247 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 6 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 6 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20231 | Did not connect partial-left to visible. | - |
| 6 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20501 | Referenced relevant arrow objects without a complete repair action. | - |
| 6 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 6 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20498 | Referenced relevant arrow objects without a complete repair action. | - |
| 6 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20649 | Used a semantic layout action for the messy cluster. | - |
| 6 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20621 | Used a semantic layout action for the messy cluster. | - |
| 6 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20614 | Used a layout/alignment action for the process steps. | - |
| 6 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21726 | Handled one major part of the multi-step repair. | - |
| 6 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20730 | Organized the layout and emitted a fitText repair. | - |
| 6 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 2 | no | 20683 | Referenced relevant objects but did not complete the multi-step reconnect. | - |
| 6 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 6 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 267 | Returned a resize/update action for the Decision box. | - |
| 6 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 6 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 6 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 207 | Returned an update action for the selected offscreen shape. | - |
| 6 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 169 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 6 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 6 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 187 | Returned a move action for the partly visible right shape. | - |
| 6 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 6 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 199 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 6 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 6 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 6 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 276 | Referenced relevant arrow objects without a complete repair action. | - |
| 6 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 201 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 6 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 234 | Referenced relevant arrow objects without a complete repair action. | - |
| 6 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 219 | Used a semantic layout action for the messy cluster. | - |
| 6 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 303 | Used a semantic layout action for the messy cluster. | - |
| 6 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 444 | Used a layout/alignment action for the process steps. | - |
| 6 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 433 | Handled one major part of the multi-step repair. | - |
| 6 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 406 | Organized the layout but did not clearly fit labels. | - |
| 6 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 481 | Handled one major part of the offscreen reconnect task. | - |
| 7 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 7 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 7 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21050 | Returned a label/update action for the title. | - |
| 7 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 19294 | Returned a move action for the selected offscreen shape. | - |
| 7 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19323 | Returned an update action for the selected offscreen shape. | - |
| 7 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 7 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible left shape. | - |
| 7 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 7 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 7 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20236 | Edited an ambiguous target explicitly: partial-left. | - |
| 7 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 7 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 7 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20465 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 7 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 7 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 7 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20521 | Used a semantic layout action for the messy cluster. | - |
| 7 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20528 | Used a semantic layout action for the messy cluster. | - |
| 7 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20527 | Used a layout/alignment action for the process steps. | - |
| 7 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21543 | Handled one major part of the multi-step repair. | - |
| 7 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20604 | Organized the layout and emitted a fitText repair. | - |
| 7 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 4 | yes | 20510 | Moved the selected offscreen node and repaired the loose arrow. | - |
| 7 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21081 | Returned a move action for the Start box. | - |
| 7 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21149 | Returned a resize/update action for the Decision box. | - |
| 7 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21051 | Returned a label/update action for the title. | - |
| 7 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 7 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 0 | no | 19325 | Did not update selected-offscreen. | - |
| 7 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19308 | Did not target selected-offscreen. | - |
| 7 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 7 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20201 | Returned a move action for the partly visible right shape. | - |
| 7 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20225 | Returned a label/update action for the partly visible left shape. | - |
| 7 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20223 | Edited an ambiguous target explicitly: partial-left. | - |
| 7 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 7 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 20262 | Returned a connect action from the left Revenue box to Forecast. | - |
| 7 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20507 | Referenced relevant arrow objects without a complete repair action. | - |
| 7 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 7 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20498 | Referenced relevant arrow objects without a complete repair action. | - |
| 7 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20593 | Used a semantic layout action for the messy cluster. | - |
| 7 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20615 | Used a semantic layout action for the messy cluster. | - |
| 7 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20609 | Used a layout/alignment action for the process steps. | - |
| 7 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21699 | Handled one major part of the multi-step repair. | - |
| 7 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20771 | Organized the layout and emitted a fitText repair. | - |
| 7 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20626 | Handled one major part of the offscreen reconnect task. | - |
| 7 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 7 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 326 | Returned a resize/update action for the Decision box. | - |
| 7 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 7 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 7 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 160 | Returned an update action for the selected offscreen shape. | - |
| 7 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 169 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 7 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 7 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 185 | Returned a move action for the partly visible right shape. | - |
| 7 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 7 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 199 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 7 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 7 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 7 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 225 | Referenced relevant arrow objects without a complete repair action. | - |
| 7 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 201 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 7 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 319 | Referenced relevant arrow objects without a complete repair action. | - |
| 7 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 175 | Used a semantic layout action for the messy cluster. | - |
| 7 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 315 | Used a semantic layout action for the messy cluster. | - |
| 7 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 381 | Used a layout/alignment action for the process steps. | - |
| 7 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 2 | no | 602 | Referenced relevant objects but did not complete the multi-step repair. | - |
| 7 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 267 | Organized the layout but did not clearly fit labels. | - |
| 7 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 551 | Handled one major part of the offscreen reconnect task. | - |
| 8 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 8 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 8 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21050 | Returned a label/update action for the title. | - |
| 8 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 19294 | Returned a move action for the selected offscreen shape. | - |
| 8 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19335 | Returned an update action for the selected offscreen shape. | - |
| 8 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 8 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible left shape. | - |
| 8 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 8 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 8 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20239 | Edited an ambiguous target explicitly: partial-left. | - |
| 8 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 8 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20281 | Did not connect partial-left to visible. | - |
| 8 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20467 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 8 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 8 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 8 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20551 | Used a semantic layout action for the messy cluster. | - |
| 8 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20523 | Used a semantic layout action for the messy cluster. | - |
| 8 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20511 | Used a layout/alignment action for the process steps. | - |
| 8 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21545 | Handled one major part of the multi-step repair. | - |
| 8 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 20565 | Organized the layout but did not clearly fit labels. | - |
| 8 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20543 | Handled one major part of the offscreen reconnect task. | - |
| 8 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21070 | Returned a move action for the Start box. | - |
| 8 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21142 | Returned a resize/update action for the Decision box. | - |
| 8 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21051 | Returned a label/update action for the title. | - |
| 8 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 8 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 0 | no | 19330 | Did not update selected-offscreen. | - |
| 8 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19308 | Did not target selected-offscreen. | - |
| 8 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 8 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20202 | Returned a move action for the partly visible right shape. | - |
| 8 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20228 | Returned a label/update action for the partly visible left shape. | - |
| 8 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 20241 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 8 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 8 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20236 | Did not connect partial-left to visible. | - |
| 8 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20570 | Referenced relevant arrow objects without a complete repair action. | - |
| 8 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 8 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20494 | Referenced relevant arrow objects without a complete repair action. | - |
| 8 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20604 | Used a semantic layout action for the messy cluster. | - |
| 8 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20628 | Used a semantic layout action for the messy cluster. | - |
| 8 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20600 | Used a layout/alignment action for the process steps. | - |
| 8 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21753 | Handled one major part of the multi-step repair. | - |
| 8 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20751 | Organized the layout and emitted a fitText repair. | - |
| 8 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20676 | Handled one major part of the offscreen reconnect task. | - |
| 8 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 8 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 212 | Returned a resize/update action for the Decision box. | - |
| 8 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 8 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 8 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 207 | Returned an update action for the selected offscreen shape. | - |
| 8 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 169 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 8 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 8 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 185 | Returned a move action for the partly visible right shape. | - |
| 8 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 8 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 198 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 8 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 8 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 8 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 225 | Referenced relevant arrow objects without a complete repair action. | - |
| 8 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 201 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 8 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 319 | Referenced relevant arrow objects without a complete repair action. | - |
| 8 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 220 | Used a semantic layout action for the messy cluster. | - |
| 8 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 303 | Used a semantic layout action for the messy cluster. | - |
| 8 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 429 | Used a layout/alignment action for the process steps. | - |
| 8 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 433 | Handled one major part of the multi-step repair. | - |
| 8 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 288 | Organized the layout but did not clearly fit labels. | - |
| 8 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 555 | Handled one major part of the offscreen reconnect task. | - |
| 9 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 9 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21085 | Returned a resize/update action for the Decision box. | - |
| 9 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21066 | Returned a label/update action for the title. | - |
| 9 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19314 | Did not target selected-offscreen. | - |
| 9 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19323 | Returned an update action for the selected offscreen shape. | - |
| 9 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19313 | Returned a move/place action for the selected offscreen note. | - |
| 9 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible left shape. | - |
| 9 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 9 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 9 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20235 | Edited an ambiguous target explicitly: partial-left. | - |
| 9 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 9 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 9 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20465 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 9 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 0 | no | 21076 | Did not handle the duplicate-arrow request. | - |
| 9 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 9 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20527 | Used a semantic layout action for the messy cluster. | - |
| 9 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20523 | Used a semantic layout action for the messy cluster. | - |
| 9 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20534 | Used a layout/alignment action for the process steps. | - |
| 9 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21545 | Handled one major part of the multi-step repair. | - |
| 9 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20615 | Organized the layout and emitted a fitText repair. | - |
| 9 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20523 | Handled one major part of the offscreen reconnect task. | - |
| 9 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21070 | Returned a move action for the Start box. | - |
| 9 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21133 | Returned a resize/update action for the Decision box. | - |
| 9 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21051 | Returned a label/update action for the title. | - |
| 9 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 9 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19383 | Returned an update action for the selected offscreen shape. | - |
| 9 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19308 | Did not target selected-offscreen. | - |
| 9 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 9 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20186 | Returned a move action for the partly visible right shape. | - |
| 9 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20227 | Returned a label/update action for the partly visible left shape. | - |
| 9 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 20241 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 9 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 9 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20228 | Did not connect partial-left to visible. | - |
| 9 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20502 | Referenced relevant arrow objects without a complete repair action. | - |
| 9 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 9 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20502 | Referenced relevant arrow objects without a complete repair action. | - |
| 9 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20626 | Used a semantic layout action for the messy cluster. | - |
| 9 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20621 | Used a semantic layout action for the messy cluster. | - |
| 9 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20601 | Used a layout/alignment action for the process steps. | - |
| 9 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21768 | Handled one major part of the multi-step repair. | - |
| 9 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20745 | Organized the layout and emitted a fitText repair. | - |
| 9 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20680 | Handled one major part of the offscreen reconnect task. | - |
| 9 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 151 | Returned a move action for the Start box. | - |
| 9 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 328 | Returned a resize/update action for the Decision box. | - |
| 9 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 9 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 9 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 266 | Returned an update action for the selected offscreen shape. | - |
| 9 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 167 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 9 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 9 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 181 | Returned a move action for the partly visible right shape. | - |
| 9 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 9 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 199 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 9 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 9 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 177 | Returned a connect action from the left Revenue box to Forecast. | - |
| 9 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 226 | Referenced relevant arrow objects without a complete repair action. | - |
| 9 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 246 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 9 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 219 | Referenced relevant arrow objects without a complete repair action. | - |
| 9 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 218 | Used a semantic layout action for the messy cluster. | - |
| 9 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 340 | Used a semantic layout action for the messy cluster. | - |
| 9 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 263 | Used a layout/alignment action for the process steps. | - |
| 9 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 422 | Handled one major part of the multi-step repair. | - |
| 9 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 288 | Organized the layout but did not clearly fit labels. | - |
| 9 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 481 | Handled one major part of the offscreen reconnect task. | - |
| 10 | `gpt-5.4-mini` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21037 | Returned a move action for the Start box. | - |
| 10 | `gpt-5.4-mini` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21098 | Returned a resize/update action for the Decision box. | - |
| 10 | `gpt-5.4-mini` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21067 | Returned a label/update action for the title. | - |
| 10 | `gpt-5.4-mini` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 19294 | Returned a move action for the selected offscreen shape. | - |
| 10 | `gpt-5.4-mini` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 19337 | Returned an update action for the selected offscreen shape. | - |
| 10 | `gpt-5.4-mini` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 4 | yes | 19315 | Returned a move/place action for the selected offscreen note. | - |
| 10 | `gpt-5.4-mini` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible left shape. | - |
| 10 | `gpt-5.4-mini` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20203 | Returned a move action for the partly visible right shape. | - |
| 10 | `gpt-5.4-mini` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20192 | Returned a label/update action for the partly visible left shape. | - |
| 10 | `gpt-5.4-mini` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 0 | no | 20235 | Edited an ambiguous target explicitly: partial-left. | - |
| 10 | `gpt-5.4-mini` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 10 | `gpt-5.4-mini` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20274 | Did not connect partial-left to visible. | - |
| 10 | `gpt-5.4-mini` | `fix_unbound_arrows` | Current semantic/chunk prompt | 4 | yes | 20465 | Returned a connect-style repair and referenced the unbound arrow context. | - |
| 10 | `gpt-5.4-mini` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 4 | yes | 21038 | Used connect semantics for Start to End without creating an explicit duplicate arrow. | - |
| 10 | `gpt-5.4-mini` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 3 | yes | 20414 | Returned a connect action for the endpoints but may leave the original unbound arrow. | - |
| 10 | `gpt-5.4-mini` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20539 | Used a semantic layout action for the messy cluster. | - |
| 10 | `gpt-5.4-mini` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20499 | Used a semantic layout action for the messy cluster. | - |
| 10 | `gpt-5.4-mini` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20527 | Used a layout/alignment action for the process steps. | - |
| 10 | `gpt-5.4-mini` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21546 | Handled one major part of the multi-step repair. | - |
| 10 | `gpt-5.4-mini` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 20491 | Organized the layout but did not clearly fit labels. | - |
| 10 | `gpt-5.4-mini` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20531 | Handled one major part of the offscreen reconnect task. | - |
| 10 | `gpt-5.4` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 21081 | Returned a move action for the Start box. | - |
| 10 | `gpt-5.4` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 21142 | Returned a resize/update action for the Decision box. | - |
| 10 | `gpt-5.4` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 21052 | Returned a label/update action for the title. | - |
| 10 | `gpt-5.4` | `selected_offscreen_move` | Current semantic/chunk prompt | 0 | no | 19303 | Did not target selected-offscreen. | - |
| 10 | `gpt-5.4` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 0 | no | 19325 | Did not update selected-offscreen. | - |
| 10 | `gpt-5.4` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 0 | no | 19312 | Did not target selected-offscreen. | - |
| 10 | `gpt-5.4` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 20190 | Returned a move action for the partly visible left shape. | - |
| 10 | `gpt-5.4` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 20186 | Returned a move action for the partly visible right shape. | - |
| 10 | `gpt-5.4` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 20228 | Returned a label/update action for the partly visible left shape. | - |
| 10 | `gpt-5.4` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 20247 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 10 | `gpt-5.4` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 20229 | Returned a label/update action for the selected Revenue box. | - |
| 10 | `gpt-5.4` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 0 | no | 20234 | Did not connect partial-left to visible. | - |
| 10 | `gpt-5.4` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 20501 | Referenced relevant arrow objects without a complete repair action. | - |
| 10 | `gpt-5.4` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 3 | yes | 21029 | Avoided editing because the Start to End arrow already exists. | - |
| 10 | `gpt-5.4` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 20494 | Referenced relevant arrow objects without a complete repair action. | - |
| 10 | `gpt-5.4` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 20599 | Used a semantic layout action for the messy cluster. | - |
| 10 | `gpt-5.4` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 20618 | Used a semantic layout action for the messy cluster. | - |
| 10 | `gpt-5.4` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 20605 | Used a layout/alignment action for the process steps. | - |
| 10 | `gpt-5.4` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 21728 | Handled one major part of the multi-step repair. | - |
| 10 | `gpt-5.4` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 4 | yes | 20746 | Organized the layout and emitted a fitText repair. | - |
| 10 | `gpt-5.4` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 20670 | Handled one major part of the offscreen reconnect task. | - |
| 10 | `claude-sonnet-4-5` | `simple_start_move` | Current semantic/chunk prompt | 4 | yes | 167 | Returned a move action for the Start box. | - |
| 10 | `claude-sonnet-4-5` | `simple_decision_resize` | Current semantic/chunk prompt | 4 | yes | 326 | Returned a resize/update action for the Decision box. | - |
| 10 | `claude-sonnet-4-5` | `simple_title_label` | Current semantic/chunk prompt | 4 | yes | 100 | Returned a label/update action for the title. | - |
| 10 | `claude-sonnet-4-5` | `selected_offscreen_move` | Current semantic/chunk prompt | 4 | yes | 88 | Returned a move action for the selected offscreen shape. | - |
| 10 | `claude-sonnet-4-5` | `selected_offscreen_recolor` | Current semantic/chunk prompt | 4 | yes | 160 | Returned an update action for the selected offscreen shape. | - |
| 10 | `claude-sonnet-4-5` | `selected_offscreen_bring_near` | Current semantic/chunk prompt | 2 | no | 166 | Referenced selected-offscreen but did not emit a direct move/place. | - |
| 10 | `claude-sonnet-4-5` | `partial_left_move` | Current semantic/chunk prompt | 4 | yes | 79 | Returned a move action for the partly visible left shape. | - |
| 10 | `claude-sonnet-4-5` | `partial_right_move_into_view` | Current semantic/chunk prompt | 4 | yes | 185 | Returned a move action for the partly visible right shape. | - |
| 10 | `claude-sonnet-4-5` | `partial_left_label` | Current semantic/chunk prompt | 4 | yes | 83 | Returned a label/update action for the partly visible left shape. | - |
| 10 | `claude-sonnet-4-5` | `ambiguous_revenue_move` | Current semantic/chunk prompt | 4 | yes | 200 | Used a selector that can safe-fail locally instead of hard-coding one ambiguous target. | - |
| 10 | `claude-sonnet-4-5` | `ambiguous_selected_revenue_rename` | Current semantic/chunk prompt | 4 | yes | 70 | Returned a label/update action for the selected Revenue box. | - |
| 10 | `claude-sonnet-4-5` | `ambiguous_top_revenue_connect` | Current semantic/chunk prompt | 4 | yes | 171 | Returned a connect action from the left Revenue box to Forecast. | - |
| 10 | `claude-sonnet-4-5` | `fix_unbound_arrows` | Current semantic/chunk prompt | 2 | no | 276 | Referenced relevant arrow objects without a complete repair action. | - |
| 10 | `claude-sonnet-4-5` | `avoid_duplicate_start_end_arrow` | Current semantic/chunk prompt | 2 | no | 335 | Referenced Start and End but did not clearly avoid duplicate creation. | - |
| 10 | `claude-sonnet-4-5` | `connect_start_end_with_unbound_arrow` | Current semantic/chunk prompt | 2 | no | 234 | Referenced relevant arrow objects without a complete repair action. | - |
| 10 | `claude-sonnet-4-5` | `clean_cluster` | Current semantic/chunk prompt | 4 | yes | 176 | Used a semantic layout action for the messy cluster. | - |
| 10 | `claude-sonnet-4-5` | `spread_overlapping_cards` | Current semantic/chunk prompt | 4 | yes | 303 | Used a semantic layout action for the messy cluster. | - |
| 10 | `claude-sonnet-4-5` | `align_process_steps` | Current semantic/chunk prompt | 4 | yes | 431 | Used a layout/alignment action for the process steps. | - |
| 10 | `claude-sonnet-4-5` | `multi_clean_and_fix_arrows` | Current semantic/chunk prompt | 3 | yes | 529 | Handled one major part of the multi-step repair. | - |
| 10 | `claude-sonnet-4-5` | `multi_organize_and_fit_labels` | Current semantic/chunk prompt | 3 | yes | 267 | Organized the layout but did not clearly fit labels. | - |
| 10 | `claude-sonnet-4-5` | `multi_offscreen_reconnect` | Current semantic/chunk prompt | 3 | yes | 481 | Handled one major part of the offscreen reconnect task. | - |

## Tasks

- `simple_start_move` (simple_edits): Move the Start box 10 pixels to the left.
  Expected ids: `start`
- `simple_decision_resize` (simple_edits): Resize the Decision box so it is wider.
  Expected ids: `end`
- `simple_title_label` (simple_edits): Change the title text to "Launch Plan".
  Expected ids: `start`
- `selected_offscreen_move` (selection_offscreen): Move the selected offscreen shape 20 pixels to the right.
  Expected ids: `selected-offscreen`
- `selected_offscreen_recolor` (selection_offscreen): Recolor the selected shape that is outside the viewport.
  Expected ids: `selected-offscreen`
- `selected_offscreen_bring_near` (selection_offscreen): Bring the selected offscreen note next to the visible group.
  Expected ids: `selected-offscreen`
- `partial_left_move` (partial_visibility): Move the partly visible shape on the left 10 pixels to the right.
  Expected ids: `partial-left`
- `partial_right_move_into_view` (partial_visibility): Move the half-visible box on the right into the viewport.
  Expected ids: `partial-right`
- `partial_left_label` (partial_visibility): Label the partly visible rectangle on the left as "Intake".
  Expected ids: `partial-left`
- `ambiguous_revenue_move` (ambiguous_targets): Move the Revenue box 20 pixels right.
  Expected ids: `partial-left`, `partial-right`
- `ambiguous_selected_revenue_rename` (ambiguous_targets): Rename only the selected Revenue box to "Revenue Q1".
  Expected ids: `partial-left`
- `ambiguous_top_revenue_connect` (ambiguous_targets): Connect the Revenue box on the left to Forecast.
  Expected ids: `partial-left`, `visible`
- `fix_unbound_arrows` (arrows_connectors): Fix the arrows that are not connected.
  Expected ids: `start`, `end`, `unbound-arrow`
- `avoid_duplicate_start_end_arrow` (arrows_connectors): Connect Start to End without duplicating an existing arrow.
  Expected ids: `start`, `end`, `bound-arrow`
- `connect_start_end_with_unbound_arrow` (arrows_connectors): Repair the loose arrow so it connects Start to End.
  Expected ids: `start`, `end`, `unbound-arrow`
- `clean_cluster` (layout_cleanup): Clean up this messy cluster without changing the text.
  Expected ids: `cluster-a`, `cluster-b`, `cluster-c`
- `spread_overlapping_cards` (layout_cleanup): Spread the overlapping cards into a readable grid.
  Expected ids: `cluster-a`, `cluster-b`, `cluster-c`
- `align_process_steps` (layout_cleanup): Align the process steps while preserving their order.
  Expected ids: `cluster-a`, `cluster-b`, `cluster-c`
- `multi_clean_and_fix_arrows` (multi_step_repair): Clean the diagram and fix the broken arrows.
  Expected ids: `start`, `end`, `unbound-arrow`, `cluster-a`, `cluster-b`, `cluster-c`
- `multi_organize_and_fit_labels` (multi_step_repair): Organize the flowchart, then fit any overflowing labels.
  Expected ids: `cluster-a`, `cluster-b`, `cluster-c`
- `multi_offscreen_reconnect` (multi_step_repair): Move the selected offscreen node into view and reconnect the loose arrow from Start to End.
  Expected ids: `selected-offscreen`, `start`, `end`, `unbound-arrow`

## Configs

- `p2_p3_semantic_chunk_loop`: Uses CanvasObservation, selector-aware schemas, semantic actions, and the current chunk-preferring response path.

## Interpretation

Best average score among configs without model-call errors: `p2_p3_semantic_chunk_loop` on `claude-sonnet-4-5` with 3.47 / 4.
Use this as a directional signal unless the run used the full benchmark matrix from `docs/stronger_benchmark_design.md`.

## Limitations

- This run uses 10 samples per task/config.
- It scores returned actions structurally; it does not yet replay every model action into the editor and visually inspect the final canvas.
- The config labels approximate refinement levels using prompt/action ablations in the current codebase.
- Estimated dollar cost is shown only when token prices are supplied through environment variables.
