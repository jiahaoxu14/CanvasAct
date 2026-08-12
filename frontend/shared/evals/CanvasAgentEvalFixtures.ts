import type { CanvasObservationRelationType, CanvasObservationVisibilityState } from '../format/CanvasObservation'
import type { SimpleShapeId } from '../types/ids-schema'

export type CanvasAgentEvalKind = 'observation' | 'selector' | 'action' | 'lint' | 'task'

export interface CanvasAgentEvalExpectedRelation {
	type: CanvasObservationRelationType
	sourceId: SimpleShapeId
	targetId: SimpleShapeId
}

export interface CanvasAgentEvalExpectations {
	objectIds?: SimpleShapeId[]
	visibility?: Partial<Record<SimpleShapeId, CanvasObservationVisibilityState>>
	relations?: CanvasAgentEvalExpectedRelation[]
	expectAmbiguousResolution?: boolean
	requiresChunkedActions?: boolean
	maxRepairLoopCount?: number
	maxVerificationFailures?: number
	minVerificationFailures?: number
	minPostconditionPassRate?: number
	maxGeometryErrorPx?: number
	maxUnrelatedShapeMutations?: number
	maxFalseTargetRate?: number
	maxFinalLintCount?: number
	minFinalLintCount?: number
}

export interface CanvasAgentEvalFixture {
	id: string
	kind: CanvasAgentEvalKind
	description: string
	request: string
	expect: CanvasAgentEvalExpectations
}

