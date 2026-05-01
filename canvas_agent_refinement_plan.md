# Canvas Agent Refinement Plan for `tldraw_base`

## Goal

Improve the agent’s canvas understanding and action reliability without replacing the current tldraw action execution layer.

The current implementation already has a useful split between prompt parts, action schemas, action utils, and the streaming executor. The refinement should keep that structure but introduce a stronger observation layer and a more closed-loop action policy.

Core direction:

- Replace fragmented canvas context with one canonical `CanvasObservation`.
- Ground screenshot evidence to shape ids and page coordinates.
- Add explicit spatial, visual, and semantic relations between shapes.
- Move common edits from raw coordinate actions toward target selectors and layout/semantic actions.
- Add local verification after action chunks, so the model does not have to self-judge only from prose.

## Current Implementation Baseline

The working mode currently gives the agent separate prompt parts:

- `ScreenshotPartUtil`
- `UserViewportBoundsPartUtil`
- `AgentViewportBoundsPartUtil`
- `BlurryShapesPartUtil`
- `PeripheralShapesPartUtil`
- `SelectedShapesPartUtil`
- `ContextItemsPartUtil`
- `UserActionHistoryPartUtil`
- `CanvasLintsPartUtil`
- chat, messages, model, data, todo, time, debug, mode

It then lets the model emit structured actions:

- primitive edits: `create`, `update`, `move`, `resize`, `rotate`, `delete`, `label`, `pen`
- layout edits: `align`, `distribute`, `stack`, `place`
- navigation/review: `setMyView`, `review`
- planning/communication: `think`, `message`, `add-detail`, `update-todo-list`

This should remain the basic architecture. The main weakness is that the model receives multiple partial representations instead of a single coherent scene representation.

## Main Problems to Fix

### 1. Viewport shape coverage is brittle

`BlurryShapesPartUtil` includes shapes only when the viewport fully contains their masked bounds. Partially visible shapes can vanish from text context even when visible in the screenshot.

Refinement: every relevant shape should have an explicit visibility state: `visible`, `partial`, `offscreen-near`, `offscreen-far`, or `occluded`.

### 2. Peripheral context is too weak

`PeripheralShapesPartUtil` reduces offscreen content to cluster bounds and counts. That helps navigation, but not task reasoning.

Refinement: peripheral regions should include type histogram, representative texts/notes, important ids, relation links to visible shapes, and distance/direction from the viewport.

### 3. Screenshot is not object-grounded

The screenshot is useful, but the model has to align pixels and shape JSON mentally.

Refinement: include screenshot metadata and per-object image-space boxes so visual evidence can be tied back to shape ids.

### 4. Current action schemas force too much coordinate management

The model often has to choose exact ids and coordinates for common operations. That is fragile.

Refinement: add target selectors, semantic layout actions, and local action resolution. Let the model express intent; let deterministic code calculate exact primitive edits.

## Design Principle

Adopt the useful pattern from VLA systems: the policy should operate on a grounded observation, emit short-horizon action chunks, then re-observe and repair.

For this canvas agent, “vision-language-action” does not mean robot controls. It means:

- vision: screenshot and object-grounded image regions
- language: user request, shape text, notes, chat history
- action: structured canvas operations
- state: scene graph, relation graph, viewport, user edits, lints

## Target Architecture

## 1. Add `CanvasObservation`

Create one canonical observation object that all canvas-facing prompt parts can derive from.

Recommended location:

- `frontend/shared/format/CanvasObservation.ts`
- `frontend/shared/format/buildCanvasObservation.ts`
- `frontend/client/parts/CanvasObservationPartUtil.ts`

### `CanvasObservation` fields

#### Frame metadata

- `pageId`
- `revisionId` or timestamp
- `agentViewportBounds`
- `userViewportBounds`
- `promptOrigin`
- `coordinateSpace`: page-space vs prompt-space mapping
- `screenshotBounds`
- `screenshotPixelSize`
- `zoom` if available

#### Object table

Each shape entry should include:

