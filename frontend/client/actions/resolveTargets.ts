import { Box, Editor, getArrowBindings, TLArrowShape, TLShape, TLShapeId, VecModel } from 'tldraw'
import { buildCanvasObservation } from '../../shared/format/buildCanvasObservation'
import {
	convertTldrawIdToSimpleId,
	convertTldrawShapeToFocusedType,
} from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { TargetSelector } from '../../shared/schema/TargetSelectorSchemas'
import { AgentRequest } from '../../shared/types/AgentRequest'
import type { ContextItem } from '../../shared/types/ContextItem'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type { AgentHelpers } from '../AgentHelpers'

export type ResolveTargetsStatus = 'ok' | 'empty' | 'ambiguous'

export interface ResolveTargetsResult {
	status: ResolveTargetsStatus
	shapeIds: SimpleShapeId[]
	reason?: string
}

export interface ResolveTargetsOptions {
	request?: AgentRequest | null
	helpers?: AgentHelpers
}

export function resolveTargets(
	agent: TldrawAgent,
	selector: TargetSelector,
	options: ResolveTargetsOptions = {}
): ResolveTargetsResult {
	const editor = agent.editor
	const request = options.request ?? agent.requests.getActiveRequest()
	const rawIds = resolveRawTargets(editor, selector, {
		agent,
		request,
		helpers: options.helpers,
	})
	const filteredIds = filterResolvedIds(editor, rawIds, selector)
	return finalizeResolution(selector, filteredIds)
}

export function resolveTargetSelectorForAction({
	agent,
	helpers,
	selector,
	shapeIds,
	actionType,
	min = 1,
	max,
}: {
	agent: TldrawAgent
	helpers: AgentHelpers
	selector?: TargetSelector
	shapeIds?: SimpleShapeId[]
	actionType: string
	min?: number
	max?: number
}): SimpleShapeId[] | null {
	if (!selector) {
		const existingIds = helpers.ensureShapeIdsExist(shapeIds ?? [])
		if (existingIds.length < min) {
			scheduleTargetResolutionFailure(
				agent,
				actionType,
				`Expected at least ${min} target shape${min === 1 ? '' : 's'}, but none were provided.`
			)
			return null
		}
		if (max !== undefined && existingIds.length > max) {
			scheduleTargetResolutionFailure(
				agent,
				actionType,
				`Expected at most ${max} target shape${max === 1 ? '' : 's'}, but ${existingIds.length} were provided.`
			)
			return null
		}
		return existingIds
	}

	const result = resolveTargets(agent, selector, { helpers })
	if (
		result.status === 'ok' &&
		result.shapeIds.length >= min &&
		(max === undefined || result.shapeIds.length <= max)
	) {
		return result.shapeIds
	}

	scheduleTargetResolutionFailure(
		agent,
		actionType,
		result.reason ??
			`Selector resolved ${result.shapeIds.length} target shape${result.shapeIds.length === 1 ? '' : 's'}; expected ${max === undefined ? `at least ${min}` : `${min}-${max}`}.`
	)
	return null
}

function resolveRawTargets(
	editor: Editor,
	selector: TargetSelector,
	context: {
		agent: TldrawAgent
		request?: AgentRequest | null
		helpers?: AgentHelpers
	}
): SimpleShapeId[] {
	switch (selector._type) {
		case 'selected':
			return editor.getSelectedShapeIds().map(convertTldrawIdToSimpleId)
		case 'context':
			return getContextShapeIds(context.request?.contextItems ?? context.agent.context.getItems(), selector.source)
		case 'ids':
			return selector.shapeIds
		case 'inside-region':
			return getShapesInRegion(editor, selector.region, context.helpers, true, selector.shapeTypes)
		case 'intersecting-region':
			return getShapesInRegion(editor, selector.region, context.helpers, false, selector.shapeTypes)
		case 'text':
			return getShapesMatchingText(editor, selector)
		case 'type':
			return getShapesMatchingTypes(editor, selector.shapeTypes)
		case 'connected-to':
			return getShapesConnectedTo(editor, selector.shapeId, {
				includeArrows: selector.includeArrows ?? false,
				includeSourceAndTarget: selector.includeSourceAndTarget ?? false,
			})
		case 'tile':
			return getShapesInObservationTile(context.agent, selector, context.helpers)
		case 'nearest':
			return getNearestShapes(editor, selector, context.helpers)
		case 'labels-of-selected':
			return getLabelsOfSelected(context.agent, context.helpers)
		case 'arrows-connected-to-selected':
			return getArrowsConnectedToSelected(editor)
	}
}

