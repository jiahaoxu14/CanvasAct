# CanvasObservation Browser Experiment

Run: `preflight\-gpt54\-mini\-20260815\-v1`

Status: **complete**

Started: 2026\-08\-15T23:53:46\.877Z

Finished: 2026\-08\-15T23:54:04\.007Z

## Coverage

- Scheduled trials: 2
- Completed trials: 2
- Failed trials: 0
- Remaining trials: 0
- Complete adjacent pairs: 1

## Conditions

| Variant | Trials | Overall pass | Grounding | Geometry | Relation | Collateral | Unscored | Mean score | Mean duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `canvasact` | 1 | 0/1 | 1/1 | 0/1 | - | 1/1 | 0 | 3 | 3901 ms |
| `original-tldraw` | 1 | 0/1 | 0/1 | 0/1 | - | 0/1 | 0 | 1 | 10121 ms |

## Cases

| Case | Variant | Trials | Passed | Mean score | Mean duration |
| --- | --- | ---: | ---: | ---: | ---: |
| `viewport-coverage` | `canvasact` | 1 | 0 | 3 | 3901 ms |
| `viewport-coverage` | `original-tldraw` | 1 | 0 | 1 | 10121 ms |

## Artifacts

- `results.jsonl`: append-only trial records
- `trial-metadata/`: one JSON record per trial
- `screenshots/`: before/after canvas evidence
- `schedule.json`: randomized adjacent-pair order
- `summary.json`: machine-readable aggregate