- stable simple id
- tldraw id
- type and subtype
- text and note
- page bounds
- prompt-space bounds
- center
- rotation
- z-order / stack index
- parent id
- group/frame id if applicable
- style summary: color, fill, font size, opacity
- selected/context flags
- locked/hidden flags
- visibility state
- screenshot-space bounds when visible

Do not replace `FocusedShape`; keep it. `CanvasObservationObject` can include a focused representation as one field, plus extra metadata that `FocusedShape` currently omits.

#### Relation graph

Add edges for:

- arrow connects `fromId` to `toId`
- parent contains child
- frame/group membership
- overlap
- touches
- near
- aligned-left / aligned-right / aligned-center-x / aligned-center-y
- same-row / same-column
- likely-label-of
- occludes / behind
- reading-order-next

Each relation should have:

- relation type
- source id
- target id
- confidence when heuristic
- optional measurements, e.g. gap, overlap area, alignment delta

#### Spatial index

Replace flat peripheral clusters with tiles:

- `viewport`: high-detail objects
- `nearby`: medium-detail summaries
- `far`: low-detail summaries

Each tile should include:

- bounds
- distance/direction from viewport
- object ids
- type histogram
- representative text snippets
- relation links crossing into the viewport

This keeps prompt size bounded while giving the agent more useful offscreen awareness.

#### Task affordances

Precompute useful action hints:

- overflowed text candidates
- unbound arrows
- overlapping labels
- detached labels
- alignable rows/columns
- flowchart chains
- isolated clusters
- candidate containers
- candidate groups

These are not commands. They are observations that help the model decide.

## 2. Prompt Integration

Update prompt parts so `CanvasObservation` becomes the source of truth.

File targets:

- `frontend/shared/schema/PromptPartDefinitions.ts`
- `frontend/client/parts/PromptPartUtil.ts`
- `frontend/client/modes/AgentModeDefinitions.ts`
- `frontend/worker/prompt/sections/rules-section.ts`
- `frontend/worker/prompt/buildMessages.ts`

Recommended migration:

1. Add `CanvasObservationPart` while keeping current parts.
2. Use it in working mode before `BlurryShapesPartUtil` and `PeripheralShapesPartUtil`.
3. Once stable, make `BlurryShapesPartUtil` and `PeripheralShapesPartUtil` thin derived views or remove them from the default working mode.
4. Keep screenshot as a separate image message, but reference its metadata from `CanvasObservation`.

Prompt wording should tell the model:

- the observation is authoritative for ids, geometry, and relations
- the screenshot is authoritative for final visual appearance
- when JSON and screenshot conflict, inspect both and prefer screenshot for visual quality, but use object ids from observation for actions

## 3. Add Target Selectors

Create a shared target selector schema.

Recommended location:

- `frontend/shared/schema/TargetSelectorSchemas.ts`
- `frontend/client/actions/resolveTargets.ts`

Selector types:

- selected shapes
- context shapes
- explicit ids
- shapes inside region
- shapes intersecting region
- shapes matching text
- shapes matching type
- shapes connected to id
- shapes in tile or cluster
- nearest shape to point
- labels of selected shapes
- arrows connected to selected shapes

Use selectors in new actions first. Later, allow existing edit actions to accept either explicit ids or selectors.

Acceptance criteria:

- A user can say “align these” and selected shapes resolve without the model listing ids.
- A user can say “move the labels inside the boxes” and labels resolve from relations.
- A user can say “connect the nearby cards” and candidates resolve from spatial proximity plus type.

## 4. Add Higher-Level Actions

Keep current primitive actions. Add a small set of semantic/layout actions that resolve locally.

Recommended new actions:

### `arrange`

Purpose: impose a layout on selected or resolved targets.

Parameters:

- target selector
- layout: row, column, grid, flow, radial, stack
- gap
- alignment
- optional bounds

### `fitText`

Purpose: repair text overflow and label containment.

Parameters:

- target selector
- strategy: widen container, shrink text, wrap text, shorten label, move label

### `connect`

Purpose: create or repair arrows between shapes.

Parameters:

- source selector
- target selector
- direction / relation label
- avoid duplicates

### `cleanupLayout`

