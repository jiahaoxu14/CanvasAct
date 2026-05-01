import {
	Box,
	Editor,
	getArrowBindings,
	isPageId,
	TLArrowShape,
	TLShape,
	TLShapeId,
	VecModel,
} from 'tldraw'
import type { BoxModel } from 'tldraw'
import type { ContextItem } from '../types/ContextItem'
import type { SimpleShapeId, TldrawShapeId } from '../types/ids-schema'
import {
	CanvasObservation,
	CanvasObservationDetailLevel,
	CanvasObservationLimits,
	CanvasObservationObject,
	CanvasObservationRelation,
	CanvasObservationRelationType,
	CanvasObservationTile,
	CanvasObservationVisibilityState,
} from './CanvasObservation'
import {
	convertTldrawIdToSimpleId,
	convertTldrawShapeToFocusedShape,
	convertTldrawShapeToFocusedType,
} from './convertTldrawShapeToFocusedShape'

export interface BuildCanvasObservationOptions {
	agentViewportBounds: BoxModel
	userViewportBounds?: BoxModel | null
	promptOrigin?: VecModel
	contextItems?: ContextItem[]
	timestamp?: string
	limits?: Partial<CanvasObservationLimits>
}

interface RawObservationObject extends CanvasObservationObject {
	shape: TLShape
	pageBoundsBox: Box
	includePriority: number
}

const DEFAULT_LIMITS: CanvasObservationLimits = {
	maxObjects: 180,
	maxRelations: 700,
	maxTilesPerBand: 24,
	maxObjectIdsPerTile: 40,
}

const ALIGNMENT_TOLERANCE = 8
const TOUCH_TOLERANCE = 2
const NEAR_RELATION_DISTANCE = 96
const TEXT_SNIPPET_LIMIT = 80

export function buildCanvasObservation(
	editor: Editor,
	options: BuildCanvasObservationOptions
): CanvasObservation {
	const limits = { ...DEFAULT_LIMITS, ...options.limits }
	const viewportBounds = Box.From(options.agentViewportBounds)
	const promptOrigin = options.promptOrigin ?? { x: 0, y: 0 }
	const contextShapeIds = getContextShapeIds(options.contextItems ?? [])
	const selectedShapeIds = new Set(editor.getSelectedShapeIds().map(convertTldrawIdToSimpleId))
	const shapes = editor.getCurrentPageShapesSorted()
	const nearDistance = Math.max(viewportBounds.w, viewportBounds.h) * 0.75
	const screenshotScale = getScreenshotScale(options.agentViewportBounds)

	const allObjects = shapes
		.map((shape, zIndex) =>
			buildRawObservationObject({
				editor,
				shape,
				zIndex,
				viewportBounds,
				promptOrigin,
				selectedShapeIds,
				contextShapeIds,
				nearDistance,
				screenshotScale,
			})
		)
		.filter((object): object is RawObservationObject => object !== null)

	markOccludedObjects(allObjects, viewportBounds)

	const allRelations = buildRelationGraph(editor, allObjects)
	const includedObjectIds = chooseIncludedObjectIds(allObjects, allRelations, limits.maxObjects)
	const includedObjects = allObjects
		.filter((object) => includedObjectIds.has(object.id))
		.map(stripRawFields)
	const includedRelations = sortRelations(
		allRelations.filter(
			(relation) =>
				includedObjectIds.has(relation.sourceId) && includedObjectIds.has(relation.targetId)
		)
	).slice(0, limits.maxRelations)

	const objectById = new Map(allObjects.map((object) => [object.id, object]))

	return {
		version: 1,
		pageId: editor.getCurrentPageId(),
		timestamp: options.timestamp ?? new Date().toISOString(),
		agentViewportBounds: roundBox(options.agentViewportBounds),
		userViewportBounds: options.userViewportBounds ? roundBox(options.userViewportBounds) : null,
		promptOrigin: roundVec(promptOrigin),
		coordinateSpace: {
			pageSpace: 'tldraw page coordinates',
			promptSpace: 'page coordinates minus promptOrigin',
			screenshotSpace: 'pixels relative to screenshotBounds',
			pageToPromptOffset: roundVec({ x: -promptOrigin.x, y: -promptOrigin.y }),
		},
		screenshot: {
			bounds: roundBox(options.agentViewportBounds),
			pixelSize: {
				w: Math.round(options.agentViewportBounds.w * screenshotScale),
				h: Math.round(options.agentViewportBounds.h * screenshotScale),
			},
			scale: roundNumber(screenshotScale),
		},
		zoom: roundNumber(editor.getZoomLevel()),
		objectCount: allObjects.length,
		objects: includedObjects,
		relations: includedRelations,
		spatialIndex: buildSpatialIndex({
			allObjects,
			allRelations,
			viewportBounds,
			limits,
		}),
		taskAffordances: buildTaskAffordances(allObjects, allRelations, objectById),
		limits,
	}
}

