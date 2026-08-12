import {
	Box,
	createShapeId,
	Editor,
	getArrowBindings,
	TLArrowShape,
	TLShape,
	TLShapeId,
	toRichText,
} from 'tldraw'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type {
	AnnotateGroupAction,
	ArrangeAction,
	BuildFlowAction,
	CleanupLayoutAction,
	ConnectAction,
	FitTextAction,
} from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import type { AgentHelpers } from '../AgentHelpers'

type ShapeInfo = {
	id: SimpleShapeId
	shape: TLShape
	bounds: Box
}

export type ConnectionPair = {
	sourceId: SimpleShapeId
	targetId: SimpleShapeId
}

export interface BuildFlowResult {
	createdShapeIds: SimpleShapeId[]
	flowArrowIds: SimpleShapeId[]
}

export function getFlowArrowIds(editor: Editor, shapeIds: SimpleShapeId[]) {
	const stepSet = new Set(shapeIds)
	const expectedKeys = new Set(
		shapeIds.slice(0, -1).map((sourceId, index) =>
			connectionKey({ sourceId, targetId: shapeIds[index + 1] })
		)
	)
	return editor
		.getCurrentPageShapesSorted()
		.filter((shape): shape is TLArrowShape => shape.type === 'arrow')
		.filter((shape) => {
			const bindings = getArrowBindings(editor, shape)
			if (!bindings.start || !bindings.end) return false
			const sourceId = convertTldrawIdToSimpleId(bindings.start.toId)
			const targetId = convertTldrawIdToSimpleId(bindings.end.toId)
			return (
				stepSet.has(sourceId) &&
				stepSet.has(targetId) &&
				expectedKeys.has(connectionKey({ sourceId, targetId }))
			)
		})
		.map((shape) => convertTldrawIdToSimpleId(shape.id))
}

export function buildFlow(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	action: Pick<
		BuildFlowAction,
		| 'direction'
		| 'gap'
		| 'region'
		| 'createArrows'
		| 'repairExistingConnectors'
		| 'createdShapeIds'
	>,
	helpers?: AgentHelpers
): BuildFlowResult {
	const gap = normalizeGap(action.gap, 40)
	arrangeShapes(
		editor,
		shapeIds,
		{
			layout: action.direction === 'horizontal' ? 'row' : 'column',
			direction: action.direction,
			gap,
			region: action.region,
		},
		helpers
	)

	if (action.createArrows === false) {
		return { createdShapeIds: [], flowArrowIds: [] }
	}

	return reconcileFlowConnections(editor, shapeIds, {
		repairExistingConnectors: action.repairExistingConnectors !== false,
		createdShapeIds: action.createdShapeIds ?? [],
	})
}

export function arrangeShapes(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	action: Pick<ArrangeAction, 'layout' | 'region' | 'gap' | 'columns' | 'direction'>,
	helpers?: AgentHelpers
) {
	const infos = getShapeInfos(editor, shapeIds)
	if (infos.length < 2) return

	const gap = normalizeGap(action.gap, 32)
	if (action.layout === 'stack') {
		editor.stackShapes(
			infos.map((info) => toTlShapeId(info.id)),
			action.direction ?? 'horizontal',
			gap
		)
		return
	}

	const region = action.region ? toPageBox(action.region, helpers) : null
	const common = region ?? Box.Common(infos.map((info) => info.bounds))

	switch (action.layout) {
		case 'row':
			arrangeRow(editor, infos, common, gap)
			break
		case 'column':
			arrangeColumn(editor, infos, common, gap)
			break
		case 'grid':
			arrangeGrid(editor, infos, common, gap, action.columns)
			break
		case 'flow':
			arrangeFlow(editor, infos, common, gap, action.columns)
			break
		case 'radial':
			arrangeRadial(editor, infos, common, gap)
			break
	}
}

