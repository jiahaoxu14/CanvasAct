import type { CanvasObservation } from '../format/CanvasObservation'
import type { AgentTrajectory } from '../types/AgentTrajectory'
import type { SimpleShapeId } from '../types/ids-schema'
import type { CanvasAgentEvalFixture } from './CanvasAgentEvalFixtures'

export interface CanvasAgentEvalMetrics {
	objectRecall: number | null
	visibilityAccuracy: number | null
	relationRecall: number | null
	selectorAccuracy: number | null
	ambiguitySafeFailRate: number | null
	falseTargetRate: number | null
	postconditionPassRate: number | null
	geometryErrorPx: number | null
	unrelatedShapeMutationCount: number | null
	repairLoopCount: number | null
	verificationFailureCount: number | null
	finalLintCount: number | null
	lintDelta: number | null
	chunkedActionCount: number | null
	score: 0 | 1 | 2 | 3 | 4
	passed: boolean
	failures: string[]
}

export interface CanvasAgentEvalTargetResolution {
	status: 'ok' | 'empty' | 'ambiguous'
	shapeIds: SimpleShapeId[]
}

export interface CanvasAgentEvalActionResult {
	postconditionPassRate?: number | null
	geometryErrorPx?: number | null
	unrelatedShapeMutationCount?: number | null
	verificationFailureCount?: number | null
}

export interface CanvasAgentEvalLintResult {
	initialLintCount: number
	finalLintCount: number
	verificationFailureCount?: number | null
}

export interface CanvasAgentEvalRunInput {
	fixtures: CanvasAgentEvalFixture[]
	observations?: Partial<Record<string, CanvasObservation>>
	targetResolutions?: Partial<Record<string, CanvasAgentEvalTargetResolution>>
	actionResults?: Partial<Record<string, CanvasAgentEvalActionResult>>
	lintResults?: Partial<Record<string, CanvasAgentEvalLintResult>>
	deterministicResults?: Partial<Record<string, boolean>>
	trajectories?: Partial<Record<string, AgentTrajectory>>
}

export interface CanvasAgentEvalRunResult {
	results: Record<string, CanvasAgentEvalMetrics>
	summary: {
		fixtureCount: number
		passedCount: number
		failedCount: number
		averageScore: number
	}
}

export function runCanvasAgentEvalHarness(input: CanvasAgentEvalRunInput): CanvasAgentEvalRunResult {
	const results: Record<string, CanvasAgentEvalMetrics> = {}
	for (const fixture of input.fixtures) {
		results[fixture.id] = evaluateCanvasAgentFixture(
			fixture,
			input.observations?.[fixture.id] ?? input.trajectories?.[fixture.id]?.finalObservation,
			input.trajectories?.[fixture.id] ?? null,
			{
				targetResolution: input.targetResolutions?.[fixture.id],
				actionResult: input.actionResults?.[fixture.id],
				lintResult: input.lintResults?.[fixture.id],
				deterministic: input.deterministicResults?.[fixture.id],
			}
		)
	}

	const values = Object.values(results)
	const passedCount = values.filter((result) => result.passed).length
	const totalScore = values.reduce((total, result) => total + result.score, 0)
	return {
		results,
		summary: {
			fixtureCount: values.length,
			passedCount,
			failedCount: values.length - passedCount,
			averageScore: values.length === 0 ? 0 : totalScore / values.length,
		},
	}
}

