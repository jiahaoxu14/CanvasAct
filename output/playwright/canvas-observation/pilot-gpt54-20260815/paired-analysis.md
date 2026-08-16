# Pilot paired analysis: pilot-gpt54-20260815

> **Pilot: n=7 matched pairs (15 complete trials).** This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.

Profile: `pilot`. Models: `gpt-5.4`. Rotations: `blue-middle`, `editable-middle`, `calls-attached`, `upper-bound`.

Geometry is reported only among correctly grounded trials. Consequently, its denominator can differ by variant and it should not be read as an all-trial success rate.

## Per-variant results

| Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CanvasObs | 8 | 7/8 (87.5%) | 4/7 (57.1%) | 4/8 (50%) | 7/8 (87.5%) | 1 (n=8) | 4.64 s (n=8) | 0.2 s (n=8) |
| Original tldraw | 7 | 3/7 (42.9%) | 1/3 (33.3%) | 1/7 (14.3%) | 3/7 (42.9%) | 1.71 (n=7) | 5.31 s (n=7) | 0.18 s (n=7) |

## Per-case results

| Case | Variant | Trials | Grounding | Geometry given grounding | Overall | Collateral | Model calls / trial | Trial latency | First-action latency |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `object-state` | CanvasObs | 2 | 1/2 (50%) | 0/1 (0%) | 0/2 (0%) | 1/2 (50%) | 1 (n=2) | 4.38 s (n=2) | 0.15 s (n=2) |
| `object-state` | Original tldraw | 2 | 0/2 (0%) | 0/0 (n/a) | 0/2 (0%) | 0/2 (0%) | 1.5 (n=2) | 4.52 s (n=2) | 0.17 s (n=2) |
| `viewport-coverage` | CanvasObs | 2 | 2/2 (100%) | 0/2 (0%) | 0/2 (0%) | 2/2 (100%) | 1 (n=2) | 3.64 s (n=2) | 0.21 s (n=2) |
| `viewport-coverage` | Original tldraw | 1 | 0/1 (0%) | 0/0 (n/a) | 0/1 (0%) | 0/1 (0%) | 5 (n=1) | 13.53 s (n=1) | 0.21 s (n=1) |
| `workspace-structure` | CanvasObs | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 1 (n=2) | 5.35 s (n=2) | 0.21 s (n=2) |
| `workspace-structure` | Original tldraw | 2 | 1/2 (50%) | 1/1 (100%) | 1/2 (50%) | 1/2 (50%) | 1 (n=2) | 3.74 s (n=2) | 0.16 s (n=2) |
| `explicit-relations` | CanvasObs | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 1 (n=2) | 5.19 s (n=2) | 0.22 s (n=2) |
| `explicit-relations` | Original tldraw | 2 | 2/2 (100%) | 0/2 (0%) | 0/2 (0%) | 2/2 (100%) | 1 (n=2) | 3.55 s (n=2) | 0.19 s (n=2) |

## Matched-pair analysis

7 of 8 pair IDs were complete and valid; 1 were incomplete or invalid.

| Outcome | Eligible pairs | Both pass | CanvasObs only | Original tldraw only | Both fail | Discordant | Exact two-sided McNemar p |
|---|---:|---:|---:|---:|---:|---:|---:|
| Grounding | 7 | 3 | 3 | 0 | 1 | 3 | 0.25 (1/4) |
| Overall | 7 | 1 | 3 | 0 | 3 | 3 | 0.25 (1/4) |

### Pair counts by case

| Case | Outcome | Pairs | Both pass | CanvasObs only | Original only | Both fail | Exact p |
|---|---|---:|---:|---:|---:|---:|---:|
| `object-state` | Grounding | 2 | 0 | 1 | 0 | 1 | 1 (1/1) |
| `object-state` | Overall | 2 | 0 | 0 | 0 | 2 | 1 (1/1) |
| `viewport-coverage` | Grounding | 1 | 0 | 1 | 0 | 0 | 1 (1/1) |
| `viewport-coverage` | Overall | 1 | 0 | 0 | 0 | 1 | 1 (1/1) |
| `workspace-structure` | Grounding | 2 | 1 | 1 | 0 | 0 | 1 (1/1) |
| `workspace-structure` | Overall | 2 | 1 | 1 | 0 | 0 | 1 (1/1) |
| `explicit-relations` | Grounding | 2 | 2 | 0 | 0 | 0 | 1 (1/1) |
| `explicit-relations` | Overall | 2 | 0 | 2 | 0 | 0 | 0.5 (1/2) |

## Interpretation

This is a small pilot used to validate the protocol and analysis pipeline. Rates and exact p-values are descriptive and should not be treated as confirmatory evidence.

The exact McNemar tests use only discordant matched pairs. With this pilot sample, large observed rate differences can still yield coarse p-values; the full counterbalanced run is required for inferential claims.
