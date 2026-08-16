export const CANVAS_OBS_EXPERIMENT_CASE_IDS = [
	'viewport-coverage',
	'object-state',
	'workspace-structure',
	'explicit-relations',
] as const

export type CanvasObsExperimentCaseId = (typeof CANVAS_OBS_EXPERIMENT_CASE_IDS)[number]

export type CanvasObsExperimentBounds = Readonly<{
	x: number
	y: number
	w: number
	h: number
}>

export type CanvasObsExperimentManipulation =
	| {
			kind: 'lock-state'
			unlockedId: string
			lockedIds: readonly string[]
	  }
	| {
			kind: 'hidden-color'
			colorsById: Readonly<Record<string, 'orange' | 'blue' | 'yellow' | 'light-violet'>>
			topShapeId: string
	  }
	| {
			kind: 'frame-membership'
			frameId: string
			attachedIds: readonly string[]
			looseIds: readonly string[]
	  }
	| {
			kind: 'arrow-binding'
			evidenceId: string
			boundFindingId: string
			unboundFindingId: string
			boundArrowId: string
			looseArrowId: string
	  }

export interface CanvasObsExperimentExpectedRelation {
	type: 'arrow-connects'
	arrowId: string
	sourceId: string
	targetId: string
}

export interface CanvasObsExperimentRotation {
	id: string
	label: string
	expectedTargetIds: readonly string[]
	canonicalPlacements: Readonly<Record<string, CanvasObsExperimentBounds>>
	manipulation: CanvasObsExperimentManipulation
	expectedRelation?: CanvasObsExperimentExpectedRelation
}

export interface CanvasObsExperimentCase {
	id: CanvasObsExperimentCaseId
	completedBefore: 0 | 1 | 2 | 3
	prompt: string
	candidateSourceBounds: Readonly<Record<string, CanvasObsExperimentBounds>>
	destination: Readonly<{
		id: string
		label: string
		bounds: CanvasObsExperimentBounds
		minimumInset: number
	}>
	rotations: readonly CanvasObsExperimentRotation[]
}

export function getCanvasObsExperimentShapeId(
	caseId: CanvasObsExperimentCaseId,
	localId: string,
) {
	return `shape:obs-${caseId}-${localId}`
}

const shapeId = getCanvasObsExperimentShapeId
const bounds = (x: number, y: number, w: number, h: number): CanvasObsExperimentBounds => ({
	x,
	y,
	w,
	h,
})

const viewportIds = {
	top: shapeId('viewport-coverage', 'k2m9'),
	middle: shapeId('viewport-coverage', 'n7q4'),
	bottom: shapeId('viewport-coverage', 'r8v3'),
} as const
const viewportSources = {
	[viewportIds.top]: bounds(2315, 210, 240, 95),
	[viewportIds.middle]: bounds(2315, 380, 240, 95),
	[viewportIds.bottom]: bounds(2315, 550, 240, 95),
} as const

const objectIds = {
	bottom: shapeId('object-state', 'v7p2'),
	middle: shapeId('object-state', 'm4q8'),
	upperHidden: shapeId('object-state', 'c9r5'),
	top: shapeId('object-state', 'h3n6'),
} as const
const objectSources = {
	[objectIds.bottom]: bounds(125, 625, 190, 95),
	[objectIds.middle]: bounds(125, 625, 190, 95),
	[objectIds.upperHidden]: bounds(125, 625, 190, 95),
	[objectIds.top]: bounds(125, 625, 190, 95),
} as const

const structureIds = {
	frameA: shapeId('workspace-structure', 'f1u6'),
	callsTeams: shapeId('workspace-structure', 'u2c7'),
	callsDuration: shapeId('workspace-structure', 'r9m1'),
	diariesTeams: shapeId('workspace-structure', 'b6k4'),
	diariesDuration: shapeId('workspace-structure', 't4v8'),
} as const
// tldraw's text layout grows these 90 px authored cards to this rendered page height.
// Runtime scoring prefers its captured initial bounds; this value is the deterministic fallback.
const STRUCTURE_RENDERED_HEIGHT = 104.890625
const structureSources = {
	[structureIds.callsTeams]: bounds(60, 190, 90, STRUCTURE_RENDERED_HEIGHT),
	[structureIds.callsDuration]: bounds(170, 300, 90, STRUCTURE_RENDERED_HEIGHT),
	[structureIds.diariesTeams]: bounds(170, 190, 90, STRUCTURE_RENDERED_HEIGHT),
	[structureIds.diariesDuration]: bounds(60, 300, 90, STRUCTURE_RENDERED_HEIGHT),
} as const