Purpose: remove overlaps and improve spacing while preserving semantic relations.

Parameters:

- target selector
- constraints: preserve order, preserve connections, avoid moving locked shapes

### `annotateGroup`

Purpose: add labels, notes, or headings to a selected group or region.

Parameters:

- target selector
- annotation style
- text
- placement preference

These actions should be converted to primitive `move`, `resize`, `create`, `update`, `place`, `align`, `stack`, and `distribute` operations by deterministic code.

## 5. Add Preconditions and Postconditions

Each action or action chunk should be able to declare expected state.

Examples:

- selected objects remain selected or become part of the modified set
- label is inside its container
- objects do not overlap
- arrow endpoints are bound
- object is visible in viewport after navigation
- created ids exist
- no duplicate arrow connects same pair for same intent

Recommended files:

- `frontend/shared/types/ActionContract.ts`
- `frontend/client/agent/managers/AgentVerificationManager.ts`
- `frontend/client/actions/verifyActionResult.ts`

Postconditions should be checked locally after applying actions. Failed checks should create a follow-up prompt or trigger local repair when deterministic.

## 6. Add Action Chunking

Current streaming applies actions as they arrive. Keep that, but add a chunk-level control layer.

Recommended concept:

- one request produces one or more `ActionChunk`s
- each chunk has intent, actions, preconditions, postconditions
- after each chunk, the app verifies the canvas diff
- if verification fails, schedule a repair request with failure details and fresh observation

This is the VLA-style improvement: short-horizon policy, execute, observe, verify, continue.

Recommended file targets:

- `frontend/shared/schema/AgentActionSchemas.ts`
- `frontend/shared/schema/buildResponseSchema.ts`
- `frontend/client/agent/TldrawAgent.ts`
- `frontend/client/agent/managers/AgentActionManager.ts`
- `frontend/client/agent/managers/AgentRequestManager.ts`

Do not block streaming visual feedback. Primitive actions can still stream, but chunk completion should trigger verification.

## 7. Add Quantized Coordinates

For model-facing geometry, prefer normalized and quantized coordinates where possible.

Recommended representation:

- page-space remains canonical internally
- prompt-space coordinates remain available
- model-facing optional grid: `x0..x1000`, `y0..y1000` inside active viewport or tile

Use this mostly for new semantic/layout actions and target selectors. Existing primitive actions can keep page/prompt-space coordinates for backward compatibility.

Benefit: the model emits simpler, less jittery geometry. Local code converts back to exact page-space.

## 8. Add Trajectory Logging and Evals

Store successful and failed attempts as trajectories.

Trajectory shape:

- user request
- initial `CanvasObservation`
- model action chunks
- primitive actions applied
- record diff
- verifier results
- final `CanvasObservation`
- optional screenshot
- user acceptance/rejection if available

Recommended file targets:

- `frontend/client/agent/managers/AgentTrajectoryManager.ts`
- `backend/app.py` only if persistence should move beyond local storage
- `backend/tests/` for server-side persistence tests if backend is used

Eval scenarios:

1. partially visible shape is still identified
2. selected shapes are edited correctly without explicit ids
3. offscreen connected shape is navigated to correctly
4. overlapping labels are detected and repaired
5. duplicate arrows are avoided
6. flowchart is arranged into readable order
7. user edits between prompts are reflected in next observation
8. screenshot/object box metadata matches visible objects

Metrics:

- action success rate
- postcondition pass rate
- number of repair loops
- coordinate jitter
- prompt token cost
- user-visible overlap count
- unbound arrow count
- text overflow count

## Evaluation Plan

Use evaluation to answer one question: does each refinement improve task success, canvas quality, or cost without making common cases worse?

Run evals in two layers:

- Offline evals: deterministic tests of observation building, selector resolution, action diffs, and lint/verifier behavior. These do not call a model.
- Model-in-the-loop evals: fixed user tasks on fixed canvas fixtures. These compare final canvas properties, not exact pixels.

Every run should compare the same fixtures across these configs:

- `baseline`: implementation before P0
- `p0_observation`: baseline plus `CanvasObservation`
- `p1_selectors`: P0 plus target selectors
- `p2_actions_verifier`: P1 plus semantic actions and verifier
- `p3_chunk_loop`: P2 plus chunked execution and trajectory logging

### Metrics Matrix

| Area | What it tests | Quantitative metrics | Qualitative metrics | Acceptance target |
| --- | --- | --- | --- | --- |
| Observation quality | Whether `CanvasObservation` captures the right canvas state | object recall; visibility accuracy; relation precision/recall; screenshot box IoU; serialized byte size; repeat-run determinism | observation is readable enough for prompt debugging | selected/context object recall = 100%; partial-visible recall = 100%; visibility accuracy >= 95%; arrow/containment relation F1 >= 95%; mean screenshot-box IoU >= 0.85; repeated builds match exactly; dense observations stay within configured object/tile limits |
| Target resolution | Whether selectors resolve references like “these”, “this label”, or “the connected node” | selector accuracy; ambiguity safe-fail rate; false-target rate; ids emitted per model action | ambiguous failures are understandable and recoverable | common-reference accuracy >= 95%; false-target rate <= 1%; ambiguous selectors safe-fail >= 95%; pan/zoom invariant fixtures produce identical resolved ids |
| Action correctness | Whether local actions produce the intended canvas diff | postcondition pass rate; unrelated-shape mutation count; geometry error in px/degrees; id uniqueness | resulting edits match the user intent without surprising side effects | postconditions pass >= 95%; unrelated-shape mutations = 0; position/size error <= 1 px; rotation error <= 0.5 degrees; created ids unique = 100% |
| Visual lint and verification | Whether final canvases avoid obvious visual defects | lint count before/after; overlap area; unbound-arrow count; label containment rate; repair-loop count | layout is readable and relationships are visually clear | final critical lints = 0 for supported checks; total lint count does not increase in >= 95% of runs; repair converges within 2 loops |
| Closed-loop tasks | Whether the full agent completes real canvas tasks | task success rate; first-pass success rate; success after repair; model calls; primitive edits; prompt tokens; latency to first action; total latency | final canvas satisfies request, keeps important content, and avoids unnecessary edits | success improves over baseline by >= 15 percentage points or reduces cost by >= 20% with no success regression above 3 percentage points |
| Regression and ablation | Whether a feature helps enough to stay enabled | absolute success rate; delta vs baseline; token delta; latency delta; cases made worse | failures cluster into understandable categories | each phase improves at least one target metric and does not materially regress task success, lint quality, or cost |

Metric definitions:

- `object recall = expected observed objects / expected fixture objects`
- `visibility accuracy = objects with expected visibility label / labeled objects`
- `relation F1` covers arrow links, containment, overlap, alignment, and label-of relations.
- `screenshot box IoU` compares observation boxes with rendered object bounds.
- `repeat-run determinism` means the same fixture produces identical normalized observation JSON.
- `false-target rate = actions that modify an unintended object / all target-resolved actions`
- `postcondition pass rate = actions satisfying declared verifier checks / actions with checks`
- `lint delta = final lint count - initial lint count`; negative is better.

### Core Fixtures

Use a small fixture set that covers high-risk canvas states:

- viewport edges: fully visible, partially visible, just-offscreen, and far-offscreen shapes
- selection/context: selected offscreen objects and context objects outside the viewport
- structure: grouped/frame-contained shapes, text inside containers, text outside containers
- geometry: rotated shapes, overlapping shapes with z-order, dense multi-cluster canvases
- arrows: both endpoints bound, one endpoint missing, both endpoints missing, duplicate arrows
- ambiguity: duplicate labels, nearby similar objects, connected offscreen targets

### Initial Eval Set

Build these first; they are enough to measure the main P0-P3 gains without overbuilding the harness.

Run the local deterministic suite with `npm run eval:canvas-agent` from `frontend/`. It covers offline observation, selector, action, lint, and synthetic trajectory checks. Live model-in-the-loop runs should write the same trajectory shape and can be compared with the same metrics.

