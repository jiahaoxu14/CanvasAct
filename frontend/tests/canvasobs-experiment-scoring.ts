import assert from 'node:assert/strict'
import {
	CANVAS_OBS_EXPERIMENT_CASES,
	CANVAS_OBS_EXPERIMENT_CASE_IDS,
	getCanvasObsExperimentCase,
	type CanvasObsExperimentBounds,
	type CanvasObsExperimentRotation,
} from '../shared/evals/CanvasObsExperimentFixtures'
import {
	scoreCanvasObsExperimentFinalStore,
	type CanvasObsExperimentFinalStore,
} from '../shared/evals/CanvasObsExperimentScoring'

assert.deepEqual(
	CANVAS_OBS_EXPERIMENT_CASES.map((definition) => definition.id),
	CANVAS_OBS_EXPERIMENT_CASE_IDS,
)
assert.deepEqual(
	CANVAS_OBS_EXPERIMENT_CASES.map((definition) => definition.rotations.length),
	[3, 3, 2, 2],
)

let assertionCount = 2

for (const definition of CANVAS_OBS_EXPERIMENT_CASES) {
	for (const rotation of definition.rotations) {
		const canonical = scoreCanvasObsExperimentFinalStore(
			definition.id,
			rotation.id,
			buildFinalStore(definition.id, rotation, 'canonical'),
		)
		assert.equal(canonical.grounding.passed, true, `${definition.id}/${rotation.id} grounding`)
		assert.equal(canonical.geometry.passed, true, `${definition.id}/${rotation.id} geometry`)
		assert.equal(canonical.relation.passed, true, `${definition.id}/${rotation.id} relation`)
		assert.equal(canonical.collateral.passed, true, `${definition.id}/${rotation.id} collateral`)
		assert.equal(canonical.overallPassed, true, `${definition.id}/${rotation.id} overall`)

		const wrong = scoreCanvasObsExperimentFinalStore(
			definition.id,
			rotation.id,
			buildFinalStore(definition.id, rotation, 'wrong-target'),
		)
		assert.equal(wrong.grounding.passed, false, `${definition.id}/${rotation.id} wrong target`)
		assert.ok(wrong.grounding.missedTargetIds.length > 0)
		assert.ok(wrong.grounding.wrongTargetIds.length > 0)
		assert.equal(wrong.overallPassed, false)
		assertionCount += 9
	}
}

const geometryCase = getCanvasObsExperimentCase('viewport-coverage')
const geometryRotation = geometryCase.rotations[1]
const partialStore = buildFinalStore('viewport-coverage', geometryRotation, 'canonical')
const targetId = geometryRotation.expectedTargetIds[0]
const target = partialStore.shapes[targetId]
assert.ok(target)
partialStore.shapes[targetId] = {
	...target,
	bounds: { ...target.bounds, x: geometryCase.destination.bounds.x - 20 },
}
const partialScore = scoreCanvasObsExperimentFinalStore(
	'viewport-coverage',
	geometryRotation.id,
	partialStore,
)
assert.equal(partialScore.grounding.passed, true)
assert.equal(partialScore.geometry.passed, false)
assert.equal(partialScore.overallPassed, false)
assertionCount += 4

const structureCase = getCanvasObsExperimentCase('workspace-structure')
const structureRotation = structureCase.rotations[0]
const grownTextStore = buildFinalStore('workspace-structure', structureRotation, 'canonical')
for (const targetId of structureRotation.expectedTargetIds) {
	const initial = grownTextStore.initialShapes[targetId]
	const final = grownTextStore.shapes[targetId]
	assert.ok(initial && final)
	grownTextStore.initialShapes[targetId] = {
		...initial,
		bounds: { ...initial.bounds, h: 112.5 },
		stateFingerprint: 'original-style',
	}
	grownTextStore.shapes[targetId] = {
		...final,
		bounds: { ...final.bounds, h: 112.5 },
		stateFingerprint: 'original-style',
	}
}
const grownTextScore = scoreCanvasObsExperimentFinalStore(
	'workspace-structure',
	structureRotation.id,
	grownTextStore,
)
assert.equal(grownTextScore.geometry.resizedTargetIds.length, 0)
assert.equal(grownTextScore.geometry.passed, true)

