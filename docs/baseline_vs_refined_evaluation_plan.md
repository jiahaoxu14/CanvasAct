# Baseline vs Refined Canvas Agent Evaluation Plan

This plan compares the original baseline agent with the refined P0-P3 system.

## Goal

Answer one question:

> Does the refined P0-P3 system complete canvas tasks more reliably than the baseline without increasing cost, latency, or wrong edits too much?

Primary comparison:

| Config | Meaning |
| --- | --- |
| `baseline_pre_p0` | Original system before `CanvasObservation`, target selectors, semantic actions, chunk verification, and trajectory evals |
| `refined_p0_p3` | Current refined system with `CanvasObservation`, target selectors, semantic actions, verification, chunks, trajectories, and eval hooks |

Optional ablations:

| Config | Purpose |
| --- | --- |
| `p0_only` | Measures whether better observation alone helps |
| `p0_p1` | Measures selectors without semantic actions |
| `p0_p2` | Measures semantic actions and verification before full chunk loop |
| `p0_p3` | Full refined system |

## Setup

Use exact version-control boundaries:

```text
baseline_pre_p0:
  git branch or tag before P0 changes

refined_p0_p3:
  current branch after P0-P3 changes
```

Keep fixed across configs:

- same model, for example `gpt-5.4-mini`
- same temperature, ideally `0`
- same user prompts
- same canvas fixtures
- same viewport bounds
- same scoring scripts
- same max model-call and action budget

Run each model-in-loop task multiple times:

```text
minimum: 5 runs per task/config
better: 10-30 runs per task/config
```

One model response is not enough evidence because model outputs vary across runs.

## Task Suite

Use tasks that stress the actual P0-P3 refinements.

| Category | Example task | What it tests |
| --- | --- | --- |
| Visibility | "Move the selected offscreen shape 20px right." | P0 object recall and selection grounding |
| Partial viewport | "Label the partly visible rectangle." | P0 partial visibility |
| Selection | "Align these." | P1 selected target resolution |
| Ambiguity | "Move the Revenue box." with two Revenue boxes | P1 safe failure |
| Arrows | "Fix arrows that are not connected." | P2 `connect` and verification |
| Duplicate prevention | "Connect Start to End." when an arrow already exists | P2 duplicate avoidance |
| Layout cleanup | "Clean up this messy cluster." | P2 `cleanupLayout` |
| Text fitting | "Make labels fit inside the boxes." | P2 `fitText` |
| Multi-step | "Clean this diagram and fix broken arrows." | P3 chunk loop and repair |
| Regression | "Move this one box left." | Ensures simple tasks do not get worse |

## Metrics

Primary metrics:

| Metric | Definition | Better direction |
| --- | --- | --- |
| Task success rate | Percent of tasks satisfying the final expected state | Higher |
| Verifier pass rate | Percent of local postconditions passed | Higher |
| Wrong-target edit rate | Percent of actions modifying unintended shapes | Lower |
| Critical lint count | Unbound arrows, overlaps, overflow after task | Lower |
| Repair loop count | Number of self-repair requests | Lower, unless success improves |
| Model calls per task | Total model calls needed | Lower |
| Primitive edit count | Number of low-level canvas edits | Lower when quality is unchanged |
| Latency to first action | Time before user sees progress | Lower |
| Total latency | Full task completion time | Lower |
| Token cost | Prompt plus completion tokens | Lower |
| Human visual score | 0-4 layout/readability score | Higher |

Task scoring rubric:

| Score | Meaning |
| ---: | --- |
| 0 | Failed, edited wrong objects, or lost important content |
| 1 | Minor part completed, major errors remain |
| 2 | Mostly attempted, but visible defects remain |
| 3 | Correct result with minor cosmetic issues |
| 4 | Correct, clean, verified, no unnecessary edits |

Use this success threshold:

```text
task_success = score >= 3
```

Strong refined-system target:

```text
refined success rate >= baseline + 15 percentage points
wrong-target edit rate <= baseline
critical lint count <= baseline
average score >= 3.5
```

## Offline Evaluation

Run deterministic tests without a model first. These check whether the local P0-P3 mechanics work independent of model quality.

| Eval | Expected result |
| --- | --- |
| partial visibility fixture | Partial objects appear in `CanvasObservation` |
| selected offscreen fixture | Selected offscreen object is included |
| arrow relation fixture | Bound and unbound arrows are detected |
| selector selected | Selected selector resolves exact ids |
| selector ambiguous text | Ambiguity safe-fails |
| cleanup action | Overlap count decreases |
| connect action | Created arrows are bound |
| verifier | Failed postconditions are detected |

Current local command:

```bash
cd frontend
npm run eval:canvas-agent
```

## Model-In-The-Loop Evaluation

Run live model tasks after offline checks pass.

Every run should save a stable artifact:

```json
{
  "config": "baseline_pre_p0",
  "model": "gpt-5.4-mini",
  "fixtureId": "task_clean_cluster",
  "request": "Clean up this messy cluster without changing the text.",
  "initialObservation": null,
  "actions": [],
  "chunks": null,
  "verifierResults": null,
  "finalObservation": null,
  "metrics": {
    "score": 4,
    "taskSuccess": true,
    "wrongTargetEdits": 0,
    "criticalLintCount": 0,
    "repairLoops": 1,
    "latencyMs": 2300
  }
}
```

For the baseline, fields such as `CanvasObservation`, `chunks`, or verifier results may be absent. Keep the schema stable and use `null`.

## Analysis Format

Overall comparison:

| Config | Success | Avg score | Wrong target | Critical lints | Repair loops | Latency | Cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `baseline_pre_p0` | 52% | 2.4 | 8% | 1.7 | 0.0 | 1.8s | 1.0x |
| `refined_p0_p3` | 78% | 3.4 | 2% | 0.4 | 0.6 | 2.4s | 1.2x |

Break down by task category:

| Category | Baseline success | Refined success | Interpretation |
| --- | ---: | ---: | --- |
| Visibility | 40% | 90% | P0 likely helps |
| Selection | 55% | 85% | P1 likely helps |
| Arrows | 35% | 80% | P2 likely helps |
| Multi-step | 20% | 70% | P3 likely helps |
| Simple edits | 95% | 93% | Watch for regression |

## Decision Rule

Call the refined system better if:

```text
overall task success improves by >= 15 percentage points
wrong-target edit rate does not increase
critical lint count decreases
simple-task success does not regress by more than 3 percentage points
```

Call the result inconclusive if:

```text
sample size is too small
model/API failures exceed 5%
improvements only appear in one task type
```

## Recommended First Experiment

Meaningful first run:

```text
configs:
  baseline_pre_p0
  refined_p0_p3

tasks:
  10 fixtures

runs:
  10 runs per task/config

total:
  200 model runs
```

Lower-cost first run:

```text
configs:
  baseline_pre_p0
  refined_p0_p3

tasks:
  5 fixtures

runs:
  5 runs per task/config

total:
  50 model runs
```

The lower-cost run is enough for a directional result, but not a final claim.
