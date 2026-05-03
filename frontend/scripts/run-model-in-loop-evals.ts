import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { streamText, type LanguageModelUsage, type ModelMessage } from 'ai'
import type { CanvasObservation } from '../shared/format/CanvasObservation'
import {
	DEFAULT_MODEL_NAME,
	getAgentModelDefinition,
	isValidModelName,
	type AgentModelName,
} from '../shared/models'
import type { AgentAction } from '../shared/types/AgentAction'
import type { AgentActionResponse, AgentStreamAction } from '../shared/types/ActionChunk'
import type { AgentPrompt } from '../shared/types/AgentPrompt'
import type { PromptPart } from '../shared/types/PromptPart'
import { AgentService } from '../worker/do/AgentService'
import { closeAndParseJson } from '../worker/do/closeAndParseJson'
import { buildMessages } from '../worker/prompt/buildMessages'
import { buildSystemPrompt } from '../worker/prompt/buildSystemPrompt'
import { runInitialCanvasAgentEvals } from '../shared/evals/runInitialCanvasAgentEvals'

type EvalConfig = {
	id: string
	label: string
	description: string
	parts: 'legacy' | 'observation'
	actionTypes: AgentAction['_type'][]
}

type EvalTask = {
	id: string
	category: BenchmarkCategory
	request: string
	observation: CanvasObservation
	expectedIds: string[]
	selectedIds?: string[]
	score: (actions: AgentAction[]) => ScoreResult
}

type BenchmarkCategory =
	| 'simple_edits'
	| 'selection_offscreen'
	| 'partial_visibility'
	| 'ambiguous_targets'
	| 'arrows_connectors'
	| 'layout_cleanup'
	| 'multi_step_repair'

type ScoreResult = {
	score: 0 | 1 | 2 | 3 | 4
	passed: boolean
	reason: string
	wrongTargetIds: string[]
}

type EvalCaseResult = {
	repetition: number
	modelName: AgentModelName
	configId: string
	taskId: string
	category: BenchmarkCategory
	request: string
	score: number
	passed: boolean
	reason: string
	wrongTargetIds: string[]
	actionTypes: string[]
	actions: AgentAction[]
	error: string | null
	durationMs: number
	latencyToFirstActionMs: number | null
	usage: TokenUsage | null
	estimatedCostUsd: number | null
}

type TokenUsage = {
	inputTokens: number | null
	outputTokens: number | null
	totalTokens: number | null
	reasoningTokens: number | null
	cachedInputTokens: number | null
}

type ModelCaseRun = {
	actions: AgentAction[]
	latencyToFirstActionMs: number | null
	usage: TokenUsage | null
	estimatedCostUsd: number | null
}

type BenchmarkArtifact = {
	status: 'running' | 'complete'
	startedAt: string
	finishedAt: string
	modelNames: AgentModelName[]
	repetitions: number
	expectedCaseCount: number
	completedCaseCount: number
	configs: EvalConfig[]
	tasks: {
		id: string
		category: BenchmarkCategory
		request: string
		expectedIds: string[]
		selectedIds: string[]
	}[]
	results: EvalCaseResult[]
	summary: ReturnType<typeof summarize>
	unavailableModels: { modelName: AgentModelName; reason: string }[]
}

interface StreamActionEntry {
	action: AgentAction
	chunk?: AgentStreamAction['chunk']
}

const repoRoot = resolve(process.cwd(), '..')
const reportPath = resolve(repoRoot, 'docs', 'model_in_loop_eval_report.md')
const artifactPath = resolve(process.cwd(), '.tsbuild', 'evals', 'model-in-loop.json')
const modelNames = getModelNames()
const repetitions = getPositiveIntEnv('MODEL_IN_LOOP_EVAL_REPETITIONS', 1)
loadDevVars()

const deterministicRun = runInitialCanvasAgentEvals()
const tasks = filterTasks(buildTasks(deterministicRun.records))
const configs = filterConfigs(buildConfigs())
if (configs.length === 0) {
	throw new Error('No eval configs selected. Check MODEL_IN_LOOP_EVAL_CONFIGS.')
}
if (tasks.length === 0) {
	throw new Error('No eval tasks selected. Check MODEL_IN_LOOP_EVAL_TASKS.')
}
const service = new AgentService({
	OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
	AGENT_DURABLE_OBJECT: undefined as never,
})

const startedAt = new Date()
const results: EvalCaseResult[] = []
const unavailableModels = new Map<AgentModelName, string>()
const expectedCaseCount = repetitions * modelNames.length * configs.length * tasks.length
let completedCaseCount = 0

persistArtifact('running')

for (let repetition = 1; repetition <= repetitions; repetition++) {
	for (const modelName of modelNames) {
		for (const config of configs) {
			for (const task of tasks) {
				const caseStart = Date.now()
				const unavailableReason = unavailableModels.get(modelName)
				if (unavailableReason) {
					results.push(
						buildFailedResult(
							repetition,
							modelName,
							config,
							task,
							caseStart,
							'Model unavailable.',
							`Skipped after earlier provider failure: ${unavailableReason}`
						)
					)
					completedCaseCount++
					persistArtifact('running')
					continue
				}
				try {
					const run = await runModelCase(config, task, modelName, caseStart)
					const score = task.score(run.actions)
					results.push({
						repetition,
						modelName,
						configId: config.id,
						taskId: task.id,
						category: task.category,
						request: task.request,
						score: score.score,
						passed: score.passed,
						reason: score.reason,
						wrongTargetIds: score.wrongTargetIds,
						actionTypes: run.actions.map((action) => action._type),
						actions: run.actions,
						error: null,
						durationMs: Date.now() - caseStart,
						latencyToFirstActionMs: run.latencyToFirstActionMs,
						usage: run.usage,
						estimatedCostUsd: run.estimatedCostUsd,
					})
				} catch (error) {
					const errorMessage = formatError(error)
					results.push(
						buildFailedResult(
							repetition,
							modelName,
							config,
							task,
							caseStart,
							'Model call failed.',
							errorMessage
						)
					)
					if (isProviderUnavailableError(errorMessage)) {
						unavailableModels.set(modelName, errorMessage)
					}
				}
				completedCaseCount++
				persistArtifact('running')
			}
		}
	}
}

const artifact = persistArtifact('complete')
writeFileSync(reportPath, buildMarkdownReport(artifact))

console.log(`Wrote model-in-the-loop eval report: ${reportPath}`)
console.log(`Wrote model-in-the-loop eval artifact: ${artifactPath}`)
console.log(JSON.stringify(artifact.summary, null, 2))
process.exit(0)

function persistArtifact(status: BenchmarkArtifact['status']) {
	const artifact = buildArtifact(status)
	mkdirSync(dirname(artifactPath), { recursive: true })
	mkdirSync(dirname(reportPath), { recursive: true })
	writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)
	return artifact
}

function buildArtifact(status: BenchmarkArtifact['status']): BenchmarkArtifact {
	return {
		status,
		startedAt: startedAt.toISOString(),
		finishedAt: new Date().toISOString(),
		modelNames,
		repetitions,
		expectedCaseCount,
		completedCaseCount,
		configs,
		tasks: tasks.map((task) => ({
			id: task.id,
			category: task.category,
			request: task.request,
			expectedIds: task.expectedIds,
			selectedIds: task.selectedIds ?? [],
		})),
		results,
		summary: summarize(results),
		unavailableModels: Array.from(unavailableModels, ([modelName, reason]) => ({
			modelName,
			reason,
		})),
	}
}

