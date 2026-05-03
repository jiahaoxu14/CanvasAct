# Stronger Canvas Agent Benchmark Design

Generated: 2026-05-02

## Goal

Compare the exact pre-P0 baseline against the refined P0-P3 agent with enough coverage to answer:

```text
Does P0-P3 improve task success without unacceptable increases in wrong edits, latency, or token cost?
```

## Benchmark Matrix

Recommended full benchmark:

| Dimension | Design |
| --- | --- |
| Configs | `baseline_pre_p0_exact`, `refined_p0_p3` |
| Tasks | 21 canvas tasks |
| Repetitions | 10 runs per task/config/model |
| Models | 3 models |
| Total model calls | 21 x 10 x 2 x 3 = 1,260 |

Lower-cost pilot:

| Dimension | Design |
| --- | --- |
| Tasks | 10 canvas tasks |
| Repetitions | 5 runs per task/config/model |
| Models | 2 models |
| Total model calls | 10 x 5 x 2 x 2 = 200 |

## Task Set

Use tasks that map directly to the P0-P3 changes. Each category should contain 3 concrete fixtures.

| Category | Count | Example Tasks | Primary Signal |
| --- | ---: | --- | --- |
| Simple edits | 3 | Move the Start box 20px right; resize the Decision box wider; change the title text to "Launch Plan" | Regression check |
| Selection/offscreen | 3 | Move the selected offscreen shape right; recolor the selected shape that is outside the viewport; bring the selected offscreen note next to the visible group | P0 observation quality |
| Partial visibility | 3 | Label the partly visible rectangle; move the half-visible box into the viewport; connect the partly visible Start node to End | P0 viewport grounding |
| Ambiguous targets | 3 | Move the Revenue box when two exist; rename only the selected Revenue box; connect the Revenue box in the top row to Forecast | P1 target safety |
| Arrows/connectors | 3 | Fix arrows that are not connected; connect Start to Process without duplicating an existing arrow; repair arrows pointing to the wrong target | P2 semantic `connect` |
| Layout cleanup | 3 | Clean up this clustered flowchart; spread overlapping cards into a readable grid; align the process steps while preserving arrow direction | P2 semantic `cleanupLayout` |
| Multi-step repair | 3 | Clean the diagram and fix broken arrows; organize the flowchart, then fit overflowing labels; move the selected offscreen node into view and reconnect it | P3 chunk verification |

Total: 21 tasks.

## Model Matrix

Run the same task/config set across multiple model sizes.

| Model Tier | Purpose |
| --- | --- |
| Small/fast model | Tests whether P0-P3 helps weaker or cheaper models |
| Mid model | Main production-like comparison |
| Strong model | Tests whether gains persist when model reasoning is stronger |

Record the exact model names in the final report, for example:

```text
gpt-5.4-mini
gpt-5.4
gpt-5.5
```

## Metrics

Primary quality metrics:

| Metric | Definition | Better |
| --- | --- | --- |
| Success rate | Percent of runs with score >= 3 | Higher |
| Average score | Mean 0-4 task score | Higher |
| Wrong-target rate | Runs that edit unintended objects | Lower |
| Critical lint count | Unbound arrows, overlaps, overflow after task | Lower |
| Simple-task regression | Success change on simple edits | No drop |

Performance and cost metrics:

| Metric | Definition | Better |
| --- | --- | --- |
| Total latency | End-to-end task time in ms | Lower |
| Latency to first action | Time until first executable action | Lower |
| Model calls per task | Number of model requests | Lower |
| Input tokens | Prompt/context tokens | Lower |
| Output tokens | Completion/action tokens | Lower |
| Total tokens | Input + output tokens | Lower |
| Estimated cost | Tokens x model price | Lower |
| Cost per success | Estimated cost / successful runs | Lower |

## Token-Cost Tracking

Each model run should save token usage and estimated cost.

```json
{
  "config": "refined_p0_p3",
  "model": "gpt-5.4-mini",
  "taskId": "partial_visibility_01",
  "runIndex": 3,
  "metrics": {
    "score": 4,
    "success": true,
    "wrongTargetEdits": 0,
    "latencyMs": 2140,
    "modelCalls": 1,
    "inputTokens": 8200,
    "outputTokens": 420,
    "totalTokens": 8620,
    "estimatedCostUsd": 0.0124,
    "costPerSuccessUsd": 0.0124
  }
}
```

Cost should be reported both as total cost and cost per successful task:

```text
total_cost = sum(estimatedCostUsd)
cost_per_success = total_cost / successful_runs
```

## Report Format

Overall table:

| Config | Model | Success | Avg Score | Wrong Target | Latency | Tokens/Run | Cost/Success |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `baseline_pre_p0_exact` | model A | TBD | TBD | TBD | TBD | TBD | TBD |
| `refined_p0_p3` | model A | TBD | TBD | TBD | TBD | TBD | TBD |

Task-category table:

| Category | Baseline Success | Refined Success | Delta | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Partial visibility | TBD | TBD | TBD | Tests P0 |
| Ambiguous targets | TBD | TBD | TBD | Tests P1 |
| Arrows/connectors | TBD | TBD | TBD | Tests P2 |
| Multi-step repair | TBD | TBD | TBD | Tests P3 |

## Decision Rule

Call P0-P3 better if all are true:

```text
overall success improves by >= 15 percentage points
wrong-target rate does not increase
simple-edit success drops by <= 3 percentage points
cost per success increases by <= 25%, or quality gain clearly justifies it
model/API error rate stays below 5%
```

Call the result inconclusive if gains appear only on one model, only one task category, or if API/model errors exceed 5%.
