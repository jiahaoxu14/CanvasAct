import {
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	Editor,
} from 'tldraw'
import type { BoxModel, TLArrowShape, TLShapeId } from 'tldraw'
import type { TargetSelector } from '../schema/TargetSelectorSchemas'
import type { ActionContract } from '../types/ActionContract'
import type { AgentTrajectory } from '../types/AgentTrajectory'
import type { SimpleShapeId } from '../types/ids-schema'
import { buildCanvasObservation } from '../format/buildCanvasObservation'
import type { CanvasObservation } from '../format/CanvasObservation'
import type { AgentHelpers } from '../../client/AgentHelpers'
import type { TldrawAgent } from '../../client/agent/TldrawAgent'
import { MoveActionUtil } from '../../client/actions/MoveActionUtil'
import { resolveTargetSelectorForAction, resolveTargets } from '../../client/actions/resolveTargets'
import { verifyActionResult } from '../../client/actions/verifyActionResult'
import { INITIAL_CANVAS_AGENT_EVAL_FIXTURES } from './CanvasAgentEvalFixtures'
import {
	runCanvasAgentEvalHarness,
	type CanvasAgentEvalActionResult,
	type CanvasAgentEvalLintResult,
	type CanvasAgentEvalRunResult,
	type CanvasAgentEvalTargetResolution,
} from './CanvasAgentEvalMetrics'

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z'
const VIEWPORT: BoxModel = { x: 0, y: 0, w: 400, h: 300 }

export interface InitialCanvasAgentEvalRun {
	result: CanvasAgentEvalRunResult
	artifacts: {
		observationIds: string[]
		targetResolutionIds: string[]
		actionResultIds: string[]
		lintResultIds: string[]
		trajectoryIds: string[]
	}
	records: {
		observations: Partial<Record<string, CanvasObservation>>
		targetResolutions: Partial<Record<string, CanvasAgentEvalTargetResolution>>
		actionResults: Partial<Record<string, CanvasAgentEvalActionResult>>
		lintResults: Partial<Record<string, CanvasAgentEvalLintResult>>
		deterministicResults: Partial<Record<string, boolean>>
		trajectories: Partial<Record<string, AgentTrajectory>>
	}
}