function buildRawObservationObject({
	editor,
	shape,
	zIndex,
	viewportBounds,
	promptOrigin,
	selectedShapeIds,
	contextShapeIds,
	nearDistance,
	screenshotScale,
}: {
	editor: Editor
	shape: TLShape
	zIndex: number
	viewportBounds: Box
	promptOrigin: VecModel
	selectedShapeIds: Set<SimpleShapeId>
	contextShapeIds: Set<SimpleShapeId>
	nearDistance: number
	screenshotScale: number
}): RawObservationObject | null {
	const pageBoundsBox = editor.getShapeMaskedPageBounds(shape)
	if (!pageBoundsBox) return null

	const id = convertTldrawIdToSimpleId(shape.id)
	const focused = convertTldrawShapeToFocusedShape(editor, shape)
	const pageBounds = roundBox(pageBoundsBox.toJson())
	const promptBounds = roundBox(toPromptBox(pageBoundsBox, promptOrigin))
	const visibility = getVisibilityState(pageBoundsBox, viewportBounds, nearDistance)
	const detailLevel = getDetailLevel(visibility)
	const text = getShapeText(editor, shape)
	const parentId = isPageId(shape.parentId)
		? null
		: convertTldrawIdToSimpleId(shape.parentId as TLShapeId)
	const ancestors = editor.getShapeAncestors(shape)
	const groupId =
		ancestors.find((ancestor) => ancestor.type === 'group')?.id ??
		(shape.type === 'group' ? shape.id : null)
	const frameId =
		ancestors.find((ancestor) => ancestor.type === 'frame')?.id ??
		(shape.type === 'frame' ? shape.id : null)
	const isSelected = selectedShapeIds.has(id)
	const isContext = contextShapeIds.has(id)

	return {
		id,
		tldrawId: shape.id as unknown as TldrawShapeId,
		type: convertTldrawShapeToFocusedType(shape),
		subtype: getShapeSubtype(shape),
		text: text ? truncate(text, TEXT_SNIPPET_LIMIT) : undefined,
		note: typeof shape.meta.note === 'string' ? truncate(shape.meta.note, TEXT_SNIPPET_LIMIT) : undefined,
		pageBounds,
		promptBounds,
		center: roundVec(pageBoundsBox.center),
		promptCenter: roundVec({
			x: pageBoundsBox.center.x - promptOrigin.x,
			y: pageBoundsBox.center.y - promptOrigin.y,
		}),
		rotation: roundNumber(shape.rotation),
		zIndex,
		parentId,
		groupId: groupId ? convertTldrawIdToSimpleId(groupId as TLShapeId) : null,
		frameId: frameId ? convertTldrawIdToSimpleId(frameId as TLShapeId) : null,
		style: getStyleSummary(shape),
		flags: {
			selected: isSelected,
			context: isContext,
			locked: shape.isLocked,
			hidden: editor.isShapeHidden(shape),
		},
		visibility,
		detailLevel,
		screenshotBounds: getScreenshotBounds(pageBoundsBox, viewportBounds, screenshotScale),
		focused,
		shape,
		pageBoundsBox,
		includePriority: getIncludePriority({ visibility, isSelected, isContext }),
	}
}

function getContextShapeIds(contextItems: ContextItem[]): Set<SimpleShapeId> {
	const ids = new Set<SimpleShapeId>()
	for (const item of contextItems) {
		if (item.type === 'shape') {
			ids.add(item.shape.shapeId)
		} else if (item.type === 'shapes') {
			for (const shape of item.shapes) ids.add(shape.shapeId)
		}
	}
	return ids
}

function getVisibilityState(
	bounds: Box,
	viewportBounds: Box,
	nearDistance: number
): CanvasObservationVisibilityState {
	if (viewportBounds.includes(bounds)) return 'visible'
	if (Box.Collides(viewportBounds, bounds)) return 'partial'
	return distanceBetweenBoxes(viewportBounds, bounds) <= nearDistance ? 'offscreen-near' : 'offscreen-far'
}

function getDetailLevel(
	visibility: CanvasObservationVisibilityState
): CanvasObservationDetailLevel {
	if (visibility === 'visible' || visibility === 'partial' || visibility === 'occluded') {
		return 'viewport'
	}
	return visibility === 'offscreen-near' ? 'nearby' : 'far'
}