export function fitTextInShapes(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	action: Pick<
		FitTextAction,
		'strategy' | 'maxWidth' | 'maxCharacters' | 'containerShapeIds'
	>
) {
	if (action.strategy === 'move-label') {
		moveLabelsIntoContainers(editor, shapeIds, action.containerShapeIds ?? [])
		return
	}

	for (const id of shapeIds) {
		const shape = editor.getShape(toTlShapeId(id))
		if (!shape) continue
		const strategy = action.strategy ?? getDefaultTextFitStrategy(shape)
		switch (strategy) {
			case 'widen-container':
				widenShapeForText(editor, shape, action.maxWidth)
				break
			case 'wrap-text':
				wrapTextShape(editor, shape, action.maxWidth)
				break
			case 'shrink-text':
				shrinkTextShape(editor, shape)
				break
			case 'shorten-label':
				shortenShapeText(editor, shape, action.maxCharacters ?? 48)
				break
			case 'move-label':
				break
		}
	}
}

export function connectShapes(
	editor: Editor,
	action: Pick<
		ConnectAction,
		| 'sourceShapeIds'
		| 'targetShapeIds'
		| 'relationLabel'
		| 'avoidDuplicates'
		| 'createdShapeIds'
	>
): SimpleShapeId[] {
	const pairs = getConnectionPairs(
		editor,
		action.sourceShapeIds ?? [],
		action.targetShapeIds ?? [],
		action.avoidDuplicates !== false
	)
	const createdShapeIds: SimpleShapeId[] = []

	for (let i = 0; i < pairs.length; i++) {
		const pair = pairs[i]
		const sourceBounds = editor.getShapePageBounds(toTlShapeId(pair.sourceId))
		const targetBounds = editor.getShapePageBounds(toTlShapeId(pair.targetId))
		const shapeId = action.createdShapeIds?.[i] ?? convertTldrawIdToSimpleId(createShapeId())
		if (!sourceBounds || !targetBounds) continue

		const start = sourceBounds.center
		const end = targetBounds.center
		const minX = Math.min(start.x, end.x)
		const minY = Math.min(start.y, end.y)
		const arrowId = toTlShapeId(shapeId)

		editor.createShape<TLArrowShape>({
			id: arrowId,
			type: 'arrow',
			x: minX,
			y: minY,
			props: {
				arrowheadEnd: 'arrow',
				arrowheadStart: 'none',
				bend: 0,
				color: 'black',
				dash: 'draw',
				elbowMidPoint: 0.5,
				end: { x: end.x - minX, y: end.y - minY },
				fill: 'none',
				font: 'draw',
				kind: 'arc',
				labelColor: 'black',
				labelPosition: 0.5,
				richText: toRichText(action.relationLabel ?? ''),
				scale: 1,
				size: 's',
				start: { x: start.x - minX, y: start.y - minY },
			},
		})

		createArrowBinding(editor, arrowId, toTlShapeId(pair.sourceId), 'start')
		createArrowBinding(editor, arrowId, toTlShapeId(pair.targetId), 'end')
		createdShapeIds.push(shapeId)
	}

	return createdShapeIds
}

export function cleanupLayout(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	action: Pick<CleanupLayoutAction, 'strategy' | 'gap' | 'avoidMovingLocked'>
) {
	const strategy = action.strategy ?? 'separate-overlaps'
	const gap = normalizeGap(action.gap, 32)
	if (strategy === 'grid' || strategy === 'horizontal' || strategy === 'vertical') {
		arrangeShapes(
			editor,
			shapeIds,
			{
				layout: strategy === 'grid' ? 'grid' : strategy === 'horizontal' ? 'row' : 'column',
				gap,
			}
		)
		return
	}

	for (let pass = 0; pass < shapeIds.length * 2; pass++) {
		const infos = getShapeInfos(editor, shapeIds)
		let moved = false
		for (let i = 0; i < infos.length; i++) {
			for (let j = i + 1; j < infos.length; j++) {
				const a = infos[i]
				const b = infos[j]
				if (action.avoidMovingLocked && b.shape.isLocked) continue
				const delta = getSeparationDelta(a.bounds, b.bounds, gap)
				if (!delta) continue
				moveShapeBoundsTo(editor, b.id, b.bounds.x + delta.x, b.bounds.y + delta.y)
				moved = true
			}
		}
		if (!moved) break
	}
}

