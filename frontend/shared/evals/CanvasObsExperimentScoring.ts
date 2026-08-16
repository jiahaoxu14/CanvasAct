import {
	getCanvasObsExperimentCase,
	getCanvasObsExperimentRotation,
	type CanvasObsExperimentBounds,
	type CanvasObsExperimentCaseId,
} from './CanvasObsExperimentFixtures'

export interface CanvasObsExperimentShapeState {
	id: string
	bounds: CanvasObsExperimentBounds
	/** Stable non-geometric shape state, e.g. serialized text/style/rotation props. */
	stateFingerprint?: string
}

export interface CanvasObsExperimentArrowBindingState {
	arrowId: string
	terminal: 'start' | 'end'
	targetId: string
}

export interface CanvasObsExperimentMutationSummary {
	addedShapeIds: readonly string[]
	updatedShapeIds: readonly string[]
	removedShapeIds: readonly string[]
}

/** A serializable projection of the final store; scoring never needs an Editor instance. */
export interface CanvasObsExperimentFinalStore {
	/** Candidate state captured after rotation but before the agent runs. */
	initialShapes?: Readonly<Record<string, CanvasObsExperimentShapeState | undefined>>
	shapes: Readonly<Record<string, CanvasObsExperimentShapeState | undefined>>
	arrowBindings: readonly CanvasObsExperimentArrowBindingState[]
	mutations: CanvasObsExperimentMutationSummary
}

export interface CanvasObsExperimentScore {
	caseId: CanvasObsExperimentCaseId
	rotationId: string
	grounding: {
		passed: boolean
		expectedTargetIds: readonly string[]
		movedCandidateIds: string[]
		missedTargetIds: string[]
		wrongTargetIds: string[]
	}
	geometry: {
		passed: boolean
		notContainedIds: string[]
		resizedTargetIds: string[]
		stateChangedTargetIds: string[]
		overlapPairs: Array<readonly [string, string]>
	}
	relation: {
		applicable: boolean
		passed: boolean
	}
	collateral: {
		passed: boolean
		unexpectedAddedIds: string[]
		unexpectedUpdatedIds: string[]
		unexpectedRemovedIds: string[]
	}
	overallPassed: boolean
}

const EPSILON = 1e-6