function markOccludedObjects(objects: RawObservationObject[], viewportBounds: Box) {
	for (let i = 0; i < objects.length; i++) {
		const object = objects[i]
		if (object.visibility !== 'visible' && object.visibility !== 'partial') continue
		const clipped = intersectBoxes(object.pageBoundsBox, viewportBounds)
		if (!clipped) continue
		const clippedArea = area(clipped)
		if (clippedArea <= 0) continue

		for (let j = i + 1; j < objects.length; j++) {
			const covering = objects[j]
			if (covering.flags.hidden || (covering.style.opacity ?? 1) < 0.9) continue
			if (covering.pageBoundsBox.includes(clipped) && area(clipped) / clippedArea >= 0.95) {
				object.visibility = 'occluded'
				object.detailLevel = 'viewport'
				break
			}
		}
	}
}

function buildRelationGraph(editor: Editor, objects: RawObservationObject[]): CanvasObservationRelation[] {
	const relations: CanvasObservationRelation[] = []
	const objectByShapeId = new Map(objects.map((object) => [object.shape.id, object]))
	const objectBySimpleId = new Map(objects.map((object) => [object.id, object]))

	for (const object of objects) {
		if (object.parentId && objectBySimpleId.has(object.parentId)) {
			addRelation(relations, {
				type: 'parent-contains-child',
				sourceId: object.parentId,
				targetId: object.id,
				confidence: 1,
			})
		}
		if (object.groupId && object.groupId !== object.id && objectBySimpleId.has(object.groupId)) {
			addRelation(relations, {
				type: 'group-member',
				sourceId: object.groupId,
				targetId: object.id,
				confidence: 1,
			})
		}
		if (object.frameId && object.frameId !== object.id && objectBySimpleId.has(object.frameId)) {
			addRelation(relations, {
				type: 'frame-member',
				sourceId: object.frameId,
				targetId: object.id,
				confidence: 1,
			})
		}

		if (object.shape.type === 'arrow') {
			const bindings = getArrowBindings(editor, object.shape as TLArrowShape)
			const startObject = bindings.start ? objectByShapeId.get(bindings.start.toId) : undefined
			const endObject = bindings.end ? objectByShapeId.get(bindings.end.toId) : undefined
			if (startObject) {
				addRelation(relations, {
					type: 'arrow-starts-at',
					sourceId: object.id,
					targetId: startObject.id,
					confidence: 1,
				})
			}
			if (endObject) {
				addRelation(relations, {
					type: 'arrow-ends-at',
					sourceId: object.id,
					targetId: endObject.id,
					confidence: 1,
				})
			}
			if (startObject && endObject) {
				addRelation(relations, {
					type: 'arrow-connects',
					sourceId: startObject.id,
					targetId: endObject.id,
					confidence: 1,
					measurements: { arrowId: object.id },
				})
			}
			if (!startObject || !endObject) {
				addRelation(relations, {
					type: 'unbound-arrow-endpoint',
					sourceId: object.id,
					targetId: object.id,
					confidence: 1,
					measurements: {
						missingStart: !startObject,
						missingEnd: !endObject,
					},
				})
			}
		}
	}

	const pairCandidates = objects
		.filter((object) => object.includePriority <= 4)
		.slice(0, 220)
	for (let i = 0; i < pairCandidates.length; i++) {
		for (let j = i + 1; j < pairCandidates.length; j++) {
			addPairwiseRelations(relations, pairCandidates[i], pairCandidates[j])
		}
	}

	for (const relation of buildReadingOrderRelations(pairCandidates)) {
		addRelation(relations, relation)
	}

	return sortRelations(relations)
}

function addPairwiseRelations(
	relations: CanvasObservationRelation[],
	a: RawObservationObject,
	b: RawObservationObject
) {
	const overlap = overlapBox(a.pageBoundsBox, b.pageBoundsBox)
	if (overlap && area(overlap) > 4) {
		const overlapArea = area(overlap)
		addRelation(relations, {
			type: 'overlap',
			sourceId: a.id,
			targetId: b.id,
			confidence: 1,
			measurements: { overlapArea: roundNumber(overlapArea) },
		})
		addOcclusionRelations(relations, a, b, overlapArea)
	} else {
		const gap = distanceBetweenBoxes(a.pageBoundsBox, b.pageBoundsBox)
		if (gap <= TOUCH_TOLERANCE) {
			addRelation(relations, {
				type: 'touches',
				sourceId: a.id,
				targetId: b.id,
				confidence: 0.9,
				measurements: { gap: roundNumber(gap) },
			})
		} else if (gap <= NEAR_RELATION_DISTANCE) {
			addRelation(relations, {
				type: 'near',
				sourceId: a.id,
				targetId: b.id,
				confidence: 0.75,
				measurements: {
					gap: roundNumber(gap),
					direction: directionFromTo(a.pageBoundsBox.center, b.pageBoundsBox.center),
				},
			})
		}
	}

	addAlignmentRelations(relations, a, b)
	addLikelyLabelRelation(relations, a, b)
}