export function annotateGroup(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	action: Pick<AnnotateGroupAction, 'text' | 'placement' | 'annotationType' | 'createdShapeIds'>
): SimpleShapeId[] {
	const bounds = getCommonBounds(editor, shapeIds)
	if (!bounds) return []

	const placement = action.placement ?? 'top'
	const annotationType = action.annotationType ?? 'text'
	const shapeId = action.createdShapeIds?.[0] ?? convertTldrawIdToSimpleId(createShapeId())
	const gap = 24
	const width = Math.max(160, Math.min(480, bounds.w))
	const height = annotationType === 'note' ? 200 : 48
	let x = bounds.midX - width / 2
	let y = bounds.y - height - gap

	switch (placement) {
		case 'bottom':
			y = bounds.maxY + gap
			break
		case 'left':
			x = bounds.x - width - gap
			y = bounds.midY - height / 2
			break
		case 'right':
			x = bounds.maxX + gap
			y = bounds.midY - height / 2
			break
		case 'center':
			x = bounds.midX - width / 2
			y = bounds.midY - height / 2
			break
		case 'top':
			break
	}

	if (annotationType === 'note') {
		editor.createShape({
			id: toTlShapeId(shapeId),
			type: 'note',
			x,
			y,
			props: {
				color: 'yellow',
				richText: toRichText(action.text),
				size: 's',
				align: 'middle',
				font: 'draw',
				fontSizeAdjustment: 0,
				growY: 0,
				labelColor: 'black',
				scale: 1,
				url: '',
				verticalAlign: 'middle',
			},
		})
	} else {
		editor.createShape({
			id: toTlShapeId(shapeId),
			type: 'text',
			x,
			y,
			props: {
				autoSize: false,
				color: 'black',
				font: 'draw',
				richText: toRichText(action.text),
				scale: 1,
				size: 's',
				textAlign: 'middle',
				w: width,
			},
		})
	}

	return [shapeId]
}

export function getConnectionPairs(
	editor: Editor,
	sourceShapeIds: SimpleShapeId[],
	targetShapeIds: SimpleShapeId[],
	avoidDuplicates: boolean
): ConnectionPair[] {
	const pairs: ConnectionPair[] = []
	const pairedByIndex = sourceShapeIds.length === targetShapeIds.length
	const candidatePairs = pairedByIndex
		? sourceShapeIds.map((sourceId, index) => ({ sourceId, targetId: targetShapeIds[index] }))
		: sourceShapeIds.flatMap((sourceId) =>
				targetShapeIds.map((targetId) => ({ sourceId, targetId }))
			)

	for (const pair of candidatePairs) {
		if (!pair.targetId || pair.sourceId === pair.targetId) continue
		if (avoidDuplicates && hasArrowBetween(editor, pair.sourceId, pair.targetId)) continue
		pairs.push(pair)
	}

	return pairs
}

