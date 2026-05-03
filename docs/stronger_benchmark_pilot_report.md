# Stronger Benchmark Pilot Report

Generated: 2026-05-02

## Scope

This was the approved lower-cost pilot from `stronger_benchmark_design.md`.

| Item | Value |
| --- | --- |
| Model calls | 200 |
| Tasks | 10 |
| Repetitions | 5 per task/config/model |
| Models | `gpt-5.4-mini`, `gpt-5.4` |
| Configs | `legacy_shape_list`, `p2_p3_semantic_chunk_loop` |

Important limitation: this pilot compares current-code prompt/action ablations. It does **not** rerun the exact historical pre-P0 commit.

## Overall Result

| Model | Config | Success | Avg Score | Wrong-Target Runs | Avg Latency | Avg Tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-mini` | Legacy shape-list | 50% | 2.70 / 4 | 5 / 50 | 1725 ms | 14,608 |
| `gpt-5.4-mini` | Refined P0-P3 style | 90% | 3.50 / 4 | 5 / 50 | 1175 ms | 20,255 |
| `gpt-5.4` | Legacy shape-list | 58% | 2.84 / 4 | 6 / 50 | 3480 ms | 14,677 |
| `gpt-5.4` | Refined P0-P3 style | 80% | 3.10 / 4 | 5 / 50 | 2635 ms | 20,318 |

Net effect:

- `gpt-5.4-mini`: success improved by **+40 percentage points**.
- `gpt-5.4`: success improved by **+22 percentage points**.
- Simple edit tasks stayed at **100%** for both configs and both models.
- Refined used about **38-39% more tokens per run**, but latency was lower in this run.
- Dollar cost was not computed because model price env vars were not supplied; token usage was captured.

## Category Result

| Category | `gpt-5.4-mini` Legacy -> Refined | `gpt-5.4` Legacy -> Refined | Interpretation |
| --- | ---: | ---: | --- |
| Simple edits | 100% -> 100% | 100% -> 100% | No regression |
| Selection/offscreen | 100% -> 100% | 100% -> 100% | No regression |
| Partial visibility | 100% -> 100% | 100% -> 100% | No regression in this pilot |
| Ambiguous targets | 0% -> 0% | 20% -> 0% | Still weak; refined edited an ambiguous target |
| Arrows/connectors | 0% -> 100% | 30% -> 50% | Refined helped, especially on mini |
| Layout cleanup | 0% -> 100% | 0% -> 100% | Strong refined gain |
| Multi-step repair | 50% -> 100% | 50% -> 100% | Strong refined gain |

## Interpretation

The refined P0-P3 style config behaved better on this pilot. The main gains came from semantic actions and chunk-oriented repair behavior:

- Arrow tasks improved because refined prompts could use `connect`.
- Layout tasks improved because refined prompts could use `cleanupLayout` or related semantic layout actions.
- Multi-step tasks improved because refined prompts could combine movement, repair, and layout operations more reliably.

The main unresolved failure is ambiguous target safety. Both refined model runs still edited one of the ambiguous `Revenue` boxes instead of safely failing or asking for disambiguation.

## Decision

The pilot supports keeping the refined P0-P3 direction:

```text
success improved by >= 15 percentage points: yes
simple-edit regression <= 3 percentage points: yes
model/API error rate < 5%: yes, 0 errors
wrong-target rate did not increase: yes for mini, improved slightly for gpt-5.4
token/cost acceptable: inconclusive until dollar prices are supplied
```

Recommended next fix before a full benchmark: improve ambiguous-target behavior so the agent uses safe selectors or asks for clarification instead of editing one matching object.

## Artifacts

- JSON artifact: `frontend/.tsbuild/evals/model-in-loop.json`
- Auto-generated detailed report: `docs/model_in_loop_eval_report.md`
- Benchmark design: `docs/stronger_benchmark_design.md`