function addOcclusionRelations(
	relations: CanvasObservationRelation[],
	a: RawObservationObject,
	b: RawObservationObject,
	overlapArea: number
) {
	const front = a.zIndex > b.zIndex ? a : b
	const back = front === a ? b : a
	const backArea = area(back.pageBoundsBox)
	if (backArea <= 0) return
	const coverage = overlapArea / backArea
	if (coverage < 0.35 || (front.style.opacity ?? 1) < 0.75) return
	addRelation(relations, {
		type: 'occludes',
		sourceId: front.id,
		targetId: back.id,
		confidence: roundNumber(Math.min(1, coverage)),
		measurements: { coverage: roundNumber(coverage) },
	})
	addRelation(relations, {
		type: 'behind',
		sourceId: back.id,
		targetId: front.id,
		confidence: roundNumber(Math.min(1, coverage)),
		measurements: { coverage: roundNumber(coverage) },
	})
}

function addAlignmentRelations(
	relations: CanvasObservationRelation[],
	a: RawObservationObject,
	b: RawObservationObject
) {
	const pairs: [CanvasObservationRelationType, number][] = [
		['aligned-left', Math.abs(a.pageBoundsBox.left - b.pageBoundsBox.left)],
		['aligned-right', Math.abs(a.pageBoundsBox.right - b.pageBoundsBox.right)],
		['aligned-center-x', Math.abs(a.pageBoundsBox.center.x - b.pageBoundsBox.center.x)],
		['aligned-center-y', Math.abs(a.pageBoundsBox.center.y - b.pageBoundsBox.center.y)],
	]
	for (const [type, delta] of pairs) {
		if (delta <= ALIGNMENT_TOLERANCE) {
			addRelation(relations, {
				type,
				sourceId: a.id,
				targetId: b.id,
				confidence: roundNumber(1 - delta / (ALIGNMENT_TOLERANCE + 1)),
				measurements: { delta: roundNumber(delta) },
			})
		}
	}

	const rowDelta = Math.abs(a.pageBoundsBox.center.y - b.pageBoundsBox.center.y)
	const columnDelta = Math.abs(a.pageBoundsBox.center.x - b.pageBoundsBox.center.x)
	if (rowDelta <= Math.max(18, Math.min(a.pageBoundsBox.h, b.pageBoundsBox.h) / 2)) {
		addRelation(relations, {
			type: 'same-row',
			sourceId: a.id,
			targetId: b.id,
			confidence: 0.75,
			measurements: { delta: roundNumber(rowDelta) },
		})
	}
	if (columnDelta <= Math.max(18, Math.min(a.pageBoundsBox.w, b.pageBoundsBox.w) / 2)) {
		addRelation(relations, {
			type: 'same-column',
			sourceId: a.id,
			targetId: b.id,
			confidence: 0.75,
			measurements: { delta: roundNumber(columnDelta) },
		})
	}
}

function addLikelyLabelRelation(
	relations: CanvasObservationRelation[],
	a: RawObservationObject,
	b: RawObservationObject
) {
	const textObject = isStandaloneTextLike(a) ? a : isStandaloneTextLike(b) ? b : null
	if (!textObject) return
	const container = textObject === a ? b : a
	if (isStandaloneTextLike(container) || container.shape.type === 'arrow' || container.shape.type === 'line') {
		return
	}
	const textBounds = textObject.pageBoundsBox
	const containerBounds = container.pageBoundsBox
	if (containerBounds.includes(textBounds)) {
		addRelation(relations, {
			type: 'likely-label-of',
			sourceId: textObject.id,
			targetId: container.id,
			confidence: 0.92,
			measurements: { placement: 'inside' },
		})
		return
	}
	const gap = distanceBetweenBoxes(textBounds, containerBounds)
	if (gap <= 72) {
		addRelation(relations, {
			type: 'likely-label-of',
			sourceId: textObject.id,
			targetId: container.id,
			confidence: 0.58,
			measurements: {
				placement: 'nearby',
				gap: roundNumber(gap),
				direction: directionFromTo(containerBounds.center, textBounds.center),
			},
		})
	}
}

