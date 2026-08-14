import type { BoxModel } from 'tldraw'
import type {
	CanvasObservation,
	CanvasObservationDetailLevel,
	CanvasObservationRelation,
	CanvasObservationVisibilityState,
} from './CanvasObservation'
import type { FocusedShape } from './FocusedShape'
import type { SimpleShapeId } from '../types/ids-schema'

/**
 * The compact, action-aligned subset of CanvasObservation shown to the model.
 *
 * CanvasObservation itself retains page, prompt, and screenshot geometry for
 * diagnostics. Mixing those coordinate systems in one model payload made it
 * easy to identify the right object but emit the wrong action coordinates.
 * This view deliberately exposes one geometry field only: actionBounds.
 */
export interface PromptCanvasObservationObject {
	id: SimpleShapeId
	type: FocusedShape['_type']
	subtype: string
	text?: string
	note?: string
	/** Present only when legacy viewport summaries do not expose this object. */
	actionBounds?: BoxModel
	rotationDegrees: number
	zIndex: number
	parentId: SimpleShapeId | null
	groupId: SimpleShapeId | null
	frameId: SimpleShapeId | null
	style: {
		color?: string
		fill?: string
		fontSize?: string | number
		opacity?: number
	}
	flags: {
		selected: boolean
		context: boolean
		locked: boolean
		hidden: boolean
	}
	visibility: CanvasObservationVisibilityState
	detailLevel: CanvasObservationDetailLevel
}

export interface PromptCanvasObservation {
	version: 1
	pageId: string
	coordinateSpace: 'prompt/action coordinates'
	objectCount: number
	objects: PromptCanvasObservationObject[]
	relations: CanvasObservationRelation[]
}

export function buildPromptCanvasObservation(
	observation: CanvasObservation
): PromptCanvasObservation {
	return {
		version: 1,
		pageId: observation.pageId,
		coordinateSpace: 'prompt/action coordinates',
		objectCount: observation.objectCount,
		objects: observation.objects.map((object) => {
			const isOffscreen =
				object.visibility === 'offscreen-near' || object.visibility === 'offscreen-far'
			return {
				id: object.id,
				type: object.type,
				subtype: object.subtype,
				text: object.text,
				note: object.note,
				actionBounds: isOffscreen ? { ...object.promptBounds } : undefined,
				rotationDegrees: roundDegrees((object.rotation * 180) / Math.PI),
				zIndex: object.zIndex,
				parentId: object.parentId,
				groupId: object.groupId,
				frameId: object.frameId,
				style: { ...object.style },
				flags: { ...object.flags },
				visibility: object.visibility,
				detailLevel: object.detailLevel,
			}
		}),
		relations: observation.relations.map((relation) => ({
			...relation,
			measurements: relation.measurements ? { ...relation.measurements } : undefined,
		})),
	}
}

function roundDegrees(value: number) {
	return Math.round(value * 100) / 100
}