function buildFailedResult(
	repetition: number,
	modelName: AgentModelName,
	config: EvalConfig,
	task: EvalTask,
	caseStart: number,
	reason: string,
	error: string
): EvalCaseResult {
	return {
		repetition,
		modelName,
		configId: config.id,
		taskId: task.id,
		category: task.category,
		request: task.request,
		score: 0,
		passed: false,
		reason,
		wrongTargetIds: [],
		actionTypes: [],
		actions: [],
		error,
		durationMs: Date.now() - caseStart,
		latencyToFirstActionMs: null,
		usage: null,
		estimatedCostUsd: null,
	}
}

async function runModelCase(
	config: EvalConfig,
	task: EvalTask,
	modelName: AgentModelName,
	caseStart: number
): Promise<ModelCaseRun> {
	const prompt = buildPrompt(config, task, modelName)
	const model = service.getModel(modelName)
	if (typeof model === 'string') {
		throw new Error('Model is a string, not a LanguageModel')
	}

	const provider = model.provider
	const modelDefinition = getAgentModelDefinition(modelName)
	const systemPrompt = buildSystemPrompt(prompt)
	const promptMessages = buildMessages(prompt)
	const messages: ModelMessage[] = []

	if (provider === 'anthropic.messages') {
		messages.push({
			role: 'system',
			content: systemPrompt,
			providerOptions: {
				anthropic: { cacheControl: { type: 'ephemeral' } },
			},
		})
	} else {
		messages.push({ role: 'system', content: systemPrompt })
	}

	messages.push(...promptMessages)
	messages.push({
		role: 'assistant',
		content: '{"chunks": [{"intent":',
	})

	const geminiThinkingBudget = modelDefinition.thinking ? 256 : 0
	const openaiReasoningEffort = provider === 'openai.responses' ? 'none' : 'minimal'
	const result = streamText({
		model,
		messages,
		maxOutputTokens: 8192,
		temperature: 0,
		onError: () => undefined,
		providerOptions: {
			anthropic: {
				thinking: { type: 'disabled' },
			},
			google: {
				thinkingConfig: { thinkingBudget: geminiThinkingBudget },
			},
			openai: {
				reasoningEffort: openaiReasoningEffort,
			},
		},
	})

	const canForceResponseStart =
		provider === 'anthropic.messages' || provider === 'google.generative-ai'
	let buffer = canForceResponseStart ? '{"chunks": [{"intent":' : ''
	let cursor = 0
	let maybeIncompleteAction: StreamActionEntry | null = null
	const actions: AgentAction[] = []
	let latencyToFirstActionMs: number | null = null

	for await (const text of result.textStream) {
		buffer += text

		const partialObject = closeAndParseJson(buffer) as AgentActionResponse | null
		if (!partialObject) continue

		const entries = getStreamActionEntries(partialObject)
		if (entries.length === 0) continue

		if (entries.length > cursor) {
			const entry = entries[cursor - 1]
			if (entry) {
				actions.push(entry.action)
				if (latencyToFirstActionMs === null) latencyToFirstActionMs = Date.now() - caseStart
				maybeIncompleteAction = null
			}
			cursor++
		}

		const entry = entries[cursor - 1]
		if (entry) maybeIncompleteAction = entry
	}

	if (maybeIncompleteAction) {
		actions.push(maybeIncompleteAction.action)
		if (latencyToFirstActionMs === null) latencyToFirstActionMs = Date.now() - caseStart
	}

	const usage = normalizeUsage(await result.totalUsage)
	return {
		actions,
		latencyToFirstActionMs,
		usage,
		estimatedCostUsd: estimateCostUsd(modelName, usage),
	}
}

function buildPrompt(config: EvalConfig, task: EvalTask, modelName: AgentModelName): AgentPrompt {
	const parts: PromptPart[] = [
		{
			type: 'mode',
			modeType: 'working',
			partTypes: getPartTypes(config),
			actionTypes: config.actionTypes,
		},
		{
			type: 'modelName',
			modelName,
		},
		{
			type: 'messages',
			agentMessages: [task.request],
			requestSource: 'user',
		},
		{
			type: 'agentViewportBounds',
			agentBounds: task.observation.agentViewportBounds,
		},
		{
			type: 'userViewportBounds',
			userBounds: task.observation.userViewportBounds,
		},
		{
			type: 'selectedShapes',
			shapeIds: task.selectedIds ?? task.observation.objects.filter((object) => object.flags.selected).map((object) => object.id),
		},
		{
			type: 'canvasLints',
			lints: getCanvasLints(task.observation),
		},
		{
			type: 'time',
			time: startedAt.toISOString(),
		},
		{
			type: 'debug',
			logMessages: false,
			logSystemPrompt: false,
		},
	]

	if (config.parts === 'observation') {
		parts.push({
			type: 'canvasObservation',
			observation: task.observation,
		})
	} else {
		parts.push({
			type: 'blurryShapes',
			shapes: task.observation.objects.map((object) => ({
				shapeId: object.id,
				type: object.type,
				text: object.text ?? object.note,
				x: object.pageBounds.x,
				y: object.pageBounds.y,
				w: object.pageBounds.w,
				h: object.pageBounds.h,
			})),
		})
		parts.push({
			type: 'peripheralShapes',
			clusters: [
				...task.observation.spatialIndex.nearby,
				...task.observation.spatialIndex.far,
			].map((tile) => ({
				bounds: tile.bounds,
				numberOfShapes: tile.objectIds.length,
			})),
		})
	}

	return Object.fromEntries(parts.map((part) => [part.type, part])) as AgentPrompt
}

function getStreamActionEntries(response: AgentActionResponse): StreamActionEntry[] {
	if (Array.isArray(response.chunks) && response.chunks.length > 0) {
		return response.chunks.flatMap((chunk, chunkIndex) => {
			const actions = Array.isArray(chunk.actions) ? chunk.actions : []
			const chunkId = chunk.chunkId ?? `chunk-${chunkIndex + 1}`
			const isKnownComplete = chunkIndex < response.chunks!.length - 1
			return actions.map((action, actionIndex) => ({
				action,
				chunk: {
					chunkId,
					intent: chunk.intent,
					index: chunkIndex,
					actionIndex,
					actionCount: actions.length,
					complete: isKnownComplete,
					postconditions: chunk.postconditions,
				},
			}))
		})
	}

	if (Array.isArray(response.actions)) {
		return response.actions.map((action) => ({ action }))
	}

	return []
}

function normalizeUsage(usage: LanguageModelUsage | undefined): TokenUsage | null {
	if (!usage) return null
	return {
		inputTokens: usage.inputTokens ?? null,
		outputTokens: usage.outputTokens ?? null,
		totalTokens: usage.totalTokens ?? null,
		reasoningTokens: usage.reasoningTokens ?? null,
		cachedInputTokens: usage.cachedInputTokens ?? null,
	}
}

function estimateCostUsd(modelName: AgentModelName, usage: TokenUsage | null) {
	if (!usage) return null
	const inputPrice = getPricePerMillionTokens(modelName, 'INPUT')
	const outputPrice = getPricePerMillionTokens(modelName, 'OUTPUT')
	if (inputPrice === null || outputPrice === null) return null
	const inputCost = ((usage.inputTokens ?? 0) / 1_000_000) * inputPrice
	const outputCost = ((usage.outputTokens ?? 0) / 1_000_000) * outputPrice
	return inputCost + outputCost
}

