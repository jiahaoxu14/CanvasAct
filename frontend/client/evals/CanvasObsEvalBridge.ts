import {
	createShapeId,
	type BoxModel,
	type TLArrowBinding,
	type TLArrowShape,
	type TLCamera,
	type TLGeoShape,
	type TLRecord,
	type TLShape,
	type TLShapeId,
} from 'tldraw'
import type { AgentVariant } from '../../shared/agentVariants'
import { isAgentVariant } from '../../shared/agentVariants'
import {
	getCanvasObsExperimentCase,
	getCanvasObsExperimentRotation,
	getCanvasObsExperimentShapeId,
	type CanvasObsExperimentCaseId,
	type CanvasObsExperimentManipulation,
} from '../../shared/evals/CanvasObsExperimentFixtures'
import {
	scoreCanvasObsExperimentFinalStore,
	type CanvasObsExperimentFinalStore,
	type CanvasObsExperimentScore,
	type CanvasObsExperimentShapeState,
} from '../../shared/evals/CanvasObsExperimentScoring'
import type { AgentModelName } from '../../shared/models'
import { isValidModelName } from '../../shared/models'
import type { ChatHistoryActionItem } from '../../shared/types/ChatHistoryItem'
import type { AgentTrajectory } from '../../shared/types/AgentTrajectory'
import type { TimePart } from '../../shared/schema/PromptPartDefinitions'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type { TldrawAgentApp } from '../agent/TldrawAgentApp'
import type { PromptPartUtil } from '../parts/PromptPartUtil'
import {
	getCurrentObservationCaseStudy,
	OBSERVATION_CASE_STUDIES,
	type ObservationCaseStudyId,
	resetCurrentObservationCaseStudy,
	selectObservationCaseStudy,
} from '../usageScenario/observationCaseStudies'

export const CANVAS_OBS_EVAL_QUERY_PARAM = 'eval'
export const CANVAS_OBS_EVAL_GLOBAL = '__canvasObsEval'

export type CanvasObsEvalRotationAlias = 'canonical' | 'r1' | 'r2'

export type CanvasObsEvalResolvedRotation =
	| 'editable-top'
	| 'editable-middle'
	| 'editable-bottom'
	| 'blue-bottom'
	| 'blue-middle'
	| 'blue-upper-hidden'
	| 'calls-attached'
	| 'diaries-attached'
	| 'upper-bound'
	| 'lower-bound'

export interface CanvasObsEvalRotationDefinition {
	/** Runner-facing stable id; equal to alias (canonical/r1/r2). */
	id: CanvasObsEvalRotationAlias
	alias: CanvasObsEvalRotationAlias
	resolvedId: CanvasObsEvalResolvedRotation
	expectedTargetIds: readonly string[]
}

export interface CanvasObsEvalCaseDefinition {
	id: ObservationCaseStudyId
	prompt: string
	destinationId: string
	rotations: CanvasObsEvalRotationDefinition[]
}

export interface CanvasObsEvalEvaluation extends CanvasObsExperimentScore {
	/** Four equally weighted checks: grounding, placement, relation, collateral. */
	score: number
	placement: CanvasObsExperimentScore['geometry']
	endToEnd: {
		passed: boolean
	}
}

export interface CanvasObsEvalStoreSnapshot {
	capturedAt: string
	pageId: string
	pageName: string
	viewportBounds: BoxModel
	viewportScreenBounds: BoxModel
	zoom: number
	camera: TLCamera
	currentPageShapeIds: string[]
	/** Rendered page bounds and stable non-positional state captured at this instant. */
	shapeStates: Record<string, CanvasObsExperimentShapeState>
	/** Every record in the tldraw store, including document and session records. */
	store: Record<string, TLRecord>
}

export interface CanvasObsEvalPreparedTrial {
	caseId: ObservationCaseStudyId
	variant: AgentVariant
	modelName: AgentModelName
	rotation: CanvasObsEvalRotationAlias
	resolvedRotation: CanvasObsEvalResolvedRotation
	prompt: string
	fixedTime: string
}

