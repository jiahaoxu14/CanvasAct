# Pilot paired analysis: pilot-sonnet-20260815

> **Pilot: n=8 matched pairs (16 complete trials).** This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.

Profile: `pilot`. Models: `claude-sonnet-4-5`. Rotations: `blue-middle`, `editable-middle`, `calls-attached`, `upper-bound`.

Geometry is reported only among correctly grounded trials. Consequently, its denominator can differ by variant and it should not be read as an all-trial success rate.

## Per-variant results

| Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CanvasObs | 8 | 8/8 (100%) | 3/8 (37.5%) | 3/8 (37.5%) | 8/8 (100%) | 1.63 (n=8) | 15.33 s (n=8) | 6.13 s (n=8) |
| Original tldraw | 8 | 4/8 (50%) | 1/4 (25%) | 1/8 (12.5%) | 4/8 (50%) | 2.25 (n=8) | 17.5 s (n=8) | 4.31 s (n=8) |

## Per-case results

| Case | Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `object-state` | CanvasObs | 2 | 2/2 (100%) | 0/2 (0%) | 0/2 (0%) | 2/2 (100%) | 2 (n=2) | 16.56 s (n=2) | 7.54 s (n=2) |
| `object-state` | Original tldraw | 2 | 0/2 (0%) | 0/0 (n/a) | 0/2 (0%) | 0/2 (0%) | 1 (n=2) | 8.01 s (n=2) | 4.64 s (n=2) |
| `viewport-coverage` | CanvasObs | 2 | 2/2 (100%) | 1/2 (50%) | 1/2 (50%) | 2/2 (100%) | 2 (n=2) | 14.31 s (n=2) | 5.35 s (n=2) |
| `viewport-coverage` | Original tldraw | 2 | 1/2 (50%) | 0/1 (0%) | 0/2 (0%) | 1/2 (50%) | 5.5 (n=2) | 34.39 s (n=2) | 4.72 s (n=2) |
| `workspace-structure` | CanvasObs | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 1.5 (n=2) | 20.78 s (n=2) | 5.52 s (n=2) |
| `workspace-structure` | Original tldraw | 2 | 1/2 (50%) | 1/1 (100%) | 1/2 (50%) | 1/2 (50%) | 1 (n=2) | 14.91 s (n=2) | 3.59 s (n=2) |
| `explicit-relations` | CanvasObs | 2 | 2/2 (100%) | 0/2 (0%) | 0/2 (0%) | 2/2 (100%) | 1 (n=2) | 9.68 s (n=2) | 6.13 s (n=2) |
| `explicit-relations` | Original tldraw | 2 | 2/2 (100%) | 0/2 (0%) | 0/2 (0%) | 2/2 (100%) | 1.5 (n=2) | 12.69 s (n=2) | 4.3 s (n=2) |

## Matched-pair analysis

8 of 8 pair IDs were complete and valid; 0 were incomplete or invalid.

| Outcome | Eligible pairs | Both pass | CanvasObs only | Original tldraw only | Both fail | Discordant | Exact two-sided McNemar p |
|---|---:|---:|---:|---:|---:|---:|---:|
| Grounding | 8 | 4 | 4 | 0 | 0 | 4 | 0.125 (1/8) |
| Overall | 8 | 1 | 2 | 0 | 5 | 2 | 0.5 (1/2) |

### Pair counts by case

| Case | Outcome | Pairs | Both pass | CanvasObs only | Original only | Both fail | Exact p |
|---|---|---:|---:|---:|---:|---:|---:|
| `object-state` | Grounding | 2 | 0 | 2 | 0 | 0 | 0.5 (1/2) |
| `object-state` | Overall | 2 | 0 | 0 | 0 | 2 | 1 (1/1) |
| `viewport-coverage` | Grounding | 2 | 1 | 1 | 0 | 0 | 1 (1/1) |
| `viewport-coverage` | Overall | 2 | 0 | 1 | 0 | 1 | 1 (1/1) |
| `workspace-structure` | Grounding | 2 | 1 | 1 | 0 | 0 | 1 (1/1) |
| `workspace-structure` | Overall | 2 | 1 | 1 | 0 | 0 | 1 (1/1) |
| `explicit-relations` | Grounding | 2 | 2 | 0 | 0 | 0 | 1 (1/1) |
| `explicit-relations` | Overall | 2 | 0 | 0 | 0 | 2 | 1 (1/1) |

## Interpretation

This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.

The exact McNemar tests use only discordant matched pairs. With this pilot sample, large observed rate differences can still yield coarse p-values; the full counterbalanced run is required for inferential claims.
