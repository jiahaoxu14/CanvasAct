# P0-P3 Canvas Agent Refinement Walkthrough

This document explains the current P0-P3 refinement path and keeps examples aligned with the implemented schemas.

## Overview

The refinement moves the canvas agent from fragile primitive editing toward grounded, locally checked editing.

```text
Baseline:
  fragmented prompt context -> model chooses ids and coordinates -> primitive edits

P0-P3:
  CanvasObservation -> target selectors -> semantic actions -> chunk verification and repair
```

Running example:

> Clean up this messy cluster and fix arrows that are not connected.

Example canvas objects:

- `cluster-a`, `cluster-b`, `cluster-c`: overlapping cards
- `start`, `end`: flowchart nodes
- `unbound-arrow`: arrow with missing bindings
- `selected-offscreen`: selected shape outside the current viewport

## Baseline: Fragmented Context

Before P0, the model receives separate prompt parts such as screenshot, blurry shapes, peripheral shapes, selected ids, viewport bounds, and canvas lints.

Example:

```json
{
  "blurryShapes": [
    { "id": "start", "type": "geo", "x": 70, "y": 110 },
    { "id": "end", "type": "geo", "x": 270, "y": 110 },
    { "id": "unbound-arrow", "type": "arrow", "x": 150, "y": 140 }
  ],
  "peripheralShapes": [
    { "bounds": { "x": 400, "y": 0, "w": 300, "h": 300 }, "numberOfShapes": 4 }
  ],
  "selectedShapes": ["selected-offscreen"]
}
```

This is brittle because the model must infer the complete scene from scattered data. For example, it may answer an arrow task with a vague primitive update:

```json
{
  "_type": "update",
  "intent": "Bind the arrow to connect start and end"
}
```

That does not give the app a reliable local contract for whether the arrow is actually bound.

## P0: CanvasObservation

P0 adds `CanvasObservation`, a structured scene state built by the app and included in working mode. The current implementation keeps the legacy shape prompt parts too, so this is additive rather than a full replacement.

Implemented observation fields include:

- object table with ids, focused shape data, bounds, style, z-index, parent/group/frame ids
- visibility: `visible`, `partial`, `offscreen-near`, `offscreen-far`, `occluded`
- screenshot bounds and page/prompt/screenshot coordinate metadata
- relation graph: `arrow-connects`, `unbound-arrow-endpoint`, `overlap`, `near`, `likely-label-of`, alignment, row/column, containment, and related edges
- spatial index: viewport, nearby tiles, far tiles
- task affordances: unbound arrows, overflowed text candidates, overlapping labels, alignable rows/columns, isolated clusters, candidate containers/groups

Example:

```json
{
  "objects": [
    {
      "id": "selected-offscreen",
      "type": "geo",
      "visibility": "offscreen-near",
      "flags": { "selected": true, "context": false, "locked": false, "hidden": false },
      "pageBounds": { "x": 420, "y": 120, "w": 80, "h": 60 },
      "screenshotBounds": null
    },
    {
      "id": "unbound-arrow",
      "type": "arrow",
      "visibility": "visible"
    }
  ],
  "relations": [
    { "type": "near", "sourceId": "unbound-arrow", "targetId": "start" },
    { "type": "near", "sourceId": "unbound-arrow", "targetId": "end" }
  ],
  "taskAffordances": {
    "unboundArrows": [
      { "shapeId": "unbound-arrow", "missingStart": true, "missingEnd": true }
    ]
  }
}
```

Why it helps:

- Offscreen selected objects stay visible to the model as objects, not just ids.
- Partially visible objects are not dropped from text context.
- Arrow and layout problems are surfaced as structured relations and affordances.

Concrete example:

```json
{
  "_type": "move",
  "intent": "Move selected-offscreen 20 pixels right",
  "anchor": "top-left",
  "shapeId": "selected-offscreen",
  "x": 440,
  "y": 120
}
```

The model can make this move because P0 tells it that `selected-offscreen` exists, is selected, and has page bounds even though it is outside the viewport.

## P1: Target Selectors

P1 adds deterministic target selectors. The model can describe a target semantically, and local code resolves it to shape ids or fails safely.

Implemented selector examples:

```json
{ "_type": "selected" }
```

```json
{ "_type": "ids", "shapeIds": ["cluster-a", "cluster-b", "cluster-c"] }
```

```json
{ "_type": "text", "text": "Revenue", "match": "exact", "expect": "one" }
```

```json
{ "_type": "connected-to", "shapeId": "start", "includeArrows": true }
```

Example user request:

> Align these.

Implementation-aligned action:

```json
{
  "_type": "arrange",
  "intent": "Arrange the selected cards into a readable row",
  "targetSelector": { "_type": "selected" },
  "layout": "row",
  "gap": 32
}
```

Local resolution converts `{ "_type": "selected" }` into actual ids such as:

```json
{
  "resolved": true,
  "shapeIds": ["cluster-a", "cluster-b", "cluster-c"]
}
```

Ambiguity example:

```json
{
  "_type": "text",
  "text": "Revenue",
  "match": "exact",
  "expect": "one"
}
```

If two shapes match, the resolver schedules a target-resolution failure instead of editing a random shape.

Why it helps:

- "this", "these", selected objects, nearby objects, and connected objects resolve locally.
- Ambiguous references fail safely.
- The model does not need to manually copy ids when the app already knows the target set.

## P2: Semantic Actions And Verification

P2 adds higher-level actions and local postconditions. The model expresses intent; local action utils resolve targets, apply edits, and provide contracts for verification.

Implemented semantic actions include:

- `arrange`
- `fitText`
- `connect`
- `cleanupLayout`
- `annotateGroup`

### Example: Clean Up Cluster

User asks:

> Clean up this messy cluster without changing the text.

Implementation-aligned action:

```json
{
  "_type": "cleanupLayout",
  "intent": "Separate the overlapping cards",
  "targetSelector": {
    "_type": "ids",
    "shapeIds": ["cluster-a", "cluster-b", "cluster-c"]
  },
  "strategy": "horizontal",
  "gap": 32,
  "avoidMovingLocked": true
}
```

The `CleanupLayoutActionUtil` resolves the target selector, applies local layout logic, and declares postconditions like:

```json
[
  { "type": "no-overlap", "shapeIds": ["cluster-a", "cluster-b", "cluster-c"] },
  { "type": "arrow-bindings", "shapeIds": ["cluster-a", "cluster-b", "cluster-c"] }
]
```

### Example: Connect Shapes

The implemented `connect` action creates bound arrows between resolved source and target shapes and avoids duplicates by default.

```json
{
  "_type": "connect",
  "intent": "Create a bound arrow from start to end",
  "sourceShapeIds": ["start"],
  "targetShapeIds": ["end"],
  "avoidDuplicates": true,
  "createdShapeIds": ["arrow-start-end"]
}
```

The action contract checks:

```json
[
  { "type": "created-shapes-exist", "shapeIds": ["arrow-start-end"] },
  { "type": "arrow-bindings", "shapeIds": ["arrow-start-end"] },
  { "type": "no-duplicate-arrows" }
]
```

Note: the current `connect` implementation creates bound arrows between endpoints. It does not take an `arrow` field to mutate an existing unbound arrow.

### Example: Fit Text

```json
{
  "_type": "fitText",
  "intent": "Wrap overflowing labels",
  "targetSelector": { "_type": "labels-of-selected" },
  "strategy": "wrap-text",
  "maxWidth": 180
}
```

The local contract checks:

```json
[
  { "type": "text-fits", "shapeIds": ["label-a", "label-b"] }
]
```

Why P2 helps:

- Layout and arrow work move from fragile coordinate guessing to local action utilities.
- Verification uses actual editor state, not the model's claim that the task is done.
- Failed postconditions can be surfaced to the next request.

## P3: Chunks, Verification, Trajectories, And Evals

P3 adds chunked responses and closes the loop around verification.

Implemented response shape:

```json
{
  "chunks": [
    {
      "chunkId": "chunk-1",
      "intent": "Repair diagram connections",
      "actions": [
        {
          "_type": "connect",
          "intent": "Create a bound arrow from start to end",
          "sourceShapeIds": ["start"],
          "targetShapeIds": ["end"],
          "avoidDuplicates": true,
          "createdShapeIds": ["arrow-start-end"]
        }
      ],
      "postconditions": [
        { "type": "arrow-bindings", "shapeIds": ["arrow-start-end"] },
        { "type": "no-duplicate-arrows" }
      ]
    }
  ]
}
```

How it works:

1. `AgentService` streams actions from `chunks`.
2. Action utils apply each completed action.
3. `AgentVerificationManager` verifies action and chunk postconditions.
4. If verification fails, it schedules a self request containing a fresh `CanvasObservation` and the failure details.
5. `AgentTrajectoryManager` records observations, actions, chunks, verifications, diffs, and metrics in local storage.

Failure example:

```json
{
  "postcondition": "no-overlap",
  "message": "Shapes \"cluster-b\" and \"cluster-c\" still overlap by 220 px2.",
  "shapeIds": ["cluster-b", "cluster-c"]
}
```

The follow-up request asks the model to repair that specific failure using the fresh observation.

P3 also includes deterministic eval support:

- `npm run eval:canvas-agent`
- fixtures for partial visibility, selected offscreen objects, arrow relations, selector behavior, action verification, and synthetic trajectories
- metrics such as postcondition pass rate, repair loop count, chunk count, lint counts, and observation determinism

Why it helps:

- Multi-step work becomes verify-and-repair instead of one-shot.
- Failures become concrete editor-state facts.
- Trajectories make regressions and successful patterns inspectable.

## Summary

| Phase | Implemented Method | Main Benefit |
| --- | --- | --- |
| Baseline | Fragmented prompt parts and primitive actions | Simple, but brittle |
| P0 | `CanvasObservation` added to working mode | Better scene grounding |
| P1 | `_type`-based target selectors and local resolution | Safer target selection |
| P2 | Semantic actions plus `ActionContract` postconditions | More reliable edits |
| P3 | Chunk streaming, verification manager, trajectory logging, evals | Repairable multi-step execution |

Short version:

```text
P0 improves what the agent sees.
P1 improves what the agent targets.
P2 improves what the agent can do and verify.
P3 improves how the agent repairs and measures behavior.
```