function buildReadingOrderRelations(objects: RawObservationObject[]): CanvasObservationRelation[] {
	const visibleObjects = objects
		.filter(
			(object) =>
				object.visibility === 'visible' ||
				object.visibility === 'partial' ||
				object.visibility === 'occluded'
		)
		.sort(readingOrderSort)
	const relations: CanvasObservationRelation[] = []
	for (let i = 0; i < visibleObjects.length - 1; i++) {
		relations.push({
			type: 'reading-order-next',
			sourceId: visibleObjects[i].id,
			targetId: visibleObjects[i + 1].id,
			confidence: 0.65,
		})
	}
	return relations
}

function chooseIncludedObjectIds(
	objects: RawObservationObject[],
	relations: CanvasObservationRelation[],
	maxObjects: number
): Set<SimpleShapeId> {
	const connectedToViewport = new Set<SimpleShapeId>()
	const viewportIds = new Set(
		objects
			.filter(
				(object) =>
					object.visibility === 'visible' ||
					object.visibility === 'partial' ||
					object.visibility === 'occluded' ||
					object.flags.selected ||
					object.flags.context
			)
			.map((object) => object.id)
	)
	for (const relation of relations) {
		if (viewportIds.has(relation.sourceId)) connectedToViewport.add(relation.targetId)
		if (viewportIds.has(relation.targetId)) connectedToViewport.add(relation.sourceId)
	}

	const ranked = objects
		.map((object) => ({
			object,
			priority: Math.min(object.includePriority, connectedToViewport.has(object.id) ? 2 : 99),
		}))
			.sort(
				(a, b) =>
					a.priority - b.priority ||
					a.object.zIndex - b.object.zIndex ||
					sortId(a.object.id, b.object.id)
			)

	const included = new Set<SimpleShapeId>()
	for (const { object } of ranked) {
		if (included.size >= maxObjects && object.includePriority > 0) continue
		included.add(object.id)
	}
	return included
}

function buildSpatialIndex({
	allObjects,
	allRelations,
	viewportBounds,
	limits,
}: {
	allObjects: RawObservationObject[]
	allRelations: CanvasObservationRelation[]
	viewportBounds: Box
	limits: CanvasObservationLimits
}): {
	viewport: CanvasObservationTile
	nearby: CanvasObservationTile[]
	far: CanvasObservationTile[]
} {
	const viewportObjects = allObjects.filter(
		(object) =>
			object.visibility === 'visible' ||
			object.visibility === 'partial' ||
			object.visibility === 'occluded'
	)
	const viewportIds = new Set(viewportObjects.map((object) => object.id))
	const tileSize = Math.max(viewportBounds.w, viewportBounds.h, 1)

	const viewportTile = buildTile({
		id: 'viewport',
		detailLevel: 'viewport',
		objects: viewportObjects,
		viewportBounds,
		allRelations,
		viewportIds,
		limits,
		boundsOverride: viewportBounds,
	})

	const tilesByKey = new Map<string, RawObservationObject[]>()
	for (const object of allObjects) {
		if (viewportIds.has(object.id)) continue
		const tileX = Math.floor(object.pageBoundsBox.center.x / tileSize)
		const tileY = Math.floor(object.pageBoundsBox.center.y / tileSize)
		const key = `${object.detailLevel}:${tileX}:${tileY}`
		const tileObjects = tilesByKey.get(key) ?? []
		tileObjects.push(object)
		tilesByKey.set(key, tileObjects)
	}

	const tiles = Array.from(tilesByKey.entries())
		.map(([key, objects]) => {
			const detailLevel = key.startsWith('nearby:') ? 'nearby' : 'far'
			return buildTile({
				id: key,
				detailLevel,
				objects,
				viewportBounds,
				allRelations,
				viewportIds,
				limits,
			})
		})
		.sort((a, b) => a.distance - b.distance || sortId(a.id, b.id))

	return {
		viewport: viewportTile,
		nearby: tiles.filter((tile) => tile.detailLevel === 'nearby').slice(0, limits.maxTilesPerBand),
		far: tiles.filter((tile) => tile.detailLevel === 'far').slice(0, limits.maxTilesPerBand),
	}
}

