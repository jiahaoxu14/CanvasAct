import type { CanvasObservation } from '../format/CanvasObservation'
import type { AgentTrajectory } from '../types/AgentTrajectory'
import type { SimpleShapeId } from '../types/ids-schema'
import type { CanvasAgentEvalFixture } from './CanvasAgentEvalFixtures'

export interface CanvasAgentEvalMetrics {
	objectRecall: number | null
	visibilityAccuracy: number | null
	relationRecall: number | null
	postconditionPassRate: number | null
	repairLoopCount: number | null
	verificationFailureCount: number | null
	finalLintCount: number | null
	chunkedActionCount: number | null
	score: 0 | 1 | 2 | 3
	passed: boolean
	failures: string[]
}

export interface CanvasAgentEvalRunInput {
	fixtures: CanvasAgentEvalFixture[]
	observations?: Partial<Record<string, CanvasObservation>>
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
			input.trajectories?.[fixture.id] ?? null
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
	trajectory: AgentTrajectory | null
): CanvasAgentEvalMetrics {
	const failures: string[] = []
	const objectRecall = observation ? getObjectRecall(fixture, observation, failures) : null
	const visibilityAccuracy = observation ? getVisibilityAccuracy(fixture, observation, failures) : null
	const relationRecall = observation ? getRelationRecall(fixture, observation, failures) : null
	const postconditionPassRate = trajectory ? getPostconditionPassRate(trajectory) : null
	const repairLoopCount = trajectory?.metrics.repairLoopCount ?? null
	const verificationFailureCount = trajectory?.metrics.verificationFailureCount ?? null
	const finalLintCount = observation ? getFinalLintCount(observation) : null
	const chunkedActionCount = trajectory?.metrics.chunkCount ?? null

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
		fixture.expect.minPostconditionPassRate !== undefined &&
		(postconditionPassRate ?? 0) < fixture.expect.minPostconditionPassRate
	) {
		failures.push(`Postcondition pass rate below ${fixture.expect.minPostconditionPassRate}.`)
	}
	if (
		fixture.expect.maxFinalLintCount !== undefined &&
		(finalLintCount ?? Number.POSITIVE_INFINITY) > fixture.expect.maxFinalLintCount
	) {
		failures.push(`Final lint count exceeded ${fixture.expect.maxFinalLintCount}.`)
	}

	return {
		objectRecall,
		visibilityAccuracy,
		relationRecall,
		postconditionPassRate,
		repairLoopCount,
		verificationFailureCount,
		finalLintCount,
		chunkedActionCount,
		score: scoreFixture(failures, {
			objectRecall,
			visibilityAccuracy,
			relationRecall,
			postconditionPassRate,
		}),
		passed: failures.length === 0,
		failures,
	}
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
		'objectRecall' | 'visibilityAccuracy' | 'relationRecall' | 'postconditionPassRate'
	>
): 0 | 1 | 2 | 3 {
	if (failures.length === 0) return 3
	const values = [
		metrics.objectRecall,
		metrics.visibilityAccuracy,
		metrics.relationRecall,
		metrics.postconditionPassRate,
	].filter((value): value is number => value !== null)
	if (values.length === 0) return 0
	const average = values.reduce((total, value) => total + value, 0) / values.length
	if (average >= 0.8) return 2
	if (average >= 0.4) return 1
	return 0
}
