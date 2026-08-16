# GPT-5.4 pilot accounting

This folder contains the attempted 16-trial GPT-5.4 pilot: four cases, two
variants, two repetitions, and the canonical rotation for each case.

## Runtime validity

- Scheduled and recorded: 16/16 trials (8 intended matched pairs)
- Completed: 15 trials
- Non-idle timeout: 1 trial
- Complete matched pairs used by `paired-analysis.md`: 7
- CanvasObs operational completion: 8/8 attempts
- Original tldraw operational completion: 7/8 attempts

The incomplete trial was Original tldraw on viewport coverage, repetition 2.
It did not become idle within the bridge's effective 180-second limit. Its
CanvasObs mate is retained in the raw artifacts but excluded from matched-pair
tests. The timeout is not imputed as a grounding failure because no final store
was exported.

## Descriptive results from complete trials

- CanvasObs grounding: 7/8 (87.5%)
- Original tldraw grounding: 3/7 (42.9%)
- CanvasObs end-to-end outcome: 4/8 (50.0%)
- Original tldraw end-to-end outcome: 1/7 (14.3%)
- Matched grounding comparison: 3 CanvasObs-only wins, 0 Original-only wins,
  exact two-sided McNemar p = 0.25 (7 eligible pairs)
- Matched end-to-end comparison: 3 CanvasObs-only wins, 0 Original-only wins,
  exact two-sided McNemar p = 0.25 (7 eligible pairs)

These are formative pilot results, not confirmatory evidence.

## Diagnostic whole-pair retry

The entire affected viewport pair was independently rerun in
`../retry-gpt54-viewport-20260815-v1/`. Both trials completed. CanvasObs passed;
Original tldraw failed after 37 model calls. The retry is a sensitivity check
and is not silently substituted into this primary pilot or pooled in its
paired analysis.
