# Full Stronger Benchmark Report

Generated: 2026-05-02

## Scope

This run completed the full benchmark matrix from `docs/stronger_benchmark_design.md`:

| Dimension | Value |
| --- | ---: |
| Tasks | 21 |
| Repetitions | 10 |
| Configs | `baseline_pre_p0_exact`, `refined_p0_p3` |
| Models | `gpt-5.4-mini`, `gpt-5.4`, `claude-sonnet-4-5` |
| Total cases | 1,260 |
| API errors | 0 |

`baseline_pre_p0_exact` used the historical pre-P0 snapshot at commit `caa56d2`. `refined_p0_p3` used the current `p2_p3_semantic_chunk_loop` path: CanvasObservation, selector-aware schemas, semantic actions, and chunk-style responses.

## Overall Result

| Config | Cases | Passed | Success | Avg Score | Wrong Targets | Avg Duration | Avg Tokens | Est. Cost | Cost/Success |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `baseline_pre_p0_exact` | 630 | 214 | 34.0% | 2.00 / 4 | 42 / 630 | 3617 ms | 8322 | $9.73 | $0.0455 |
| `refined_p0_p3` | 630 | 501 | 79.5% | 3.25 / 4 | 24 / 630 | 3201 ms | 13766 | $15.13 | $0.0302 |

Delta: success improved by **+45.6 percentage points**, average score improved by **+1.25 / 4**, and wrong-target cases dropped from **6.7% to 3.8%**. Average token use increased by about **1.65x**. Total estimated cost increased by **55%**, but cost per successful task decreased by **34%**.

## Per Model

| Model | Baseline Success | Refined Success | Delta | Baseline Score | Refined Score | Wrong Target Delta | Token Ratio | Cost/Success |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-mini` | 38.1% | 87.6% | +49.5 pp | 2.15 | 3.36 | -9.0 pp | 1.66x | $0.0253 -> $0.0178 |
| `gpt-5.4` | 35.2% | 70.5% | +35.2 pp | 2.00 | 2.93 | +0.5 pp | 1.66x | $0.0928 -> $0.0748 |
| `claude-sonnet-4-5` | 28.6% | 80.5% | +51.9 pp | 1.86 | 3.47 | 0.0 pp | 1.42x | $0.0141 -> $0.0046 |

## By Task Category

| Category | Baseline Success | Refined Success | Delta | Main Signal |
| --- | ---: | ---: | ---: | --- |
| Simple edits | 100.0% | 100.0% | +0.0 pp | No simple-task regression |
| Selection/offscreen | 36.7% | 55.6% | +18.9 pp | Improved overall, but `gpt-5.4` regressed here |
| Partial visibility | 0.0% | 100.0% | +100.0 pp | Strong P0 observation gain |
| Ambiguous targets | 41.1% | 64.4% | +23.3 pp | Improved, but still has wrong-target cases |
| Arrows/connectors | 21.1% | 42.2% | +21.1 pp | Better semantics, still weak for Claude arrow tasks |
| Layout cleanup | 23.3% | 100.0% | +76.7 pp | Strong semantic `cleanupLayout` gain |
| Multi-step repair | 15.6% | 94.4% | +78.9 pp | Strong P3-style multi-action gain |

## Decision

The refined P0-P3 system behaves better than the exact pre-P0 baseline on this benchmark. It passes the main quality gates: success improves by more than 15 points, simple edits do not regress, aggregate wrong-target rate decreases, cost per successful task decreases, and API error rate is 0%.

Important caveats:

- Token use increased materially, even though cost per successful task decreased.
- `gpt-5.4` regressed on selection/offscreen tasks.
- Ambiguous-target and arrow tasks still need targeted refinement because wrong-target cases remain.

Cost estimates use standard API token prices as of 2026-05-02:

- `gpt-5.4-mini`: $0.75 / 1M input, $4.50 / 1M output.
- `gpt-5.4`: $2.50 / 1M input, $15.00 / 1M output.
- `claude-sonnet-4-5`: $3.00 / 1M input, $15.00 / 1M output.

Pricing sources: OpenAI API pricing (`https://openai.com/api/pricing/`) and Anthropic Claude Sonnet 4.5 docs (`https://docs.claude.com/en/docs/about-claude/models/whats-new-sonnet-4-5`).

Artifacts:

- `frontend/.tsbuild/evals/stronger-benchmark-full-combined.json`
- `frontend/.tsbuild/evals/exact-baseline-pre-p0-full-gpt-5_4-mini.json`
- `frontend/.tsbuild/evals/exact-baseline-pre-p0-full-gpt-5_4.json`
- `frontend/.tsbuild/evals/exact-baseline-pre-p0-full-claude-sonnet-4-5.json`
- `frontend/.tsbuild/evals/model-in-loop.json`
- `docs/model_in_loop_eval_report.md`