function getContextShapeIds(
	contextItems: ContextItem[],
	source: 'agent' | 'user' | 'any' = 'any'
): SimpleShapeId[] {
	const ids: SimpleShapeId[] = []
	for (const item of contextItems) {
		if (source !== 'any' && item.source !== source) continue
		if (item.type === 'shape') {
			ids.push(item.shape.shapeId)
		} else if (item.type === 'shapes') {
			for (const shape of item.shapes) ids.push(shape.shapeId)
		}
	}
	return ids
}

function getShapesInRegion(
	editor: Editor,
	region: { x: number; y: number; w: number; h: number; coordinateSpace?: 'prompt' | 'page' },
	helpers: AgentHelpers | undefined,
	fullyInside: boolean,
	shapeTypes?: string[]
): SimpleShapeId[] {
	const box = Box.From(toPageBox(region, helpers))
	return editor
		.getCurrentPageShapesSorted()
		.filter((shape) => shapeMatchesTypes(shape, shapeTypes))
		.filter((shape) => {
			const bounds = editor.getShapeMaskedPageBounds(shape)
			if (!bounds) return false
			return fullyInside ? box.includes(bounds) : Box.Collides(box, bounds)
		})
		.map((shape) => convertTldrawIdToSimpleId(shape.id))
}

function getShapesMatchingText(
	editor: Editor,
	selector: Extract<TargetSelector, { _type: 'text' }>
): SimpleShapeId[] {
	return editor
		.getCurrentPageShapesSorted()
		.filter((shape) => shapeMatchesTypes(shape, selector.shapeTypes))
		.filter((shape) => {
			const haystacks = [getShapeText(editor, shape)]
			if (selector.searchNotes && typeof shape.meta.note === 'string') {
				haystacks.push(shape.meta.note)
			}
			return haystacks.some((value) =>
				value ? textMatches(value, selector.text, selector.match ?? 'contains', selector.caseSensitive) : false
			)
		})
		.map((shape) => convertTldrawIdToSimpleId(shape.id))
}

function getShapesMatchingTypes(editor: Editor, shapeTypes: string[]): SimpleShapeId[] {
	return editor
		.getCurrentPageShapesSorted()
		.filter((shape) => shapeMatchesTypes(shape, shapeTypes))
		.map((shape) => convertTldrawIdToSimpleId(shape.id))
}

function getShapesConnectedTo(
	editor: Editor,
	shapeId: SimpleShapeId,
	{
		includeArrows,
		includeSourceAndTarget,
	}: { includeArrows: boolean; includeSourceAndTarget: boolean }
): SimpleShapeId[] {
	const targetId = `shape:${shapeId}` as TLShapeId
	const ids: SimpleShapeId[] = includeSourceAndTarget && editor.getShape(targetId) ? [shapeId] : []

	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		const connectedIds = [bindings.start?.toId, bindings.end?.toId].filter(
			(id): id is TLShapeId => id !== undefined
		)
		if (!connectedIds.includes(targetId)) continue
		if (includeArrows) ids.push(convertTldrawIdToSimpleId(shape.id))
		for (const connectedId of connectedIds) {
			if (connectedId !== targetId) ids.push(convertTldrawIdToSimpleId(connectedId))
		}
	}
	return ids
}