function getPricePerMillionTokens(modelName: AgentModelName, direction: 'INPUT' | 'OUTPUT') {
	const specificName = `MODEL_IN_LOOP_EVAL_${modelName
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '_')}_${direction}_USD_PER_1M`
	const genericName = `MODEL_IN_LOOP_EVAL_${direction}_USD_PER_1M`
	const value = Number.parseFloat(process.env[specificName] ?? process.env[genericName] ?? '')
	return Number.isFinite(value) && value >= 0 ? value : null
}

function buildTasks(records: ReturnType<typeof runInitialCanvasAgentEvals>['records']): EvalTask[] {
	const selectedObservation = required(
		records.observations.observation_selected_offscreen,
		'observation_selected_offscreen'
	)
	const partialVisibilityObservation = required(
		records.observations.observation_partial_visibility,
		'observation_partial_visibility'
	)
	const arrowObservation = required(
		records.trajectories.task_fix_unbound_arrows?.initialObservation,
		'task_fix_unbound_arrows.initialObservation'
	)
	const arrowRelationsObservation = required(
		records.observations.observation_arrow_relations,
		'observation_arrow_relations'
	)
	const clusterObservation = required(
		records.trajectories.task_clean_cluster?.initialObservation,
		'task_clean_cluster.initialObservation'
	)
	const decisionObservation = withObjectNotes(arrowRelationsObservation, {
		end: 'Decision',
		start: 'Start',
	})
	const titleObservation = withObjectNotes(arrowRelationsObservation, {
		start: 'Title',
		end: 'End',
	})
	const ambiguousRevenueObservation = withObjectNotes(partialVisibilityObservation, {
		'partial-left': 'Revenue',
		'partial-right': 'Revenue',
		visible: 'Forecast',
	})
	const combinedArrowClusterObservation = combineObservations(arrowObservation, clusterObservation)
	const combinedSelectedArrowObservation = combineObservations(selectedObservation, arrowObservation)

	return [
		{
			id: 'simple_start_move',
			category: 'simple_edits',
			request: 'Move the Start box 10 pixels to the left.',
			observation: arrowRelationsObservation,
			expectedIds: ['start'],
			score: (actions) => scoreMoveShape(actions, 'start', 'Returned a move action for the Start box.'),
		},
		{
			id: 'simple_decision_resize',
			category: 'simple_edits',
			request: 'Resize the Decision box so it is wider.',
			observation: decisionObservation,
			expectedIds: ['end'],
			score: (actions) => scoreResizeShape(actions, 'end', 'Returned a resize/update action for the Decision box.'),
		},
		{
			id: 'simple_title_label',
			category: 'simple_edits',
			request: 'Change the title text to "Launch Plan".',
			observation: titleObservation,
			expectedIds: ['start'],
			score: (actions) => scoreLabelShape(actions, 'start', 'Launch Plan', 'Returned a label/update action for the title.'),
		},
		{
			id: 'selected_offscreen_move',
			category: 'selection_offscreen',
			request: 'Move the selected offscreen shape 20 pixels to the right.',
			observation: selectedObservation,
			expectedIds: ['selected-offscreen'],
			selectedIds: ['selected-offscreen'],
			score: scoreSelectedOffscreenMove,
		},
		{
			id: 'selected_offscreen_recolor',
			category: 'selection_offscreen',
			request: 'Recolor the selected shape that is outside the viewport.',
			observation: selectedObservation,
			expectedIds: ['selected-offscreen'],
			selectedIds: ['selected-offscreen'],
			score: (actions) => scoreUpdateShape(actions, 'selected-offscreen', 'Returned an update action for the selected offscreen shape.'),
		},
		{
			id: 'selected_offscreen_bring_near',
			category: 'selection_offscreen',
			request: 'Bring the selected offscreen note next to the visible group.',
			observation: selectedObservation,
			expectedIds: ['selected-offscreen'],
			selectedIds: ['selected-offscreen'],
			score: (actions) => scoreMoveOrPlaceShape(actions, 'selected-offscreen', 'Returned a move/place action for the selected offscreen note.'),
		},
		{
			id: 'partial_left_move',
			category: 'partial_visibility',
			request: 'Move the partly visible shape on the left 10 pixels to the right.',
			observation: partialVisibilityObservation,
			expectedIds: ['partial-left'],
			score: (actions) => scoreMoveShape(actions, 'partial-left', 'Returned a move action for the partly visible left shape.'),
		},
		{
			id: 'partial_right_move_into_view',
			category: 'partial_visibility',
			request: 'Move the half-visible box on the right into the viewport.',
			observation: partialVisibilityObservation,
			expectedIds: ['partial-right'],
			score: (actions) => scoreMoveShape(actions, 'partial-right', 'Returned a move action for the partly visible right shape.'),
		},
		{
			id: 'partial_left_label',
			category: 'partial_visibility',
			request: 'Label the partly visible rectangle on the left as "Intake".',
			observation: partialVisibilityObservation,
			expectedIds: ['partial-left'],
			score: (actions) => scoreLabelShape(actions, 'partial-left', 'Intake', 'Returned a label/update action for the partly visible left shape.'),
		},
		{
			id: 'ambiguous_revenue_move',
			category: 'ambiguous_targets',
			request: 'Move the Revenue box 20 pixels right.',
			observation: ambiguousRevenueObservation,
			expectedIds: ['partial-left', 'partial-right'],
			score: (actions) => scoreAmbiguousSafeFail(actions, ['partial-left', 'partial-right']),
		},
		{
			id: 'ambiguous_selected_revenue_rename',
			category: 'ambiguous_targets',
			request: 'Rename only the selected Revenue box to "Revenue Q1".',
			observation: ambiguousRevenueObservation,
			expectedIds: ['partial-left'],
			selectedIds: ['partial-left'],
			score: (actions) => scoreLabelShape(actions, 'partial-left', 'Revenue Q1', 'Returned a label/update action for the selected Revenue box.'),
		},
		{
			id: 'ambiguous_top_revenue_connect',
			category: 'ambiguous_targets',
			request: 'Connect the Revenue box on the left to Forecast.',
			observation: ambiguousRevenueObservation,
			expectedIds: ['partial-left', 'visible'],
			score: (actions) => scoreConnectPair(actions, 'partial-left', 'visible', 'Returned a connect action from the left Revenue box to Forecast.'),
		},
		{
			id: 'fix_unbound_arrows',
			category: 'arrows_connectors',
			request: 'Fix the arrows that are not connected.',
			observation: arrowObservation,
			expectedIds: ['start', 'end', 'unbound-arrow'],
			score: scoreFixUnboundArrows,
		},
		{
			id: 'avoid_duplicate_start_end_arrow',
			category: 'arrows_connectors',
			request: 'Connect Start to End without duplicating an existing arrow.',
			observation: arrowRelationsObservation,
			expectedIds: ['start', 'end', 'bound-arrow'],
			score: scoreAvoidDuplicateStartEndArrow,
		},
		{
			id: 'connect_start_end_with_unbound_arrow',
			category: 'arrows_connectors',
			request: 'Repair the loose arrow so it connects Start to End.',
			observation: arrowObservation,
			expectedIds: ['start', 'end', 'unbound-arrow'],
			score: scoreFixUnboundArrows,
		},
		{
			id: 'clean_cluster',
			category: 'layout_cleanup',
			request: 'Clean up this messy cluster without changing the text.',
			observation: clusterObservation,
			expectedIds: ['cluster-a', 'cluster-b', 'cluster-c'],
			score: scoreCleanCluster,
		},
		{
			id: 'spread_overlapping_cards',
			category: 'layout_cleanup',
			request: 'Spread the overlapping cards into a readable grid.',
			observation: clusterObservation,
			expectedIds: ['cluster-a', 'cluster-b', 'cluster-c'],
			score: scoreCleanCluster,
		},
		{
			id: 'align_process_steps',
			category: 'layout_cleanup',
			request: 'Align the process steps while preserving their order.',
			observation: clusterObservation,
			expectedIds: ['cluster-a', 'cluster-b', 'cluster-c'],
			score: scoreLayoutAlignCluster,
		},
		{
			id: 'multi_clean_and_fix_arrows',
			category: 'multi_step_repair',
			request: 'Clean the diagram and fix the broken arrows.',
			observation: combinedArrowClusterObservation,
			expectedIds: ['start', 'end', 'unbound-arrow', 'cluster-a', 'cluster-b', 'cluster-c'],
			score: scoreCleanAndFixArrows,
		},
		{
			id: 'multi_organize_and_fit_labels',
			category: 'multi_step_repair',
			request: 'Organize the flowchart, then fit any overflowing labels.',
			observation: clusterObservation,
			expectedIds: ['cluster-a', 'cluster-b', 'cluster-c'],
			score: scoreOrganizeAndFitLabels,
		},
		{
			id: 'multi_offscreen_reconnect',
			category: 'multi_step_repair',
			request: 'Move the selected offscreen node into view and reconnect the loose arrow from Start to End.',
			observation: combinedSelectedArrowObservation,
			expectedIds: ['selected-offscreen', 'start', 'end', 'unbound-arrow'],
			selectedIds: ['selected-offscreen'],
			score: scoreMoveOffscreenAndReconnect,
		},
	]
}

