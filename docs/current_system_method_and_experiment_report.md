# CanvasAct Method and Experiment Report

Generated: 2026-05-02

## 1. Motivation and Problem Statement

LLMs can understand natural-language intent, but canvas editing is spatial and stateful. A model must identify the correct objects, reason about visibility and relationships, choose executable actions, and avoid unrelated edits. This is difficult when objects are offscreen, partially visible, overlapping, connected by arrows, or duplicated by label.

Problem statement: given a user instruction, canvas state, viewport, and selection, the system should produce canvas actions that satisfy the user's intent while preserving unrelated content and avoiding unsafe edits.

Key requirements:

| Requirement | Meaning |
| --- | --- |
| Spatial grounding | Provide object ids, geometry, visibility, and relations. |
| Target safety | Prevent or detect edits to unintended objects. |
| Ambiguity handling | Avoid guessing when multiple objects match the request. |
| Action executability | Require structured actions the canvas can apply reliably. |
| Multi-step repair | Decompose complex edits into verifiable steps. |
| Practical efficiency | Improve task success without impractical latency or token cost. |

The evaluation reflects these requirements by testing simple edits, offscreen selection, partial visibility, ambiguous targets, arrows/connectors, layout cleanup, and multi-step repair.

## 2. Method

The system enables an LLM to work inside a visual canvas by converting the canvas into a structured spatial scene, giving the model a constrained action language, resolving target references locally, and verifying the results after actions are applied. The core idea is that the model should reason about the canvas, but the application should remain responsible for precise geometry, target resolution, and safety checks.

### 2.1 Spatial Scene Representation

The system gives the model a canonical `CanvasObservation`: a structured description of the current canvas state. This observation is the model's main source of truth for object ids, geometry, visibility, relationships, and task-relevant affordances.

Each observed object includes:

- a stable object id for later actions
- object type, such as shape, text, arrow, or note
- text or note content when available
- true canvas bounds and model-facing prompt bounds
- visibility state: visible, partially visible, nearby offscreen, far offscreen, or occluded
- selection state
- focused details for important or nearby objects

This solves a common canvas-agent problem: screenshots alone are visually rich but weak for precise editing. The model may see an object but not know its id, exact bounds, selection state, or whether it is partly outside the viewport. `CanvasObservation` bridges that gap by pairing visual context with actionable object metadata.

### 2.2 Viewport, Offscreen, and Partial-Visibility Awareness

The system does not treat the viewport as the whole canvas. It explicitly represents:

- objects fully inside the viewport
- objects partially clipped by the viewport
- selected objects even when they are offscreen
- nearby offscreen content
- farther offscreen content summarized into spatial tiles

Spatial tiles include bounds, counts, type summaries, representative text, important ids, and relation links back to visible content. This lets the model answer requests such as "move the selected offscreen note next to the group" or "move the half-visible box into view" without first losing track of the target.

The observation also distinguishes page coordinates from model-facing prompt coordinates. That helps the model reason spatially while still allowing the application to execute actions in true canvas coordinates.

### 2.3 Relationship and Affordance Extraction

The system extracts higher-level relationships from the canvas, including arrow bindings, connected objects, labels, overlap candidates, and text overflow candidates. These are surfaced as relations and task affordances rather than leaving the model to infer everything from raw pixels.

Important examples:

- unbound arrows are identified as repair candidates
- existing arrows are represented so the model can avoid duplicate connectors
- overlapping labels and shapes are surfaced as layout cleanup candidates
- overflowing text is surfaced as a fit-text candidate

This gives the model a task-oriented understanding of the canvas: not only what objects exist, but what is likely wrong and what kind of repair action is appropriate.

### 2.4 Target Selectors

The system avoids relying only on hard-coded object ids from the model. Instead, many actions can use target selectors. A selector describes intent, and the application resolves it against the current canvas.

Supported selector ideas include:

- selected shapes
- current context shapes or regions
- text or note matches
- nearest object
- objects inside or intersecting a region
- objects represented by a spatial tile
- connected objects
- labels of selected objects
- arrows connected to selected objects

This is important for ambiguous instructions. For example, if two boxes are both labeled "Revenue", the model should not guess one id. It can express "the Revenue box" as a selector with an expectation of exactly one match. Local resolution then either finds one safe target or fails safely. This prevents a wrong edit when the user's language is underspecified.

### 2.5 Action Language

The model does not directly manipulate the editor. It emits structured actions. The action language contains both primitive edit actions and semantic canvas actions.

Primitive actions include operations such as:

- move
- resize
- label
- update
- create
- delete
- align
- distribute
- bring to front or send to back

Semantic actions represent higher-level canvas intent:

- `connect`: create or repair bound arrows between objects while checking existing connections
- `cleanupLayout`: spread or organize overlapping objects into a readable layout
- `fitText`: repair overflowing text or labels
- `arrange`: express higher-level spatial organization

