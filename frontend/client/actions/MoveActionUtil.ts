import { TLShape, TLShapeId, Vec } from 'tldraw'
import { MoveAction } from '../../shared/schema/AgentActionSchemas'
import type { SimpleShapeId } from '../../shared/types/ids-schema'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveTargetSelectorForAction, scheduleTargetResolutionFailure } from './resolveTargets'

export const MoveActionUtil = registerActionUtil(
	class MoveActionUtil extends AgentActionUtil<MoveAction> {
		static override type = 'move' as const

		override getInfo(action: Streaming<MoveAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<MoveAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeId ? [action.shapeId] : [],
				actionType: 'move',
				min: 1,
				max: 1,
			})
			if (!shapeIds) return null
			const shapeId = shapeIds[0]
			if (!action.targetSelector && hasAmbiguousHardCodedMoveTarget(this, shapeId, action.intent)) {
				scheduleTargetResolutionFailure(
					this.agent,
					'move',
					`The hard-coded target "${shapeId}" appears to be one of multiple matching shapes. Use a targetSelector with expect:"one", or ask the user which one to move.`
				)
				return null
			}
			action.shapeId = shapeId

			// Make sure the x and y values are numbers
			const floatX = helpers.ensureValueIsNumber(action.x)
			const floatY = helpers.ensureValueIsNumber(action.y)
			if (floatX === null || floatY === null) return null
			action.x = floatX
			action.y = floatY

			return action
		}

		override applyAction(action: Streaming<MoveAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			const { editor } = this

			if (!action.shapeId) return

			// Translate the position back to the chat's position
			const { x, y } = helpers.removeOffsetFromVec({ x: action.x, y: action.y })

			const shapeId = `shape:${action.shapeId}` as TLShapeId
			const shape = editor.getShape(shapeId)
			if (!shape) return

			const shapeBounds = editor.getShapePageBounds(shapeId)
			if (!shapeBounds) return

			const moveTarget = new Vec(x, y)
			const shapeOrigin = new Vec(shape.x, shape.y)
			const shapeBoundsOrigin = new Vec(shapeBounds.minX, shapeBounds.minY)

			// Calculate the offset from the shape bounds origin to the shape origin
			const shapeOriginDelta = shapeOrigin.sub(shapeBoundsOrigin)

			// Adjust the target position based on the anchor point
			const boundsWidth = shapeBounds.w
			const boundsHeight = shapeBounds.h

			// Calculate the anchor point offset from the bounds origin
			let anchorOffsetX = 0
			let anchorOffsetY = 0

			switch (action.anchor) {
				case 'top-left': {
					anchorOffsetX = 0
					anchorOffsetY = 0
					break
				}
				case 'top-center': {
					anchorOffsetX = boundsWidth / 2
					anchorOffsetY = 0
					break
				}
				case 'top-right': {
					anchorOffsetX = boundsWidth
					anchorOffsetY = 0
					break
				}
				case 'bottom-left': {
					anchorOffsetX = 0
					anchorOffsetY = boundsHeight
					break
				}
				case 'bottom-center': {
					anchorOffsetX = boundsWidth / 2
					anchorOffsetY = boundsHeight
					break
				}
				case 'bottom-right': {
					anchorOffsetX = boundsWidth
					anchorOffsetY = boundsHeight
					break
				}
				case 'center-left': {
					anchorOffsetX = 0
					anchorOffsetY = boundsHeight / 2
					break
				}
				case 'center-right': {
					anchorOffsetX = boundsWidth
					anchorOffsetY = boundsHeight / 2
					break
				}
				case 'center': {
					anchorOffsetX = boundsWidth / 2
					anchorOffsetY = boundsHeight / 2
					break
				}
			}

			// Adjust the target to account for the anchor point
			// The target x,y should be where the anchor point is positioned
			// So we subtract the anchor offset to get the bounds origin position
			const adjustedTarget = moveTarget.sub(new Vec(anchorOffsetX, anchorOffsetY))

			const newTarget = adjustedTarget.add(shapeOriginDelta)

			editor.updateShape({
				id: shapeId,
				type: shape.type,
				x: newTarget.x,
				y: newTarget.y,
			})
		}
	}
)

function hasAmbiguousHardCodedMoveTarget(
	util: AgentActionUtil<MoveAction>,
	shapeId: SimpleShapeId,
	intent: string | undefined
) {
	const { editor, agent } = util
	const shape = editor.getShape(`shape:${shapeId}` as TLShapeId)
	if (!shape) return false
	if (editor.getSelectedShapeIds().includes(shape.id)) return false

	const request = agent.requests.getActiveRequest()
	const haystack = normalizeText(
		[
			intent,
			...(request?.agentMessages ?? []),
			...(request?.userMessages ?? []),
		]
			.filter(Boolean)
			.join('\n')
	)
	if (!haystack) return false

	for (const label of getShapeTextCandidates(editor, shape)) {
		if (!label || !haystack.includes(normalizeText(label))) continue
		const matchingIds = editor
			.getCurrentPageShapesSorted()
			.filter((candidate) =>
				getShapeTextCandidates(editor, candidate).some(
					(candidateLabel) => normalizeText(candidateLabel) === normalizeText(label)
				)
			)
			.map((candidate) => candidate.id)
		if (matchingIds.length > 1) return true
	}

	return false
}

function getShapeTextCandidates(editor: AgentActionUtil<MoveAction>['editor'], shape: TLShape) {
	const candidates: string[] = []
	try {
		const text = editor.getShapeUtil(shape).getText(shape)
		if (text) candidates.push(text)
	} catch {
		// Some shape utils do not expose text.
	}
	if (typeof shape.meta.note === 'string') candidates.push(shape.meta.note)
	return candidates
}

function normalizeText(value: string) {
	return value.trim().toLocaleLowerCase()
}
