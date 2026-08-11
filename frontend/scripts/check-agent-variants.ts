import { strict as assert } from 'node:assert'
import {
	CANVASACT_AGENT_MODE,
	DEFAULT_AGENT_VARIANT,
	LEGACY_AGENT_MODE,
	isAgentVariant,
} from '../shared/agentVariants'
import { buildResponseSchema } from '../shared/schema/buildResponseSchema'
import type { AgentPrompt } from '../shared/types/AgentPrompt'
import { getAgentModeDefinition } from '../client/modes/AgentModeDefinitions'
import { buildSystemPrompt } from '../worker/prompt/buildSystemPrompt'

const semanticActionTypes = ['arrange', 'connect', 'cleanupLayout', 'fitText', 'annotateGroup']
const original = getAgentModeDefinition(LEGACY_AGENT_MODE)
const canvasAct = getAgentModeDefinition(CANVASACT_AGENT_MODE)

assert.equal(DEFAULT_AGENT_VARIANT, 'canvasact')
assert.equal(isAgentVariant('canvasact'), true)
assert.equal(isAgentVariant('original-tldraw'), true)
assert.equal(isAgentVariant('constructor'), false)

assert.equal(original.active, true)
assert.equal(canvasAct.active, true)
if (!original.active || !canvasAct.active) throw new Error('Expected active agent modes.')

assert.equal(original.parts.includes('canvasObservation'), false)
assert.equal(canvasAct.parts.includes('canvasObservation'), true)
assert.equal(original.actions.some((action) => semanticActionTypes.includes(action)), false)
assert.equal(canvasAct.actions.some((action) => semanticActionTypes.includes(action)), true)
assert.deepEqual(original.parts, [
	'mode',
	'debug',
	'modelName',
	'messages',
	'data',
	'contextItems',
	'screenshot',
	'userViewportBounds',
	'agentViewportBounds',
	'blurryShapes',
	'peripheralShapes',
	'selectedShapes',
	'chatHistory',
	'userActionHistory',
	'todoList',
	'canvasLints',
	'time',
])
assert.deepEqual(original.actions, [
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
])

const originalPrompt = buildSystemPrompt({
	mode: {
		type: 'mode',
		modeType: original.type,
		partTypes: original.parts,
		actionTypes: original.actions,
	},
} as AgentPrompt)
const canvasActPrompt = buildSystemPrompt({
	mode: {
		type: 'mode',
		modeType: canvasAct.type,
		partTypes: canvasAct.parts,
		actionTypes: canvasAct.actions,
	},
} as AgentPrompt)

assert.equal(originalPrompt.includes('CanvasObservation'), false)
assert.equal(originalPrompt.includes('Action chunks'), false)
assert.equal(originalPrompt.includes('targetSelector'), false)
assert.equal(canvasActPrompt.includes('CanvasObservation'), true)
assert.equal(canvasActPrompt.includes('Action chunks'), true)
assert.equal(canvasActPrompt.includes('targetSelector'), true)

const originalSchema = JSON.stringify(buildResponseSchema(original.actions, original.type))
const canvasActSchema = JSON.stringify(buildResponseSchema(canvasAct.actions, canvasAct.type))

assert.equal(originalSchema.includes('"chunks"'), false)
assert.equal(originalSchema.includes('targetSelector'), false)
assert.equal(originalSchema.includes('cleanupLayout'), false)
assert.equal(canvasActSchema.includes('"chunks"'), true)
assert.equal(canvasActSchema.includes('targetSelector'), true)
assert.equal(canvasActSchema.includes('cleanupLayout'), true)

console.log('Agent variant contract checks passed.')
process.exit(0)
