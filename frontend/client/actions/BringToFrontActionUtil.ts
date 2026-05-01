import { TLShapeId } from 'tldraw'
import { BringToFrontAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const BringToFrontActionUtil = registerActionUtil(
	class BringToFrontActionUtil extends AgentActionUtil<BringToFrontAction> {
		static override type = 'bringToFront' as const

		override getInfo(action: Streaming<BringToFrontAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<BringToFrontAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'bringToFront',
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds
			return action
		}

		override applyAction(action: Streaming<BringToFrontAction>) {
			if (!action.complete || !action.shapeIds) return
			this.editor.bringToFront(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	}
)