export function runInitialCanvasAgentEvals(): InitialCanvasAgentEvalRun {
	installHeadlessDom()

	const observations: Partial<Record<string, CanvasObservation>> = {}
	const targetResolutions: Partial<Record<string, CanvasAgentEvalTargetResolution>> = {}
	const actionResults: Partial<Record<string, CanvasAgentEvalActionResult>> = {}
	const lintResults: Partial<Record<string, CanvasAgentEvalLintResult>> = {}
	const deterministicResults: Partial<Record<string, boolean>> = {}
	const trajectories: Partial<Record<string, AgentTrajectory>> = {}

	withEditor((editor) => {
		setupPartialVisibilityFixture(editor)
		const first = observe(editor)
		const second = observe(editor)
		observations.observation_partial_visibility = first
		deterministicResults.observation_partial_visibility = normalizeObservation(first) === normalizeObservation(second)
	})

	withEditor((editor) => {
		setupArrowRelationsFixture(editor)
		const first = observe(editor)
		const second = observe(editor)
		observations.observation_arrow_relations = first
		deterministicResults.observation_arrow_relations = normalizeObservation(first) === normalizeObservation(second)
	})

	withEditor((editor) => {
		setupSelectedOffscreenFixture(editor)
		const first = observe(editor)
		const second = observe(editor)
		observations.observation_selected_offscreen = first
		deterministicResults.observation_selected_offscreen = normalizeObservation(first) === normalizeObservation(second)
	})

	withEditor((editor) => {
		setupSelectedSelectorFixture(editor)
		targetResolutions.selector_selected_shapes = resolveTargets(
			createEvalAgent(editor),
			{ _type: 'selected', expect: 'many' } satisfies TargetSelector
		)
	})

	withEditor((editor) => {
		setupAmbiguousLabelFixture(editor)
		targetResolutions.selector_ambiguous_label = resolveTargets(
			createEvalAgent(editor),
			{
				_type: 'text',
				text: 'Duplicate label',
				match: 'exact',
				searchNotes: true,
				expect: 'one',
			} satisfies TargetSelector
		)
	})

	withEditor((editor) => {
		setupAlignSelectedFixture(editor)
		actionResults.action_align_selected = runAlignSelectedEval(editor)
	})

	withEditor((editor) => {
		setupAmbiguousLabelFixture(editor)
		actionResults.action_move_ambiguous_selector = runMoveAmbiguousSelectorEval(editor)
	})

	withEditor((editor) => {
		setupAmbiguousLabelFixture(editor)
		actionResults.action_move_ambiguous_hardcoded = runMoveAmbiguousHardcodedEval(editor)
	})

	withEditor((editor) => {
		setupOverlapLintFixture(editor)
		lintResults.lint_text_overlap = runOverlapLintEval(editor)
	})

	withEditor((editor) => {
		trajectories.task_fix_unbound_arrows = runFixUnboundArrowsTrajectory(editor)
	})

	withEditor((editor) => {
		trajectories.task_clean_cluster = runCleanClusterTrajectory(editor)
	})

	const result = runCanvasAgentEvalHarness({
		fixtures: INITIAL_CANVAS_AGENT_EVAL_FIXTURES,
		observations,
		targetResolutions,
		actionResults,
		lintResults,
		deterministicResults,
		trajectories,
	})

	return {
		result,
		artifacts: {
			observationIds: Object.keys(observations).sort(),
			targetResolutionIds: Object.keys(targetResolutions).sort(),
			actionResultIds: Object.keys(actionResults).sort(),
			lintResultIds: Object.keys(lintResults).sort(),
			trajectoryIds: Object.keys(trajectories).sort(),
		},
		records: {
			observations,
			targetResolutions,
			actionResults,
			lintResults,
			deterministicResults,
			trajectories,
		},
	}
}

function setupPartialVisibilityFixture(editor: Editor) {
	createGeo(editor, 'visible', 80, 80, 80, 60)
	createGeo(editor, 'partial-left', -30, 80, 80, 60)
	createGeo(editor, 'partial-right', 360, 80, 80, 60)
}

function setupArrowRelationsFixture(editor: Editor) {
	createGeo(editor, 'start', 70, 110, 80, 60)
	createGeo(editor, 'end', 270, 110, 80, 60)
	createArrow(editor, 'bound-arrow', 150, 140, 'start', 'end')
	createArrow(editor, 'unbound-arrow', 40, 230)
}

function setupSelectedOffscreenFixture(editor: Editor) {
	createGeo(editor, 'selected-offscreen', 420, 120, 80, 60)
	editor.select(toTlShapeId('selected-offscreen'))
}

function setupSelectedSelectorFixture(editor: Editor) {
	createGeo(editor, 'selected-a', 60, 60, 80, 60)
	createGeo(editor, 'selected-b', 180, 120, 80, 60)
	createGeo(editor, 'unselected', 300, 120, 80, 60)
	editor.select(toTlShapeId('selected-a'), toTlShapeId('selected-b'))
}

function setupAmbiguousLabelFixture(editor: Editor) {
	createGeo(editor, 'duplicate-label-a', 60, 60, 80, 60, { note: 'Duplicate label' })
	createGeo(editor, 'duplicate-label-b', 180, 60, 80, 60, { note: 'Duplicate label' })
}

function setupAlignSelectedFixture(editor: Editor) {
	createGeo(editor, 'align-a', 120, 60, 80, 60)
	createGeo(editor, 'align-b', 240, 160, 80, 60)
	createGeo(editor, 'align-unrelated', 320, 40, 40, 40)
	editor.select(toTlShapeId('align-a'), toTlShapeId('align-b'))
}

function setupOverlapLintFixture(editor: Editor) {
	createGeo(editor, 'overlap-label-a', 80, 80, 120, 50)
	createGeo(editor, 'overlap-label-b', 130, 95, 120, 50)
}