function buildConfigs(): EvalConfig[] {
	const primitiveActions = [
		'message',
		'think',
		'move',
		'place',
		'resize',
		'align',
		'distribute',
		'create',
		'update',
		'delete',
		'label',
		'bringToFront',
		'sendToBack',
		'rotate',
		'unknown',
	] satisfies AgentAction['_type'][]
	const semanticActions = [
		...primitiveActions,
		'arrange',
		'connect',
		'cleanupLayout',
		'fitText',
		'review',
		'setMyView',
	] satisfies AgentAction['_type'][]

	return [
		{
			id: 'legacy_shape_list',
			label: 'Legacy shape-list prompt',
			description: 'Approximates the pre-P0 prompt using legacy blurry/peripheral shape text and primitive actions.',
			parts: 'legacy',
			actionTypes: primitiveActions,
		},
		{
			id: 'p0_observation',
			label: 'P0 CanvasObservation prompt',
			description: 'Uses CanvasObservation but keeps the primitive-heavy action set.',
			parts: 'observation',
			actionTypes: primitiveActions,
		},
		{
			id: 'p2_p3_semantic_chunk_loop',
			label: 'Current semantic/chunk prompt',
			description: 'Uses CanvasObservation, selector-aware schemas, semantic actions, and the current chunk-preferring response path.',
			parts: 'observation',
			actionTypes: semanticActions,
		},
	]
}

function scoreSelectedOffscreenMove(actions: AgentAction[]): ScoreResult {
	return scoreMoveShape(actions, 'selected-offscreen', 'Returned a move action for the selected offscreen shape.')
}

function scoreMoveShape(actions: AgentAction[], shapeId: string, successReason: string): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, [shapeId])
	const move = actions.find((action) => action._type === 'move' && (action as Record<string, unknown>).shapeId === shapeId)
	if (move && wrongTargets.length === 0) {
		return pass(4, successReason, wrongTargets)
	}
	if (move) return pass(3, `Moved ${shapeId} but also referenced unrelated targets.`, wrongTargets)
	if (actions.some((action) => mentionsId(action, shapeId))) {
		return pass(2, `Referenced ${shapeId} but did not emit a direct move.`, wrongTargets)
	}
	return fail(`Did not target ${shapeId}.`, wrongTargets)
}

function scoreMoveOrPlaceShape(actions: AgentAction[], shapeId: string, successReason: string): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, [shapeId])
	const targeted = actions.find(
		(action) =>
			(action._type === 'move' || action._type === 'place') &&
			getActionTargetIds(action).includes(shapeId)
	)
	if (targeted && wrongTargets.length === 0) return pass(4, successReason, wrongTargets)
	if (targeted) return pass(3, `Targeted ${shapeId} but also referenced unrelated targets.`, wrongTargets)
	if (actions.some((action) => mentionsId(action, shapeId))) {
		return pass(2, `Referenced ${shapeId} but did not emit a direct move/place.`, wrongTargets)
	}
	return fail(`Did not target ${shapeId}.`, wrongTargets)
}

function scoreResizeShape(actions: AgentAction[], shapeId: string, successReason: string): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, [shapeId])
	const resize = actions.find(
		(action) =>
			(action._type === 'resize' || action._type === 'update') &&
			getActionTargetIds(action).includes(shapeId)
	)
	if (resize && wrongTargets.length === 0) return pass(4, successReason, wrongTargets)
	if (resize) return pass(3, `Resized/updated ${shapeId} but also referenced unrelated targets.`, wrongTargets)
	if (actions.some((action) => mentionsId(action, shapeId))) {
		return pass(2, `Referenced ${shapeId} but did not emit a resize/update.`, wrongTargets)
	}
	return fail(`Did not target ${shapeId}.`, wrongTargets)
}

function scoreLabelShape(
	actions: AgentAction[],
	shapeId: string,
	expectedText: string,
	successReason: string
): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, [shapeId])
	const label = actions.find(
		(action) =>
			(action._type === 'label' || action._type === 'update') &&
			getActionTargetIds(action).includes(shapeId)
	)
	if (label && mentionsId(label, expectedText) && wrongTargets.length === 0) {
		return pass(4, successReason, wrongTargets)
	}
	if (label && wrongTargets.length === 0) {
		return pass(3, `Targeted ${shapeId} for a label/update but did not clearly include "${expectedText}".`, wrongTargets)
	}
	if (label) return pass(3, `Labeled/updated ${shapeId} but also referenced unrelated targets.`, wrongTargets)
	if (actions.some((action) => mentionsId(action, shapeId))) {
		return pass(2, `Referenced ${shapeId} but did not emit a label/update.`, wrongTargets)
	}
	return fail(`Did not label/update ${shapeId}.`, wrongTargets)
}

function scoreUpdateShape(actions: AgentAction[], shapeId: string, successReason: string): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, [shapeId])
	const update = actions.find(
		(action) =>
			(action._type === 'update' ||
				action._type === 'label' ||
				action._type === 'resize' ||
				action._type === 'bringToFront') &&
			getActionTargetIds(action).includes(shapeId)
	)
	if (update && wrongTargets.length === 0) return pass(4, successReason, wrongTargets)
	if (update) return pass(3, `Updated ${shapeId} but also referenced unrelated targets.`, wrongTargets)
	if (actions.some((action) => mentionsId(action, shapeId))) {
		return pass(2, `Referenced ${shapeId} but did not emit an update.`, wrongTargets)
	}
	return fail(`Did not update ${shapeId}.`, wrongTargets)
}

