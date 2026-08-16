# CanvasObservation Browser Experiment

Run: `preflight\-sonnet\-20260815\-v2`

Status: **complete**

Started: 2026\-08\-15T21:57:18\.037Z

Finished: 2026\-08\-15T21:57:23\.020Z

## Coverage

- Scheduled trials: 2
- Completed trials: 2
- Failed trials: 0
- Remaining trials: 0
- Complete adjacent pairs: 1

## Conditions

| Variant | Trials | Overall pass | Grounding | Geometry | Relation | Collateral | Unscored | Mean score | Mean duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `canvasact` | 1 | 0/1 | 0/1 | 0/1 | - | 1/1 | 0 | 2 | 1081 ms |
| `original-tldraw` | 1 | 0/1 | 0/1 | 0/1 | - | 1/1 | 0 | 2 | 1865 ms |

## Cases

| Case | Variant | Trials | Passed | Mean score | Mean duration |
| --- | --- | ---: | ---: | ---: | ---: |
| `viewport-coverage` | `canvasact` | 1 | 0 | 2 | 1081 ms |
| `viewport-coverage` | `original-tldraw` | 1 | 0 | 2 | 1865 ms |

## Artifacts

- `results.jsonl`: append-only trial records
- `trial-metadata/`: one JSON record per trial
- `screenshots/`: before/after canvas evidence
- `schedule.json`: randomized adjacent-pair order
- `summary.json`: machine-readable aggregate

