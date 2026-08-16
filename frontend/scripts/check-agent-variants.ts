import { strict as assert } from 'node:assert'
import { getAgentActionUtilsRecordForMode } from '../client/actions/AgentActionUtil'
import { getAgentModeDefinition } from '../client/modes/AgentModeDefinitions'
import {
	CANVASACT_AGENT_MODE,
	DEFAULT_AGENT_VARIANT,
	LEGACY_AGENT_MODE,
	isAgentVariant,
} from '../shared/agentVariants'
import { getActionSchemaForMode } from '../shared/schema/AgentActionSchemaRegistry'
import { buildResponseSchema, buildResponseZodSchema } from '../shared/schema/buildResponseSchema'
import type { AgentPrompt } from '../shared/types/AgentPrompt'
import { buildSystemPrompt } from '../worker/prompt/buildSystemPrompt'

const removedCompoundActionTypes = [
	'arrange',
	'buildFlow',
	'organizeBoard',
	'repairDashboard',
	'connect',
	'cleanupLayout',
	'fitText',
	'annotateGroup',
] as const

const expectedLegacyActions = [
	'message',
	'think',
	'review',
	'add-detail',
	'update-todo-list',
	'setMyView',
	'create',
	'delete',
	'update',
	'label',
	'move',
	'place',
	'bringToFront',
	'sendToBack',
	'rotate',
	'resize',
	'align',
	'distribute',
	'stack',
	'clear',
	'pen',
	'countryInfo',
	'count',
	'unknown',
] as const

const original = getAgentModeDefinition(LEGACY_AGENT_MODE)
const canvasAct = getAgentModeDefinition(CANVASACT_AGENT_MODE)

assert.equal(DEFAULT_AGENT_VARIANT, 'canvasact')
assert.equal(isAgentVariant('canvasact'), true)
assert.equal(isAgentVariant('original-tldraw'), true)
assert.equal(isAgentVariant('constructor'), false)

assert.equal(original.active, true)
assert.equal(canvasAct.active, true)
if (!original.active || !canvasAct.active) throw new Error('Expected active agent modes.')

// CanvasObservation is the entire experimental boundary. The two working modes
// must otherwise receive exactly the same prompt parts in the same order.
assert.equal(original.parts.includes('canvasObservation'), false)
assert.equal(canvasAct.parts.includes('canvasObservation'), true)
assert.deepEqual(
	canvasAct.parts.filter((part) => part !== 'canvasObservation'),
	original.parts,
)

// CanvasObs uses the original tldraw action vocabulary without adding compound
// actions or removing the original review action.
assert.deepEqual(original.actions, [...expectedLegacyActions])
assert.deepEqual(canvasAct.actions, [...expectedLegacyActions])
for (const actionType of removedCompoundActionTypes) {
	assert.equal(original.actions.includes(actionType), false)
	assert.equal(canvasAct.actions.includes(actionType), false)
}

const originalPrompt = buildSystemPrompt(promptFor(original))
const canvasActPrompt = buildSystemPrompt(promptFor(canvasAct))

const sharedMovePromptGuidance = [
	"The `move` action's `x` and `y` are prompt/action-space coordinates",
	'For every shape type, `move.x` and `move.y` locate the point selected by `move.anchor`.',
	'Use `anchor: "top-left"` as the canonical choice for ordinary shapes',
	'For relative moves, change only the requested axes',
] as const

assert.equal(originalPrompt.includes('CanvasObservation'), false)
assert.equal(canvasActPrompt.includes('CanvasObservation'), true)
for (const [variant, prompt] of [
	['original-tldraw', originalPrompt],
	['canvasact', canvasActPrompt],
] as const) {
	assert.equal(prompt.includes('Action chunks'), false, `${variant} still advertises chunks`)
	assert.equal(
		prompt.includes('top-level `actions` are not accepted'),
		false,
		`${variant} still rejects legacy actions`,
	)
	assert.equal(prompt.includes('targetSelector'), false, `${variant} still advertises selectors`)
	assert.equal(prompt.includes('postcondition'), false, `${variant} still advertises postconditions`)
	assert.equal(
		prompt.includes('automatically runs one bounded'),
		false,
		`${variant} still advertises automatic review`,
	)
	assert.equal(
		prompt.includes('Do not emit the `review` action'),
		false,
		`${variant} still blocks legacy review`,
	)
	assert.equal(
		prompt.includes('Use the `review` action to check your work.'),
		true,
		`${variant} does not advertise legacy review`,
	)
	for (const guidance of sharedMovePromptGuidance) {
		assert.equal(
			prompt.includes(guidance),
			true,
			`${variant} does not advertise shared move coordinate guidance: ${guidance}`,
		)
	}
}