This gives the model a better abstraction. Instead of asking it to manually compute many low-level edits for "clean up this flowchart", it can say the intended operation, and the application handles the precise local mechanics.

### 2.6 Chunked Execution and Verification

For multi-step edits, the model is encouraged to return action chunks. Each chunk has:

- one short-horizon intent
- one or more structured actions
- optional postconditions describing what should be true afterward

The application can apply actions as they stream, then verify the completed chunk before continuing. If a chunk fails local verification, the model receives a fresh observation and a concrete failure message. This supports repair loops for tasks such as "clean the diagram and fix the broken arrows" where one action may change the canvas state for the next action.

### 2.7 Local Safety and Quality Checks

The application verifies model output locally. The checks include:

- whether the intended target resolved correctly
- whether an action edited unrelated shapes
- whether arrows are actually connected
- whether duplicate arrows were created
- whether labels still overlap or overflow
- whether semantic action postconditions were satisfied

This creates a division of labor:

- the LLM interprets the user's intent and chooses actions
- the canvas system resolves targets, applies geometry, detects problems, and asks for repair when needed

That division is what enables spatial reasoning without giving the model unchecked control over the canvas.

## 3. Experiment

### 3.a Experiment Setup

The benchmark tested whether CanvasAct improves canvas-task completion while controlling wrong edits, latency, tokens, and cost.

The full matrix was:

| Dimension | Value |
| --- | ---: |
| Tasks | 21 |
| Task categories | 7 |
| Repetitions | 10 |
| Models | 3 |
| Compared systems | tldraw vs CanvasAct |
| Total cases | 1,260 |

Models:

- `gpt-5.4-mini`
- `gpt-5.4`
- `claude-sonnet-4-5`

Task categories:

- simple edits
- selection and offscreen targets
- partial visibility
- ambiguous targets
- arrows and connectors
- layout cleanup
- multi-step repair

The main metrics were:

- success rate
- average 0-4 task score
- wrong-target rate
- API error rate
- average latency
- average token use
- estimated total cost
- estimated cost per successful task

Task score rubric:

| Score | Meaning |
| ---: | --- |
| 4 | Correct target, correct action, clean result, no unnecessary edits |
| 3 | Main task completed with minor issues |
| 2 | Referenced relevant objects, but did not complete the required action |
| 1 | Very partial attempt with major errors still remaining |
| 0 | Failed, missed the target, edited the wrong object, or made an unsafe edit |

Success threshold: `score >= 3`.

Wrong-target cases measure unsafe targeting. A run is counted as wrong-target when the model's returned action explicitly targets an object id outside the expected target set for that task. This is different from ordinary failure: a model can fail by doing nothing useful, but a wrong-target case means it tried to edit or reference the wrong canvas object.

| Example task | Expected target | Wrong-target example |
| --- | --- | --- |
| Move the partly visible shape on the left | `partial-left` | Move `partial-right` instead |
| Rename only the selected Revenue box | selected `partial-left` | Rename the other Revenue box |
| Connect Start to End without duplicating an existing arrow | `start`, `end`, `bound-arrow` | Edit `unbound-arrow` as an extra target |

### 3.b Experiment Result

The full run completed all `1,260 / 1,260` cases with `0` API errors.

Overall result:

| System | Cases | Passed | Success | Avg Score | Wrong Targets | Avg Duration | Avg Tokens | Est. Cost | Cost/Success |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tldraw | 630 | 214 | 34.0% | 2.00 / 4 | 42 / 630 | 3617 ms | 8322 | $9.73 | $0.0455 |
| CanvasAct | 630 | 501 | 79.5% | 3.25 / 4 | 24 / 630 | 3201 ms | 13766 | $15.13 | $0.0302 |

Latency and token usage:

| Method | Avg latency | Avg tokens | Interpretation |
| --- | ---: | ---: | --- |
| tldraw | 3617 ms | 8322 | Lower token use, but much lower task success |
| CanvasAct | 3201 ms | 13766 | More context per run, but lower average latency and higher task success |

Model-by-category success rate:

| Method | Simple edits | Selection/offscreen | Partial visibility | Ambiguous targets | Arrows/connectors | Layout cleanup | Multi-step repair | Average |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tldraw | 100.0% | 36.7% | 0.0% | 41.1% | 21.1% | 23.3% | 15.6% | 34.0% |
| CanvasAct | 100.0% | 55.6% | 100.0% | 64.4% | 42.2% | 100.0% | 94.4% | 79.5% |

Model-by-category average 0-4 score:

| Method | Simple edits | Selection/offscreen | Partial visibility | Ambiguous targets | Arrows/connectors | Layout cleanup | Multi-step repair | Average |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tldraw | 4.00 | 1.91 | 0.00 | 2.31 | 2.21 | 2.47 | 1.13 | 2.00 |
| CanvasAct | 4.00 | 2.44 | 4.00 | 2.58 | 2.58 | 4.00 | 3.17 | 3.25 |

