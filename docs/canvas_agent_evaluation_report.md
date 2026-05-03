# Canvas Agent Evaluation Report

Generated: 2026-05-02

## Result

The refined P0-P3 agent performed better than the exact pre-P0 baseline on the current compact evaluation.

| Version | Cases | Success Rate | Avg Score | Wrong-Target Cases | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact pre-P0 baseline | 25 | 40% | 2.40 / 4 | 5 / 25 | 0 |
| Refined P0-P3 | 25 | 100% | 4.00 / 4 | 0 / 25 | 0 |

Net change:

- Success rate improved by **+60 percentage points**.
- Wrong-target failures dropped from **5** to **0**.
- Average response duration increased by about **525 ms**.

## Task Breakdown

| Task | Baseline | Refined | What Changed |
| --- | ---: | ---: | --- |
| Selected offscreen object | 5 / 5 | 5 / 5 | No regression |
| Partly visible object | 0 / 5 | 5 / 5 | Refined targeted the partly visible shape correctly |
| Simple visible object | 5 / 5 | 5 / 5 | No regression |
| Fix unbound arrows | 0 / 5 | 5 / 5 | Refined used semantic `connect` actions |
| Clean clustered layout | 0 / 5 | 5 / 5 | Refined used semantic `cleanupLayout` actions |

## Interpretation

The result supports that P0-P3 improved agent behavior in this system:

- **P0** gave the model clearer scene grounding through `CanvasObservation`.
- **P1** made target selection safer with explicit selectors.
- **P2** gave the model higher-level canvas actions instead of fragile raw edits.
- **P3** added verification and repair hooks around action chunks.

The strongest gains appeared on tasks where the baseline needed to reason about partially visible objects, broken arrows, or messy layouts.

## Caveat

This is directional evidence, not a final production benchmark. The live test used 5 tasks, 5 repetitions each, and one model (`gpt-5.4-mini`). A stronger benchmark should add more tasks, more repetitions, multiple models, token-cost tracking, and visual replay/human quality scoring.

## Artifacts

- `frontend/.tsbuild/evals/exact-baseline-pre-p0-model-in-loop.json`
- `frontend/.tsbuild/evals/model-in-loop.json`
- `docs/baseline_vs_refined_evaluation_results.md`