function runAlignSelectedEval(editor: Editor): CanvasAgentEvalActionResult {
	const selectedIds = [toTlShapeId('align-a'), toTlShapeId('align-b')]
	const unrelatedId = toTlShapeId('align-unrelated')
	const unrelatedBefore = editor.getShapePageBounds(unrelatedId)?.toJson()
	editor.alignShapes(selectedIds, 'left')

	const lefts = selectedIds.map((id) => editor.getShapePageBounds(id)?.left ?? Number.NaN)
	const targetLeft = Math.min(...lefts)
	const geometryErrorPx = Math.max(...lefts.map((left) => Math.abs(left - targetLeft)))
	const unrelatedAfter = editor.getShapePageBounds(unrelatedId)?.toJson()
	const unrelatedShapeMutationCount =
		JSON.stringify(unrelatedBefore) === JSON.stringify(unrelatedAfter) ? 0 : 1

	return {
		postconditionPassRate: geometryErrorPx <= 1 ? 1 : 0,
		geometryErrorPx,
		unrelatedShapeMutationCount,
		verificationFailureCount: geometryErrorPx <= 1 && unrelatedShapeMutationCount === 0 ? 0 : 1,
	}
}

function runOverlapLintEval(editor: Editor): CanvasAgentEvalLintResult {
	const verification = verifyActionResult(
		editor,
		{
			actionType: 'lint_text_overlap',
			postconditions: [
				{
					type: 'no-overlap',
					shapeIds: ['overlap-label-a', 'overlap-label-b'] as SimpleShapeId[],
					allowedOverlap: 0,
				},
			],
		},
		null
	)
	return {
		initialLintCount: 1,
		finalLintCount: verification.failures.length > 0 ? 1 : 0,
		verificationFailureCount: verification.failures.length,
	}
}

function runMoveAmbiguousSelectorEval(editor: Editor): CanvasAgentEvalActionResult {
	const before = [
		editor.getShapePageBounds(toTlShapeId('duplicate-label-a'))?.toJson(),
		editor.getShapePageBounds(toTlShapeId('duplicate-label-b'))?.toJson(),
	]
	const scheduledMessages: string[] = []
	const agent = createEvalAgent(editor, scheduledMessages)
	const result = resolveTargetSelectorForAction({
		agent,
		helpers: {
			ensureShapeIdsExist: (shapeIds: SimpleShapeId[]) =>
				shapeIds.filter((shapeId) => editor.getShape(toTlShapeId(shapeId))),
		} as unknown as Parameters<typeof resolveTargetSelectorForAction>[0]['helpers'],
		selector: {
			_type: 'text',
			text: 'Duplicate label',
			match: 'exact',
			searchNotes: true,
			expect: 'one',
		} satisfies TargetSelector,
		actionType: 'move',
		min: 1,
		max: 1,
	})
	const after = [
		editor.getShapePageBounds(toTlShapeId('duplicate-label-a'))?.toJson(),
		editor.getShapePageBounds(toTlShapeId('duplicate-label-b'))?.toJson(),
	]
	const unrelatedShapeMutationCount = JSON.stringify(before) === JSON.stringify(after) ? 0 : 1

	return {
		postconditionPassRate: result === null ? 1 : 0,
		unrelatedShapeMutationCount,
		verificationFailureCount: scheduledMessages.length,
	}
}