function reconcileFlowConnections(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	options: { repairExistingConnectors: boolean; createdShapeIds: SimpleShapeId[] }
): BuildFlowResult {
	const stepSet = new Set(shapeIds)
	const expectedPairs = shapeIds.slice(0, -1).map((sourceId, index) => ({
		sourceId,
		targetId: shapeIds[index + 1],
	}))
	const expectedKeys = new Set(expectedPairs.map(connectionKey))
	const keptByKey = new Map<string, SimpleShapeId>()
	const arrowIdsToDelete: TLShapeId[] = []

	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		if (!bindings.start || !bindings.end) continue
		const sourceId = convertTldrawIdToSimpleId(bindings.start.toId)
		const targetId = convertTldrawIdToSimpleId(bindings.end.toId)
		if (!stepSet.has(sourceId) || !stepSet.has(targetId)) continue

		const key = connectionKey({ sourceId, targetId })
		if (!options.repairExistingConnectors) {
			if (!keptByKey.has(key)) keptByKey.set(key, convertTldrawIdToSimpleId(shape.id))
			continue
		}
		if (!expectedKeys.has(key) || keptByKey.has(key) || !isCanonicalFlowConnector(shape)) {
			arrowIdsToDelete.push(shape.id)
			continue
		}
		keptByKey.set(key, convertTldrawIdToSimpleId(shape.id))
	}

	if (arrowIdsToDelete.length > 0) editor.deleteShapes(arrowIdsToDelete)

	const createdShapeIds: SimpleShapeId[] = []
	const flowArrowIds: SimpleShapeId[] = []
	for (let index = 0; index < expectedPairs.length; index++) {
		const pair = expectedPairs[index]
		const key = connectionKey(pair)
		const existingId = keptByKey.get(key)
		if (existingId) {
			flowArrowIds.push(existingId)
			continue
		}
		const requestedId =
			options.createdShapeIds[index] ??
			(`flow-${pair.sourceId}-${pair.targetId}` as SimpleShapeId)
		const created = connectShapes(editor, {
			sourceShapeIds: [pair.sourceId],
			targetShapeIds: [pair.targetId],
			avoidDuplicates: true,
			createdShapeIds: [requestedId],
		})
		if (created[0]) {
			createdShapeIds.push(created[0])
			flowArrowIds.push(created[0])
		}
	}

	return { createdShapeIds, flowArrowIds }
}

function isCanonicalFlowConnector(shape: TLArrowShape) {
	return (
		shape.props.arrowheadStart === 'none' &&
		shape.props.arrowheadEnd === 'arrow' &&
		shape.props.bend === 0 &&
		shape.props.color === 'black' &&
		shape.props.dash === 'draw'
	)
}

function connectionKey(pair: ConnectionPair) {
	return `${pair.sourceId}->${pair.targetId}`
}

function arrangeRow(editor: Editor, infos: ShapeInfo[], box: Box, gap: number) {
	const maxHeight = Math.max(...infos.map((info) => info.bounds.h))
	let x = box.x
	for (const info of infos) {
		moveShapeBoundsTo(editor, info.id, x, box.y + (maxHeight - info.bounds.h) / 2)
		x += info.bounds.w + gap
	}
}

function arrangeColumn(editor: Editor, infos: ShapeInfo[], box: Box, gap: number) {
	const maxWidth = Math.max(...infos.map((info) => info.bounds.w))
	let y = box.y
	for (const info of infos) {
		moveShapeBoundsTo(editor, info.id, box.x + (maxWidth - info.bounds.w) / 2, y)
		y += info.bounds.h + gap
	}
}

function arrangeGrid(
	editor: Editor,
	infos: ShapeInfo[],
	box: Box,
	gap: number,
	columns = Math.ceil(Math.sqrt(infos.length))
) {
	const rows = Math.ceil(infos.length / columns)
	const columnWidths = Array.from({ length: columns }, (_, column) =>
		Math.max(...infos.filter((_, index) => index % columns === column).map((info) => info.bounds.w), 0)
	)
	const rowHeights = Array.from({ length: rows }, (_, row) =>
		Math.max(
			...infos
				.filter((_, index) => Math.floor(index / columns) === row)
				.map((info) => info.bounds.h),
			0
		)
	)

	for (let index = 0; index < infos.length; index++) {
		const column = index % columns
		const row = Math.floor(index / columns)
		const x = box.x + sum(columnWidths.slice(0, column)) + column * gap
		const y = box.y + sum(rowHeights.slice(0, row)) + row * gap
		moveShapeBoundsTo(editor, infos[index].id, x, y)
	}
}