| Eval id | Layer | Primary metric | Example pass condition |
| --- | --- | --- | --- |
| `observation_partial_visibility` | offline | partial-visible recall | every edge-clipped shape appears with `visibility = partial` |
| `observation_arrow_relations` | offline | relation F1 | bound arrows expose exact source/target ids; unbound endpoints are reported as missing |
| `observation_selected_offscreen` | offline | selected/context recall | selected and context objects survive viewport filtering |
| `selector_selected_shapes` | offline | selector accuracy | “these” resolves to the selected shape ids and no others |
| `selector_ambiguous_label` | offline | ambiguity safe-fail rate | duplicate text labels produce a safe ambiguity result, not a random edit |
| `action_align_selected` | offline | postcondition pass rate | selected shapes share the requested alignment within 1 px |
| `lint_text_overlap` | offline | lint delta | overlapping labels are detected and the verifier reports a failing postcondition |
| `task_fix_unbound_arrows` | trajectory, then model-in-loop | task success and repair loops | final canvas has zero unbound arrows and uses no more than 2 repair loops |
| `task_clean_cluster` | trajectory, then model-in-loop | rubric score and lint delta | human rubric score >= 3, lint count decreases, text content is preserved |

### Task Rubric

Use automatic metrics for pass/fail, then add a compact human score only for model-in-the-loop tasks:

- 0: failed task, edited wrong objects, or lost important content
- 1: partially completed but has major semantic or visual errors
- 2: mostly completed with noticeable layout or relationship defects
- 3: correct result with minor cosmetic issues
- 4: correct, readable, visually clean, and verified

Review dimensions for the qualitative note:

- request satisfaction
- readability
- relationship clarity
- unnecessary edits
- communication quality

Target: average score >= 3.5, no critical task below 3, and no repeated failure category across more than 10% of runs.

### Run Artifacts

Every eval run should save one trajectory record per task:

- config name and git commit
- fixture id and request text
- initial canvas snapshot, observation, and screenshot
- model response, action chunks, primitive actions, and diffs
- verifier results and final observation
- metric results, latency, token counts, and human score if reviewed

Use these records for regression tests, prompt examples, failure clustering, and future preference data.

## Implementation Phases

### P0: Strong observation layer

Deliverables:

- `CanvasObservation` types
- observation builder
- relation graph
- partial/offscreen visibility states
- screenshot metadata and object boxes
- prompt part integration
- working-mode inclusion

Acceptance:

- partially visible shapes are present in text observation
- selected/context shapes are always included even if outside viewport
- arrow endpoint relations are explicit
- peripheral regions include useful summaries, not just counts
- observation can be logged for debugging

### P1: Target selectors and local resolution

Deliverables:

- target selector schema
- target resolver
- selector support in new high-level actions
- prompt rules for when to use selectors

Acceptance:

- common user references resolve without manual id enumeration
- ambiguous selectors produce a repair/follow-up instead of wrong edits
- selected/context targets are preferred for “this/these/here”

### P2: Higher-level actions and verification

Deliverables:

- `arrange`, `fitText`, `connect`, `cleanupLayout`, `annotateGroup`
- local primitive resolver
- action contracts
- verifier manager
- failure-to-repair scheduling

Acceptance:

- common layout tasks use fewer model-emitted primitive actions
- text overflow and overlaps are checked locally
- arrow bindings are verified locally
- failed postconditions are surfaced to the next prompt with fresh observation

### P3: Action chunk loop and eval harness

Deliverables:

- action chunk response format
- chunk-level verification
- trajectory logging
- eval fixtures and metrics

Acceptance:

- multi-step tasks improve through observe-execute-verify loops
- regressions are measurable
- trajectory logs can be used for prompt examples or later fine-tuning

## Guardrails for Codex

- Do not remove existing primitive action utils in the first pass.
- Do not change model providers or streaming transport for P0.
- Keep old prompt parts temporarily for compatibility while introducing `CanvasObservation`.
- Prefer additive schema changes before destructive refactors.
- Keep observation size bounded with detail levels and spatial tiles.
- Treat screenshot grounding as metadata, not a replacement for the screenshot.
- Use deterministic verification wherever possible; only ask the model to reason when the verifier cannot decide.
