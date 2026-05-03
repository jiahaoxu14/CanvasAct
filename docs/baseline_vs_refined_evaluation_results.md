# Baseline vs Refined Canvas Agent Evaluation Results

Generated: 2026-05-02

## Scope

This report conducts the compact evaluation from `baseline_vs_refined_evaluation_plan.md`.

The exact pre-P0 boundary used here is commit `caa56d2`. P0 was introduced in `1087d27`.

The exact pre-P0 run used the historical baseline worker prompt/schema/model code from `caa56d2` in a temporary snapshot, with the same three fixture prompts and the same structural scoring rubric as the refined run. The current-code ablation run is also included as a consistency check.

| Report config | Evaluation source | Meaning |
| --- | --- | --- |
| `baseline_pre_p0_exact` | commit `caa56d2` temp snapshot | Historical pre-P0 worker prompt/schema/model code |
| `baseline_pre_p0_approx` | current `legacy_shape_list` ablation | Current-code baseline-style legacy shape-list prompt with primitive actions |
| `refined_p0_p3` | current `p2_p3_semantic_chunk_loop` | Current observation, selector-aware schemas, semantic actions, and chunk-preferring response path |

Artifacts:

- Offline JSON: `frontend/.tsbuild/evals/canvas-agent-initial.json`
- Exact baseline JSON: `frontend/.tsbuild/evals/exact-baseline-pre-p0-model-in-loop.json`
- Live model JSON: `frontend/.tsbuild/evals/model-in-loop.json`
- Live model markdown: `docs/model_in_loop_eval_report.md`

## Commands Run

Offline deterministic eval:

```bash
cd frontend
npm run eval:canvas-agent
```

Live model-in-loop eval:

```bash
cd frontend
MODEL_IN_LOOP_EVAL_MODEL=gpt-5.4-mini \
MODEL_IN_LOOP_EVAL_CONFIGS=legacy_shape_list,p2_p3_semantic_chunk_loop \
MODEL_IN_LOOP_EVAL_REPETITIONS=5 \
npm run eval:model-in-loop
```

Exact pre-P0 baseline run:

```bash
cd /private/tmp/canvasact-baseline-caa56d2.kdowx9/frontend
MODEL_IN_LOOP_EVAL_MODEL=gpt-5.4-mini \
EXACT_BASELINE_EVAL_REPETITIONS=5 \
CANVASACT_CURRENT_ROOT=/Users/jiahaoxu/Github/CanvasAct \
node .tsbuild/run-exact-baseline-model-eval.mjs
```

## Offline Deterministic Results

The deterministic local suite passed.

| Metric | Result |
| --- | ---: |
| Fixtures | 9 |
| Passed | 9 |
| Failed | 0 |
| Average score | 4.00 / 4 |

Covered fixture groups:

- observation: partial visibility, arrow relations, selected offscreen objects
- selector: selected-shape resolution, ambiguous label safe-fail
- action: selected alignment
- lint/verifier: overlapping text detection
- trajectory: unbound arrow repair, cluster cleanup

Interpretation: the local P0-P3 mechanics used by the refined system are working on the deterministic fixtures before involving a live model.

## Live Model-In-The-Loop Results

Model: `gpt-5.4-mini`

Repetitions: 5 per task/config

Tasks:

- `selected_offscreen_move`
- `partial_left_move`
- `simple_start_move`
- `fix_unbound_arrows`
- `clean_cluster`

Overall comparison:

| Config | Cases | Passed | Success rate | Avg score | Model errors | Avg duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `baseline_pre_p0_exact` | 25 | 10 | 40% | 2.40 / 4 | 0 | 1566 ms |
| `refined_p0_p3` | 25 | 25 | 100% | 4.00 / 4 | 0 | 2091 ms |

Delta:

| Metric | Change |
| --- | ---: |
| Success rate | +60 percentage points |
| Average score | +1.60 / 4 |
| Average duration | +525 ms |
| Model-call errors | no increase |

Per-task comparison:

| Task | Exact baseline success | Refined success | Baseline avg score | Refined avg score | Main difference |
| --- | ---: | ---: | ---: | ---: | --- |
| `selected_offscreen_move` | 5 / 5 | 5 / 5 | 4.00 | 4.00 | Both configs handled the selected offscreen move |
| `partial_left_move` | 0 / 5 | 5 / 5 | 0.00 | 4.00 | Baseline moved the fully visible shape; refined targeted `partial-left` |
| `simple_start_move` | 5 / 5 | 5 / 5 | 4.00 | 4.00 | Simple visible-object move did not regress |
| `fix_unbound_arrows` | 0 / 5 | 5 / 5 | 2.00 | 4.00 | Baseline emitted `update`; refined emitted `connect` |
| `clean_cluster` | 0 / 5 | 5 / 5 | 2.00 | 4.00 | Baseline emitted primitive `move`s; refined emitted `cleanupLayout` |

Structural wrong-target rate:

| Config | Wrong-target cases |
| --- | ---: |
| `baseline_pre_p0_exact` | 5 / 25 |
| `refined_p0_p3` | 0 / 25 |

Current-code ablation consistency check:

| Config | Cases | Passed | Success rate | Avg score | Model errors | Avg duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `baseline_pre_p0_approx` | 25 | 15 | 60% | 3.20 / 4 | 0 | 2107 ms |
| `refined_p0_p3` | 25 | 25 | 100% | 4.00 / 4 | 0 | 2091 ms |

## Decision Against The Plan

For the compact runnable comparison, the refined system passes the planned improvement rule:

```text
overall task success improves by >= 15 percentage points
wrong-target edit rate does not increase
critical lint count does not increase in the measured deterministic suite
simple selected-shape task does not regress
```

Evidence:

- success improved from 40% to 100%
- average score improved from 2.40 to 4.00
- model-call errors stayed at 0
- wrong-target structural cases dropped from 5/25 to 0/25
- offline deterministic eval passed 9/9
- the simple selected offscreen move stayed at 5/5 for both configs
- the simple visible Start-box move stayed at 5/5 for both configs

## Interpretation

The refined P0-P3 path behaved better than the exact pre-P0 baseline on the available compact task set.

The main improvement came from P2/P3-style behavior:

- partial-visibility tasks targeted `partial-left` instead of the fully visible object
- arrow tasks used `connect` instead of vague `update`
- layout tasks used `cleanupLayout` instead of multiple primitive `move`s
- chunk/semantic schemas gave the model a more direct way to express successful edits

The refined config was slower than the exact baseline in this run by 525 ms on average. That latency increase is small relative to the success-rate gain in this compact task set, but latency and token cost still need direct measurement before making a production claim.

P0 alone is not isolated in this primary comparison. The current result supports the full refined path, not a claim that every individual phase independently improves success.

## Remaining Gaps

This is a useful directional result, but not the full comprehensive evaluation described in the plan.

Missing or weakly covered items:

- 10-task model-in-loop suite
- visual replay of final canvas state after every model action
- token cost measurement
- human visual scoring
- broad simple-task regression suite
- repeated runs across multiple models
- full browser/UI replay of the historical baseline; the exact baseline run used historical worker prompt/schema/model code with manually constructed fixture prompt parts

Recommended next step:

Expand the fixture set to at least ten live model tasks, add final canvas replay/visual scoring, and run the same repeated harness across exact git worktrees or feature-flagged builds with a compatible artifact schema.
