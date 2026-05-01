import type { SimpleShapeId } from './ids-schema'

export type ActionPostcondition =
	| {
			type: 'created-shapes-exist'
			shapeIds: SimpleShapeId[]
	  }
	| {
			type: 'no-overlap'
			shapeIds: SimpleShapeId[]
			allowedOverlap?: number
	  }
	| {
			type: 'text-fits'
			shapeIds: SimpleShapeId[]
	  }
	| {
			type: 'arrow-bindings'
			shapeIds: SimpleShapeId[]
	  }
	| {
			type: 'labels-inside-containers'
			pairs: { labelId: SimpleShapeId; containerId: SimpleShapeId }[]
	  }
	| {
			type: 'no-duplicate-arrows'
	  }
	| {
			type: 'objects-visible'
			shapeIds: SimpleShapeId[]
	  }

export interface ActionContract {
	actionType: string
	intent?: string
	modifiedShapeIds?: SimpleShapeId[]
	createdShapeIds?: SimpleShapeId[]
	postconditions: ActionPostcondition[]
}

export interface ActionVerificationFailure {
	postcondition: ActionPostcondition
	message: string
	shapeIds: SimpleShapeId[]
}

export interface ActionVerificationResult {
	ok: boolean
	failures: ActionVerificationFailure[]
}
