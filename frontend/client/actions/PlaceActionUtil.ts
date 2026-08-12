import { TLShapeId } from 'tldraw'
import { PlaceAction } from '../../shared/schema/AgentActionSchemas'
import { ActionContract } from '../../shared/types/ActionContract'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import {
	isHardCodedSingleTargetAmbiguous,
	resolveTargetSelectorForAction,
	scheduleTargetResolutionFailure,
} from './resolveTargets'

export const PlaceActionUtil = registerActionUtil(
	class PlaceActionUtil extends AgentActionUtil<PlaceAction> {
		static override type = 'place' as const

		override getInfo(action: Streaming<PlaceAction>) {
			return {
				icon: 'target' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<PlaceAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeId ? [action.shapeId] : [],
				actionType: 'place',
				min: 1,
				max: 1,
			})
			if (!shapeIds) return null
			const shapeId = shapeIds[0]
			if (
				!action.targetSelector &&
				isHardCodedSingleTargetAmbiguous(this.agent, shapeId, action.intent)
			) {
				scheduleTargetResolutionFailure(
					this.agent,
					'place',
					`The hard-coded target "${shapeId}" appears to be one of multiple matching shapes. Use a targetSelector with expect:"one", or ask the user which one to place.`
				)
				return null
			}
			action.shapeId = shapeId

			const referenceSelector = action.referenceSelector
				? { ...action.referenceSelector, includeLocked: true }
				: undefined
			const referenceShapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: referenceSelector,
				shapeIds: action.referenceShapeId ? [action.referenceShapeId] : [],
				actionType: 'place reference',
				min: 1,
				max: 1,
			})
			if (!referenceShapeIds) return null
			action.referenceShapeId = referenceShapeIds[0]

			return action
		}

		override applyAction(action: Streaming<PlaceAction>) {
			if (!action.complete) return
			const { editor } = this

			const { side, sideOffset = 0, align = 'center', alignOffset = 0 } = action
			if (!action.referenceShapeId || !action.shapeId) return
			const referenceShapeId = `shape:${action.referenceShapeId}` as TLShapeId
			const shapeId = `shape:${action.shapeId}` as TLShapeId

			const shape = editor.getShape(shapeId)
			const referenceShape = editor.getShape(referenceShapeId)
			if (!shape || !referenceShape) return

			const bbA = editor.getShapePageBounds(shape)!
			const bbR = editor.getShapePageBounds(referenceShape)!
			if (side === 'inside') {
				const padding = Math.max(0, action.padding ?? 16)
				const alignX = action.insideAlignX ?? 'center'
				const alignY = action.insideAlignY ?? 'center'
				const availableWidth = bbR.width - padding * 2
				const availableHeight = bbR.height - padding * 2
				if (bbA.width > availableWidth || bbA.height > availableHeight) {
					scheduleTargetResolutionFailure(
						this.agent,
						'place',
						`Target "${action.shapeId}" does not fit inside "${action.referenceShapeId}" with ${padding}px padding.`
					)
					return
				}
				const x = getInsideAxisPosition(bbR.minX, bbR.maxX, bbA.width, padding, alignX)
				const y = getInsideAxisPosition(bbR.minY, bbR.maxY, bbA.height, padding, alignY)
				moveShapeBoundsTo(editor, shapeId, x, y)
			} else if (side === 'top' && align === 'start') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.minX + alignOffset,
					y: bbR.minY - bbA.height - sideOffset,
				})
			} else if (side === 'top' && align === 'center') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.midX - bbA.width / 2 + alignOffset,
					y: bbR.minY - bbA.height - sideOffset,
				})
			} else if (side === 'top' && align === 'end') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.maxX - bbA.width - alignOffset,
					y: bbR.minY - bbA.height - sideOffset,
				})
			} else if (side === 'bottom' && align === 'start') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.minX + alignOffset,
					y: bbR.maxY + sideOffset,
				})
			} else if (side === 'bottom' && align === 'center') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.midX - bbA.width / 2 + alignOffset,
					y: bbR.maxY + sideOffset,
				})
			} else if (side === 'bottom' && align === 'end') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.maxX - bbA.width - alignOffset,
					y: bbR.maxY + sideOffset,
				})
				// LEFT SIDE (corrected)
			} else if (side === 'left' && align === 'start') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.minX - bbA.width - sideOffset,
					y: bbR.minY + alignOffset,
				})
			} else if (side === 'left' && align === 'center') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.minX - bbA.width - sideOffset,
					y: bbR.midY - bbA.height / 2 + alignOffset,
				})
			} else if (side === 'left' && align === 'end') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.minX - bbA.width - sideOffset,
					y: bbR.maxY - bbA.height - alignOffset,
				})
				// RIGHT SIDE (corrected)
			} else if (side === 'right' && align === 'start') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.maxX + sideOffset,
					y: bbR.minY + alignOffset,
				})
			} else if (side === 'right' && align === 'center') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.maxX + sideOffset,
					y: bbR.midY - bbA.height / 2 + alignOffset,
				})
			} else if (side === 'right' && align === 'end') {
				editor.updateShape({
					id: shapeId,
					type: shape.type,
					x: bbR.maxX + sideOffset,
					y: bbR.maxY - bbA.height - alignOffset,
				})
			}
		}

		override getActionContract(action: Streaming<PlaceAction>): ActionContract | null {
			if (!action.complete || !action.shapeId || !action.referenceShapeId) return null
			return {
				actionType: 'place',
				intent: action.intent,
				modifiedShapeIds: [action.shapeId],
				postconditions:
					action.side === 'inside'
						? [
								{
									type: 'objects-inside-containers',
									pairs: [
										{
											objectId: action.shapeId,
											containerId: action.referenceShapeId,
											padding: Math.max(0, action.padding ?? 16),
										},
									],
								},
							]
						: [],
			}
		}
	}
)

function getInsideAxisPosition(
	min: number,
	max: number,
	size: number,
	padding: number,
	align: 'start' | 'center' | 'end'
) {
	if (align === 'start') return min + padding
	if (align === 'end') return max - padding - size
	return (min + max - size) / 2
}

function moveShapeBoundsTo(
	editor: AgentActionUtil<PlaceAction>['editor'],
	shapeId: TLShapeId,
	x: number,
	y: number
) {
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
