# CanvasObservation Browser Experiment

Run: `pilot\-gpt54\-20260815`

Status: **complete\-with\-errors**

Started: 2026\-08\-15T22:21:29\.073Z

Finished: 2026\-08\-15T22:25:45\.828Z

## Coverage

- Scheduled trials: 16
- Completed trials: 15
- Failed trials: 1
- Remaining trials: 0
- Complete adjacent pairs: 7

## Conditions

| Variant | Trials | Overall pass | Grounding | Geometry | Relation | Collateral | Unscored | Mean score | Mean duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `canvasact` | 8 | 4/8 | 7/8 | 4/8 | 2/2 | 7/8 | 0 | 3.25 | 4640 ms |
| `original-tldraw` | 7 | 1/7 | 3/7 | 1/7 | 2/2 | 3/7 | 0 | 2 | 5310 ms |

## Cases

| Case | Variant | Trials | Passed | Mean score | Mean duration |
| --- | --- | ---: | ---: | ---: | ---: |
| `explicit-relations` | `canvasact` | 2 | 2 | 4 | 5187 ms |
| `explicit-relations` | `original-tldraw` | 2 | 0 | 3 | 3552 ms |
| `object-state` | `canvasact` | 2 | 0 | 2 | 4381 ms |
| `object-state` | `original-tldraw` | 2 | 0 | 1 | 4523 ms |
| `viewport-coverage` | `canvasact` | 2 | 0 | 3 | 3640 ms |
| `viewport-coverage` | `original-tldraw` | 1 | 0 | 1 | 13531 ms |
| `workspace-structure` | `canvasact` | 2 | 2 | 4 | 5354 ms |
| `workspace-structure` | `original-tldraw` | 2 | 1 | 2.5 | 3744 ms |

## Runner failures

| Trial | Case | Variant | Error |
| --- | --- | --- | --- |
| `pair-5f78191f5d0e8425--original-tldraw` | `viewport-coverage` | `original-tldraw` | page.evaluate: Error: CanvasObs eval trial did not become idle within 180000 ms.     at CanvasObsEvalBridge.waitForIdle (http://127.0.0.1:5174/client/evals/CanvasObsEvalBridge.ts:235:23)     at async eval (eval at evaluate (:311:30), <anonymous>:7:25)     at async <anonymous>:337:30     at callBridge (/Users/jiahaoxu/Github/CanvasAct/frontend/scripts/run-browser-observation-experiment.mjs:290:14)     at runTrial (/Users/jiahaoxu/Github/CanvasAct/frontend/scripts/run-browser-observation-experiment.mjs:178:7)     at async main (/Users/jiahaoxu/Github/CanvasAct/frontend/scripts/run-browser-observation-experiment.mjs:108:19)     at async file:///Users/jiahaoxu/Github/CanvasAct/frontend/scripts/run-browser-observation-experiment.mjs:41:1 |

## Artifacts

- `results.jsonl`: append-only trial records
- `trial-metadata/`: one JSON record per trial
- `screenshots/`: before/after canvas evidence
- `schedule.json`: randomized adjacent-pair order
- `summary.json`: machine-readable aggregate