export function evaluateCanvasAgentFixture(
	fixture: CanvasAgentEvalFixture,
	observation: CanvasObservation | null | undefined,
	trajectory: AgentTrajectory | null,
	options: {
		targetResolution?: CanvasAgentEvalTargetResolution
		actionResult?: CanvasAgentEvalActionResult
		lintResult?: CanvasAgentEvalLintResult
		deterministic?: boolean
	} = {}
): CanvasAgentEvalMetrics {
	const failures: string[] = []
	const objectRecall = observation ? getObjectRecall(fixture, observation, failures) : null
	const visibilityAccuracy = observation ? getVisibilityAccuracy(fixture, observation, failures) : null
	const relationRecall = observation ? getRelationRecall(fixture, observation, failures) : null
	const selectorAccuracy = options.targetResolution
		? getSelectorAccuracy(fixture, options.targetResolution, failures)
		: null
	const ambiguitySafeFailRate = options.targetResolution
		? getAmbiguitySafeFailRate(fixture, options.targetResolution, failures)
		: null
	const falseTargetRate = options.targetResolution
		? getFalseTargetRate(fixture, options.targetResolution, failures)
		: null
	const postconditionPassRate =
		options.actionResult?.postconditionPassRate ??
		(trajectory ? getPostconditionPassRate(trajectory) : null)
	const geometryErrorPx = options.actionResult?.geometryErrorPx ?? null
	const unrelatedShapeMutationCount = options.actionResult?.unrelatedShapeMutationCount ?? null
	const repairLoopCount = trajectory?.metrics.repairLoopCount ?? null
	const verificationFailureCount =
		options.lintResult?.verificationFailureCount ??
		options.actionResult?.verificationFailureCount ??
		trajectory?.metrics.verificationFailureCount ??
		null
	const finalLintCount = options.lintResult?.finalLintCount ?? (observation ? getFinalLintCount(observation) : null)
	const lintDelta = options.lintResult
		? options.lintResult.finalLintCount - options.lintResult.initialLintCount
		: null
	const chunkedActionCount = trajectory?.metrics.chunkCount ?? null

	if (options.deterministic === false) {
		failures.push('Repeated eval builds were not deterministic.')
	}
	if (fixture.expect.requiresChunkedActions && (chunkedActionCount ?? 0) === 0) {
		failures.push('Expected at least one action chunk.')
	}
	if (
		fixture.expect.maxRepairLoopCount !== undefined &&
		(repairLoopCount ?? Number.POSITIVE_INFINITY) > fixture.expect.maxRepairLoopCount
	) {
		failures.push(`Repair loop count exceeded ${fixture.expect.maxRepairLoopCount}.`)
	}
	if (
		fixture.expect.maxVerificationFailures !== undefined &&
		(verificationFailureCount ?? Number.POSITIVE_INFINITY) > fixture.expect.maxVerificationFailures
	) {
		failures.push(`Verification failures exceeded ${fixture.expect.maxVerificationFailures}.`)
	}
	if (
		fixture.expect.minVerificationFailures !== undefined &&
		(verificationFailureCount ?? 0) < fixture.expect.minVerificationFailures
	) {
		failures.push(`Verification failures below ${fixture.expect.minVerificationFailures}.`)
	}
	if (
		fixture.expect.minPostconditionPassRate !== undefined &&
		(postconditionPassRate ?? 0) < fixture.expect.minPostconditionPassRate
	) {
		failures.push(`Postcondition pass rate below ${fixture.expect.minPostconditionPassRate}.`)
	}
	if (
		fixture.expect.maxGeometryErrorPx !== undefined &&
		(geometryErrorPx ?? Number.POSITIVE_INFINITY) > fixture.expect.maxGeometryErrorPx
	) {
		failures.push(`Geometry error exceeded ${fixture.expect.maxGeometryErrorPx}px.`)
	}
	if (
		fixture.expect.maxUnrelatedShapeMutations !== undefined &&
		(unrelatedShapeMutationCount ?? Number.POSITIVE_INFINITY) >
			fixture.expect.maxUnrelatedShapeMutations
	) {
		failures.push(`Unrelated shape mutations exceeded ${fixture.expect.maxUnrelatedShapeMutations}.`)
	}
	if (
		fixture.expect.maxFalseTargetRate !== undefined &&
		(falseTargetRate ?? Number.POSITIVE_INFINITY) > fixture.expect.maxFalseTargetRate
	) {
		failures.push(`False-target rate exceeded ${fixture.expect.maxFalseTargetRate}.`)
	}
	if (
		fixture.expect.maxFinalLintCount !== undefined &&
		(finalLintCount ?? Number.POSITIVE_INFINITY) > fixture.expect.maxFinalLintCount
	) {
		failures.push(`Final lint count exceeded ${fixture.expect.maxFinalLintCount}.`)
	}
	if (
		fixture.expect.minFinalLintCount !== undefined &&
		(finalLintCount ?? 0) < fixture.expect.minFinalLintCount
	) {
		failures.push(`Final lint count below ${fixture.expect.minFinalLintCount}.`)
	}

	return {
		objectRecall,
		visibilityAccuracy,
		relationRecall,
		selectorAccuracy,
		ambiguitySafeFailRate,
		falseTargetRate,
		postconditionPassRate,
		geometryErrorPx,
		unrelatedShapeMutationCount,
		repairLoopCount,
		verificationFailureCount,
		finalLintCount,
		lintDelta,
		chunkedActionCount,
		score: scoreFixture(failures, {
			objectRecall,
			visibilityAccuracy,
			relationRecall,
			selectorAccuracy,
			ambiguitySafeFailRate,
			postconditionPassRate,
		}),
		passed: failures.length === 0,
		failures,
	}
}