function scoreAmbiguousSafeFail(actions: AgentAction[], ambiguousIds: string[]): ScoreResult {
	const explicitEdit = actions.find(
		(action) => isEditAction(action) && getActionTargetIds(action).some((id) => ambiguousIds.includes(id))
	)
	if (explicitEdit) {
		return fail(
			`Edited an ambiguous target explicitly: ${getActionTargetIds(explicitEdit).join(', ')}.`,
			getWrongTargetIds(actions, [])
		)
	}
	const safeSelector = actions.some(usesAmbiguousSafeSelector)
	if (safeSelector) {
		return pass(4, 'Used a selector that can safe-fail locally instead of hard-coding one ambiguous target.', [])
	}
	const editCount = actions.filter(isEditAction).length
	if (editCount === 0) {
		return pass(4, 'Did not edit because the target was ambiguous.', [])
	}
	return fail('Edited without an explicit safe target for an ambiguous request.', getWrongTargetIds(actions, []))
}

function scoreConnectPair(
	actions: AgentAction[],
	sourceId: string,
	targetId: string,
	successReason: string
): ScoreResult {
	const expected = [sourceId, targetId]
	const wrongTargets = getWrongTargetIds(actions, expected)
	const connect = actions.find((action) => {
		const targetIds = getActionTargetIds(action)
		return action._type === 'connect' && targetIds.includes(sourceId) && targetIds.includes(targetId)
	})
	if (connect && wrongTargets.length === 0) return pass(4, successReason, wrongTargets)
	if (connect) return pass(3, `Connected ${sourceId} and ${targetId} but also referenced unrelated targets.`, wrongTargets)
	if (actions.some((action) => mentionsId(action, sourceId) && mentionsId(action, targetId))) {
		return pass(2, `Referenced ${sourceId} and ${targetId} but did not emit a connect action.`, wrongTargets)
	}
	return fail(`Did not connect ${sourceId} to ${targetId}.`, wrongTargets)
}

function scoreFixUnboundArrows(actions: AgentAction[]): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, ['start', 'end', 'unbound-arrow'])
	const hasConnect = actions.some((action) => action._type === 'connect')
	const mentionsStartEnd = actions.some((action) => mentionsId(action, 'start') && mentionsId(action, 'end'))
	const handlesUnbound = actions.some(
		(action) => action._type === 'delete' && mentionsId(action, 'unbound-arrow')
	) || actions.some((action) => mentionsId(action, 'unbound-arrow'))

	if (hasConnect && mentionsStartEnd && handlesUnbound && wrongTargets.length === 0) {
		return pass(4, 'Returned a connect-style repair and referenced the unbound arrow context.', wrongTargets)
	}
	if (hasConnect && mentionsStartEnd) {
		return pass(3, 'Returned a connect action for the endpoints but may leave the original unbound arrow.', wrongTargets)
	}
	if (mentionsStartEnd || handlesUnbound) {
		return pass(2, 'Referenced relevant arrow objects without a complete repair action.', wrongTargets)
	}
	return fail('Did not produce an arrow repair targeting the relevant objects.', wrongTargets)
}

function scoreAvoidDuplicateStartEndArrow(actions: AgentAction[]): ScoreResult {
	const wrongTargets = getWrongTargetIds(actions, ['start', 'end', 'bound-arrow'])
	const created = actions.some((action) => action._type === 'create')
	const connect = actions.find((action) => {
		const targetIds = getActionTargetIds(action)
		return action._type === 'connect' && targetIds.includes('start') && targetIds.includes('end')
	})
	if (connect && !created && wrongTargets.length === 0) {
		return pass(4, 'Used connect semantics for Start to End without creating an explicit duplicate arrow.', wrongTargets)
	}
	if (!created && actions.filter(isEditAction).length === 0) {
		return pass(3, 'Avoided editing because the Start to End arrow already exists.', wrongTargets)
	}
	if (created) return fail('Created a new arrow even though one already exists.', wrongTargets)
	if (actions.some((action) => mentionsId(action, 'start') && mentionsId(action, 'end'))) {
		return pass(2, 'Referenced Start and End but did not clearly avoid duplicate creation.', wrongTargets)
	}
	return fail('Did not handle the duplicate-arrow request.', wrongTargets)
}

function scoreCleanCluster(actions: AgentAction[]): ScoreResult {
	const expected = ['cluster-a', 'cluster-b', 'cluster-c']
	const wrongTargets = getWrongTargetIds(actions, expected)
	const semantic = actions.find(
		(action) => action._type === 'cleanupLayout' || action._type === 'arrange'
	)
	const mentionsAll = expected.every((id) => actions.some((action) => mentionsId(action, id)))
	const moveCount = actions.filter((action) => action._type === 'move').length

	if (semantic && (mentionsAll || mentionsSelector(semantic)) && wrongTargets.length === 0) {
		return pass(4, 'Used a semantic layout action for the messy cluster.', wrongTargets)
	}
	if (semantic) return pass(3, 'Used a semantic layout action but target specificity is incomplete.', wrongTargets)
	if (moveCount >= 3 && mentionsAll) {
		return pass(2, 'Used primitive moves for all cluster shapes instead of a semantic layout action.', wrongTargets)
	}
	return fail('Did not emit a credible cluster cleanup action.', wrongTargets)
}

function scoreLayoutAlignCluster(actions: AgentAction[]): ScoreResult {
	const expected = ['cluster-a', 'cluster-b', 'cluster-c']
	const wrongTargets = getWrongTargetIds(actions, expected)
	const layout = actions.find(
		(action) =>
			(action._type === 'cleanupLayout' || action._type === 'arrange' || action._type === 'align') &&
			(expected.every((id) => getActionTargetIds(action).includes(id)) || mentionsSelector(action))
	)
	if (layout && wrongTargets.length === 0) {
		return pass(4, 'Used a layout/alignment action for the process steps.', wrongTargets)
	}
	if (layout) return pass(3, 'Used a layout/alignment action but also referenced unrelated targets.', wrongTargets)
	if (expected.every((id) => actions.some((action) => mentionsId(action, id)))) {
		return pass(2, 'Referenced all process steps but did not emit a credible layout action.', wrongTargets)
	}
	return fail('Did not align or arrange the process steps.', wrongTargets)
}

function scoreCleanAndFixArrows(actions: AgentAction[]): ScoreResult {
	const expected = ['start', 'end', 'unbound-arrow', 'cluster-a', 'cluster-b', 'cluster-c']
	const wrongTargets = getWrongTargetIds(actions, expected)
	const fixesArrow = actions.some(
		(action) =>
			action._type === 'connect' &&
			mentionsId(action, 'start') &&
			mentionsId(action, 'end') &&
			mentionsId(action, 'unbound-arrow')
	)
	const cleansLayout = actions.some(
		(action) => action._type === 'cleanupLayout' || action._type === 'arrange' || action._type === 'align'
	)
	if (fixesArrow && cleansLayout && wrongTargets.length === 0) {
		return pass(4, 'Handled both arrow repair and layout cleanup.', wrongTargets)
	}
	if ((fixesArrow || cleansLayout) && wrongTargets.length === 0) {
		return pass(3, 'Handled one major part of the multi-step repair.', wrongTargets)
	}
	if (expected.some((id) => actions.some((action) => mentionsId(action, id)))) {
		return pass(2, 'Referenced relevant objects but did not complete the multi-step repair.', wrongTargets)
	}
	return fail('Did not handle the multi-step clean-and-fix request.', wrongTargets)
}