export const INITIAL_CANVAS_AGENT_EVAL_FIXTURES: CanvasAgentEvalFixture[] = [
	{
		id: 'observation_partial_visibility',
		kind: 'observation',
		description: 'Partially visible shapes remain represented with partial visibility.',
		request: 'Inspect the current viewport.',
		expect: {
			objectIds: ['partial-left' as SimpleShapeId, 'partial-right' as SimpleShapeId],
			visibility: {
				['partial-left' as SimpleShapeId]: 'partial',
				['partial-right' as SimpleShapeId]: 'partial',
			},
		},
	},
	{
		id: 'observation_arrow_relations',
		kind: 'observation',
		description: 'Bound and unbound arrow endpoints appear as explicit relations.',
		request: 'Inspect the arrows.',
		expect: {
			objectIds: [
				'start' as SimpleShapeId,
				'end' as SimpleShapeId,
				'bound-arrow' as SimpleShapeId,
				'unbound-arrow' as SimpleShapeId,
			],
			relations: [
				{
					type: 'arrow-connects',
					sourceId: 'start' as SimpleShapeId,
					targetId: 'end' as SimpleShapeId,
				},
				{
					type: 'unbound-arrow-endpoint',
					sourceId: 'unbound-arrow' as SimpleShapeId,
					targetId: 'unbound-arrow' as SimpleShapeId,
				},
			],
		},
	},
	{
		id: 'observation_selected_offscreen',
		kind: 'observation',
		description: 'Selected or context shapes survive viewport filtering when offscreen.',
		request: 'Use the selected offscreen shape.',
		expect: {
			objectIds: ['selected-offscreen' as SimpleShapeId],
			visibility: {
				['selected-offscreen' as SimpleShapeId]: 'offscreen-near',
			},
		},
	},
	{
		id: 'selector_selected_shapes',
		kind: 'selector',
		description: 'Common selected-shape references do not require model-emitted ids.',
		request: 'Align these.',
		expect: {
			objectIds: ['selected-a' as SimpleShapeId, 'selected-b' as SimpleShapeId],
		},
	},
	{
		id: 'selector_ambiguous_label',
		kind: 'selector',
		description: 'Ambiguous duplicate labels fail safely instead of choosing an arbitrary target.',
		request: 'Move the duplicate label.',
		expect: {
			objectIds: ['duplicate-label-a' as SimpleShapeId, 'duplicate-label-b' as SimpleShapeId],
			expectAmbiguousResolution: true,
			maxFalseTargetRate: 0,
		},
	},
	{
		id: 'selector_ambiguous_label_with_max',
		kind: 'selector',
		description: 'Selector max never truncates duplicate matches before expect-one validation.',
		request: 'Move the duplicate label.',
		expect: {
			objectIds: ['duplicate-label-a' as SimpleShapeId, 'duplicate-label-b' as SimpleShapeId],
			expectAmbiguousResolution: true,
			maxFalseTargetRate: 0,
		},
	},
	{
		id: 'action_align_selected',
		kind: 'action',
		description: 'Selected shapes can be aligned deterministically without mutating unrelated shapes.',
		request: 'Align these to the left.',
		expect: {
			objectIds: ['align-a' as SimpleShapeId, 'align-b' as SimpleShapeId],
			minPostconditionPassRate: 1,
			maxGeometryErrorPx: 1,
			maxUnrelatedShapeMutations: 0,
		},
	},
	{
		id: 'action_move_ambiguous_selector',
		kind: 'action',
		description: 'Ambiguous move selectors fail safely instead of moving one matching shape.',
		request: 'Move the duplicate label.',
		expect: {
			objectIds: ['duplicate-label-a' as SimpleShapeId, 'duplicate-label-b' as SimpleShapeId],
			minPostconditionPassRate: 1,
			maxUnrelatedShapeMutations: 0,
			minVerificationFailures: 1,
		},
	},
	{
		id: 'action_move_ambiguous_hardcoded',
		kind: 'action',
		description: 'Hard-coded move ids are rejected when the request text matches duplicate labels.',
		request: 'Move the duplicate label.',
		expect: {
			objectIds: ['duplicate-label-a' as SimpleShapeId, 'duplicate-label-b' as SimpleShapeId],
			minPostconditionPassRate: 1,
			maxUnrelatedShapeMutations: 0,
			minVerificationFailures: 1,
		},
	},
	{
		id: 'case_study_1_ambiguous_place',
		kind: 'action',
		description: 'Case Study 1 safe-fails before moving any duplicated launch brief.',
		request: 'Move the LAUNCH BRIEF into READY FOR LEGAL.',
		expect: {
			minPostconditionPassRate: 1,
			maxUnrelatedShapeMutations: 0,
			minVerificationFailures: 1,
		},
	},
	{
		id: 'action_place_inside_unique',
		kind: 'action',
		description: 'A clarified unique brief is placed inside the destination and verified locally.',
		request: 'Move the NORTHSTAR campaign launch brief into READY FOR LEGAL.',
		expect: {
			minPostconditionPassRate: 1,
			maxVerificationFailures: 0,
		},
	},
	{
		id: 'case_study_1_partial_visibility_place',
		kind: 'action',
		description:
			'Case Study 1 uses a unique partial-visibility qualifier to move only the clipped duplicate card.',
		request:
			'Move the partially visible LAUNCH BRIEF at the right edge into READY FOR LEGAL.',
		expect: {
			minPostconditionPassRate: 1,
			maxUnrelatedShapeMutations: 0,
			maxVerificationFailures: 0,
		},
	},
	{
		id: 'case_study_2_build_flow',
		kind: 'action',
		description: 'Case Study 2 builds an ordered flow with one bound connector per adjacent pair.',
		request: 'Build the five-step incident workflow in the requested order.',
		expect: {
			minPostconditionPassRate: 1,
			maxGeometryErrorPx: 1,
			maxUnrelatedShapeMutations: 0,
			maxVerificationFailures: 0,
		},
	},
	{
		id: 'lint_text_overlap',
		kind: 'lint',
		description: 'Overlapping labels are detected and reported by local verification.',
		request: 'Detect the overlapping text.',
		expect: {
			minFinalLintCount: 1,
			minVerificationFailures: 1,
		},
	},
	{
		id: 'task_fix_unbound_arrows',
		kind: 'task',
		description: 'Unbound arrows are repaired and verified.',
		request: 'Fix the arrows that are not connected.',
		expect: {
			requiresChunkedActions: true,
			maxFinalLintCount: 0,
			maxRepairLoopCount: 2,
			minPostconditionPassRate: 1,
		},
	},
	{
		id: 'task_clean_cluster',
		kind: 'task',
		description: 'A messy cluster is cleaned through observe-execute-verify loops.',
		request: 'Clean up this messy cluster without changing the text.',
		expect: {
			requiresChunkedActions: true,
			maxRepairLoopCount: 2,
			maxVerificationFailures: 0,
			minPostconditionPassRate: 1,
		},
	},
]
