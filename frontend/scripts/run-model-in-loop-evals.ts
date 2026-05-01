import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CanvasObservation } from '../shared/format/CanvasObservation'
import { DEFAULT_MODEL_NAME, isValidModelName, type AgentModelName } from '../shared/models'
import type { AgentAction } from '../shared/types/AgentAction'
import type { AgentPrompt } from '../shared/types/AgentPrompt'
import type { PromptPart } from '../shared/types/PromptPart'
import { AgentService } from '../worker/do/AgentService'
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
	request: string
	observation: CanvasObservation
	expectedIds: string[]
	selectedIds?: string[]
	score: (actions: AgentAction[]) => ScoreResult
}

type ScoreResult = {
	score: 0 | 1 | 2 | 3 | 4
	passed: boolean
	reason: string
	wrongTargetIds: string[]
}

type EvalCaseResult = {
	configId: string
	taskId: string
	request: string
	score: number
	passed: boolean
	reason: string
	wrongTargetIds: string[]
	actionTypes: string[]
	actions: AgentAction[]
	error: string | null
	durationMs: number
}

const repoRoot = resolve(process.cwd(), '..')
const reportPath = resolve(repoRoot, 'model_in_loop_eval_report.md')
const artifactPath = resolve(process.cwd(), '.tsbuild', 'evals', 'model-in-loop.json')
const modelName = getModelName()
loadDevVars()

const deterministicRun = runInitialCanvasAgentEvals()
const tasks = buildTasks(deterministicRun.records)
const configs = buildConfigs()
const service = new AgentService({
	OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? '',
	AGENT_DURABLE_OBJECT: undefined as never,
})

const startedAt = new Date()
const results: EvalCaseResult[] = []

for (const config of configs) {
	for (const task of tasks) {
		const caseStart = Date.now()
		try {
			const actions = await runModelCase(config, task)
			const score = task.score(actions)
			results.push({
				configId: config.id,
				taskId: task.id,
				request: task.request,
				score: score.score,
				passed: score.passed,
				reason: score.reason,
				wrongTargetIds: score.wrongTargetIds,
				actionTypes: actions.map((action) => action._type),
				actions,
				error: null,
				durationMs: Date.now() - caseStart,
			})
		} catch (error) {
			results.push({
				configId: config.id,
				taskId: task.id,
				request: task.request,
				score: 0,
				passed: false,
				reason: 'Model call failed.',
				wrongTargetIds: [],
				actionTypes: [],
				actions: [],
				error: formatError(error),
				durationMs: Date.now() - caseStart,
			})
		}
	}
}

const finishedAt = new Date()
const artifact = {
	startedAt: startedAt.toISOString(),
	finishedAt: finishedAt.toISOString(),
	modelName,
	configs,
	tasks: tasks.map((task) => ({
		id: task.id,
		request: task.request,
		expectedIds: task.expectedIds,
		selectedIds: task.selectedIds ?? [],
	})),
	results,
	summary: summarize(results),
}