function getShapesInObservationTile(
	agent: TldrawAgent,
	selector: Extract<TargetSelector, { _type: 'tile' }>,
	helpers?: AgentHelpers
): SimpleShapeId[] {
	const request = agent.requests.getActiveRequest()
	const promptOrigin = helpers ? { x: -helpers.offset.x, y: -helpers.offset.y } : { x: 0, y: 0 }
	const observation = buildCanvasObservation(agent.editor, {
		agentViewportBounds: request?.bounds ?? agent.editor.getViewportPageBounds(),
		userViewportBounds: agent.editor.getViewportPageBounds(),
		promptOrigin,
		contextItems: request?.contextItems ?? agent.context.getItems(),
	})
	const tiles = [
		observation.spatialIndex.viewport,
		...observation.spatialIndex.nearby,
		...observation.spatialIndex.far,
	]
	const matchingTiles = tiles.filter((tile) => {
		if (selector.tileId && tile.id !== selector.tileId) return false
		if (selector.detailLevel && tile.detailLevel !== selector.detailLevel) return false
		if (selector.direction && !tile.direction.includes(selector.direction)) return false
		return true
	})
	const objectById = new Map(observation.objects.map((object) => [object.id, object]))
	return matchingTiles
		.flatMap((tile) => tile.objectIds)
		.filter((id) => {
			const object = objectById.get(id)
			if (!object) return true
			return !selector.shapeTypes || selector.shapeTypes.includes(object.type) || selector.shapeTypes.includes(object.subtype)
		})
}

function getNearestShapes(
	editor: Editor,
	selector: Extract<TargetSelector, { _type: 'nearest' }>,
	helpers?: AgentHelpers
): SimpleShapeId[] {
	const point = toPagePoint(selector.point, helpers)
	const max = selector.max ?? 1
	return editor
		.getCurrentPageShapesSorted()
		.filter((shape) => shapeMatchesTypes(shape, selector.shapeTypes))
		.map((shape) => {
			const bounds = editor.getShapeMaskedPageBounds(shape)
			return {
				shape,
				distance: bounds ? distanceToBox(point, bounds) : Number.POSITIVE_INFINITY,
			}
		})
		.filter(({ distance }) => Number.isFinite(distance))
		.sort((a, b) => a.distance - b.distance || a.shape.index.localeCompare(b.shape.index))
		.slice(0, max)
		.map(({ shape }) => convertTldrawIdToSimpleId(shape.id))
}

function getLabelsOfSelected(agent: TldrawAgent, helpers?: AgentHelpers): SimpleShapeId[] {
	const selectedIds = new Set(agent.editor.getSelectedShapeIds().map(convertTldrawIdToSimpleId))
	if (selectedIds.size === 0) return []
	const request = agent.requests.getActiveRequest()
	const promptOrigin = helpers ? { x: -helpers.offset.x, y: -helpers.offset.y } : { x: 0, y: 0 }
	const observation = buildCanvasObservation(agent.editor, {
		agentViewportBounds: request?.bounds ?? agent.editor.getViewportPageBounds(),
		userViewportBounds: agent.editor.getViewportPageBounds(),
		promptOrigin,
		contextItems: request?.contextItems ?? agent.context.getItems(),
	})

	const relationLabels = observation.relations
		.filter((relation) => relation.type === 'likely-label-of' && selectedIds.has(relation.targetId))
		.map((relation) => relation.sourceId)
	if (relationLabels.length > 0) return relationLabels

	return getFallbackLabelsNearSelected(agent.editor, selectedIds)
}

function getArrowsConnectedToSelected(editor: Editor): SimpleShapeId[] {
	const selectedIds = new Set(editor.getSelectedShapeIds())
	if (selectedIds.size === 0) return []
	const arrowIds: SimpleShapeId[] = []
	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'arrow') continue
		const bindings = getArrowBindings(editor, shape as TLArrowShape)
		if (
			(bindings.start?.toId && selectedIds.has(bindings.start.toId)) ||
			(bindings.end?.toId && selectedIds.has(bindings.end.toId))
		) {
			arrowIds.push(convertTldrawIdToSimpleId(shape.id))
		}
	}
	return arrowIds
}

function getFallbackLabelsNearSelected(editor: Editor, selectedIds: Set<SimpleShapeId>): SimpleShapeId[] {
	const selectedBounds = Array.from(selectedIds)
		.map((id) => editor.getShapeMaskedPageBounds(`shape:${id}` as TLShapeId))
		.filter((bounds): bounds is Box => bounds !== undefined)
	const labels: SimpleShapeId[] = []
	for (const shape of editor.getCurrentPageShapesSorted()) {
		if (shape.type !== 'text' && shape.type !== 'note') continue
		const bounds = editor.getShapeMaskedPageBounds(shape)
		if (!bounds) continue
		if (
			selectedBounds.some(
				(selected) => selected.includes(bounds) || distanceBetweenBoxes(selected, bounds) <= 72
			)
		) {
			labels.push(convertTldrawIdToSimpleId(shape.id))
		}
	}
	return labels
}