function runMoveAmbiguousHardcodedEval(editor: Editor): CanvasAgentEvalActionResult {
	const before = [
		editor.getShapePageBounds(toTlShapeId('duplicate-label-a'))?.toJson(),
		editor.getShapePageBounds(toTlShapeId('duplicate-label-b'))?.toJson(),
	]
	const scheduledMessages: string[] = []
	const agent = createEvalAgent(editor, scheduledMessages, {
		agentMessages: ['Move the Duplicate label.'],
		userMessages: ['Move the Duplicate label.'],
	})
	const util = new MoveActionUtil(agent)
	const sanitized = util.sanitizeAction(
			{
			_type: 'move',
			complete: true,
			time: 0,
			intent: 'Move the Duplicate label.',
				shapeId: 'duplicate-label-a' as SimpleShapeId,
				anchor: 'center',
				x: 140,
				y: 120,
		},
			{
				ensureShapeIdsExist: (shapeIds: SimpleShapeId[]) =>
					shapeIds.filter((shapeId) => editor.getShape(toTlShapeId(shapeId))),
				ensureValueIsNumber: (value: unknown) => (typeof value === 'number' ? value : null),
			} as unknown as AgentHelpers
		)
	const after = [
		editor.getShapePageBounds(toTlShapeId('duplicate-label-a'))?.toJson(),
		editor.getShapePageBounds(toTlShapeId('duplicate-label-b'))?.toJson(),
	]
	const unrelatedShapeMutationCount = JSON.stringify(before) === JSON.stringify(after) ? 0 : 1

	return {
		postconditionPassRate: sanitized === null ? 1 : 0,
		unrelatedShapeMutationCount,
		verificationFailureCount: scheduledMessages.length,
	}
}

function runFixUnboundArrowsTrajectory(editor: Editor): AgentTrajectory {
	createGeo(editor, 'start', 70, 110, 80, 60)
	createGeo(editor, 'end', 270, 110, 80, 60)
	createArrow(editor, 'unbound-arrow', 150, 140)
	const initialObservation = observe(editor)

	bindArrow(editor, 'unbound-arrow', 'start', 'start')
	bindArrow(editor, 'unbound-arrow', 'end', 'end')
	const contract: ActionContract = {
		actionType: 'connect',
		modifiedShapeIds: ['unbound-arrow' as SimpleShapeId],
		postconditions: [{ type: 'arrow-bindings', shapeIds: ['unbound-arrow' as SimpleShapeId] }],
	}
	const verification = verifyActionResult(editor, contract, null)
	const finalObservation = observe(editor)

	return makeTrajectory({
		id: 'task_fix_unbound_arrows',
		request: 'Fix the arrows that are not connected.',
		initialObservation,
		finalObservation,
		contract,
		verification,
		chunkIntent: 'Bind the arrow to its source and target shapes.',
		repairLoopCount: 1,
	})
}

function runCleanClusterTrajectory(editor: Editor): AgentTrajectory {
	createGeo(editor, 'cluster-a', 80, 80, 100, 60)
	createGeo(editor, 'cluster-b', 120, 105, 100, 60)
	createGeo(editor, 'cluster-c', 160, 130, 100, 60)
	const initialObservation = observe(editor)

	editor.updateShapes([
		{ id: toTlShapeId('cluster-a'), type: 'geo', x: 60, y: 80 },
		{ id: toTlShapeId('cluster-b'), type: 'geo', x: 190, y: 80 },
		{ id: toTlShapeId('cluster-c'), type: 'geo', x: 320, y: 80 },
	])
	const shapeIds = ['cluster-a', 'cluster-b', 'cluster-c'] as SimpleShapeId[]
	const contract: ActionContract = {
		actionType: 'cleanupLayout',
		modifiedShapeIds: shapeIds,
		postconditions: [{ type: 'no-overlap', shapeIds, allowedOverlap: 0 }],
	}
	const verification = verifyActionResult(editor, contract, null)
	const finalObservation = observe(editor)

	return makeTrajectory({
		id: 'task_clean_cluster',
		request: 'Clean up this messy cluster without changing the text.',
		initialObservation,
		finalObservation,
		contract,
		verification,
		chunkIntent: 'Move the cluster into a readable row with spacing.',
		repairLoopCount: 1,
	})
}

