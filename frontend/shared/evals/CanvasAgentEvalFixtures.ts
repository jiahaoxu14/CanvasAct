import type {
	CanvasObservationRelationType,
	CanvasObservationVisibilityState,
} from '../format/CanvasObservation'
import type { SimpleShapeId } from '../types/ids-schema'

export type CanvasAgentEvalKind = 'observation'

export interface CanvasAgentEvalExpectedRelation {
	type: CanvasObservationRelationType
	sourceId: SimpleShapeId
	targetId: SimpleShapeId
}

export interface CanvasAgentEvalExpectations {
	objectIds?: SimpleShapeId[]
	visibility?: Partial<Record<SimpleShapeId, CanvasObservationVisibilityState>>
	relations?: CanvasAgentEvalExpectedRelation[]
}

export interface CanvasAgentEvalFixture {
	id: string
	kind: CanvasAgentEvalKind
	description: string
	request: string
	expect: CanvasAgentEvalExpectations
}

/**
 * CanvasAct now changes perception only. These deterministic fixtures therefore
 * evaluate CanvasObservation itself, not selectors, action contracts, chunks,
 * repair loops, or a separate reviewer.
 */
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
]
