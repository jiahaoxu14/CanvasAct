import { TLShapeId } from 'tldraw'
import { RotateAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const RotateActionUtil = registerActionUtil(
	class RotateActionUtil extends AgentActionUtil<RotateAction> {
		static override type = 'rotate' as const

		override getInfo(action: Streaming<RotateAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<RotateAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'rotate',
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds
			return action
		}

		override applyAction(action: Streaming<RotateAction>, helpers: AgentHelpers) {
			if (
				!action.shapeIds ||
				typeof action.degrees !== 'number' ||
				action.degrees === 0 ||
				action.originX === undefined ||
				action.originY === undefined
			) {
				return
			}

			const origin = helpers.removeOffsetFromVec({ x: action.originX, y: action.originY })
			const shapeIds = action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId)
			const radians = (action.degrees * Math.PI) / 180

			this.editor.rotateShapesBy(shapeIds, radians, { center: origin })
		}
	}
)
