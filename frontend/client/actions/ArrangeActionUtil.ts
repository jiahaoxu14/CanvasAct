import { ArrangeAction } from '../../shared/schema/AgentActionSchemas'
import { ActionContract } from '../../shared/types/ActionContract'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'
import { arrangeShapes } from './resolveSemanticActions'
import { resolveTargetSelectorForAction } from './resolveTargets'

export const ArrangeActionUtil = registerActionUtil(
	class ArrangeActionUtil extends AgentActionUtil<ArrangeAction> {
		static override type = 'arrange' as const

		override getInfo(action: Streaming<ArrangeAction>) {
			return {
				icon: 'cursor' as const,
				description: action.intent ?? '',
			}
		}

		override sanitizeAction(action: Streaming<ArrangeAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const shapeIds = resolveTargetSelectorForAction({
				agent: this.agent,
				helpers,
				selector: action.targetSelector,
				shapeIds: action.shapeIds,
				actionType: 'arrange',
				min: 2,
			})
			if (!shapeIds) return null
			action.shapeIds = shapeIds

			return action
		}

		override applyAction(action: Streaming<ArrangeAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.shapeIds) return
			arrangeShapes(this.editor, action.shapeIds, action, helpers)
		}

		override getActionContract(action: Streaming<ArrangeAction>): ActionContract | null {
			if (!action.complete || !action.shapeIds) return null
			const orderedDirection =
				action.layout === 'row'
					? 'horizontal'
					: action.layout === 'column'
						? 'vertical'
						: null
			return {
				actionType: 'arrange',
				intent: action.intent,
				modifiedShapeIds: action.shapeIds,
				postconditions: [
					{ type: 'no-overlap', shapeIds: action.shapeIds },
					...(orderedDirection
						? ([
								{
									type: 'ordered-layout',
									shapeIds: action.shapeIds,
									direction: orderedDirection,
									gap: Math.max(0, action.gap ?? 32),
									tolerance: 2,
								},
							] satisfies ActionContract['postconditions'])
						: []),
					{ type: 'objects-visible', shapeIds: action.shapeIds },
				],
			}
		}
	}
)
