import type { BoxModel, VecModel } from 'tldraw'
import type { FocusedShape } from './FocusedShape'
import type { SimpleShapeId, TldrawShapeId } from '../types/ids-schema'

export type CanvasObservationVisibilityState =
	| 'visible'
	| 'partial'
	| 'offscreen-near'
	| 'offscreen-far'
	| 'occluded'

export type CanvasObservationDetailLevel = 'viewport' | 'nearby' | 'far'

export type CanvasObservationRelationType =
	| 'arrow-connects'
	| 'arrow-starts-at'
	| 'arrow-ends-at'
	| 'unbound-arrow-endpoint'
	| 'parent-contains-child'
	| 'frame-member'
	| 'group-member'
	| 'overlap'
	| 'touches'
	| 'near'
	| 'aligned-left'
	| 'aligned-right'
	| 'aligned-center-x'
	| 'aligned-center-y'
	| 'same-row'
	| 'same-column'
	| 'likely-label-of'
	| 'occludes'
	| 'behind'
	| 'reading-order-next'

export interface CanvasObservationCoordinateSpace {
	pageSpace: 'tldraw page coordinates'
	promptSpace: 'page coordinates minus promptOrigin'
	screenshotSpace: 'pixels relative to screenshotBounds'
	pageToPromptOffset: VecModel
}

export interface CanvasObservationScreenshotMetadata {
	bounds: BoxModel
	pixelSize: {
		w: number
		h: number
	}
	scale: number
}

export interface CanvasObservationObject {
	id: SimpleShapeId
	tldrawId: TldrawShapeId
	type: FocusedShape['_type']
	subtype: string
	text?: string
	note?: string
	pageBounds: BoxModel
	promptBounds: BoxModel
	center: VecModel
	promptCenter: VecModel
	rotation: number
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
	screenshotBounds: BoxModel | null
	focused: FocusedShape
}

export interface CanvasObservationRelation {
	type: CanvasObservationRelationType
	sourceId: SimpleShapeId
	targetId: SimpleShapeId
	confidence?: number
	measurements?: Record<string, string | number | boolean | null>
}

export interface CanvasObservationTile {
	id: string
	detailLevel: CanvasObservationDetailLevel
	bounds: BoxModel
	distance: number
	direction: string
	objectIds: SimpleShapeId[]
	importantObjectIds: SimpleShapeId[]
	typeHistogram: Record<string, number>
	representativeTexts: string[]
	relationLinks: CanvasObservationRelation[]
}

export interface CanvasObservationSpatialIndex {
	viewport: CanvasObservationTile
	nearby: CanvasObservationTile[]
	far: CanvasObservationTile[]
}

export interface CanvasObservationTaskAffordances {
	overflowedTextCandidates: SimpleShapeId[]
	unboundArrows: {
		shapeId: SimpleShapeId
		missingStart: boolean
		missingEnd: boolean
	}[]
	overlappingLabels: SimpleShapeId[][]
	detachedLabels: SimpleShapeId[]
	alignableRows: SimpleShapeId[][]
	alignableColumns: SimpleShapeId[][]
	flowchartChains: SimpleShapeId[][]
	isolatedClusters: SimpleShapeId[][]
	candidateContainers: SimpleShapeId[]
	candidateGroups: SimpleShapeId[][]
}

export interface CanvasObservationLimits {
	maxObjects: number
	maxRelations: number
	maxTilesPerBand: number
	maxObjectIdsPerTile: number
}

export interface CanvasObservation {
	version: 1
	pageId: string
	timestamp: string
	agentViewportBounds: BoxModel
	userViewportBounds: BoxModel | null
	promptOrigin: VecModel
	coordinateSpace: CanvasObservationCoordinateSpace
	screenshot: CanvasObservationScreenshotMetadata
	zoom: number
	objectCount: number
	objects: CanvasObservationObject[]
	relations: CanvasObservationRelation[]
	spatialIndex: CanvasObservationSpatialIndex
	taskAffordances: CanvasObservationTaskAffordances
	limits: CanvasObservationLimits
}