const relationIds = {
	evidence: shapeId('explicit-relations', 'e2s6'),
	upperFinding: shapeId('explicit-relations', 'q4w8'),
	lowerFinding: shapeId('explicit-relations', 'l7n3'),
	upperArrow: shapeId('explicit-relations', 'a5d9'),
	lowerArrow: shapeId('explicit-relations', 'a8p2'),
} as const
const relationSources = {
	[relationIds.upperFinding]: bounds(1350, 175, 170, 95),
	[relationIds.lowerFinding]: bounds(1350, 305, 170, 95),
} as const

const singlePlacement = (targetId: string, placement: CanvasObsExperimentBounds) => ({
	[targetId]: placement,
})

export const CANVAS_OBS_EXPERIMENT_CASES: readonly CanvasObsExperimentCase[] = [
	{
		id: 'viewport-coverage',
		completedBefore: 0,
		prompt:
			'Move the editable copy of “Unclear ownership delays handoffs” into the Key slot in Friday’s report.',
		candidateSourceBounds: viewportSources,
		destination: {
			id: shapeId('viewport-coverage', 's7y3'),
			label: 'Key',
			bounds: bounds(650, 645, 260, 115),
			minimumInset: 8,
		},
		rotations: [
			lockRotation('editable-top', 'Top copy is editable', viewportIds.top),
			lockRotation('editable-middle', 'Middle copy is editable', viewportIds.middle),
			lockRotation('editable-bottom', 'Bottom copy is editable', viewportIds.bottom),
		],
	},
	{
		id: 'object-state',
		completedBefore: 1,
		prompt:
			'Move the blue “Handoff breakdown” chart into the Chart slot in Friday’s report.',
		candidateSourceBounds: objectSources,
		destination: {
			id: shapeId('object-state', 'f3r7'),
			label: 'Chart',
			bounds: bounds(420, 645, 220, 115),
			minimumInset: 8,
		},
		rotations: [
			colorRotation('blue-bottom', 'Bottom hidden chart is blue', objectIds.bottom, {
				[objectIds.bottom]: 'blue',
				[objectIds.middle]: 'orange',
				[objectIds.upperHidden]: 'yellow',
				[objectIds.top]: 'light-violet',
			}),
			colorRotation('blue-middle', 'Middle hidden chart is blue', objectIds.middle, {
				[objectIds.bottom]: 'orange',
				[objectIds.middle]: 'blue',
				[objectIds.upperHidden]: 'yellow',
				[objectIds.top]: 'light-violet',
			}),
			colorRotation(
				'blue-upper-hidden',
				'Upper hidden chart is blue',
				objectIds.upperHidden,
				{
					[objectIds.bottom]: 'orange',
					[objectIds.middle]: 'yellow',
					[objectIds.upperHidden]: 'blue',
					[objectIds.top]: 'light-violet',
				},
			),
		],
	},
	{
		id: 'workspace-structure',
		completedBefore: 2,
		prompt:
			'Two cards were accidentally pasted over Study setup A instead of filed inside it. Move those loose cards into Study setup B.',
		candidateSourceBounds: structureSources,
		destination: {
			id: shapeId('workspace-structure', 'f2u7'),
			label: 'Study setup B',
			bounds: bounds(300, 130, 240, 320),
			minimumInset: 8,
		},
		rotations: [
			membershipRotation(
				'calls-attached',
				'Calls are attached; diaries are loose',
				[structureIds.callsTeams, structureIds.callsDuration],
				[structureIds.diariesTeams, structureIds.diariesDuration],
			),
			membershipRotation(
				'diaries-attached',
				'Diaries are attached; calls are loose',
				[structureIds.diariesTeams, structureIds.diariesDuration],
				[structureIds.callsTeams, structureIds.callsDuration],
			),
		],
	},
	{
		id: 'explicit-relations',
		completedBefore: 3,
		prompt:
			'Move the “Lost decision context” finding supported by Interview evidence into the Claim slot in Friday’s report.',
		candidateSourceBounds: relationSources,
		destination: {
			id: shapeId('explicit-relations', 'c6p2'),
			label: 'Claim',
			bounds: bounds(920, 645, 220, 115),
			minimumInset: 8,
		},
		rotations: [
			bindingRotation(
				'upper-bound',
				'Upper finding has the native evidence binding',
				relationIds.upperFinding,
				relationIds.lowerFinding,
				relationIds.upperArrow,
				relationIds.lowerArrow,
			),
			bindingRotation(
				'lower-bound',
				'Lower finding has the native evidence binding',
				relationIds.lowerFinding,
				relationIds.upperFinding,
				relationIds.lowerArrow,
				relationIds.upperArrow,
			),
		],
	},
] as const

