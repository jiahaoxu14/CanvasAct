import type { CanvasObservation } from '../format/CanvasObservation'
import type { SimpleShapeId } from '../types/ids-schema'
import type { CanvasAgentEvalFixture } from './CanvasAgentEvalFixtures'

/** Metrics for the observation layer that remains in the CanvasObs prototype. */
export interface CanvasAgentEvalMetrics {
	objectRecall: number | null
	visibilityAccuracy: number | null
	relationRecall: number | null
	deterministic: boolean | null
	score: 0 | 1 | 2 | 3 | 4
	passed: boolean
	failures: string[]
}

export interface CanvasAgentEvalRunInput {
	fixtures: CanvasAgentEvalFixture[]
	observations: Partial<Record<string, CanvasObservation>>
	deterministicResults?: Partial<Record<string, boolean>>
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
			input.observations[fixture.id],
			input.deterministicResults?.[fixture.id],
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
	deterministic: boolean | undefined,
): CanvasAgentEvalMetrics {
	const failures: string[] = []
	if (!observation) failures.push('No CanvasObservation was produced for this fixture.')

	const objectRecall = observation ? getObjectRecall(fixture, observation, failures) : null
	const visibilityAccuracy = observation
		? getVisibilityAccuracy(fixture, observation, failures)
		: null
	const relationRecall = observation ? getRelationRecall(fixture, observation, failures) : null

	if (deterministic === false) {
		failures.push('Repeated CanvasObservation builds were not deterministic.')
	}

	return {
		objectRecall,
		visibilityAccuracy,
		relationRecall,
		deterministic: deterministic ?? null,
		score: scoreObservation(failures, [objectRecall, visibilityAccuracy, relationRecall]),
		passed: failures.length === 0,
		failures,
	}
}

function getObjectRecall(
	fixture: CanvasAgentEvalFixture,
	observation: CanvasObservation,
	failures: string[],
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
	failures: string[],
) {
	const expected = Object.entries(fixture.expect.visibility ?? {})
	if (expected.length === 0) return null
	const objectsById = new Map(observation.objects.map((object) => [object.id, object]))
	const matched = expected.filter(
		([id, visibility]) => objectsById.get(id as SimpleShapeId)?.visibility === visibility,
	).length
	const accuracy = matched / expected.length
	if (accuracy < 1) failures.push(`Visibility accuracy ${matched}/${expected.length}.`)
	return accuracy
}

function getRelationRecall(
	fixture: CanvasAgentEvalFixture,
	observation: CanvasObservation,
	failures: string[],
) {
	const expected = fixture.expect.relations ?? []
	if (expected.length === 0) return null
	const matched = expected.filter((expectedRelation) =>
		observation.relations.some(
			(relation) =>
				relation.type === expectedRelation.type &&
				relation.sourceId === expectedRelation.sourceId &&
				relation.targetId === expectedRelation.targetId,
		),
	).length
	const recall = matched / expected.length
	if (recall < 1) failures.push(`Relation recall ${matched}/${expected.length}.`)
	return recall
}

function scoreObservation(
	failures: string[],
	metrics: Array<number | null>,
): 0 | 1 | 2 | 3 | 4 {
	if (failures.length === 0) return 4
	const values = metrics.filter((value): value is number => value !== null)
	if (values.length === 0) return 0
	const average = values.reduce((total, value) => total + value, 0) / values.length
	if (average >= 0.95) return 3
	if (average >= 0.8) return 2
	if (average >= 0.4) return 1
	return 0
}
