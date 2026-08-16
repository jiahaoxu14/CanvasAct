# CanvasObs full three-model experiment protocol

Status: frozen before the first full-run trial on 2026-08-15. The earlier
Sonnet and GPT-5.4 pilots and the GPT-5.4-mini systems preflight are formative
and are not pooled into this run.

## Design

- Models: `claude-sonnet-4-5`, `gpt-5.4`, and `gpt-5.4-mini`.
- Variants: CanvasObs and Original tldraw.
- Probe configurations: 10 total--three editable-copy rotations, three hidden
  blue-layer rotations, two frame-membership rotations, and two native-binding
  rotations.
- Repetitions: 20 per model, configuration, and variant.
- Total: 1,200 scheduled trials in 600 adjacent matched pairs.
- Each pair uses the same model, probe, rotation, repetition, prompt, initial
  store, camera, viewport, action schema, execution path, and review lifecycle.
  The only treatment difference is the CanvasObservation payload and its
  interpretation guidance.
- Pair order is randomized from the fixed seed
  `canvasobs-full-3models-20260815-v1`.
- Every trial runs through the real browser and worker pipeline with a fixed
  180-second idle deadline.

## Outcomes

1. **Exact target grounding:** all and only the expected candidate IDs moved.
2. **Geometry given grounding:** targets preserve size/state, avoid forbidden
   overlap, and are fully contained in the destination with an 8-pixel inset.
3. **Relation preservation:** required native binding remains present when
   applicable.
4. **Collateral preservation:** no unallowed records are added, removed, or
   updated.
5. **End-to-end success:** grounding, geometry, relation, and collateral checks
   all pass.

Grounding and end-to-end success are the principal outcomes. Geometry is always
reported conditionally on correct grounding and with its denominator shown.

## Failure and retry policy

- The primary run has no outcome-dependent retries. A recorded timeout,
  provider error, browser error, or transport error remains in the dataset.
- A trial with any recorded status other than `complete` is a failure for the
  primary intention-to-treat grounding and end-to-end outcomes. Geometry,
  relation, and collateral components are unavailable without a final store
  and are excluded only from their explicitly conditional denominators.
- Primary paired grounding and end-to-end analyses retain all 600 scheduled
  pairs and treat a failed member as false. Complete-pair results are reported
  only as a sensitivity analysis.
- The report must show attempted/completed/failed counts by model and variant,
  failure types, complete-pair counts, and a failure-as-zero sensitivity
  analysis for end-to-end success.
- Restarting the runner may resume only unscheduled/missing trial IDs. Recorded
  failures are never replaced in the primary run.

## Analysis

- Report all outcomes separately by model, variant, probe family, and rotation
  before any pooled summary.
- Use exact two-sided McNemar tests for paired binary outcomes and paired
  bootstrap confidence intervals for rate differences. Treat pooled
  cross-model results as secondary.
- Report model calls, latency, timeouts, and abstentions descriptively.
- Do not interpret a grounding gain as a geometry gain, and do not describe
  pilot-tuned canonical-only results as confirmatory evidence.
- Preserve raw JSONL, schedule, per-trial metadata, screenshots, run config,
  and analysis outputs. Do not overwrite or delete failed trials.

## Launch checks

Before launch, the 103 scorer assertions, 11 observation-case tests, seven
lifecycle regressions, and agent-variant parity checks must pass. Each provider
model must have a successful systems preflight with real trajectories and no
transport or authentication error.

The viewport wording was changed during formative preflight from "current
working copy" to "editable copy." All formative data are excluded, the eval
fixture wording is authoritative, and no prompt, fixture, scorer, or rotation
changes are permitted after the first full-run trial.

## Frozen source provenance

- Git HEAD: `f115f724d7ac717a3742f695126ec0a459d3dbc9`
- Aggregate SHA-256 over 203 files in `frontend/client`, `shared`, `worker`,
  `scripts`, and `tests`, plus package and Vite configuration files:
  `8896294be0ac644860fd1d738520e77a75ef98b20a05db16864ebaf11deb044d`
- `frontend/package.json` SHA-256:
  `85e769dac6cb467bab1d6c15b3ef6b2114738072e9250ca0dbe9a80922635581`
- `frontend/package-lock.json` SHA-256:
  `b4c862009ab9de29dbd7fbd3cc02a03e28b344afc6b144b1b7e16bbb8be3d58c`
- Node.js `v22.17.0`; Playwright `1.62.1`.
- The run directory contains a compressed snapshot of these source files and a
  copy of this protocol. The dedicated server was started from this snapshot's
  working state and no source edits or HMR updates are allowed during the run.
