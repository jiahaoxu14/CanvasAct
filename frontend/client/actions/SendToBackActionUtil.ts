import { TLShapeId } from 'tldraw'
import { SendToBackAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const SendToBackActionUtil = registerActionUtil(
	class SendToBackActionUtil extends AgentActionUtil<SendToBackAction> {
		static override type = 'sendToBack' as const

		override getInfo(action: Streaming<SendToBackAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<SendToBackAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'sendToBack',
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds
			return action
		}

		override applyAction(action: Streaming<SendToBackAction>) {
			if (!action.complete || !action.shapeIds) return
			this.editor.sendToBack(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	}
)
