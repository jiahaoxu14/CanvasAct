import { Box, Editor, TLBinding, TLShape, TLShapeId } from 'tldraw'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import type { SimpleShapeId } from '../../shared/types/ids-schema'

export type LayoutOperation = 'align' | 'distribute' | 'stack'

export interface LayoutClusterSnapshot {
	shapeIds: SimpleShapeId[]
	pageBounds: { x: number; y: number; w: number; h: number }
}

/**
 * Mirror tldraw's layout clustering: selected shapes connected through selected
 * arrow bindings move as one cluster. Capturing this before execution lets
 * CanvasAct check the same units that the host editor actually lays out.
 */
export function getLayoutClusters(
	editor: Editor,
	shapeIds: SimpleShapeId[],
	type: LayoutOperation
): LayoutClusterSnapshot[] {
	const freshShapes = shapeIds
		.map((id) => editor.getShape(`shape:${id}` as TLShapeId))
		.filter((shape): shape is TLShape => shape !== undefined)
	const clusters: LayoutClusterSnapshot[] = []
	const visited = new Set<TLShapeId>()

	for (const shape of freshShapes) {
		if (visited.has(shape.id)) continue
		visited.add(shape.id)
		const pageBounds = editor.getShapePageBounds(shape)
		if (!pageBounds) continue
		if (!editor.getShapeUtil(shape).canBeLaidOut?.(shape, { type, shapes: freshShapes })) continue

		const members = [shape]
		const memberBounds = [pageBounds]
		collectConnectedSelectedShapes(
			editor,
			freshShapes,
			members,
			memberBounds,
			visited,
			editor.getBindingsToShape(shape.id, 'arrow')
		)
		const common = Box.Common(memberBounds)
		if (!common) continue
		clusters.push({
			shapeIds: members.map((member) => convertTldrawIdToSimpleId(member.id)),
			pageBounds: { x: common.x, y: common.y, w: common.w, h: common.h },
		})
	}

	return clusters
}

function collectConnectedSelectedShapes(
	editor: Editor,
	selectedShapes: TLShape[],
	resultShapes: TLShape[],
	resultBounds: Box[],
	visited: Set<TLShapeId>,
	bindings: TLBinding[]
) {
	for (const binding of bindings) {
		for (const id of [binding.fromId, binding.toId]) {
			if (visited.has(id)) continue
			const connected = selectedShapes.find((shape) => shape.id === id)
			if (!connected) continue
			visited.add(id)
			const bounds = editor.getShapePageBounds(connected)
			if (!bounds) continue
			resultShapes.push(connected)
			resultBounds.push(bounds)
			collectConnectedSelectedShapes(
				editor,
				selectedShapes,
				resultShapes,
				resultBounds,
				visited,
				editor.getBindingsInvolvingShape(connected.id, 'arrow')
			)
		}
	}
}

export function computeAutomaticStackGap(
	clusters: LayoutClusterSnapshot[],
	direction: 'horizontal' | 'vertical'
) {
	const sorted = [...clusters].sort((a, b) =>
		direction === 'horizontal'
			? a.pageBounds.x - b.pageBounds.x
			: a.pageBounds.y - b.pageBounds.y
	)
	const gaps = sorted.slice(0, -1).map((cluster, index) => {
		const next = sorted[index + 1]
		return direction === 'horizontal'
			? next.pageBounds.x - (cluster.pageBounds.x + cluster.pageBounds.w)
			: next.pageBounds.y - (cluster.pageBounds.y + cluster.pageBounds.h)
	})
	const counts = new Map<number, number>()
	for (const gap of gaps) counts.set(gap, (counts.get(gap) ?? 0) + 1)
	let mostCommon: { gap: number; count: number } | null = null
	for (const [gap, count] of counts) {
		if (!mostCommon || count > mostCommon.count) mostCommon = { gap, count }
	}
	if (mostCommon && mostCommon.count > 1) return { ordered: sorted, gap: mostCommon.gap }
	return {
		ordered: sorted,
		gap: gaps.length === 0 ? 0 : gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
	}
}
