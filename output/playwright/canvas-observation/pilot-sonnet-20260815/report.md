# CanvasObservation Browser Experiment

Run: `pilot\-sonnet\-20260815`

Status: **complete**

Started: 2026\-08\-15T22:05:44\.446Z

Finished: 2026\-08\-15T22:10:09\.099Z

## Coverage

- Scheduled trials: 16
- Completed trials: 16
- Failed trials: 0
- Remaining trials: 0
- Complete adjacent pairs: 8

## Conditions

| Variant | Trials | Overall pass | Grounding | Geometry | Relation | Collateral | Unscored | Mean score | Mean duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `canvasact` | 8 | 3/8 | 8/8 | 3/8 | 2/2 | 8/8 | 0 | 3.375 | 15334 ms |
| `original-tldraw` | 8 | 1/8 | 4/8 | 1/8 | 2/2 | 4/8 | 0 | 2.125 | 17502 ms |

## Cases

| Case | Variant | Trials | Passed | Mean score | Mean duration |
| --- | --- | ---: | ---: | ---: | ---: |
| `explicit-relations` | `canvasact` | 2 | 0 | 3 | 9678 ms |
| `explicit-relations` | `original-tldraw` | 2 | 0 | 3 | 12692 ms |
| `object-state` | `canvasact` | 2 | 0 | 3 | 16563 ms |
| `object-state` | `original-tldraw` | 2 | 0 | 1 | 8014 ms |
| `viewport-coverage` | `canvasact` | 2 | 1 | 3.5 | 14313 ms |
| `viewport-coverage` | `original-tldraw` | 2 | 0 | 2 | 34395 ms |
| `workspace-structure` | `canvasact` | 2 | 2 | 4 | 20784 ms |
| `workspace-structure` | `original-tldraw` | 2 | 1 | 2.5 | 14908 ms |

## Artifacts

- `results.jsonl`: append-only trial records
- `trial-metadata/`: one JSON record per trial
- `screenshots/`: before/after canvas evidence
- `schedule.json`: randomized adjacent-pair order
- `summary.json`: machine-readable aggregate