function makeTrajectory({
	id,
	request,
	initialObservation,
	finalObservation,
	contract,
	verification,
	chunkIntent,
	repairLoopCount,
}: {
	id: string
	request: string
	initialObservation: CanvasObservation
	finalObservation: CanvasObservation
	contract: ActionContract
	verification: ReturnType<typeof verifyActionResult>
	chunkIntent: string
	repairLoopCount: number
}): AgentTrajectory {
	const timestamp = FIXED_TIMESTAMP
	return {
		trajectoryId: `eval-${id}`,
		agentVariant: 'canvasact',
		startedAt: timestamp,
		finishedAt: timestamp,
		status: 'completed',
		request: {
			agentMessages: [request],
			userMessages: [request],
			source: 'user',
			bounds: VIEWPORT,
		},
		initialObservation,
		finalObservation,
		actions: [
			{
				action: {
					_type: contract.actionType,
					complete: true,
					time: 0,
				} as AgentTrajectory['actions'][number]['action'],
				chunk: {
					chunkId: 'chunk-1',
					intent: chunkIntent,
					index: 0,
					actionIndex: 0,
					actionCount: 1,
					complete: true,
					postconditions: contract.postconditions,
				},
				contract,
				diff: { added: [], updated: contract.modifiedShapeIds ?? [], removed: [] },
			},
		],
		chunks: [
			{
				chunkId: 'chunk-1',
				intent: chunkIntent,
				index: 0,
				actionCount: 1,
				actionTypes: [contract.actionType],
				postconditions: contract.postconditions.map((postcondition) => postcondition.type),
			},
		],
		verifications: [
			{
				scope: 'chunk',
				id: 'chunk-1',
				result: verification,
				timestamp,
			},
		],
		metrics: {
			modelCallCount: 1,
			actionCount: 1,
			chunkCount: 1,
			primitiveEditCount: 1,
			repairLoopCount,
			verificationFailureCount: verification.failures.length,
			latencyToFirstActionMs: 0,
			totalLatencyMs: 0,
		},
	}
}

function createGeo(
	editor: Editor,
	id: string,
	x: number,
	y: number,
	w: number,
	h: number,
	options: { note?: string; rotation?: number } = {}
) {
	editor.createShape({
		id: toTlShapeId(id),
		type: 'geo',
		x,
		y,
		rotation: options.rotation ?? 0,
		props: {
			geo: 'rectangle',
			w,
			h,
		},
		meta: options.note ? { note: options.note } : undefined,
	})
}

function createArrow(
	editor: Editor,
	id: string,
	x: number,
	y: number,
	startShapeId?: string,
	endShapeId?: string
) {
	editor.createShape<TLArrowShape>({
		id: toTlShapeId(id),
		type: 'arrow',
		x,
		y,
		props: {
			start: { x: 0, y: 0 },
			end: { x: 120, y: 0 },
		},
	})
	if (startShapeId) bindArrow(editor, id, startShapeId, 'start')
	if (endShapeId) bindArrow(editor, id, endShapeId, 'end')
}

function bindArrow(
	editor: Editor,
	arrowId: string,
	targetShapeId: string,
	terminal: 'start' | 'end'
) {
	editor.createBinding({
		type: 'arrow',
		fromId: toTlShapeId(arrowId),
		toId: toTlShapeId(targetShapeId),
		props: {
			terminal,
			normalizedAnchor: { x: 0.5, y: 0.5 },
			isExact: false,
			isPrecise: false,
			snap: 'none',
		},
	})
}

function observe(editor: Editor): CanvasObservation {
	return buildCanvasObservation(editor, {
		agentViewportBounds: VIEWPORT,
		userViewportBounds: VIEWPORT,
		timestamp: FIXED_TIMESTAMP,
		limits: {
			maxObjects: 40,
			maxRelations: 200,
			maxTilesPerBand: 8,
			maxObjectIdsPerTile: 20,
		},
	})
}

function normalizeObservation(observation: CanvasObservation) {
	return JSON.stringify(observation)
}

function withEditor(callback: (editor: Editor) => void) {
	const editor = createHeadlessEditor()
	try {
		callback(editor)
	} finally {
		editor.dispose()
	}
}

function createHeadlessEditor() {
	const shapeUtils = [...defaultShapeUtils]
	const bindingUtils = [...defaultBindingUtils]
	const store = createTLStore({ shapeUtils, bindingUtils })
	const container = createHeadlessElement('div')
	return new Editor({
		store,
		shapeUtils,
		bindingUtils,
		tools: [],
		getContainer: () => container,
	})
}