function filterResolvedIds(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	selector: TargetSelector
): SimpleShapeId[] {
	const seen = new Set<SimpleShapeId>()
	const result: SimpleShapeId[] = []
	for (const shapeId of shapeIds) {
		if (seen.has(shapeId)) continue
		const shape = editor.getShape(`shape:${shapeId}` as TLShapeId)
		if (!shape) continue
		if (!selector.includeLocked && shape.isLocked) continue
		if (!selector.includeHidden && editor.isShapeHidden(shape)) continue
		seen.add(shapeId)
		result.push(shapeId)
	}
	return selector.max ? result.slice(0, selector.max) : result
}

function finalizeResolution(
	selector: TargetSelector,
	shapeIds: SimpleShapeId[]
): ResolveTargetsResult {
	if (shapeIds.length === 0) {
		return {
			status: 'empty',
			shapeIds,
			reason: `Target selector "${selector._type}" did not match any editable shapes.`,
		}
	}
	if (selector.expect === 'one' && shapeIds.length !== 1) {
		return {
			status: 'ambiguous',
			shapeIds,
			reason: `Target selector "${selector._type}" expected one shape but matched ${shapeIds.length}.`,
		}
	}
	return { status: 'ok', shapeIds }
}

export function scheduleTargetResolutionFailure(
	agent: TldrawAgent,
	actionType: string,
	reason: string
) {
	agent.schedule({
		message: `[TARGET RESOLUTION FAILED]: The ${actionType} action could not resolve targets safely. ${reason} Use the CanvasObservation and a more specific target selector, or ask the user for clarification before editing.`,
		source: 'self',
	})
}

function getShapeText(editor: Editor, shape: TLShape): string | undefined {
	try {
		return editor.getShapeUtil(shape).getText(shape) ?? undefined
	} catch {
		return undefined
	}
}

function textMatches(value: string, query: string, match: 'contains' | 'exact' | 'regex', caseSensitive = false) {
	const haystack = caseSensitive ? value : value.toLocaleLowerCase()
	const needle = caseSensitive ? query : query.toLocaleLowerCase()
	if (match === 'exact') return haystack === needle
	if (match === 'regex') {
		try {
			return new RegExp(query, caseSensitive ? undefined : 'i').test(value)
		} catch {
			return false
		}
	}
	return haystack.includes(needle)
}

function shapeMatchesTypes(shape: TLShape, shapeTypes?: string[]) {
	if (!shapeTypes || shapeTypes.length === 0) return true
	const focusedType = convertTldrawShapeToFocusedType(shape)
	const props = shape.props as Record<string, unknown>
	const subtype = typeof props.geo === 'string' ? props.geo : shape.type
	return shapeTypes.includes(focusedType) || shapeTypes.includes(shape.type) || shapeTypes.includes(subtype)
}

function toPageBox(
	region: { x: number; y: number; w: number; h: number; coordinateSpace?: 'prompt' | 'page' },
	helpers?: AgentHelpers
) {
	if (region.coordinateSpace === 'page' || !helpers) return region
	return helpers.removeOffsetFromBox(region)
}

function toPagePoint(
	point: { x: number; y: number; coordinateSpace?: 'prompt' | 'page' },
	helpers?: AgentHelpers
): VecModel {
	if (point.coordinateSpace === 'page' || !helpers) return point
	return helpers.removeOffsetFromVec(point)
}

function distanceToBox(point: VecModel, box: Box) {
	const dx = Math.max(box.x - point.x, point.x - (box.x + box.w), 0)
	const dy = Math.max(box.y - point.y, point.y - (box.y + box.h), 0)
	return Math.hypot(dx, dy)
}

function distanceBetweenBoxes(a: Box, b: Box) {
	const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
	const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
	return Math.hypot(dx, dy)
}