function buildTile({
	id,
	detailLevel,
	objects,
	viewportBounds,
	allRelations,
	viewportIds,
	limits,
	boundsOverride,
}: {
	id: string
	detailLevel: CanvasObservationDetailLevel
	objects: RawObservationObject[]
	viewportBounds: Box
	allRelations: CanvasObservationRelation[]
	viewportIds: Set<SimpleShapeId>
	limits: CanvasObservationLimits
	boundsOverride?: Box
}): CanvasObservationTile {
	const bounds = boundsOverride ?? getCommonBounds(objects.map((object) => object.pageBoundsBox))
	const ids = objects.map((object) => object.id).sort(sortId)
	const objectIdSet = new Set(ids)
	const relationLinks = allRelations
		.filter(
			(relation) =>
				(objectIdSet.has(relation.sourceId) && viewportIds.has(relation.targetId)) ||
				(objectIdSet.has(relation.targetId) && viewportIds.has(relation.sourceId))
		)
		.slice(0, 20)

	return {
		id,
		detailLevel,
		bounds: roundBox(bounds.toJson()),
		distance: roundNumber(distanceBetweenBoxes(viewportBounds, bounds)),
		direction: directionFromTo(viewportBounds.center, bounds.center),
		objectIds: ids.slice(0, limits.maxObjectIdsPerTile),
			importantObjectIds: ids
				.filter((objectId) => {
					const object = objects.find((item) => item.id === objectId)
					return (
						object?.flags.selected ||
						object?.flags.context ||
						relationLinks.some((r) => r.sourceId === objectId || r.targetId === objectId)
					)
				})
				.slice(0, limits.maxObjectIdsPerTile),
		typeHistogram: getTypeHistogram(objects),
		representativeTexts: getRepresentativeTexts(objects),
		relationLinks,
	}
}

function buildTaskAffordances(
	objects: RawObservationObject[],
	relations: CanvasObservationRelation[],
	objectById: Map<SimpleShapeId, RawObservationObject>
): CanvasObservation['taskAffordances'] {
	const unboundArrows = relations
		.filter((relation) => relation.type === 'unbound-arrow-endpoint')
		.map((relation) => ({
			shapeId: relation.sourceId,
			missingStart: Boolean(relation.measurements?.missingStart),
			missingEnd: Boolean(relation.measurements?.missingEnd),
		}))

	const labelRelations = relations.filter((relation) => relation.type === 'likely-label-of')
	const detachedLabels = labelRelations
		.filter((relation) => relation.measurements?.placement === 'nearby')
		.map((relation) => relation.sourceId)

	return {
		overflowedTextCandidates: objects
			.filter((object) => {
				const props = object.shape.props as Record<string, unknown>
				return typeof props.growY === 'number' && props.growY > 5
			})
			.map((object) => object.id),
		unboundArrows,
		overlappingLabels: getOverlappingLabelGroups(objects),
		detachedLabels,
		alignableRows: getAlignableGroups(objects, 'row'),
		alignableColumns: getAlignableGroups(objects, 'column'),
		flowchartChains: getFlowchartChains(relations),
		isolatedClusters: getIsolatedClusters(objects, relations),
		candidateContainers: objects
			.filter((object) => isContainerCandidate(object, relations, objectById))
			.map((object) => object.id),
		candidateGroups: getCandidateGroups(objects),
	}
}

function stripRawFields(object: RawObservationObject): CanvasObservationObject {
	const {
		shape: _shape,
		pageBoundsBox: _pageBoundsBox,
		includePriority: _includePriority,
		...serialized
	} = object
	return serialized
}

function getIncludePriority({
	visibility,
	isSelected,
	isContext,
}: {
	visibility: CanvasObservationVisibilityState
	isSelected: boolean
	isContext: boolean
}) {
	if (isSelected || isContext) return 0
	if (visibility === 'partial') return 0
	if (visibility === 'visible' || visibility === 'occluded') return 1
	if (visibility === 'offscreen-near') return 3
	return 7
}

function addRelation(relations: CanvasObservationRelation[], relation: CanvasObservationRelation) {
	if (relation.sourceId === relation.targetId && relation.type !== 'unbound-arrow-endpoint') return
	relations.push(relation)
}