function createEvalAgent(
	editor: Editor,
	scheduledMessages: string[] = [],
	request: { agentMessages: string[]; userMessages: string[] } | null = null
): TldrawAgent {
	return {
		editor,
		requests: {
			getActiveRequest: () =>
				request
					? {
							...request,
							bounds: VIEWPORT,
							data: [],
							source: 'user',
							contextItems: [],
						}
					: null,
		},
		context: { getItems: () => [] },
		schedule: (message: { message: string }) => {
			scheduledMessages.push(message.message)
		},
	} as unknown as TldrawAgent
}

function toTlShapeId(id: string): TLShapeId {
	return createShapeId(id)
}

function installHeadlessDom() {
	const globalObject = globalThis as typeof globalThis & {
		document?: Document
		window?: Window & typeof globalThis
		devicePixelRatio?: number
		requestAnimationFrame?: (callback: FrameRequestCallback) => number
		cancelAnimationFrame?: (handle: number) => void
		Node?: { TEXT_NODE: number }
	}

	const requestAnimationFrame =
		globalObject.requestAnimationFrame ??
		((callback: FrameRequestCallback) => Number(setTimeout(() => callback(Date.now()), 0)))
	const cancelAnimationFrame =
		globalObject.cancelAnimationFrame ?? ((handle: number) => clearTimeout(handle))

	globalObject.requestAnimationFrame = requestAnimationFrame
	globalObject.cancelAnimationFrame = cancelAnimationFrame
	globalObject.devicePixelRatio = globalObject.devicePixelRatio ?? 1
	globalObject.Node = globalObject.Node ?? { TEXT_NODE: 3 }

	if (!globalObject.document) {
		const body = createHeadlessElement('body')
		globalObject.document = {
			body,
			activeElement: null,
			createElement: (tagName: string) => createHeadlessElement(tagName),
			createTextNode: (text: string) => ({ nodeType: 3, textContent: text }) as unknown as Text,
			createDocumentFragment: () =>
				createHeadlessElement('#document-fragment') as unknown as DocumentFragment,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		} as unknown as Document
	}

	if (!globalObject.window) {
		globalObject.window = {
			document: globalObject.document,
			devicePixelRatio: globalObject.devicePixelRatio,
			requestAnimationFrame,
			cancelAnimationFrame,
			matchMedia: () =>
				({
					matches: false,
					media: '',
					onchange: null,
					addListener: () => undefined,
					removeListener: () => undefined,
					addEventListener: () => undefined,
					removeEventListener: () => undefined,
					dispatchEvent: () => false,
				}) as unknown as MediaQueryList,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		} as unknown as Window & typeof globalThis
	}
}

function createHeadlessElement(tagName: string): HTMLElement {
	const styleValues = new Map<string, string>()
	const children: unknown[] = []
	const element = {
		tagName,
		nodeType: tagName === '#document-fragment' ? 11 : 1,
		classList: {
			add: () => undefined,
			remove: () => undefined,
			toggle: () => false,
		},
		style: {
			setProperty: (key: string, value: string | null | undefined) => {
				if (value === null || value === undefined) {
					styleValues.delete(key)
				} else {
					styleValues.set(key, value)
				}
			},
			getPropertyValue: (key: string) => styleValues.get(key) ?? '',
		},
		setAttribute: () => undefined,
		appendChild: (child: unknown) => {
			children.push(child)
			return child
		},
		removeChild: (child: unknown) => {
			const index = children.indexOf(child)
			if (index >= 0) children.splice(index, 1)
			return child
		},
		remove: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		focus: () => undefined,
		blur: () => undefined,
		getBoundingClientRect: () => ({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 120,
			bottom: 24,
			width: 120,
			height: 24,
		}),
		scrollWidth: 120,
		childNodes: children,
		textContent: '',
		innerHTML: '',
	}
	return element as unknown as HTMLElement
}