const renderedFallbackStore = buildFinalStore(
	'workspace-structure',
	structureRotation,
	'canonical',
)
const { initialShapes: _initialShapes, ...storeWithoutInitialProjection } = renderedFallbackStore
const renderedFallbackScore = scoreCanvasObsExperimentFinalStore(
	'workspace-structure',
	structureRotation.id,
	storeWithoutInitialProjection,
)
assert.equal(renderedFallbackScore.geometry.resizedTargetIds.length, 0)
assert.equal(renderedFallbackScore.geometry.passed, true)

const styleMutationStore = buildFinalStore('workspace-structure', structureRotation, 'canonical')
const styleTargetId = structureRotation.expectedTargetIds[0]
styleMutationStore.initialShapes[styleTargetId].stateFingerprint = 'original-style'
styleMutationStore.shapes[styleTargetId].stateFingerprint = 'changed-style'
const styleMutationScore = scoreCanvasObsExperimentFinalStore(
	'workspace-structure',
	structureRotation.id,
	styleMutationStore,
)
assert.deepEqual(styleMutationScore.geometry.stateChangedTargetIds, [styleTargetId])
assert.equal(styleMutationScore.geometry.passed, false)
assert.equal(styleMutationScore.overallPassed, false)
assertionCount += 7

console.log(`CanvasObs experiment scoring checks passed (${assertionCount} assertions).`)

function buildFinalStore(
	caseId: (typeof CANVAS_OBS_EXPERIMENT_CASE_IDS)[number],
	rotation: CanvasObsExperimentRotation,
	outcome: 'canonical' | 'wrong-target',
): CanvasObsExperimentFinalStore & {
	initialShapes: Record<string, { id: string; bounds: CanvasObsExperimentBounds; stateFingerprint?: string }>
	shapes: Record<string, { id: string; bounds: CanvasObsExperimentBounds }>
} {
	const definition = getCanvasObsExperimentCase(caseId)
	const initialShapes: Record<
		string,
		{ id: string; bounds: CanvasObsExperimentBounds; stateFingerprint?: string }
	> = {}
	const shapes: Record<string, { id: string; bounds: CanvasObsExperimentBounds }> = {}
	for (const [id, sourceBounds] of Object.entries(definition.candidateSourceBounds)) {
		initialShapes[id] = { id, bounds: { ...sourceBounds } }
		shapes[id] = { id, bounds: { ...sourceBounds } }
	}
	shapes[definition.destination.id] = {
		id: definition.destination.id,
		bounds: { ...definition.destination.bounds },
	}

	let movedIds: readonly string[]
	if (outcome === 'canonical') {
		movedIds = rotation.expectedTargetIds
	} else {
		const alternatives = Object.keys(definition.candidateSourceBounds).filter(
			(id) => !rotation.expectedTargetIds.includes(id),
		)
		movedIds = alternatives.slice(0, rotation.expectedTargetIds.length)
	}

	const placements = Object.values(rotation.canonicalPlacements)
	for (const [index, id] of movedIds.entries()) {
		const placement = placements[index] ?? placements[0]
		shapes[id] = { id, bounds: { ...placement } }
	}

	const arrowBindings = rotation.expectedRelation
		? [
				{
					arrowId: rotation.expectedRelation.arrowId,
					terminal: 'start' as const,
					targetId: rotation.expectedRelation.sourceId,
				},
				{
					arrowId: rotation.expectedRelation.arrowId,
					terminal: 'end' as const,
					targetId: rotation.expectedRelation.targetId,
				},
			]
		: []

	return {
		initialShapes,
		shapes,
		arrowBindings,
		mutations: {
			addedShapeIds: [],
			updatedShapeIds: movedIds,
			removedShapeIds: [],
		},
	}
}
