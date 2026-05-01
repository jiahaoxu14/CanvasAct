import { TLShapeId } from 'tldraw'
import { DistributeAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const DistributeActionUtil = registerActionUtil(
	class DistributeActionUtil extends AgentActionUtil<DistributeAction> {
		static override type = 'distribute' as const

		override getInfo(action: Streaming<DistributeAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<DistributeAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'distribute',
				min: 2,
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds
			return action
		}

		override applyAction(action: Streaming<DistributeAction>) {
			if (!action.complete || !action.shapeIds) return

			this.editor.distributeShapes(
				action.shapeIds.map((id) => `shape:${id}` as TLShapeId),
				action.direction
			)
		}
	}
)