CanvasAct per-model result by task category:

| Model | Simple edits | Selection/offscreen | Partial visibility | Ambiguous targets | Arrows/connectors | Layout cleanup | Multi-step repair | Average | Avg latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.4-mini` | 100.0% | 86.7% | 100.0% | 33.3% | 93.3% | 100.0% | 100.0% | 87.6% | 1261 ms |
| `gpt-5.4` | 100.0% | 13.3% | 100.0% | 60.0% | 33.3% | 100.0% | 86.7% | 70.5% | 2402 ms |
| `claude-sonnet-4-5` | 100.0% | 66.7% | 100.0% | 100.0% | 0.0% | 100.0% | 96.7% | 80.5% | 5939 ms |

Per-category result:

| Category | tldraw Success | CanvasAct Success | Delta | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Simple edits | 100.0% | 100.0% | +0.0 | No regression on straightforward visible edits |
| Selection/offscreen | 36.7% | 55.6% | +18.9 | Improved overall, but still inconsistent |
| Partial visibility | 0.0% | 100.0% | +100.0 | Strong gain from explicit visibility and spatial observation |
| Ambiguous targets | 41.1% | 64.4% | +23.3 | Better target safety, but wrong-target cases remain |
| Arrows/connectors | 21.1% | 42.2% | +21.1 | Improved, but connector repair remains a weak area |
| Layout cleanup | 23.3% | 100.0% | +76.7 | Strong gain from semantic layout actions |
| Multi-step repair | 15.6% | 94.4% | +78.9 | Strong gain from chunked semantic action planning |

### 3.c Experiment Analysis

CanvasAct substantially improves canvas-agent behavior. The biggest gains come from tasks where the model needs structured spatial context or higher-level actions:

- partial visibility improved from `0.0%` to `100.0%`
- layout cleanup improved from `23.3%` to `100.0%`
- multi-step repair improved from `15.6%` to `94.4%`

These results suggest that the main method works: the model benefits from seeing canvas state as structured objects, visibility states, spatial tiles, relations, and affordances rather than relying on visual interpretation alone.

Simple edits stayed at `100.0%`, which is important. CanvasAct adds more context and more action abstractions, but it did not reduce performance on straightforward visible-object edits.

Wrong-target behavior improved overall. The wrong-target rate dropped from `6.7%` to `3.8%`. This supports the value of target selectors and local target resolution. However, ambiguous-target tasks still produced errors in some cases, so target safety is improved but not solved.

Cost and tokens show a tradeoff. Average token use increased by about `1.65x`, because CanvasAct sends richer spatial context. However, the cost per successful task decreased from `$0.0455` to `$0.0302`, because the success rate increased enough to offset the higher prompt cost.

Remaining weaknesses:

- selection/offscreen tasks improved overall but remain inconsistent, especially for one model
- connector repair still fails often enough to need more focused work
- ambiguous target handling should be stricter when labels are duplicated

Overall conclusion: CanvasAct achieves the goal of enabling LLMs to understand and act in a spatial canvas. It does this by combining structured scene observation, local target resolution, semantic action abstractions, chunked execution, and verification. The benchmark shows that this design produces much higher task success, fewer wrong-target edits, and lower cost per successful task, while preserving simple-edit reliability.

## 4. Limitations

The current evaluation is useful for controlled comparison, but it has several limitations:

| Limitation | Meaning |
| --- | --- |
| Structural scoring only | The evaluator scores returned actions and target ids. It does not fully replay every action and visually inspect the final canvas. |
| Limited task distribution | The benchmark covers 21 fixed tasks across 7 categories. It may not capture all real user canvas workflows, document types, or visual styles. |
| Connector reliability | Arrows and connector repair remain weak. CanvasAct improves the aggregate connector result, but individual models still fail some connector tasks. |
| Ambiguity handling | Ambiguous labels and duplicated objects are safer than before, but wrong-target cases still occur. Stronger clarification or safe-fail behavior is needed. |
| Model sensitivity | Performance differs by model. Some categories improve strongly for one model but remain weak for another. |
| Higher prompt load | CanvasAct uses richer spatial observations, which increases average token usage even when cost per successful task improves. |
| No human visual judgment | The benchmark does not include human review of layout quality, aesthetics, or whether the final canvas feels natural to users. |

Artifacts:

- `frontend/.tsbuild/evals/stronger-benchmark-full-combined.json`
- `docs/stronger_benchmark_full_report.md`
- `docs/model_in_loop_eval_report.md`

Pricing sources for cost estimates:

- OpenAI API pricing: `https://openai.com/api/pricing/`
- Anthropic Claude Sonnet 4.5 pricing: `https://docs.claude.com/en/docs/about-claude/models/whats-new-sonnet-4-5`