function scoreOrganizeAndFitLabels(actions: AgentAction[]): ScoreResult {
	const expected = ['cluster-a', 'cluster-b', 'cluster-c']
	const wrongTargets = getWrongTargetIds(actions, expected)
	const layout = actions.some(
		(action) => action._type === 'cleanupLayout' || action._type === 'arrange' || action._type === 'align'
	)
	const fitText = actions.some((action) => action._type === 'fitText')
	if (layout && fitText && wrongTargets.length === 0) {
		return pass(4, 'Organized the layout and emitted a fitText repair.', wrongTargets)
	}
	if (layout && wrongTargets.length === 0) {
		return pass(3, 'Organized the layout but did not clearly fit labels.', wrongTargets)
	}
	if (layout || fitText) return pass(2, 'Attempted one semantic repair but target specificity was incomplete.', wrongTargets)
	return fail('Did not organize the flowchart or fit labels.', wrongTargets)
}

function scoreMoveOffscreenAndReconnect(actions: AgentAction[]): ScoreResult {
	const expected = ['selected-offscreen', 'start', 'end', 'unbound-arrow']
	const wrongTargets = getWrongTargetIds(actions, expected)
	const movedOffscreen = actions.some(
		(action) =>
			(action._type === 'move' || action._type === 'place' || action._type === 'setMyView') &&
			mentionsId(action, 'selected-offscreen')
	)
	const reconnected = actions.some(
		(action) =>
			action._type === 'connect' &&
			mentionsId(action, 'start') &&
			mentionsId(action, 'end') &&
			mentionsId(action, 'unbound-arrow')
	)
	if (movedOffscreen && reconnected && wrongTargets.length === 0) {
		return pass(4, 'Moved the selected offscreen node and repaired the loose arrow.', wrongTargets)
	}
	if ((movedOffscreen || reconnected) && wrongTargets.length === 0) {
		return pass(3, 'Handled one major part of the offscreen reconnect task.', wrongTargets)
	}
	if (expected.some((id) => actions.some((action) => mentionsId(action, id)))) {
		return pass(2, 'Referenced relevant objects but did not complete the multi-step reconnect.', wrongTargets)
	}
	return fail('Did not handle the offscreen reconnect task.', wrongTargets)
}

function pass(score: 2 | 3 | 4, reason: string, wrongTargetIds: string[]): ScoreResult {
	return { score, passed: score >= 3, reason, wrongTargetIds }
}

function fail(reason: string, wrongTargetIds: string[]): ScoreResult {
	return { score: 0, passed: false, reason, wrongTargetIds }
}

function mentionsSelector(action: AgentAction) {
	return JSON.stringify(action).includes('targetSelector')
}

function mentionsId(action: AgentAction, id: string) {
	return JSON.stringify(action).includes(id)
}

function isEditAction(action: AgentAction) {
	return [
		'move',
		'place',
		'resize',
		'align',
		'distribute',
		'create',
		'update',
		'delete',
		'label',
		'bringToFront',
		'sendToBack',
		'rotate',
		'arrange',
		'connect',
		'cleanupLayout',
		'fitText',
	].includes(action._type)
}

function usesAmbiguousSafeSelector(action: AgentAction) {
	const value = action as Record<string, unknown>
	return [value.targetSelector, value.sourceSelector, value.containerSelector].some((selector) => {
		if (!selector || typeof selector !== 'object') return false
		const record = selector as Record<string, unknown>
		return record._type === 'text' && record.expect === 'one' && typeof record.text === 'string'
	})
}

function getWrongTargetIds(actions: AgentAction[], expectedIds: string[]) {
	const expected = new Set(expectedIds)
	const knownIds = [
		'selected-offscreen',
		'partial-left',
		'partial-right',
		'visible',
		'start',
		'end',
		'bound-arrow',
		'unbound-arrow',
		'cluster-a',
		'cluster-b',
		'cluster-c',
	]
	const targetedIds = new Set(actions.flatMap(getActionTargetIds))
	return knownIds.filter((id) => !expected.has(id) && targetedIds.has(id))
}

function getActionTargetIds(action: AgentAction): string[] {
	const ids = new Set<string>()
	const value = action as Record<string, unknown>
	addMaybeId(ids, value.shapeId)
	addMaybeIds(ids, value.shapeIds)
	addMaybeIds(ids, value.sourceShapeIds)
	addMaybeIds(ids, value.targetShapeIds)
	addMaybeIds(ids, value.createdShapeIds)
	addMaybeIds(ids, value.containerShapeIds)
	addSelectorIds(ids, value.targetSelector)
	addSelectorIds(ids, value.sourceSelector)
	addSelectorIds(ids, value.containerSelector)
	const update = value.update
	if (update && typeof update === 'object') {
		addMaybeId(ids, (update as Record<string, unknown>).shapeId)
	}
	return Array.from(ids)
}

function addSelectorIds(ids: Set<string>, selector: unknown) {
	if (!selector || typeof selector !== 'object') return
	const selectorRecord = selector as Record<string, unknown>
	addMaybeIds(ids, selectorRecord.shapeIds)
	addMaybeId(ids, selectorRecord.shapeId)
}

function addMaybeId(ids: Set<string>, value: unknown) {
	if (typeof value === 'string') ids.add(value)
}

function addMaybeIds(ids: Set<string>, value: unknown) {
	if (!Array.isArray(value)) return
	for (const item of value) addMaybeId(ids, item)
}

function withObjectNotes(
	observation: CanvasObservation,
	notes: Record<string, string>
): CanvasObservation {
	const clone = cloneObservation(observation)
	for (const object of clone.objects) {
		const note = notes[object.id]
		if (!note) continue
		object.note = note
		object.text = note
		if (object.focused && typeof object.focused === 'object') {
			const focused = object.focused as Record<string, unknown>
			if ('note' in focused) focused.note = note
			if ('text' in focused) focused.text = note
		}
	}
	for (const tile of [clone.spatialIndex.viewport, ...clone.spatialIndex.nearby, ...clone.spatialIndex.far]) {
		tile.representativeTexts = tile.objectIds.flatMap((id) => {
			const note = notes[id]
			return note ? [note] : []
		})
	}
	return clone
}

