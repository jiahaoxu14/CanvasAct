import { TLShapeId } from 'tldraw'
import { ResizeAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const ResizeActionUtil = registerActionUtil(
	class ResizeActionUtil extends AgentActionUtil<ResizeAction> {
		static override type = 'resize' as const

		override getInfo(action: Streaming<ResizeAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<ResizeAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'resize',
			})
			if (!shapeIds) return null

			action.shapeIds = shapeIds
			return action
		}

		override applyAction(action: Streaming<ResizeAction>, helpers: AgentHelpers) {
			if (
				!action.shapeIds ||
				typeof action.scaleX !== 'number' ||
				typeof action.scaleY !== 'number' ||
				action.scaleX === 0 ||
				action.scaleY === 0 ||
				action.originX === undefined ||
				action.originY === undefined
			) {
				return
			}

			const origin = helpers.removeOffsetFromVec({ x: action.originX, y: action.originY })
			const shapeIds = action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId)

			for (const shapeId of shapeIds) {
				this.editor.resizeShape(
					shapeId,
					{ x: action.scaleX, y: action.scaleY },
					{ scaleOrigin: origin }
				)
			}
		}
	}
)