function getSelectorAccuracy(
	fixture: CanvasAgentEvalFixture,
	targetResolution: CanvasAgentEvalTargetResolution,
	failures: string[]
) {
	if (fixture.expect.expectAmbiguousResolution) return null
	const expected = fixture.expect.objectIds ?? []
	if (expected.length === 0) return null
	const expectedSet = new Set(expected)
	const resolvedSet = new Set(targetResolution.shapeIds)
	const matched = expected.filter((id) => resolvedSet.has(id)).length
	const extra = targetResolution.shapeIds.filter((id) => !expectedSet.has(id)).length
	const accuracy = matched / expected.length
	if (targetResolution.status !== 'ok' || accuracy < 1 || extra > 0) {
		failures.push(
			`Selector resolved ${matched}/${expected.length} expected targets with ${extra} extra target${extra === 1 ? '' : 's'}.`
		)
	}
	return accuracy
}

function getAmbiguitySafeFailRate(
	fixture: CanvasAgentEvalFixture,
	targetResolution: CanvasAgentEvalTargetResolution,
	failures: string[]
) {
	if (!fixture.expect.expectAmbiguousResolution) return null
	const passed = targetResolution.status === 'ambiguous'
	if (!passed) failures.push(`Expected ambiguous resolution, got "${targetResolution.status}".`)
	return passed ? 1 : 0
}

function getFalseTargetRate(
	fixture: CanvasAgentEvalFixture,
	targetResolution: CanvasAgentEvalTargetResolution,
	failures: string[]
) {
	const expected = fixture.expect.objectIds ?? []
	if (expected.length === 0 || targetResolution.shapeIds.length === 0) return null
	const expectedSet = new Set(expected)
	const falseTargets = targetResolution.shapeIds.filter((id) => !expectedSet.has(id)).length
	const rate = falseTargets / targetResolution.shapeIds.length
	if (fixture.expect.maxFalseTargetRate !== undefined && rate > fixture.expect.maxFalseTargetRate) {
		failures.push(`False-target rate ${rate}.`)
	}
	return rate
}

function getObjectRecall(
	fixture: CanvasAgentEvalFixture,
	observation: CanvasObservation,
	failures: string[]
) {
	const expected = fixture.expect.objectIds ?? []
	if (expected.length === 0) return null
	const observed = new Set(observation.objects.map((object) => object.id))
	const matched = expected.filter((id) => observed.has(id)).length
	const recall = matched / expected.length
	if (recall < 1) failures.push(`Object recall ${matched}/${expected.length}.`)
	return recall
}

function getVisibilityAccuracy(
	fixture: CanvasAgentEvalFixture,
	observation: CanvasObservation,
	failures: string[]
) {
	const expected = Object.entries(fixture.expect.visibility ?? {})
	if (expected.length === 0) return null
	const objectsById = new Map(observation.objects.map((object) => [object.id, object]))
	const matched = expected.filter(
		([id, visibility]) => objectsById.get(id as SimpleShapeId)?.visibility === visibility
	).length
	const accuracy = matched / expected.length
	if (accuracy < 1) failures.push(`Visibility accuracy ${matched}/${expected.length}.`)
	return accuracy
}

function getRelationRecall(
	fixture: CanvasAgentEvalFixture,
	observation: CanvasObservation,
	failures: string[]
) {
	const expected = fixture.expect.relations ?? []
	if (expected.length === 0) return null
	const matched = expected.filter((expectedRelation) =>
		observation.relations.some(
			(relation) =>
				relation.type === expectedRelation.type &&
				relation.sourceId === expectedRelation.sourceId &&
				relation.targetId === expectedRelation.targetId
		)
	).length
	const recall = matched / expected.length
	if (recall < 1) failures.push(`Relation recall ${matched}/${expected.length}.`)
	return recall
}

function getPostconditionPassRate(trajectory: AgentTrajectory) {
	const verifications = trajectory.verifications
	if (verifications.length === 0) return null
	const passed = verifications.filter((verification) => verification.result.ok).length
	return passed / verifications.length
}

function getFinalLintCount(observation: CanvasObservation) {
	return (
		observation.taskAffordances.overflowedTextCandidates.length +
		observation.taskAffordances.unboundArrows.length +
		observation.taskAffordances.overlappingLabels.length
	)
}

function scoreFixture(
	failures: string[],
	metrics: Pick<
		CanvasAgentEvalMetrics,
		| 'objectRecall'
		| 'visibilityAccuracy'
		| 'relationRecall'
		| 'selectorAccuracy'
		| 'ambiguitySafeFailRate'
		| 'postconditionPassRate'
	>
): 0 | 1 | 2 | 3 | 4 {
	if (failures.length === 0) return 4
	const values = [
		metrics.objectRecall,
		metrics.visibilityAccuracy,
		metrics.relationRecall,
		metrics.selectorAccuracy,
		metrics.ambiguitySafeFailRate,
		metrics.postconditionPassRate,
	].filter((value): value is number => value !== null)
	if (values.length === 0) return 0
	const average = values.reduce((total, value) => total + value, 0) / values.length
	if (average >= 0.95) return 3
	if (average >= 0.8) return 2
	if (average >= 0.4) return 1
	return 0
}
