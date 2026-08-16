# Pilot paired analysis: preflight-gpt54-mini-20260815-v1

> **Pilot: n=1 matched pairs (2 complete trials).** This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.

Profile: `pilot`. Models: `gpt-5.4-mini`. Rotations: `editable-middle`.

Geometry is reported only among correctly grounded trials. Consequently, its denominator can differ by variant and it should not be read as an all-trial success rate.

## Per-variant results

| Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CanvasObs | 1 | 1/1 (100%) | 0/1 (0%) | 0/1 (0%) | 1/1 (100%) | 1 (n=1) | 3.9 s (n=1) | 0.12 s (n=1) |
| Original tldraw | 1 | 0/1 (0%) | 0/0 (n/a) | 0/1 (0%) | 0/1 (0%) | 4 (n=1) | 10.12 s (n=1) | 0.17 s (n=1) |

## Per-case results

| Case | Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `viewport-coverage` | CanvasObs | 1 | 1/1 (100%) | 0/1 (0%) | 0/1 (0%) | 1/1 (100%) | 1 (n=1) | 3.9 s (n=1) | 0.12 s (n=1) |
| `viewport-coverage` | Original tldraw | 1 | 0/1 (0%) | 0/0 (n/a) | 0/1 (0%) | 0/1 (0%) | 4 (n=1) | 10.12 s (n=1) | 0.17 s (n=1) |

## Matched-pair analysis

1 of 1 pair IDs were complete and valid; 0 were incomplete or invalid.

| Outcome | Eligible pairs | Both pass | CanvasObs only | Original tldraw only | Both fail | Discordant | Exact two-sided McNemar p |
|---|---:|---:|---:|---:|---:|---:|---:|
| Grounding | 1 | 0 | 1 | 0 | 0 | 1 | 1 (1/1) |
| Overall | 1 | 0 | 0 | 0 | 1 | 0 | 1 (1/1) |

### Pair counts by case

| Case | Outcome | Pairs | Both pass | CanvasObs only | Original only | Both fail | Exact p |
|---|---|---:|---:|---:|---:|---:|---:|
| `viewport-coverage` | Grounding | 1 | 0 | 1 | 0 | 0 | 1 (1/1) |
| `viewport-coverage` | Overall | 1 | 0 | 0 | 0 | 1 | 1 (1/1) |

## Interpretation

This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.

The exact McNemar tests use only discordant matched pairs. With this pilot sample, large observed rate differences can still yield coarse p-values; the full counterbalanced run is required for inferential claims.