const caseById = new Map(CANVAS_OBS_EXPERIMENT_CASES.map((definition) => [definition.id, definition]))

export function getCanvasObsExperimentCase(caseId: CanvasObsExperimentCaseId) {
	const definition = caseById.get(caseId)
	if (!definition) throw new Error(`Unknown CanvasObs experiment case: ${caseId}`)
	return definition
}

export function getCanvasObsExperimentRotation(caseId: CanvasObsExperimentCaseId, rotationId: string) {
	const rotation = getCanvasObsExperimentCase(caseId).rotations.find(
		(candidate) => candidate.id === rotationId,
	)
	if (!rotation) {
		throw new Error(`Unknown CanvasObs experiment rotation: ${caseId}/${rotationId}`)
	}
	return rotation
}

function lockRotation(id: string, label: string, unlockedId: string): CanvasObsExperimentRotation {
	return {
		id,
		label,
		expectedTargetIds: [unlockedId],
		canonicalPlacements: singlePlacement(unlockedId, bounds(660, 655, 240, 95)),
		manipulation: {
			kind: 'lock-state',
			unlockedId,
			lockedIds: Object.values(viewportIds).filter((candidate) => candidate !== unlockedId),
		},
	}
}

function colorRotation(
	id: string,
	label: string,
	blueId: string,
	colorsById: Extract<CanvasObsExperimentManipulation, { kind: 'hidden-color' }>['colorsById'],
): CanvasObsExperimentRotation {
	return {
		id,
		label,
		expectedTargetIds: [blueId],
		canonicalPlacements: singlePlacement(blueId, bounds(435, 655, 190, 95)),
		manipulation: { kind: 'hidden-color', colorsById, topShapeId: objectIds.top },
	}
}

function membershipRotation(
	id: string,
	label: string,
	attachedIds: readonly string[],
	looseIds: readonly string[],
): CanvasObsExperimentRotation {
	return {
		id,
		label,
		expectedTargetIds: looseIds,
		canonicalPlacements: {
			[looseIds[0]]: bounds(320, 190, 90, STRUCTURE_RENDERED_HEIGHT),
			[looseIds[1]]: bounds(430, 190, 90, STRUCTURE_RENDERED_HEIGHT),
		},
		manipulation: {
			kind: 'frame-membership',
			frameId: structureIds.frameA,
			attachedIds,
			looseIds,
		},
	}
}

function bindingRotation(
	id: string,
	label: string,
	boundFindingId: string,
	unboundFindingId: string,
	boundArrowId: string,
	looseArrowId: string,
): CanvasObsExperimentRotation {
	return {
		id,
		label,
		expectedTargetIds: [boundFindingId],
		canonicalPlacements: singlePlacement(boundFindingId, bounds(945, 655, 170, 95)),
		manipulation: {
			kind: 'arrow-binding',
			evidenceId: relationIds.evidence,
			boundFindingId,
			unboundFindingId,
			boundArrowId,
			looseArrowId,
		},
		expectedRelation: {
			type: 'arrow-connects',
			arrowId: boundArrowId,
			sourceId: relationIds.evidence,
			targetId: boundFindingId,
		},
	}
}