export interface CanvasObsEvalExport {
	version: 1
	preparedTrial: CanvasObsEvalPreparedTrial | null
	caseId: ObservationCaseStudyId | null
	variant: AgentVariant
	modelName: AgentModelName
	isGenerating: boolean
	lastError: string | null
	initialStore: CanvasObsEvalStoreSnapshot | null
	finalStore: CanvasObsEvalStoreSnapshot
	actions: ChatHistoryActionItem[]
	trajectories: AgentTrajectory[]
	evaluation: CanvasObsEvalEvaluation | null
}

export interface CanvasObsEvalPrepareTrialOptions {
	caseId: ObservationCaseStudyId
	variant: AgentVariant
	modelName: AgentModelName
	rotation?: CanvasObsEvalRotationAlias
	fixedTime?: string
}

export interface CanvasObsEvalBridgeApi {
	version: 1
	listCases(): CanvasObsEvalCaseDefinition[]
	selectCase(caseId: ObservationCaseStudyId): Promise<CanvasObsEvalExport>
	resetCase(): Promise<CanvasObsEvalExport>
	setVariant(variant: AgentVariant): CanvasObsEvalExport
	setModel(modelName: AgentModelName): CanvasObsEvalExport
	applyRotation(rotation: CanvasObsEvalRotationAlias): Promise<CanvasObsEvalExport>
	prepareTrial(options: CanvasObsEvalPrepareTrialOptions): Promise<CanvasObsEvalExport>
	prompt(message?: string): Promise<CanvasObsEvalExport>
	submitPrompt(message?: string): Promise<CanvasObsEvalExport>
	waitForIdle(timeoutMs?: number): Promise<CanvasObsEvalExport>
	exportState(): CanvasObsEvalExport
}

declare global {
	interface Window {
		__canvasObsEval?: CanvasObsEvalBridgeApi
	}
}

const DEFAULT_FIXED_TIME = '12:00:00 PM'
const DEFAULT_IDLE_TIMEOUT_MS = 180_000

const ROTATION_ALIASES: Record<
	ObservationCaseStudyId,
	readonly Omit<CanvasObsEvalRotationDefinition, 'id' | 'expectedTargetIds'>[]
> = {
	'viewport-coverage': [
		{ alias: 'canonical', resolvedId: 'editable-middle' },
		{ alias: 'r1', resolvedId: 'editable-top' },
		{ alias: 'r2', resolvedId: 'editable-bottom' },
	],
	'object-state': [
		{ alias: 'canonical', resolvedId: 'blue-middle' },
		{ alias: 'r1', resolvedId: 'blue-bottom' },
		{ alias: 'r2', resolvedId: 'blue-upper-hidden' },
	],
	'workspace-structure': [
		{ alias: 'canonical', resolvedId: 'calls-attached' },
		{ alias: 'r1', resolvedId: 'diaries-attached' },
	],
	'explicit-relations': [
		{ alias: 'canonical', resolvedId: 'upper-bound' },
		{ alias: 'r1', resolvedId: 'lower-bound' },
	],
}

export function isCanvasObsEvalModeEnabled(location: Location = window.location) {
	return new URLSearchParams(location.search).get(CANVAS_OBS_EVAL_QUERY_PARAM) === '1'
}

/**
 * Install an opt-in browser bridge for controlled model-in-the-loop evaluation.
 *
 * This bridge deliberately exposes only local editor and agent operations. Model
 * credentials remain in the worker and are never readable from this API.
 */
export function installCanvasObsEvalBridge(app: TldrawAgentApp) {
	if (!isCanvasObsEvalModeEnabled()) return () => undefined

	const bridge = new CanvasObsEvalBridge(app)
	window[CANVAS_OBS_EVAL_GLOBAL] = bridge.api

	return () => {
		bridge.dispose()
		if (window[CANVAS_OBS_EVAL_GLOBAL] === bridge.api) {
			delete window[CANVAS_OBS_EVAL_GLOBAL]
		}
	}
}