// Both modes use the exact legacy response envelope and exact per-action schema.
const originalResponseJsonSchema = buildResponseSchema(original.actions, original.type)
const canvasActResponseJsonSchema = buildResponseSchema(canvasAct.actions, canvasAct.type)
assert.deepEqual(canvasActResponseJsonSchema, originalResponseJsonSchema)
for (const [variant, schema] of [
	['original-tldraw', originalResponseJsonSchema],
	['canvasact', canvasActResponseJsonSchema],
] as const) {
	const serialized = JSON.stringify(schema)
	assert.equal(serialized.includes('targetSelector'), false, `${variant} schema still has selectors`)
	assert.equal(serialized.includes('referenceSelector'), false, `${variant} schema still has selectors`)
	assert.equal(serialized.includes('postcondition'), false, `${variant} schema still has contracts`)
	assert.equal(serialized.includes('"chunks"'), false, `${variant} schema still has chunks`)
	assert.equal(
		serialized.includes('x and y are prompt/action-space coordinates'),
		true,
		`${variant} move schema does not define prompt/action-space coordinates`,
	)
	assert.equal(
		serialized.includes('locate the selected anchor for every shape type'),
		true,
		`${variant} move schema does not define anchor semantics`,
	)
	assert.equal(
		serialized.includes('preserve the current anchor coordinate on every untouched axis'),
		true,
		`${variant} move schema does not define relative-move axis preservation`,
	)
}

const originalResponseSchema = buildResponseZodSchema(original.actions, original.type)
const canvasActResponseSchema = buildResponseZodSchema(canvasAct.actions, canvasAct.type)
const legacyResponse = { actions: [{ _type: 'message', text: 'Done' }] }
const removedChunkResponse = {
	chunks: [{ intent: 'Answer', actions: [{ _type: 'message', text: 'Done' }] }],
	objective: {
		summary: 'Answer the user.',
		coverage: 'not-applicable',
		postconditions: [],
		unverifiedCriteria: [],
	},
}
assert.equal(originalResponseSchema.safeParse(legacyResponse).success, true)
assert.equal(canvasActResponseSchema.safeParse(legacyResponse).success, true)
assert.equal(originalResponseSchema.safeParse(removedChunkResponse).success, false)
assert.equal(canvasActResponseSchema.safeParse(removedChunkResponse).success, false)

for (const actionType of expectedLegacyActions) {
	const originalActionSchema = getActionSchemaForMode(actionType, original.type)
	const canvasActActionSchema = getActionSchemaForMode(actionType, canvasAct.type)
	assert.ok(originalActionSchema, `Missing original schema for ${actionType}`)
	assert.ok(canvasActActionSchema, `Missing CanvasObs schema for ${actionType}`)
	assert.equal(
		canvasActActionSchema,
		originalActionSchema,
		`CanvasObs must reuse the exact original schema for ${actionType}`,
	)
}

// Reusing the same util constructors prevents selector resolution, contracts,
// verification, or other CanvasObs-only execution from surviving accidentally.
const agentStub = { editor: {} } as Parameters<typeof getAgentActionUtilsRecordForMode>[0]
const originalUtils = getAgentActionUtilsRecordForMode(agentStub, original.type)
const canvasActUtils = getAgentActionUtilsRecordForMode(agentStub, canvasAct.type)
for (const actionType of expectedLegacyActions) {
	assert.equal(
		canvasActUtils[actionType].constructor,
		originalUtils[actionType].constructor,
		`CanvasObs must reuse the exact original action util for ${actionType}`,
	)
	assert.equal(
		'getActionContract' in canvasActUtils[actionType],
		false,
		`CanvasObs action util ${actionType} still exposes a postcondition contract`,
	)
	assert.equal(
		'prepareActionContract' in canvasActUtils[actionType],
		false,
		`CanvasObs action util ${actionType} still prepares a postcondition contract`,
	)
}

console.log('Agent variant parity checks passed.')
process.exit(0)

function promptFor(mode: typeof original | typeof canvasAct): AgentPrompt {
	if (!mode.active) throw new Error('Expected an active mode.')
	return {
		mode: {
			type: 'mode',
			modeType: mode.type,
			partTypes: mode.parts,
			actionTypes: mode.actions,
		},
	} as AgentPrompt
}