export function scoreCanvasObsExperimentFinalStore(
	caseId: CanvasObsExperimentCaseId,
	rotationId: string,
	store: CanvasObsExperimentFinalStore,
): CanvasObsExperimentScore {
	const definition = getCanvasObsExperimentCase(caseId)
	const rotation = getCanvasObsExperimentRotation(caseId, rotationId)
	const expected = new Set(rotation.expectedTargetIds)
	const candidateIds = Object.keys(definition.candidateSourceBounds)
	const movedCandidateIds = candidateIds.filter((id) => {
		const finalShape = store.shapes[id]
		const source = store.initialShapes?.[id]?.bounds ?? definition.candidateSourceBounds[id]
		return !!finalShape && (different(finalShape.bounds.x, source.x) || different(finalShape.bounds.y, source.y))
	})
	const moved = new Set(movedCandidateIds)
	const missedTargetIds = rotation.expectedTargetIds.filter((id) => !moved.has(id))
	const wrongTargetIds = movedCandidateIds.filter((id) => !expected.has(id))
	const groundingPassed = missedTargetIds.length === 0 && wrongTargetIds.length === 0

	const innerDestination = insetBounds(
		definition.destination.bounds,
		definition.destination.minimumInset,
	)
	const notContainedIds = rotation.expectedTargetIds.filter((id) => {
		const shape = store.shapes[id]
		return !shape || !contains(innerDestination, shape.bounds)
	})
	const resizedTargetIds = rotation.expectedTargetIds.filter((id) => {
		const shape = store.shapes[id]
		const source = store.initialShapes?.[id]?.bounds ?? definition.candidateSourceBounds[id]
		return !shape || different(shape.bounds.w, source.w) || different(shape.bounds.h, source.h)
	})
	const stateChangedTargetIds = rotation.expectedTargetIds.filter((id) => {
		const initialFingerprint = store.initialShapes?.[id]?.stateFingerprint
		if (initialFingerprint === undefined) return false
		return store.shapes[id]?.stateFingerprint !== initialFingerprint
	})
	const overlapPairs: Array<readonly [string, string]> = []
	for (let index = 0; index < rotation.expectedTargetIds.length; index++) {
		for (let other = index + 1; other < rotation.expectedTargetIds.length; other++) {
			const firstId = rotation.expectedTargetIds[index]
			const secondId = rotation.expectedTargetIds[other]
			const first = store.shapes[firstId]
			const second = store.shapes[secondId]
			if (first && second && intersectionArea(first.bounds, second.bounds) > 1) {
				overlapPairs.push([firstId, secondId])
			}
		}
	}
	const geometryPassed =
		notContainedIds.length === 0 &&
		resizedTargetIds.length === 0 &&
		stateChangedTargetIds.length === 0 &&
		overlapPairs.length === 0

	const relationPassed = rotation.expectedRelation
		? hasArrowBinding(
				store.arrowBindings,
				rotation.expectedRelation.arrowId,
				'start',
				rotation.expectedRelation.sourceId,
			) &&
			hasArrowBinding(
				store.arrowBindings,
				rotation.expectedRelation.arrowId,
				'end',
				rotation.expectedRelation.targetId,
			)
		: true

	const allowedUpdatedIds = new Set(rotation.expectedTargetIds)
	if (rotation.expectedRelation) allowedUpdatedIds.add(rotation.expectedRelation.arrowId)
	const unexpectedAddedIds = [...store.mutations.addedShapeIds]
	const unexpectedUpdatedIds = store.mutations.updatedShapeIds.filter(
		(id) => !allowedUpdatedIds.has(id),
	)
	const unexpectedRemovedIds = [...store.mutations.removedShapeIds]
	const collateralPassed =
		unexpectedAddedIds.length === 0 &&
		unexpectedUpdatedIds.length === 0 &&
		unexpectedRemovedIds.length === 0

	return {
		caseId,
		rotationId,
		grounding: {
			passed: groundingPassed,
			expectedTargetIds: rotation.expectedTargetIds,
			movedCandidateIds,
			missedTargetIds,
			wrongTargetIds,
		},
		geometry: {
			passed: geometryPassed,
			notContainedIds,
			resizedTargetIds,
			stateChangedTargetIds,
			overlapPairs,
		},
		relation: {
			applicable: !!rotation.expectedRelation,
			passed: relationPassed,
		},
		collateral: {
			passed: collateralPassed,
			unexpectedAddedIds,
			unexpectedUpdatedIds,
			unexpectedRemovedIds,
		},
		overallPassed:
			groundingPassed && geometryPassed && relationPassed && collateralPassed,
	}
}

function different(first: number, second: number) {
	return Math.abs(first - second) > EPSILON
}

function insetBounds(bounds: CanvasObsExperimentBounds, inset: number) {
	return {
		x: bounds.x + inset,
		y: bounds.y + inset,
		w: Math.max(0, bounds.w - inset * 2),
		h: Math.max(0, bounds.h - inset * 2),
	}
}

function contains(container: CanvasObsExperimentBounds, child: CanvasObsExperimentBounds) {
	return (
		child.x >= container.x - EPSILON &&
		child.y >= container.y - EPSILON &&
		child.x + child.w <= container.x + container.w + EPSILON &&
		child.y + child.h <= container.y + container.h + EPSILON
	)
}

function intersectionArea(first: CanvasObsExperimentBounds, second: CanvasObsExperimentBounds) {
	const width = Math.max(
		0,
		Math.min(first.x + first.w, second.x + second.w) - Math.max(first.x, second.x),
	)
	const height = Math.max(
		0,
		Math.min(first.y + first.h, second.y + second.h) - Math.max(first.y, second.y),
	)
	return width * height
}

function hasArrowBinding(
	bindings: readonly CanvasObsExperimentArrowBindingState[],
	arrowId: string,
	terminal: 'start' | 'end',
	targetId: string,
) {
	return bindings.some(
		(binding) =>
			binding.arrowId === arrowId &&
			binding.terminal === terminal &&
			binding.targetId === targetId,
	)
}