function arrangeFlow(
	editor: Editor,
	infos: ShapeInfo[],
	box: Box,
	gap: number,
	columns?: number
) {
	if (columns) {
		arrangeGrid(editor, infos, box, gap, columns)
		return
	}

	let x = box.x
	let y = box.y
	let rowHeight = 0
	const maxX = box.x + Math.max(box.w, 320)
	for (const info of infos) {
		if (x > box.x && x + info.bounds.w > maxX) {
			x = box.x
			y += rowHeight + gap
			rowHeight = 0
		}
		moveShapeBoundsTo(editor, info.id, x, y)
		x += info.bounds.w + gap
		rowHeight = Math.max(rowHeight, info.bounds.h)
	}
}

function arrangeRadial(editor: Editor, infos: ShapeInfo[], box: Box, gap: number) {
	const radius = Math.max(
		80,
		Math.min(box.w, box.h) / 2 - Math.max(...infos.map((info) => Math.max(info.bounds.w, info.bounds.h))) / 2,
		(Math.max(box.w, box.h) + gap * infos.length) / 3
	)
	for (let index = 0; index < infos.length; index++) {
		const info = infos[index]
		const angle = -Math.PI / 2 + (Math.PI * 2 * index) / infos.length
		const centerX = box.midX + Math.cos(angle) * radius
		const centerY = box.midY + Math.sin(angle) * radius
		moveShapeBoundsTo(editor, info.id, centerX - info.bounds.w / 2, centerY - info.bounds.h / 2)
	}
}

function moveShapeBoundsTo(editor: Editor, id: SimpleShapeId, x: number, y: number) {
	const shapeId = toTlShapeId(id)
	const shape = editor.getShape(shapeId)
	const bounds = editor.getShapePageBounds(shapeId)
	if (!shape || !bounds) return

	editor.updateShape({
		id: shapeId,
		type: shape.type,
		x: x + (shape.x - bounds.x),
		y: y + (shape.y - bounds.y),
	} as any)
}

function getShapeInfos(editor: Editor, shapeIds: SimpleShapeId[]): ShapeInfo[] {
	return shapeIds
		.map((id) => {
			const shape = editor.getShape(toTlShapeId(id))
			const bounds = editor.getShapePageBounds(toTlShapeId(id))
			return shape && bounds ? { id, shape, bounds } : null
		})
		.filter((info): info is ShapeInfo => info !== null)
}

function getCommonBounds(editor: Editor, shapeIds: SimpleShapeId[]) {
	const bounds = getShapeInfos(editor, shapeIds).map((info) => info.bounds)
	return bounds.length > 0 ? Box.Common(bounds) : null
}

function toPageBox(
	region: { x: number; y: number; w: number; h: number; coordinateSpace?: 'prompt' | 'page' },
	helpers?: AgentHelpers
) {
	return Box.From(region.coordinateSpace === 'page' || !helpers ? region : helpers.removeOffsetFromBox(region))
}

function getDefaultTextFitStrategy(shape: TLShape): FitTextAction['strategy'] {
	return shape.type === 'text' ? 'wrap-text' : 'widen-container'
}

function widenShapeForText(editor: Editor, shape: TLShape, maxWidth?: number) {
	const props = shape.props as Record<string, unknown>
	const currentWidth = typeof props.w === 'number' ? props.w : undefined
	if (!currentWidth) {
		shrinkTextShape(editor, shape)
		return
	}
	const growY = typeof props.growY === 'number' ? props.growY : 0
	const targetWidth = Math.min(maxWidth ?? Number.POSITIVE_INFINITY, currentWidth + Math.max(80, growY * 2))
	editor.updateShape({
		id: shape.id,
		type: shape.type,
		props: { w: targetWidth },
	} as any)
}

function wrapTextShape(editor: Editor, shape: TLShape, maxWidth?: number) {
	if (shape.type !== 'text') {
		widenShapeForText(editor, shape, maxWidth)
		return
	}
	const bounds = editor.getShapePageBounds(shape)
	const width = maxWidth ?? Math.max(180, Math.min(480, bounds?.w ?? 240))
	editor.updateShape({
		id: shape.id,
		type: shape.type,
		props: { autoSize: false, w: width },
	} as any)
}

