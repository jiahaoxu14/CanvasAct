# CanvasObservation Browser Experiment

Run: `preflight\-gpt54\-20260815\-v1`

Status: **complete**

Started: 2026\-08\-15T22:20:19\.689Z

Finished: 2026\-08\-15T22:21:06\.414Z

## Coverage

- Scheduled trials: 2
- Completed trials: 2
- Failed trials: 0
- Remaining trials: 0
- Complete adjacent pairs: 1

## Conditions

| Variant | Trials | Overall pass | Grounding | Geometry | Relation | Collateral | Unscored | Mean score | Mean duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `canvasact` | 1 | 1/1 | 1/1 | 1/1 | - | 1/1 | 0 | 4 | 6482 ms |
| `original-tldraw` | 1 | 0/1 | 0/1 | 0/1 | - | 0/1 | 0 | 1 | 37575 ms |

## Cases

| Case | Variant | Trials | Passed | Mean score | Mean duration |
| --- | --- | ---: | ---: | ---: | ---: |
| `viewport-coverage` | `canvasact` | 1 | 1 | 4 | 6482 ms |
| `viewport-coverage` | `original-tldraw` | 1 | 0 | 1 | 37575 ms |

## Artifacts

- `results.jsonl`: append-only trial records
- `trial-metadata/`: one JSON record per trial
- `screenshots/`: before/after canvas evidence
- `schedule.json`: randomized adjacent-pair order
- `summary.json`: machine-readable aggregate

