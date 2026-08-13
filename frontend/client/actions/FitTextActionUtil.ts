import { FitTextAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { fitTextInShapes } from './resolveSemanticActions'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const FitTextActionUtil = registerActionUtil(
	class FitTextActionUtil extends AgentActionUtil<FitTextAction> {
		static override type = 'fitText' as const

		override getInfo(action: Streaming<FitTextAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<FitTextAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'fitText',
				min: 1,
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds

			if (action.containerSelector || action.containerShapeIds) {
				const containerShapeIds = resolveTargetSelectorForAction({
					agent: this.agent,
					helpers,
					selector: action.containerSelector,
					shapeIds: action.containerShapeIds,
					actionType: 'fitText',
					min: 1,
				})
				if (!containerShapeIds) return null
				action.containerShapeIds = containerShapeIds
			}

			return action
		}

		override applyAction(action: Streaming<FitTextAction>) {
			if (!action.complete || !action.shapeIds) return
			fitTextInShapes(this.editor, action.shapeIds, action)
		}
	}
)