mkdirSync(dirname(artifactPath), { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)
writeFileSync(reportPath, buildMarkdownReport(artifact))

console.log(`Wrote model-in-the-loop eval report: ${reportPath}`)
console.log(`Wrote model-in-the-loop eval artifact: ${artifactPath}`)
console.log(JSON.stringify(artifact.summary, null, 2))

async function runModelCase(config: EvalConfig, task: EvalTask): Promise<AgentAction[]> {
	const prompt = buildPrompt(config, task)
	const actions: AgentAction[] = []
	for await (const action of service.stream(prompt)) {
		if (!action.complete) continue
		const { complete: _complete, time: _time, chunk: _chunk, ...rawAction } = action
		actions.push(rawAction as AgentAction)
		if (actions.length >= 8) break
	}
	return actions
}

function buildPrompt(config: EvalConfig, task: EvalTask): AgentPrompt {
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

function buildTasks(records: ReturnType<typeof runInitialCanvasAgentEvals>['records']): EvalTask[] {
	const selectedObservation = required(
		records.observations.observation_selected_offscreen,
		'observation_selected_offscreen'
	)
	const arrowObservation = required(
		records.trajectories.task_fix_unbound_arrows?.initialObservation,
		'task_fix_unbound_arrows.initialObservation'
	)
	const clusterObservation = required(
		records.trajectories.task_clean_cluster?.initialObservation,
		'task_clean_cluster.initialObservation'
	)

	return [
		{
			id: 'selected_offscreen_move',
			request: 'Move the selected offscreen shape 20 pixels to the right.',
			observation: selectedObservation,
			expectedIds: ['selected-offscreen'],
			selectedIds: ['selected-offscreen'],
			score: scoreSelectedOffscreenMove,
		},
		{
			id: 'fix_unbound_arrows',
			request: 'Fix the arrows that are not connected.',
			observation: arrowObservation,
			expectedIds: ['start', 'end', 'unbound-arrow'],
			score: scoreFixUnboundArrows,
		},
		{
			id: 'clean_cluster',
			request: 'Clean up this messy cluster without changing the text.',
			observation: clusterObservation,
			expectedIds: ['cluster-a', 'cluster-b', 'cluster-c'],
			score: scoreCleanCluster,
		},
	]
}

function buildConfigs(): EvalConfig[] {
	const primitiveActions = [
		'message',
		'think',
		'move',
		'align',
		'create',
		'update',
		'delete',
		'label',
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
	const wrongTargets = getWrongTargetIds(actions, ['selected-offscreen'])
	const move = actions.find(
		(action) => action._type === 'move' && (action as Record<string, unknown>).shapeId === 'selected-offscreen'
	)
	if (move && wrongTargets.length === 0) {
		return pass(4, 'Returned a move action for the selected offscreen shape.', wrongTargets)
	}
	if (move) return pass(3, 'Moved selected shape but also referenced unrelated targets.', wrongTargets)
	if (actions.some((action) => mentionsId(action, 'selected-offscreen'))) {
		return pass(2, 'Referenced the selected offscreen shape but did not emit a direct move.', wrongTargets)
	}
	return fail('Did not target the selected offscreen shape.', wrongTargets)
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

function getWrongTargetIds(actions: AgentAction[], expectedIds: string[]) {
	const expected = new Set(expectedIds)
	const knownIds = [
		'selected-offscreen',
		'start',
		'end',
		'unbound-arrow',
		'cluster-a',
		'cluster-b',
		'cluster-c',
	]
	return knownIds.filter((id) => !expected.has(id) && actions.some((action) => mentionsId(action, id)))
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
	return configs.map((config) => {
		const configResults = caseResults.filter((result) => result.configId === config.id)
		const passedCount = configResults.filter((result) => result.passed).length
		const errorCount = configResults.filter((result) => result.error).length
		const totalScore = configResults.reduce((total, result) => total + result.score, 0)
		return {
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
		}
	})
}

function buildMarkdownReport(artifact: {
	startedAt: string
	finishedAt: string
	modelName: AgentModelName
	configs: EvalConfig[]
	tasks: { id: string; request: string; expectedIds: string[]; selectedIds: string[] }[]
	results: EvalCaseResult[]
	summary: ReturnType<typeof summarize>
}) {
	const allErrors = artifact.results.filter((result) => result.error)
	const lines: string[] = []
	lines.push('# Model-in-the-Loop Canvas Agent Eval Report')
	lines.push('')
	lines.push(`Generated: ${artifact.finishedAt}`)
	lines.push(`Model: \`${artifact.modelName}\``)
	lines.push(`JSON artifact: \`frontend/.tsbuild/evals/model-in-loop.json\``)
	lines.push('')
	lines.push('## Scope')
	lines.push('')
	lines.push(
		'This is a live model-in-the-loop smoke eval. It calls the configured model through `AgentService`, feeds fixed canvas observations, collects completed structured actions, and scores whether the returned actions target the expected objects.'
	)
	lines.push('')
	lines.push(
		'The configs are prompt/action ablations in the current codebase. They are not exact historical binaries for P0/P1/P2/P3, and P4 is not implemented in this repo yet.'
	)
	lines.push('')
	lines.push('## Summary')
	lines.push('')
	lines.push('| Config | Cases | Passed | Pass Rate | Avg Score | Errors | Avg Duration |')
	lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
	for (const row of artifact.summary) {
		lines.push(
			`| ${row.label} | ${row.caseCount} | ${row.passedCount} | ${formatPercent(row.passRate)} | ${row.averageScore.toFixed(2)} / 4 | ${row.errorCount} | ${row.averageDurationMs} ms |`
		)
	}
	lines.push('')
	lines.push('## Task Results')
	lines.push('')
	lines.push('| Task | Config | Score | Passed | Action Types | Reason | Error |')
	lines.push('| --- | --- | ---: | --- | --- | --- | --- |')
	for (const result of artifact.results) {
		const config = artifact.configs.find((item) => item.id === result.configId)
		lines.push(
			`| \`${result.taskId}\` | ${config?.label ?? result.configId} | ${result.score} | ${result.passed ? 'yes' : 'no'} | ${result.actionTypes.map((type) => `\`${type}\``).join(', ') || '-'} | ${escapeCell(result.reason)} | ${escapeCell(result.error ?? '-')} |`
		)
	}
	lines.push('')
	lines.push('## Tasks')
	lines.push('')
	for (const task of artifact.tasks) {
		lines.push(`- \`${task.id}\`: ${task.request}`)
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
	if (allErrors.length === artifact.results.length) {
		lines.push(
			'All live model calls failed, so this run does not measure agent quality. Check the API key, model name, and network access, then rerun `npm run eval:model-in-loop` from `frontend/`.'
		)
	} else {
		if (allErrors.length > 0) {
			lines.push(
				`${allErrors.length} of ${artifact.results.length} live model calls failed, so rankings that include those failures are not definitive. Treat this run as a partial smoke test rather than a final P0-P4 comparison.`
			)
			lines.push('')
		}
		const completeSummaries = artifact.summary.filter((summary) => summary.errorCount === 0)
		const rankingPool = completeSummaries.length > 0 ? completeSummaries : artifact.summary
		const best = [...rankingPool].sort((a, b) => b.averageScore - a.averageScore)[0]
		const qualifier = completeSummaries.length > 0 ? 'among configs without model-call errors' : 'in this smoke run'
		lines.push(`Best average score ${qualifier}: \`${best.configId}\` with ${best.averageScore.toFixed(2)} / 4.`)
		lines.push(
			'Use this as a directional signal only. A stronger experiment should run more tasks, multiple repetitions per task, and exact git worktrees or feature flags for each P0-P3 phase.'
		)
	}
	lines.push('')
	lines.push('## Limitations')
	lines.push('')
	lines.push('- This run uses one sample per task/config.')
	lines.push('- It scores returned actions structurally; it does not yet replay every model action into the editor and visually inspect the final canvas.')
	lines.push('- The config labels approximate refinement levels using prompt/action ablations in the current codebase.')
	lines.push('- P4 has not been defined or implemented in `canvas_agent_refinement_plan.md`, so it is not evaluated here.')
	lines.push('')
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

function getModelName(): AgentModelName {
	const value = process.env.MODEL_IN_LOOP_EVAL_MODEL
	return isValidModelName(value) ? value : DEFAULT_MODEL_NAME
}

function required<T>(value: T | undefined | null, name: string): T {
	if (!value) throw new Error(`Missing eval fixture data: ${name}`)
	return value
}

function formatPercent(value: number) {
	return `${Math.round(value * 100)}%`
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