function sortRelations(relations: CanvasObservationRelation[]) {
	const seen = new Set<string>()
	return relations
		.sort(
			(a, b) =>
				a.type.localeCompare(b.type) ||
				sortId(a.sourceId, b.sourceId) ||
				sortId(a.targetId, b.targetId) ||
				JSON.stringify(a.measurements ?? {}).localeCompare(JSON.stringify(b.measurements ?? {}))
		)
		.filter((relation) => {
			const key = `${relation.type}:${relation.sourceId}:${relation.targetId}:${JSON.stringify(
				relation.measurements ?? {}
			)}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
}

function getShapeText(editor: Editor, shape: TLShape): string | undefined {
	try {
		return editor.getShapeUtil(shape).getText(shape) ?? undefined
	} catch {
		return undefined
	}
}

function getShapeSubtype(shape: TLShape): string {
	const props = shape.props as Record<string, unknown>
	if (typeof props.geo === 'string') return props.geo
	if (typeof props.kind === 'string') return `${shape.type}:${props.kind}`
	return shape.type
}

function getStyleSummary(shape: TLShape): CanvasObservationObject['style'] {
	const props = shape.props as Record<string, unknown>
	const style: CanvasObservationObject['style'] = {}
	if (typeof props.color === 'string') style.color = props.color
	if (typeof props.fill === 'string') style.fill = props.fill
	if (typeof props.size === 'string' || typeof props.size === 'number') style.fontSize = props.size
	if (shape.opacity !== 1) style.opacity = Number(shape.opacity)
	return style
}

function isStandaloneTextLike(object: RawObservationObject) {
	return object.shape.type === 'text' || object.shape.type === 'note'
}

function getScreenshotScale(bounds: BoxModel) {
	const largestDimension = Math.max(bounds.w, bounds.h)
	return largestDimension > 8000 ? 8000 / largestDimension : 1
}

function getScreenshotBounds(
	pageBounds: Box,
	screenshotBounds: Box,
	scale: number
): BoxModel | null {
	const clipped = intersectBoxes(pageBounds, screenshotBounds)
	if (!clipped) return null
	return roundBox({
		x: (clipped.x - screenshotBounds.x) * scale,
		y: (clipped.y - screenshotBounds.y) * scale,
		w: clipped.w * scale,
		h: clipped.h * scale,
	})
}

function toPromptBox(box: Box, promptOrigin: VecModel): BoxModel {
	return {
		x: box.x - promptOrigin.x,
		y: box.y - promptOrigin.y,
		w: box.w,
		h: box.h,
	}
}

function intersectBoxes(a: Box, b: Box): Box | null {
	const x1 = Math.max(a.x, b.x)
	const y1 = Math.max(a.y, b.y)
	const x2 = Math.min(a.x + a.w, b.x + b.w)
	const y2 = Math.min(a.y + a.h, b.y + b.h)
	if (x2 <= x1 || y2 <= y1) return null
	return new Box(x1, y1, x2 - x1, y2 - y1)
}

function overlapBox(a: Box, b: Box): Box | null {
	return intersectBoxes(a, b)
}

function area(box: Box) {
	return Math.max(0, box.w) * Math.max(0, box.h)
}

function distanceBetweenBoxes(a: Box, b: Box) {
	const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
	const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
	return Math.hypot(dx, dy)
}

function directionFromTo(from: VecModel, to: VecModel) {
	const dx = to.x - from.x
	const dy = to.y - from.y
	const horizontal = Math.abs(dx) < 1 ? '' : dx > 0 ? 'right' : 'left'
	const vertical = Math.abs(dy) < 1 ? '' : dy > 0 ? 'below' : 'above'
	if (horizontal && vertical) return `${vertical}-${horizontal}`
	return horizontal || vertical || 'center'
}

function getCommonBounds(boxes: Box[]) {
	if (boxes.length === 0) return new Box()
	return Box.Common(boxes)
}

function getTypeHistogram(objects: RawObservationObject[]) {
	const histogram: Record<string, number> = {}
	for (const object of objects) {
		histogram[object.type] = (histogram[object.type] ?? 0) + 1
	}
	return Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => a.localeCompare(b)))
}

function getRepresentativeTexts(objects: RawObservationObject[]) {
	const snippets: string[] = []
	for (const object of objects.sort(readingOrderSort)) {
		const snippet = object.text || object.note
		if (!snippet) continue
		if (snippets.includes(snippet)) continue
		snippets.push(snippet)
		if (snippets.length >= 6) break
	}
	return snippets
}

function getOverlappingLabelGroups(objects: RawObservationObject[]) {
	const textObjects = objects.filter((object) => object.text && isStandaloneTextLike(object))
	const groups: SimpleShapeId[][] = []
	for (let i = 0; i < textObjects.length; i++) {
		for (let j = i + 1; j < textObjects.length; j++) {
			if (Box.Collides(textObjects[i].pageBoundsBox, textObjects[j].pageBoundsBox)) {
				groups.push([textObjects[i].id, textObjects[j].id].sort(sortId))
			}
		}
	}
	return groups
}

function getAlignableGroups(objects: RawObservationObject[], axis: 'row' | 'column') {
	const visible = objects.filter(
		(object) =>
			object.visibility === 'visible' ||
			object.visibility === 'partial' ||
			object.visibility === 'occluded'
	)
	const buckets = new Map<number, SimpleShapeId[]>()
	for (const object of visible) {
		const value = axis === 'row' ? object.pageBoundsBox.center.y : object.pageBoundsBox.center.x
		const bucket = Math.round(value / 40)
		const ids = buckets.get(bucket) ?? []
		ids.push(object.id)
		buckets.set(bucket, ids)
	}
	return Array.from(buckets.values())
		.map((ids) => ids.sort(sortId))
		.filter((ids) => ids.length >= 3)
		.sort((a, b) => sortId(a[0], b[0]))
}

function getFlowchartChains(relations: CanvasObservationRelation[]) {
	const arrowRelations = relations.filter((relation) => relation.type === 'arrow-connects')
	const outgoing = new Map<SimpleShapeId, SimpleShapeId[]>()
	const incoming = new Set<SimpleShapeId>()
	for (const relation of arrowRelations) {
		const targets = outgoing.get(relation.sourceId) ?? []
		targets.push(relation.targetId)
		outgoing.set(relation.sourceId, targets)
		incoming.add(relation.targetId)
	}

	const chains: SimpleShapeId[][] = []
	for (const start of Array.from(outgoing.keys()).sort(sortId)) {
		if (incoming.has(start)) continue
		const chain = [start]
		const visited = new Set(chain)
		let current = start
		while (outgoing.get(current)?.length === 1) {
			const next = outgoing.get(current)![0]
			if (visited.has(next)) break
			chain.push(next)
			visited.add(next)
			current = next
		}
		if (chain.length >= 3) chains.push(chain)
	}
	return chains
}

function getIsolatedClusters(objects: RawObservationObject[], relations: CanvasObservationRelation[]) {
	const relatedIds = new Set<SimpleShapeId>()
	for (const relation of relations) {
		relatedIds.add(relation.sourceId)
		relatedIds.add(relation.targetId)
	}
	return objects
		.filter((object) => object.detailLevel !== 'far' && !relatedIds.has(object.id))
		.map((object) => [object.id])
		.slice(0, 20)
}

function isContainerCandidate(
	object: RawObservationObject,
	relations: CanvasObservationRelation[],
	objectById: Map<SimpleShapeId, RawObservationObject>
) {
	if (!['rectangle', 'note', 'unknown'].includes(object.type) && object.shape.type !== 'frame') return false
	if (
		relations.some(
			(relation) =>
				relation.type === 'parent-contains-child' &&
				relation.sourceId === object.id &&
				objectById.has(relation.targetId)
		)
	) {
		return true
	}
	const contained = Array.from(objectById.values()).filter(
		(other) => other.id !== object.id && object.pageBoundsBox.includes(other.pageBoundsBox)
	)
	return contained.length > 0
}

function getCandidateGroups(objects: RawObservationObject[]) {
	const groups = new Map<SimpleShapeId, SimpleShapeId[]>()
	for (const object of objects) {
		if (object.groupId && object.groupId !== object.id) {
			const ids = groups.get(object.groupId) ?? []
			ids.push(object.id)
			groups.set(object.groupId, ids)
		}
	}
	return Array.from(groups.entries())
		.map(([groupId, ids]) => [groupId, ...ids.sort(sortId)])
		.filter((ids) => ids.length >= 3)
}

function readingOrderSort(a: RawObservationObject, b: RawObservationObject) {
	return (
		a.pageBoundsBox.y - b.pageBoundsBox.y ||
		a.pageBoundsBox.x - b.pageBoundsBox.x ||
		a.zIndex - b.zIndex ||
		sortId(a.id, b.id)
	)
}

function roundBox(box: BoxModel): BoxModel {
	return {
		x: roundNumber(box.x),
		y: roundNumber(box.y),
		w: roundNumber(box.w),
		h: roundNumber(box.h),
	}
}

function roundVec(vec: VecModel): VecModel {
	return {
		x: roundNumber(vec.x),
		y: roundNumber(vec.y),
	}
}

function roundNumber(value: number) {
	return Math.round(value * 100) / 100
}

function truncate(value: string, maxLength: number) {
	const singleLine = value.replace(/\s+/g, ' ').trim()
	return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}...` : singleLine
}

function sortId(a: string, b: string) {
	return a.localeCompare(b)
}