class CanvasObsEvalBridge {
	private initialStore: CanvasObsEvalStoreSnapshot | null = null
	private preparedTrial: CanvasObsEvalPreparedTrial | null = null
	private fixedTime = DEFAULT_FIXED_TIME
	private readonly agent: TldrawAgent
	private readonly timePartUtil: PromptPartUtil<TimePart>
	private readonly originalTimeGetPart: PromptPartUtil<TimePart>['getPart']

	readonly api: CanvasObsEvalBridgeApi

	constructor(private readonly app: TldrawAgentApp) {
		const agent = app.agents.getAgent()
		if (!agent) throw new Error('CanvasObs eval bridge requires an initialized agent.')
		this.agent = agent

		this.timePartUtil = agent.getPromptPartUtil('time') as PromptPartUtil<TimePart>
		this.originalTimeGetPart = this.timePartUtil.getPart
		this.timePartUtil.getPart = () => ({ type: 'time', time: this.fixedTime })

		this.api = {
			version: 1,
			listCases: () => this.listCases(),
			selectCase: (caseId) => this.selectCase(caseId),
			resetCase: () => this.resetCase(),
			setVariant: (variant) => this.setVariant(variant),
			setModel: (modelName) => this.setModel(modelName),
			applyRotation: (rotation) => this.applyRotation(rotation),
			prepareTrial: (options) => this.prepareTrial(options),
			prompt: (message) => this.submitPrompt(message),
			submitPrompt: (message) => this.submitPrompt(message),
			waitForIdle: (timeoutMs) => this.waitForIdle(timeoutMs),
			exportState: () => this.exportState(),
		}
	}

	dispose() {
		this.timePartUtil.getPart = this.originalTimeGetPart
	}

	private listCases(): CanvasObsEvalCaseDefinition[] {
		return OBSERVATION_CASE_STUDIES.map((caseStudy) => {
			const experimentCase = getCanvasObsExperimentCase(caseStudy.id)
			return {
				id: caseStudy.id,
				prompt: experimentCase.prompt,
				destinationId: experimentCase.destination.id,
				rotations: ROTATION_ALIASES[caseStudy.id].map((rotation) => ({
					...rotation,
					id: rotation.alias,
					expectedTargetIds: [
						...getCanvasObsExperimentRotation(caseStudy.id, rotation.resolvedId)
							.expectedTargetIds,
					],
				})),
			}
		})
	}

	private async selectCase(caseId: ObservationCaseStudyId) {
		this.assertIdle()
		this.requireCase(caseId)
		await new Promise<void>((resolve) => {
			selectObservationCaseStudy(this.app.editor, caseId, resolve)
		})
		await nextAnimationFrame()
		this.clearPreparedTrial()
		return this.exportState()
	}

	private async resetCase() {
		this.assertIdle()
		this.requireCurrentCase()
		await this.resetCurrentCasePage()
		this.clearPreparedTrial()
		return this.exportState()
	}

	private setVariant(variant: AgentVariant) {
		this.assertIdle()
		if (!isAgentVariant(variant)) throw new Error(`Unknown agent variant: ${String(variant)}`)
		this.agent.setVariant(variant)
		this.preparedTrial = this.preparedTrial ? { ...this.preparedTrial, variant } : null
		return this.exportState()
	}

	private setModel(modelName: AgentModelName) {
		this.assertIdle()
		if (!isValidModelName(modelName)) throw new Error(`Unknown model: ${String(modelName)}`)
		this.agent.modelName.setModelName(modelName)
		this.preparedTrial = this.preparedTrial ? { ...this.preparedTrial, modelName } : null
		return this.exportState()
	}

	private async applyRotation(rotation: CanvasObsEvalRotationAlias) {
		this.assertIdle()
		const caseStudy = this.requireCurrentCase()
		const resolvedRotation = this.resolveRotation(caseStudy.id, rotation)

		// Always rotate from the canonical fixture so calls are idempotent and do
		// not accumulate transformations from a prior trial.
		await this.resetCurrentCasePage()
		this.applyResolvedRotation(caseStudy.id, resolvedRotation)
		await nextAnimationFrame()

		this.preparedTrial = this.preparedTrial
			? { ...this.preparedTrial, rotation, resolvedRotation }
			: null
		this.initialStore = this.captureStore()
		return this.exportState()
	}