function combineObservations(
	primary: CanvasObservation,
	secondary: CanvasObservation
): CanvasObservation {
	const combined = cloneObservation(primary)
	const extra = cloneObservation(secondary)
	const knownIds = new Set(combined.objects.map((object) => object.id))
	const extraObjects = extra.objects.filter((object) => !knownIds.has(object.id))
	combined.objects.push(...extraObjects)
	combined.objectCount = combined.objects.length
	combined.relations.push(
		...extra.relations.filter(
			(relation) => !knownIds.has(relation.sourceId) && !knownIds.has(relation.targetId)
		)
	)
	combined.spatialIndex.viewport.objectIds = Array.from(
		new Set([...combined.spatialIndex.viewport.objectIds, ...extra.spatialIndex.viewport.objectIds])
	)
	combined.spatialIndex.viewport.importantObjectIds = Array.from(
		new Set([
			...combined.spatialIndex.viewport.importantObjectIds,
			...extra.spatialIndex.viewport.importantObjectIds,
		])
	)
	combined.spatialIndex.nearby.push(...extra.spatialIndex.nearby)
	combined.spatialIndex.far.push(...extra.spatialIndex.far)
	combined.taskAffordances = {
		overflowedTextCandidates: unique([
			...combined.taskAffordances.overflowedTextCandidates,
			...extra.taskAffordances.overflowedTextCandidates,
		]),
		unboundArrows: [
			...combined.taskAffordances.unboundArrows,
			...extra.taskAffordances.unboundArrows.filter((arrow) => !knownIds.has(arrow.shapeId)),
		],
		overlappingLabels: [
			...combined.taskAffordances.overlappingLabels,
			...extra.taskAffordances.overlappingLabels,
		],
		detachedLabels: unique([
			...combined.taskAffordances.detachedLabels,
			...extra.taskAffordances.detachedLabels,
		]),
		alignableRows: [
			...combined.taskAffordances.alignableRows,
			...extra.taskAffordances.alignableRows,
		],
		alignableColumns: [
			...combined.taskAffordances.alignableColumns,
			...extra.taskAffordances.alignableColumns,
		],
		flowchartChains: [
			...combined.taskAffordances.flowchartChains,
			...extra.taskAffordances.flowchartChains,
		],
		isolatedClusters: [
			...combined.taskAffordances.isolatedClusters,
			...extra.taskAffordances.isolatedClusters,
		],
		candidateContainers: unique([
			...combined.taskAffordances.candidateContainers,
			...extra.taskAffordances.candidateContainers,
		]),
		candidateGroups: [
			...combined.taskAffordances.candidateGroups,
			...extra.taskAffordances.candidateGroups,
		],
	}
	return combined
}

function cloneObservation(observation: CanvasObservation): CanvasObservation {
	return JSON.parse(JSON.stringify(observation)) as CanvasObservation
}

function unique<T>(items: T[]): T[] {
	return Array.from(new Set(items))
}

function getPartTypes(config: EvalConfig): PromptPart['type'][] {
	const base = [
		'mode',
		'debug',
		'modelName',
		'messages',
		'userViewportBounds',
		'agentViewportBounds',
		'selectedShapes',
		'canvasLints',
		'time',
	] satisfies PromptPart['type'][]
	if (config.parts === 'observation') return [...base, 'canvasObservation']
	return [...base, 'blurryShapes', 'peripheralShapes']
}

function getCanvasLints(observation: CanvasObservation) {
	return [
		...observation.taskAffordances.unboundArrows.map((arrow) => ({
			type: 'friendless-arrow' as const,
			shapeIds: [arrow.shapeId],
		})),
		...observation.taskAffordances.overlappingLabels.map((shapeIds) => ({
			type: 'overlapping-text' as const,
			shapeIds,
		})),
		...observation.taskAffordances.overflowedTextCandidates.map((shapeId) => ({
			type: 'growY-on-shape' as const,
			shapeIds: [shapeId],
		})),
	]
}

function summarize(caseResults: EvalCaseResult[]) {
	return modelNames.flatMap((modelName) => configs.map((config) => {
		const configResults = caseResults.filter(
			(result) => result.configId === config.id && result.modelName === modelName
		)
		const passedCount = configResults.filter((result) => result.passed).length
		const errorCount = configResults.filter((result) => result.error).length
		const totalScore = configResults.reduce((total, result) => total + result.score, 0)
		const successfulRuns = configResults.filter((result) => result.passed)
		const totalCost = sumNullable(configResults.map((result) => result.estimatedCostUsd))
		return {
			modelName,
			configId: config.id,
			label: config.label,
			caseCount: configResults.length,
			passedCount,
			passRate: configResults.length === 0 ? 0 : passedCount / configResults.length,
			averageScore: configResults.length === 0 ? 0 : totalScore / configResults.length,
			errorCount,
			averageDurationMs:
				configResults.length === 0
					? 0
					: Math.round(
							configResults.reduce((total, result) => total + result.durationMs, 0) /
								configResults.length
						),
			averageLatencyToFirstActionMs: averageNullable(
				configResults.map((result) => result.latencyToFirstActionMs)
			),
			averageInputTokens: averageNullable(
				configResults.map((result) => result.usage?.inputTokens ?? null)
			),
			averageOutputTokens: averageNullable(
				configResults.map((result) => result.usage?.outputTokens ?? null)
			),
			averageTotalTokens: averageNullable(
				configResults.map((result) => result.usage?.totalTokens ?? null)
			),
			totalEstimatedCostUsd: totalCost,
			costPerSuccessUsd:
				totalCost === null || successfulRuns.length === 0 ? null : totalCost / successfulRuns.length,
		}
	}))
}

function averageNullable(values: (number | null)[]) {
	const finite = values.filter((value): value is number => Number.isFinite(value))
	if (finite.length === 0) return null
	return Math.round(finite.reduce((total, value) => total + value, 0) / finite.length)
}

function sumNullable(values: (number | null)[]) {
	const finite = values.filter((value): value is number => Number.isFinite(value))
	if (finite.length === 0) return null
	return finite.reduce((total, value) => total + value, 0)
}

function summarizeByCategory(caseResults: EvalCaseResult[], evalConfigs: EvalConfig[]) {
	const rows: {
		modelName: AgentModelName
		configId: string
		label: string
		category: BenchmarkCategory
		caseCount: number
		passRate: number
		averageScore: number
		wrongTargetCount: number
	}[] = []
	const categories = Array.from(new Set(caseResults.map((result) => result.category)))
	for (const modelName of modelNames) {
		for (const config of evalConfigs) {
			for (const category of categories) {
				const results = caseResults.filter(
					(result) =>
						result.modelName === modelName &&
						result.configId === config.id &&
						result.category === category
				)
				if (results.length === 0) continue
				const passedCount = results.filter((result) => result.passed).length
				rows.push({
					modelName,
					configId: config.id,
					label: config.label,
					category,
					caseCount: results.length,
					passRate: passedCount / results.length,
					averageScore:
						results.reduce((total, result) => total + result.score, 0) / results.length,
					wrongTargetCount: results.filter((result) => result.wrongTargetIds.length > 0).length,
				})
			}
		}
	}
	return rows
}