function shrinkTextShape(editor: Editor, shape: TLShape) {
	const props = shape.props as Record<string, unknown>
	const size = props.size
	const sizeOrder = ['xl', 'l', 'm', 's'] as const
	const sizeIndex = typeof size === 'string' ? sizeOrder.indexOf(size as (typeof sizeOrder)[number]) : -1
	if (sizeIndex >= 0 && sizeIndex < sizeOrder.length - 1) {
		editor.updateShape({
			id: shape.id,
			type: shape.type,
			props: { size: sizeOrder[sizeIndex + 1] },
		} as any)
		return
	}
	const scale = typeof props.scale === 'number' ? props.scale : 1
	editor.updateShape({
		id: shape.id,
		type: shape.type,
		props: { scale: Math.max(0.6, scale * 0.85) },
	} as any)
}

function shortenShapeText(editor: Editor, shape: TLShape, maxCharacters: number) {
	const text = getShapeText(editor, shape)
	if (!text || text.length <= maxCharacters) return
	const shortened = `${text.slice(0, Math.max(0, maxCharacters - 3)).trim()}...`
	editor.updateShape({
		id: shape.id,
		type: shape.type,
		props: { richText: toRichText(shortened) },
	} as any)
}

function moveLabelsIntoContainers(
	editor: Editor,
	labelShapeIds: SimpleShapeId[],
	containerShapeIds: SimpleShapeId[]
) {
	const containers = getShapeInfos(editor, containerShapeIds).filter(
		(info) => info.shape.type !== 'text' && info.shape.type !== 'note' && info.shape.type !== 'arrow'
	)
	if (containers.length === 0) return

	for (const labelId of labelShapeIds) {
		const label = editor.getShape(toTlShapeId(labelId))
		const labelBounds = editor.getShapePageBounds(toTlShapeId(labelId))
		if (!label || !labelBounds) continue
		if (label.type !== 'text' && label.type !== 'note') continue
		const container = containers[0]
		moveShapeBoundsTo(
			editor,
			labelId,
			container.bounds.midX - labelBounds.w / 2,
			container.bounds.midY - labelBounds.h / 2
		)
	}
}

function getSeparationDelta(a: Box, b: Box, gap: number) {
	const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + gap
	const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + gap
	if (overlapX <= 0 || overlapY <= 0) return null
	if (overlapX < overlapY) {
		return { x: b.midX >= a.midX ? overlapX : -overlapX, y: 0 }
	}
	return { x: 0, y: b.midY >= a.midY ? overlapY : -overlapY }
}

function createArrowBinding(
	editor: Editor,
	arrowId: TLShapeId,
	toId: TLShapeId,
	terminal: 'start' | 'end'
) {
	editor.createBinding({
		type: 'arrow',
		fromId: arrowId,
		toId,
		props: {
			normalizedAnchor: { x: 0.5, y: 0.5 },
			isExact: false,
			isPrecise: false,
			terminal,
		},
		meta: {},
	})
}

function hasArrowBetween(editor: Editor, sourceId: SimpleShapeId, targetId: SimpleShapeId) {
	const sourceTlId = toTlShapeId(sourceId)
	const targetTlId = toTlShapeId(targetId)
	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		if (bindings.start?.toId === sourceTlId && bindings.end?.toId === targetTlId) {
			return true
		}
	}
	return false
}

function getShapeText(editor: Editor, shape: TLShape): string | undefined {
	try {
		return editor.getShapeUtil(shape).getText(shape) ?? undefined
	} catch {
		return undefined
	}
}

function toTlShapeId(id: SimpleShapeId): TLShapeId {
	return createShapeId(id)
}

function sum(values: number[]) {
	return values.reduce((total, value) => total + value, 0)
}

function normalizeGap(gap: number | undefined, fallback: number) {
	return Math.max(0, gap ?? fallback)
}
