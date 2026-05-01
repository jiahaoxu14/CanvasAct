import { CleanupLayoutAction } from '../../shared/schema/AgentActionSchemas'
import { ActionContract } from '../../shared/types/ActionContract'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { cleanupLayout } from './resolveSemanticActions'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const CleanupLayoutActionUtil = registerActionUtil(
	class CleanupLayoutActionUtil extends AgentActionUtil<CleanupLayoutAction> {
		static override type = 'cleanupLayout' as const

		override getInfo(action: Streaming<CleanupLayoutAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<CleanupLayoutAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'cleanupLayout',
				min: 2,
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds

			return action
		}

		override applyAction(action: Streaming<CleanupLayoutAction>) {
			if (!action.complete || !action.shapeIds) return
			cleanupLayout(this.editor, action.shapeIds, action)
		}

		override getActionContract(action: Streaming<CleanupLayoutAction>): ActionContract | null {
			if (!action.complete || !action.shapeIds) return null
			return {
				actionType: 'cleanupLayout',
				intent: action.intent,
				modifiedShapeIds: action.shapeIds,
				postconditions: [
					{ type: 'no-overlap', shapeIds: action.shapeIds },
					{ type: 'arrow-bindings', shapeIds: action.shapeIds },
				],
			}
		}
	}
)