function buildMarkdownReport(artifact: BenchmarkArtifact) {
	const allErrors = artifact.results.filter((result) => result.error)
	const lines: string[] = []
	lines.push('# Model-in-the-Loop Canvas Agent Eval Report')
	lines.push('')
	lines.push(`Generated: ${artifact.finishedAt}`)
	lines.push(`Status: \`${artifact.status}\``)
	lines.push(`Models: ${artifact.modelNames.map((modelName) => `\`${modelName}\``).join(', ')}`)
	lines.push(`Repetitions per task/config: ${artifact.repetitions}`)
	lines.push(`Cases: ${artifact.completedCaseCount} / ${artifact.expectedCaseCount}`)
	lines.push(`JSON artifact: \`frontend/.tsbuild/evals/model-in-loop.json\``)
	lines.push('')
	lines.push('## Scope')
	lines.push('')
	lines.push(
		'This is a live model-in-the-loop smoke eval. It calls the configured model through `AgentService`, feeds fixed canvas observations, collects completed structured actions, and scores whether the returned actions target the expected objects.'
	)
	lines.push('')
	lines.push(
		'The configs are prompt/action ablations in the current codebase. They are not exact historical binaries for P0/P1/P2/P3.'
	)
	lines.push('')
	lines.push('## Summary')
	lines.push('')
	lines.push('| Model | Config | Cases | Passed | Pass Rate | Avg Score | Errors | Avg Duration | Avg Tokens | Cost/Success |')
	lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
	for (const row of artifact.summary) {
		lines.push(
			`| \`${row.modelName}\` | ${row.label} | ${row.caseCount} | ${row.passedCount} | ${formatPercent(row.passRate)} | ${row.averageScore.toFixed(2)} / 4 | ${row.errorCount} | ${row.averageDurationMs} ms | ${formatNullableNumber(row.averageTotalTokens)} | ${formatUsd(row.costPerSuccessUsd)} |`
		)
	}
	lines.push('')
	lines.push('## Category Summary')
	lines.push('')
	lines.push('| Model | Config | Category | Cases | Pass Rate | Avg Score | Wrong Targets |')
	lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: |')
	for (const row of summarizeByCategory(artifact.results, artifact.configs)) {
		lines.push(
			`| \`${row.modelName}\` | ${row.label} | \`${row.category}\` | ${row.caseCount} | ${formatPercent(row.passRate)} | ${row.averageScore.toFixed(2)} / 4 | ${row.wrongTargetCount} |`
		)
	}
	lines.push('')
	lines.push('## Task Results')
	lines.push('')
	lines.push('| Run | Model | Task | Config | Score | Passed | Tokens | Reason | Error |')
	lines.push('| ---: | --- | --- | --- | ---: | --- | ---: | --- | --- |')
	for (const result of artifact.results) {
		const config = artifact.configs.find((item) => item.id === result.configId)
		lines.push(
			`| ${result.repetition} | \`${result.modelName}\` | \`${result.taskId}\` | ${config?.label ?? result.configId} | ${result.score} | ${result.passed ? 'yes' : 'no'} | ${formatNullableNumber(result.usage?.totalTokens ?? null)} | ${escapeCell(result.reason)} | ${escapeCell(result.error ?? '-')} |`
		)
	}
	lines.push('')
	lines.push('## Tasks')
	lines.push('')
	for (const task of artifact.tasks) {
		lines.push(`- \`${task.id}\` (${task.category}): ${task.request}`)
		lines.push(`  Expected ids: ${task.expectedIds.map((id) => `\`${id}\``).join(', ')}`)
	}
	lines.push('')
	lines.push('## Configs')
	lines.push('')
	for (const config of artifact.configs) {
		lines.push(`- \`${config.id}\`: ${config.description}`)
	}
	lines.push('')
	lines.push('## Interpretation')
	lines.push('')
	if (artifact.unavailableModels.length > 0) {
		lines.push(
			`Unavailable models: ${artifact.unavailableModels
				.map((model) => `\`${model.modelName}\``)
				.join(', ')}. Their remaining cases were marked as provider failures after the first hard API failure.`
		)
		lines.push('')
	}
	if (allErrors.length === artifact.results.length) {
		lines.push(
			'All live model calls failed, so this run does not measure agent quality. Check the API key, model name, and network access, then rerun `npm run eval:model-in-loop` from `frontend/`.'
		)
	} else {
		if (allErrors.length > 0) {
			lines.push(
				`${allErrors.length} of ${artifact.results.length} live model calls failed, so rankings that include those failures are not definitive. Treat this run as a partial smoke test rather than a final P0-P3 comparison.`
			)
			lines.push('')
		}
		const completeSummaries = artifact.summary.filter((summary) => summary.errorCount === 0)
		const rankingPool = completeSummaries.length > 0 ? completeSummaries : artifact.summary
		const best = [...rankingPool].sort((a, b) => b.averageScore - a.averageScore)[0]
		const qualifier = completeSummaries.length > 0 ? 'among configs without model-call errors' : 'in this smoke run'
		lines.push(
			`Best average score ${qualifier}: \`${best.configId}\` on \`${best.modelName}\` with ${best.averageScore.toFixed(2)} / 4.`
		)
		lines.push(
			'Use this as a directional signal unless the run used the full benchmark matrix from `docs/stronger_benchmark_design.md`.'
		)
	}
	lines.push('')
	lines.push('## Limitations')
	lines.push('')
	lines.push(`- This run uses ${artifact.repetitions} sample${artifact.repetitions === 1 ? '' : 's'} per task/config.`)
	lines.push('- It scores returned actions structurally; it does not yet replay every model action into the editor and visually inspect the final canvas.')
	lines.push('- The config labels approximate refinement levels using prompt/action ablations in the current codebase.')
	lines.push('- Estimated dollar cost is shown only when token prices are supplied through environment variables.')
	return `${lines.join('\n')}\n`
}

function loadDevVars() {
	const envPath = resolve(process.cwd(), '.dev.vars')
	let raw = ''
	try {
		raw = readFileSync(envPath, 'utf8')
	} catch {
		return
	}
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const separator = trimmed.indexOf('=')
		if (separator === -1) continue
		const key = trimmed.slice(0, separator).trim()
		const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, '')
		if (!process.env[key]) process.env[key] = value
	}
}

function getModelNames(): AgentModelName[] {
	const raw = process.env.MODEL_IN_LOOP_EVAL_MODELS ?? process.env.MODEL_IN_LOOP_EVAL_MODEL
	if (!raw) return [DEFAULT_MODEL_NAME]
	const selected = raw
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
	const valid = selected.filter(isValidModelName)
	return valid.length > 0 ? valid : [DEFAULT_MODEL_NAME]
}

function getPositiveIntEnv(name: string, fallback: number) {
	const value = Number.parseInt(process.env[name] ?? '', 10)
	return Number.isFinite(value) && value > 0 ? value : fallback
}

function filterConfigs(evalConfigs: EvalConfig[]) {
	const raw = process.env.MODEL_IN_LOOP_EVAL_CONFIGS
	if (!raw) return evalConfigs
	const selected = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))
	return evalConfigs.filter((config) => selected.has(config.id))
}

function filterTasks(evalTasks: EvalTask[]) {
	const raw = process.env.MODEL_IN_LOOP_EVAL_TASKS
	const selected = raw
		? new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))
		: null
	const filtered = selected ? evalTasks.filter((task) => selected.has(task.id)) : evalTasks
	const limit = getPositiveIntEnv('MODEL_IN_LOOP_EVAL_TASK_LIMIT', filtered.length)
	return filtered.slice(0, limit)
}

function required<T>(value: T | undefined | null, name: string): T {
	if (!value) throw new Error(`Missing eval fixture data: ${name}`)
	return value
}

function formatPercent(value: number) {
	return `${Math.round(value * 100)}%`
}

function formatNullableNumber(value: number | null) {
	return value === null ? '-' : String(value)
}

function formatUsd(value: number | null) {
	return value === null ? '-' : `$${value.toFixed(4)}`
}

function escapeCell(value: string) {
	return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
}

function formatError(error: unknown) {
	if (error instanceof Error) {
		const cause = 'cause' in error ? stringifyUnknown((error as { cause?: unknown }).cause) : ''
		return [error.name, error.message, cause ? `cause: ${cause}` : ''].filter(Boolean).join(': ')
	}
	return stringifyUnknown(error)
}

function isProviderUnavailableError(error: string) {
	const normalized = error.toLowerCase()
	return (
		normalized.includes('credit balance is too low') ||
		normalized.includes('insufficient_quota') ||
		normalized.includes('billing') ||
		normalized.includes('api key') ||
		normalized.includes('authentication') ||
		normalized.includes('permission_denied')
	)
}

function stringifyUnknown(value: unknown): string {
	if (value === undefined) return ''
	if (value === null) return 'null'
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value)
	}
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}