	private async prepareTrial(options: CanvasObsEvalPrepareTrialOptions) {
		this.assertIdle()
		this.requireCase(options.caseId)
		if (!isAgentVariant(options.variant)) {
			throw new Error(`Unknown agent variant: ${String(options.variant)}`)
		}
		if (!isValidModelName(options.modelName)) {
			throw new Error(`Unknown model: ${String(options.modelName)}`)
		}

		const rotation = options.rotation ?? 'canonical'
		const resolvedRotation = this.resolveRotation(options.caseId, rotation)
		await new Promise<void>((resolve) => {
			selectObservationCaseStudy(this.app.editor, options.caseId, resolve)
		})
		await this.resetCurrentCasePage()
		this.applyResolvedRotation(options.caseId, resolvedRotation)
		await nextAnimationFrame()

		this.app.agents.resetAllAgents()
		this.agent.setVariant(options.variant)
		this.agent.modelName.setModelName(options.modelName)
		this.fixedTime = options.fixedTime ?? DEFAULT_FIXED_TIME
		this.agent.chatOrigin.reset()

		const caseStudy = this.requireCurrentCase()
		const experimentCase = getCanvasObsExperimentCase(caseStudy.id)
		this.preparedTrial = {
			caseId: caseStudy.id,
			variant: options.variant,
			modelName: options.modelName,
			rotation,
			resolvedRotation,
			prompt: experimentCase.prompt,
			fixedTime: this.fixedTime,
		}
		this.initialStore = this.captureStore()
		return this.exportState()
	}

	private async submitPrompt(message?: string) {
		this.assertIdle()
		const caseStudy = this.requireCurrentCase()
		const prompt = message?.trim() || getCanvasObsExperimentCase(caseStudy.id).prompt
		if (!prompt) throw new Error('CanvasObs eval prompt cannot be empty.')

		if (!this.initialStore) this.initialStore = this.captureStore()
		if (this.preparedTrial) this.preparedTrial = { ...this.preparedTrial, prompt }

		// Match the UI request path: interrupt stale work, schedule one user request,
		// and let the normal agent own streaming, execution, review, and continuations.
		this.agent.interrupt({
			input: {
				agentMessages: [prompt],
				bounds: this.app.editor.getViewportPageBounds(),
				source: 'user',
				contextItems: this.agent.context.getItems(),
			},
		})

		return this.waitForIdle()
	}

	private async waitForIdle(timeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
			throw new Error(`Idle timeout must be a positive number, received ${timeoutMs}.`)
		}
		const deadline = performance.now() + timeoutMs
		while (this.agent.requests.isGenerating()) {
			if (performance.now() >= deadline) {
				throw new Error(`CanvasObs eval trial did not become idle within ${timeoutMs} ms.`)
			}
			await delay(25)
		}
		await nextAnimationFrame()
		return this.exportState()
	}

	private exportState(): CanvasObsEvalExport {
		const caseStudy = getCurrentObservationCaseStudy(this.app.editor)
		const actions = this.agent.chat
			.getHistory()
			.filter((item): item is ChatHistoryActionItem => item.type === 'action')

		const finalStore = this.captureStore()
		return cloneJson({
			version: 1,
			preparedTrial: this.preparedTrial,
			caseId: caseStudy?.id ?? null,
			variant: this.agent.variant.getVariant(),
			modelName: this.agent.modelName.getModelName(),
			isGenerating: this.agent.requests.isGenerating(),
			lastError: this.agent.requests.getLastError(),
			initialStore: this.initialStore,
			finalStore,
			actions,
			trajectories: this.agent.trajectories.getTrajectories(),
			evaluation: this.scoreFinalStore(finalStore),
		})
	}

	private captureStore(): CanvasObsEvalStoreSnapshot {
		const { editor } = this.app
		const page = editor.getCurrentPage()
		const shapeStates: Record<string, CanvasObsExperimentShapeState> = {}
		for (const shape of editor.getCurrentPageShapesSorted()) {
			const bounds = editor.getShapePageBounds(shape.id)
			if (!bounds) continue
			shapeStates[shape.id] = {
				id: shape.id,
				bounds: bounds.toJson(),
				stateFingerprint: getShapeStateFingerprint(shape),
			}
		}
		return cloneJson({
			capturedAt: new Date().toISOString(),
			pageId: page.id,
			pageName: page.name,
			viewportBounds: editor.getViewportPageBounds().toJson(),
			viewportScreenBounds: editor.getViewportScreenBounds().toJson(),
			zoom: editor.getZoomLevel(),
			camera: editor.getCamera(),
			currentPageShapeIds: Array.from(editor.getCurrentPageShapeIds()).sort(),
			shapeStates,
			store: editor.store.serialize('all'),
		}) as CanvasObsEvalStoreSnapshot
	}

	private applyResolvedRotation(
		caseId: ObservationCaseStudyId,
		rotation: CanvasObsEvalResolvedRotation
	) {
		const { editor } = this.app
		const manipulation = getCanvasObsExperimentRotation(caseId, rotation).manipulation
		const candidateBounds = this.captureCandidateBounds(caseId)

		editor.run(
			() => {
				switch (manipulation.kind) {
					case 'lock-state':
						this.rotateEditableArchiveCopy(manipulation)
						break
					case 'hidden-color':
						this.rotateBlueChart(manipulation)
						break
					case 'frame-membership':
						this.rotateAttachedSetupCards(manipulation)
						break
					case 'arrow-binding':
						this.rotateEvidenceBinding(manipulation)
						break
				}
			},
			{ history: 'ignore', ignoreShapeLock: true }
		)

		this.assertCandidateBoundsUnchanged(caseId, candidateBounds)
	}

	private rotateEditableArchiveCopy(
		manipulation: Extract<CanvasObsExperimentManipulation, { kind: 'lock-state' }>
	) {
		for (const candidateId of [manipulation.unlockedId, ...manipulation.lockedIds]) {
			const shape = this.requireShapeById(candidateId)
			this.app.editor.updateShape({
				id: shape.id,
				type: shape.type,
				isLocked: candidateId !== manipulation.unlockedId,
			})
		}
	}

	private rotateBlueChart(
		manipulation: Extract<CanvasObsExperimentManipulation, { kind: 'hidden-color' }>
	) {
		for (const [candidateId, color] of Object.entries(manipulation.colorsById)) {
			const shape = this.requireGeoShapeById(candidateId)
			this.app.editor.updateShape({
				id: shape.id,
				type: shape.type,
				props: { color },
			})
		}
	}

	private rotateAttachedSetupCards(
		manipulation: Extract<CanvasObsExperimentManipulation, { kind: 'frame-membership' }>
	) {
		const editor = this.app.editor
		const pageId = editor.getCurrentPageId()

		editor.reparentShapes(manipulation.looseIds as TLShapeId[], pageId)
		editor.reparentShapes(manipulation.attachedIds as TLShapeId[], manipulation.frameId as TLShapeId)
	}

	private rotateEvidenceBinding(
		manipulation: Extract<CanvasObsExperimentManipulation, { kind: 'arrow-binding' }>
	) {
		if (manipulation.boundArrowId.endsWith('-a5d9')) return
		const editor = this.app.editor
		const upperArrowId = manipulation.looseArrowId as TLShapeId
		const lowerArrowId = manipulation.boundArrowId as TLShapeId
		const evidenceId = manipulation.evidenceId as TLShapeId
		const lowerFindingId = manipulation.boundFindingId as TLShapeId
		const upperArrow = editor.getShape<TLArrowShape>(upperArrowId)
		if (!upperArrow) throw new Error('Missing upper evidence arrow.')

		const upperBindings = editor.getBindingsFromShape(upperArrowId, 'arrow')
		editor.deleteBindings(upperBindings, { isolateShapes: true })

		const lowerBindings = editor.getBindingsFromShape(lowerArrowId, 'arrow')
		if (lowerBindings.length > 0) {
			editor.deleteBindings(lowerBindings, { isolateShapes: true })
		}

		this.createPreciseArrowBinding(lowerArrowId, evidenceId, 'start', { x: 1, y: 0.42 })
		this.createPreciseArrowBinding(lowerArrowId, lowerFindingId, 'end', { x: 0, y: 0.5 })
	}

	private createPreciseArrowBinding(
		arrowId: TLShapeId,
		targetId: TLShapeId,
		terminal: 'start' | 'end',
		normalizedAnchor: { x: number; y: number }
	) {
		this.app.editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: arrowId,
			toId: targetId,
			props: {
				terminal,
				normalizedAnchor,
				isExact: true,
				isPrecise: true,
				snap: 'none',
			},
		})
	}

	private captureCandidateBounds(caseId: ObservationCaseStudyId) {
		const localIds = {
			'viewport-coverage': ['k2m9', 'n7q4', 'r8v3'],
			'object-state': ['v7p2', 'm4q8', 'c9r5', 'h3n6'],
			'workspace-structure': ['u2c7', 'r9m1', 'b6k4', 't4v8'],
			'explicit-relations': ['e2s6', 'q4w8', 'l7n3'],
		}[caseId]
		return new Map(
			localIds.map((localId) => {
				const bounds = this.app.editor.getShapePageBounds(shapeId(caseId, localId))
				if (!bounds) throw new Error(`Missing eval candidate bounds for ${caseId}/${localId}.`)
				return [localId, bounds.toJson()] as const
			})
		)
	}

	private assertCandidateBoundsUnchanged(
		caseId: ObservationCaseStudyId,
		before: Map<string, BoxModel>
	) {
		for (const [localId, expected] of before) {
			const actual = this.app.editor.getShapePageBounds(shapeId(caseId, localId))?.toJson()
			if (!actual || !boxesEqual(actual, expected)) {
				throw new Error(
					`Counterfactual rotation changed visible candidate geometry for ${caseId}/${localId}.`
				)
			}
		}
	}

	private async resetCurrentCasePage() {
		await new Promise<void>((resolve) => {
			resetCurrentObservationCaseStudy(this.app.editor, resolve)
		})
		await nextAnimationFrame()
	}

	private resolveRotation(
		caseId: ObservationCaseStudyId,
		alias: CanvasObsEvalRotationAlias
	): CanvasObsEvalResolvedRotation {
		const rotation = ROTATION_ALIASES[caseId].find((candidate) => candidate.alias === alias)
		if (!rotation) {
			const valid = ROTATION_ALIASES[caseId].map((candidate) => candidate.alias).join(', ')
			throw new Error(`Rotation ${alias} is invalid for ${caseId}. Valid rotations: ${valid}.`)
		}
		getCanvasObsExperimentRotation(caseId, rotation.resolvedId)
		return rotation.resolvedId
	}

	private requireCase(caseId: ObservationCaseStudyId) {
		const caseStudy = OBSERVATION_CASE_STUDIES.find((candidate) => candidate.id === caseId)
		if (!caseStudy) throw new Error(`Unknown CanvasObs eval case: ${String(caseId)}`)
		return caseStudy
	}

	private requireCurrentCase() {
		const caseStudy = getCurrentObservationCaseStudy(this.app.editor)
		if (!caseStudy) throw new Error('Select a CanvasObs case-study page before evaluating.')
		return caseStudy
	}

	private requireShapeById(id: string) {
		const shape = this.app.editor.getShape(id as TLShapeId)
		if (!shape) throw new Error(`Missing CanvasObs eval shape: ${id}`)
		return shape
	}

	private requireGeoShapeById(id: string) {
		const shape = this.app.editor.getShape<TLGeoShape>(id as TLShapeId)
		if (!shape || shape.type !== 'geo') {
			throw new Error(`Missing CanvasObs eval geo shape: ${id}`)
		}
		return shape
	}

	private scoreFinalStore(finalStore: CanvasObsEvalStoreSnapshot): CanvasObsEvalEvaluation | null {
		const trial = this.preparedTrial
		if (!trial || !this.initialStore || trial.caseId !== this.requireCurrentCase().id) return null

		const scoreStore = this.buildScoreStore(this.initialStore, finalStore)
		const score = scoreCanvasObsExperimentFinalStore(
			trial.caseId as CanvasObsExperimentCaseId,
			trial.resolvedRotation,
			scoreStore
		)
		return {
			...score,
			score:
				Number(score.grounding.passed) +
				Number(score.geometry.passed) +
				Number(score.relation.passed) +
				Number(score.collateral.passed),
			placement: score.geometry,
			endToEnd: { passed: score.overallPassed },
		}
	}

	private buildScoreStore(
		initialStore: CanvasObsEvalStoreSnapshot,
		finalStore: CanvasObsEvalStoreSnapshot
	): CanvasObsExperimentFinalStore {
		const arrowBindings: CanvasObsExperimentFinalStore['arrowBindings'][number][] = []

		for (const shape of this.app.editor.getCurrentPageShapesSorted()) {
			if (shape.type !== 'arrow') continue
			for (const binding of this.app.editor.getBindingsFromShape(shape.id, 'arrow')) {
				const arrowBinding = binding as TLArrowBinding
				arrowBindings.push({
					arrowId: shape.id,
					terminal: arrowBinding.props.terminal,
					targetId: arrowBinding.toId,
				})
			}
		}

		const initialShapeRecords = getShapeRecords(initialStore.store)
		const finalShapeRecords = getShapeRecords(finalStore.store)
		const initialIds = new Set(Object.keys(initialShapeRecords))
		const finalIds = new Set(Object.keys(finalShapeRecords))
		const addedShapeIds = [...finalIds].filter((id) => !initialIds.has(id)).sort()
		const removedShapeIds = [...initialIds].filter((id) => !finalIds.has(id)).sort()
		const updatedShapeIds = [...initialIds]
			.filter(
				(id) =>
					finalIds.has(id) &&
					JSON.stringify(initialShapeRecords[id]) !== JSON.stringify(finalShapeRecords[id])
			)
			.sort()

		return {
			initialShapes: initialStore.shapeStates,
			shapes: finalStore.shapeStates,
			arrowBindings,
			mutations: { addedShapeIds, updatedShapeIds, removedShapeIds },
		}
	}

	private assertIdle() {
		if (this.agent.requests.isGenerating()) {
			throw new Error('Wait for the active CanvasObs eval request before changing trial state.')
		}
	}

	private clearPreparedTrial() {
		this.preparedTrial = null
		this.initialStore = null
	}
}

function shapeId(caseId: ObservationCaseStudyId, localId: string) {
	return createShapeId(getCanvasObsExperimentShapeId(caseId, localId).slice('shape:'.length))
}

function getShapeRecords(store: Record<string, TLRecord>) {
	return Object.fromEntries(
		Object.entries(store).filter(([, record]) => record.typeName === 'shape')
	)
}

function getShapeStateFingerprint(shape: TLShape) {
	return stableJsonStringify({
		type: shape.type,
		rotation: shape.rotation,
		opacity: shape.opacity,
		isLocked: shape.isLocked,
		props: shape.props,
		meta: shape.meta,
	})
}

function stableJsonStringify(value: unknown) {
	return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJsonValue)
	if (!value || typeof value !== 'object') return value

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => [key, sortJsonValue(child)])
	)
}

function boxesEqual(a: BoxModel, b: BoxModel) {
	return (
		Math.abs(a.x - b.x) < 1e-6 &&
		Math.abs(a.y - b.y) < 1e-6 &&
		Math.abs(a.w - b.w) < 1e-6 &&
		Math.abs(a.h - b.h) < 1e-6
	)
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function nextAnimationFrame() {
	return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

function delay(ms: number) {
	return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}
